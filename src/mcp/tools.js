/**
 * MCP tool implementations — transport-agnostic.
 *
 * Five tools, each a thin wrapper over the same library functions the CLI
 * uses, returning the same JSON shapes as the CLI's --json envelopes. The
 * MCP server (server.js) only marshals these in and out of the protocol.
 *
 * Every tool takes an optional `dir` — the workspace folder that contains
 * (or will receive) cv-content/. MCP clients don't reliably set the server's
 * working directory, so agents should pass it explicitly.
 *
 * The fifth tool (`plan_layout`, C6a) is the one that is not part of the
 * author-a-CV loop: it answers "how will this paginate?" without writing a PDF,
 * so an assistant can tell the user which roles land on page 1, and whether
 * anything overflows, before it builds. The surface stayed at four for four
 * releases on purpose; this one earns its place by pricing a layout before a
 * build, which is a different question from how the page looks — the caller
 * answers that by opening the PDF `build_pdf` returns.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { layoutDiagnostics } from '../pdf/layoutDiagnostics.js'
import { planCV, renderCV } from '../pdf/render.js'
import { scaffoldContent } from '../pdf/scaffold.js'
import { discoverThemes } from '../pdf/themes/index.js'
import { validateContent } from '../pdf/validateContent.js'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const workspace = (/** @type {string | undefined} */ dir) => resolve(dir ?? process.cwd())
const contentDirOf = (/** @type {string | undefined} */ dir) => join(workspace(dir), 'cv-content')

// lib/fonts in the published package; src/fonts in a repo checkout pre-build.
function resolveFontsDir() {
  const libFonts = join(pkgRoot, 'lib', 'fonts')
  return existsSync(libFonts) ? libFonts : join(pkgRoot, 'src', 'fonts')
}

/**
 * The model-facing docs that ship INSIDE the package (package.json "files"
 * lists them by path; docs/hostile-baseline.md is an internal quality record
 * and deliberately stays out).
 *
 * Why they are reachable through `get_schema` and not just as a path: an MCP
 * client knows the workspace `dir` it passes in, and nothing else. The server's
 * own install path is knowable only to the server — and even handed the
 * absolute path, an agent frequently cannot READ it: the usual launcher is
 * `npx -y @hrtips/cvx@x.y.z mcp`, which unpacks into the npx cache
 * (`~/.npm/_npx/<hash>/node_modules/…`), outside the workspace, behind whatever
 * file-access policy the client enforces, and garbage-collected on npm's
 * schedule. Plenty of MCP clients have no filesystem tool at all. So the path
 * is offered as a convenience and the CONTENT is what the tool can actually
 * guarantee: ask for it by id and it comes back inline, no network, no reads.
 *
 * Not returned by default — `docs/ai-guide.md` is ~20 kB, and `get_schema` is
 * the call an agent makes FIRST, before it knows whether it needs the guide.
 */
const GUIDES = [
  {
    id: 'ai-guide',
    file: 'ai-guide.md',
    title: 'The full CVX assistant playbook: default flow, fallbacks, layout reading'
  },
  {
    id: 'cv-schema',
    file: 'cv-schema.md',
    title: 'Field-by-field reference for every cv-content/ file, with examples'
  }
]

/**
 * Inventory of the packaged guides, with `content` filled in for the ids in
 * `requested`. A guide whose file is missing is dropped rather than thrown on:
 * `get_schema` returning the schema is the contract, and losing the whole call
 * over a doc would be a bad trade for the tool an agent calls first.
 *
 * @param {string[]} requested
 */
function packagedGuides(requested) {
  /** @type {{ id: string, title: string, path: string, bytes: number, content?: string }[]} */
  const out = []
  for (const { id, file, title } of GUIDES) {
    const path = join(pkgRoot, 'docs', file)
    if (!existsSync(path)) continue
    out.push({
      id,
      title,
      path,
      bytes: statSync(path).size,
      ...(requested.includes(id) && { content: readFileSync(path, 'utf8') })
    })
  }
  return out
}

export async function getSchema(
  /** @type {{ dir?: string, guides?: string[] }} */ { dir, guides = [] } = {}
) {
  const schema = JSON.parse(readFileSync(join(pkgRoot, 'schema', 'v1', 'cvx.schema.json'), 'utf8'))
  const themes = Object.keys(await discoverThemes()).map((name) => ({
    name,
    default: name === 'teal'
  }))

  const layoutsDir = join(contentDirOf(dir), 'layouts')
  const builtIn = ['two-column', 'single-column']
  const names = new Set(builtIn)
  const layouts = builtIn.map((name) => ({
    name,
    default: name === 'two-column',
    source: 'built-in'
  }))
  if (existsSync(layoutsDir)) {
    for (const f of readdirSync(layoutsDir).filter((name) => name.endsWith('.yaml'))) {
      const name = basename(f, '.yaml')
      if (!names.has(name)) layouts.push({ name, default: false, source: 'cv-content/layouts' })
      names.add(name)
    }
  }
  return { schemaVersion: 1, schema, themes, layouts, guides: packagedGuides(guides) }
}

export async function initCv(/** @type {{ dir?: string }} */ { dir } = {}) {
  const dest = contentDirOf(dir)
  if (existsSync(dest)) {
    return {
      ok: false,
      error: { code: 'already-exists', message: `${dest} already exists — refusing to overwrite` }
    }
  }
  // Shared with `cvx init`. The copy is not verbatim: the scaffold's `$schema`
  // headers and doc links are pinned to the running release (see scaffold.js).
  const { ref } = scaffoldContent(dest)
  return {
    ok: true,
    dest,
    /** The git ref the scaffolded files' `$schema` headers point at. */
    schemaRef: ref,
    nextSteps: [
      'Edit the YAML files in cv-content/ with real, truthful details (see AGENTS.md there)',
      "Replace or delete cv-content/images/profile.jpg — it is the example person's photo; never ship it on a real CV",
      'Ask the user for their photo (square, 400x400px+) — it cannot be generated; the CV renders fine without one',
      'Run validate_cv after every edit, then build_pdf'
    ]
  }
}

export async function validateCv(
  /** @type {{ dir?: string, strict?: boolean }} */ { dir, strict = true } = {}
) {
  const result = validateContent({
    contentDir: contentDirOf(dir),
    strict,
    fontsDir: resolveFontsDir()
  })
  return {
    ok: result.ok,
    schemaVersion: 1,
    strict,
    errors: result.errors,
    warnings: result.warnings,
    checked: result.checked
  }
}

export async function buildPdf(
  /** @type {{ dir?: string, ats?: boolean }} */ { dir, ats = false } = {}
) {
  /** @type {string[]} */
  const notices = []
  const { buffer, filename, themeName, layoutName, config, plan } = await renderCV({
    contentDir: contentDirOf(dir),
    fontsDir: resolveFontsDir(),
    ats,
    warn: (msg) => notices.push(msg)
  })
  const path = join(workspace(dir), filename)
  writeFileSync(path, buffer)
  // A build is progress: it clears the "you have asked the same question five
  // times" counter, so a plan → build → plan sequence does not open with an
  // accusation of looping. See trackPlanIteration.
  planIterations.delete(workspace(dir))
  return {
    ok: true,
    filename,
    path,
    bytes: buffer.byteLength,
    ats,
    theme: ats ? null : themeName,
    layout: ats ? null : layoutName,
    // `notices`, NOT `warnings`: the response already carries
    // `diagnostics.warnings`, a list of {code, page, …} objects, and two fields
    // called `warnings` in one object — one of them repeating the other's text
    // verbatim — is a contract that reads as a bug. These are the run's
    // human-readable notes (unsupported glyphs, a layout that fell back to the
    // built-in default, an overflowing page); the structured, matchable list of
    // layout defects is `diagnostics.warnings`.
    notices,
    // The same numbers `plan_layout` returns, for the plan THIS build rendered
    // (C6a) — so an assistant that just built does not need a second call to
    // see how the CV paginated. `null` for the ATS/single-column variant, which
    // react-pdf auto-flows and CVX never packs.
    diagnostics: layoutDiagnostics(plan, config)
  }
}

/**
 * How many times in a row `plan_layout` will answer for one workspace before it
 * starts saying "nothing has changed, stop".
 *
 * The sprint requires an iteration cap (design doc §7.4 / G-c: "cap the agent's
 * plan_layout iterations"), and it is worth being precise about what it guards
 * against HERE, where there are no levers yet: `plan_layout` is a pure function
 * of the content directory, so calling it twice without editing anything cannot
 * produce a different answer. A loop is therefore never progress — it is an
 * agent burning tokens against a number it cannot move, which is exactly the
 * §12-question-5 failure ("could it burn many plan_layout calls?"). The cap
 * does not refuse to answer: refusing would break a legitimate re-read (e.g.
 * showing the user the plan again), and an agent that cannot get an answer
 * tends to retry harder. It reports, in the response, that the layout is
 * identical to last time and what the only faithful next move is.
 */
const PLAN_ITERATION_CAP = 5

/**
 * Consecutive `plan_layout` calls per workspace that returned the same layout.
 * Process-scoped (one MCP server per client session), and reset in the two cases
 * that mean the agent is not looping: the answer changed (an edit actually moved
 * the layout), or `build_pdf` ran (it acted on the answer). Without the second
 * reset, five plans followed by a build left the NEXT plan still saying
 * "capReached — stop planning and act" at an agent that had just done exactly
 * that.
 *
 * @type {Map<string, { fingerprint: string, count: number }>}
 */
const planIterations = new Map()

/** Bound the map so a long-lived server that sees many workspaces cannot grow without limit. */
const MAX_TRACKED_WORKSPACES = 32

/** @param {string} dir @param {string} fingerprint */
function trackPlanIteration(dir, fingerprint) {
  const prev = planIterations.get(dir)
  const count = prev?.fingerprint === fingerprint ? prev.count + 1 : 1
  if (!planIterations.has(dir) && planIterations.size >= MAX_TRACKED_WORKSPACES) {
    planIterations.clear()
  }
  planIterations.set(dir, { fingerprint, count })
  return {
    count,
    cap: PLAN_ITERATION_CAP,
    /** Did this call return the same layout as the previous one for this workspace? */
    unchanged: count > 1,
    capReached: count >= PLAN_ITERATION_CAP
  }
}

export async function planLayout(/** @type {{ dir?: string }} */ { dir } = {}) {
  /** @type {string[]} */
  const notices = []
  const { themeName, layoutName, isSingleColumn, config, plan } = await planCV({
    contentDir: contentDirOf(dir),
    fontsDir: resolveFontsDir(),
    warn: (msg) => notices.push(msg)
  })
  const diagnostics = layoutDiagnostics(plan, config)
  const iteration = trackPlanIteration(workspace(dir), JSON.stringify(diagnostics))

  if (iteration.capReached) {
    notices.push(
      `plan_layout has returned the identical layout ${iteration.count} times for this workspace — ` +
        `nothing you have done since the first call changed it. Stop planning and act: build the ` +
        `PDF and look at it, or put the trade-off to the user (shorter bullets, one fewer role, a ` +
        `section they choose to cut) so they can pick what goes. CVX has no layout levers: the ` +
        `layout follows the content, so only a content edit moves it. Never drop content to fit — the user chooses what goes.`
    )
  }

  return {
    ok: true,
    /** Nothing was written: this is a dry run, and the PDF still has to be built. */
    rendered: false,
    /**
     * Which document this plan describes. Always the DESIGNED variant: the
     * ATS/single-column variant is auto-flowed by react-pdf and never packed,
     * so there is no plan of it to report and its sheet count can differ.
     */
    variant: /** @type {const} */ ('designed'),
    theme: isSingleColumn ? null : themeName,
    layout: layoutName,
    diagnostics,
    note: isSingleColumn
      ? `The "${layoutName}" layout is single-column: react-pdf flows it automatically and CVX ` +
        `does not pack it, so there is no pagination plan to report. Layout diagnostics exist ` +
        `for the designed two-column variant only.`
      : `These numbers describe the DESIGNED (two-column) variant only — the one build_pdf ` +
        `writes without ats: true. The ATS variant is a single column react-pdf flows on its ` +
        `own; CVX never packs it, so it has no plan and its page count can differ from ` +
        `totalPages. Build it to find out; there is no dry run for it.`,
    iteration,
    // See buildPdf for why this is not called `warnings`.
    notices
  }
}

/**
 * Tool metadata consumed by the MCP server. Descriptions are written for the
 * calling model: state when to call the tool, not just what it does.
 */
export const TOOLS = [
  {
    name: 'get_schema',
    title: 'Get the CVX content schema and inventory',
    description:
      'Call this FIRST, before writing or editing any cv-content YAML. Returns the canonical JSON Schema for every content file (personal, summary, experience, education, competencies, achievements, referees, keywords, config, layouts) plus the available themes and layouts. The schema is the authoritative contract for keys and shapes. It also lists, under `guides`, the model-facing documentation that ships inside this package — `ai-guide` (the full CVX playbook) and `cv-schema` (the field-by-field reference with examples). Each entry carries an absolute `path`; read it directly if your client can read files outside the workspace, and otherwise ask for the text INLINE by calling get_schema again with guides: ["ai-guide"]. That works offline and needs no file access — prefer it over fetching the docs from GitHub, which returns whatever the main branch says today rather than the version you are running.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description:
            'Absolute path of the workspace folder containing cv-content/. Defaults to the server working directory.'
        },
        guides: {
          type: 'array',
          items: { type: 'string', enum: ['ai-guide', 'cv-schema'] },
          description:
            'Return the full text of these packaged guides inline, in the `guides` array. Omit it (the default) to get the inventory only — ai-guide.md alone is ~20 kB, so ask for it when you need it, not on every call.'
        }
      },
      additionalProperties: false
    },
    handler: getSchema
  },
  {
    name: 'init_cv',
    title: 'Scaffold a starter cv-content/ folder',
    description:
      "Creates cv-content/ with a complete example CV (Bruce Wayne) in the given workspace folder. Call when the user wants to start a CV and no cv-content/ exists. Refuses to overwrite an existing folder. After init, replace the example content with the user's real, truthful details — never invent facts.",
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description:
            'Absolute path of the workspace folder to scaffold into. Defaults to the server working directory.'
        }
      },
      additionalProperties: false
    },
    handler: initCv
  },
  {
    name: 'validate_cv',
    title: 'Validate cv-content/ and get every problem at once',
    description:
      'Checks every YAML file in cv-content/ against the canonical schema plus practical checks (missing required files, unknown theme/layout, photo problems, stray files). Returns all errors and warnings with file + field paths and suggested fixes. Call after every edit and always before build_pdf. Fix errors, re-validate, then build.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description:
            'Absolute path of the workspace folder containing cv-content/. Defaults to the server working directory.'
        },
        strict: {
          type: 'boolean',
          description:
            'Treat warnings (e.g. unknown keys) as errors. Default true — recommended for agents.',
          default: true
        }
      },
      additionalProperties: false
    },
    handler: validateCv
  },
  {
    name: 'build_pdf',
    title: 'Render cv-content/ to a PDF',
    description:
      'Renders cv-content/ to a pixel-perfect CV PDF in the workspace folder, named after the person (e.g. jane-doe.pdf). Set ats: true for the ATS-safe single-column variant (machine-friendly, no colours; produces <name>-ats.pdf). Run validate_cv first — a build with invalid content can fail or render wrong. Returns the same layout diagnostics as plan_layout (page count, per-page column fills, which roles and sections landed on which page, overflow warnings) for the PDF it just wrote, so you can report the result without a second call. Two separate lists come back: `diagnostics.warnings` is the structured list of layout defects, each with a `code` (`overflow`, `page1-no-experience`) — match on the code, never the wording; `notices` is plain-text notes about the run. Note that `diagnostics` describes the designed two-column pagination and is null for ats: true.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description:
            'Absolute path of the workspace folder containing cv-content/. The PDF is written here. Defaults to the server working directory.'
        },
        ats: {
          type: 'boolean',
          description:
            'Build the ATS-safe single-column variant instead of the designed two-column CV.',
          default: false
        }
      },
      additionalProperties: false
    },
    handler: buildPdf
  },
  {
    name: 'plan_layout',
    title: 'See how the CV will paginate — without rendering a PDF',
    description:
      'Dry run: packs cv-content/ and returns the pagination plan and layout diagnostics WITHOUT writing a PDF. Use it before build_pdf to tell the user which roles land on page 1, how many pages the CV takes, and whether anything overflows — the pre-build preview, with real numbers instead of a guess. It answers for the DESIGNED two-column variant only: the ATS variant is a single column react-pdf flows on its own, CVX never packs it, and its page count can differ — there is no dry run for it, so build it to find out. Returns per page: column fill ratios (used/budget, normally 0..1, and ABOVE 1 exactly when that page is over budget — see overflowPt), the experience entries and sidebar sections placed there (item and bullet ranges are 0-based and end-exclusive: [6,8) of 8 is the last TWO items), overflow in points, and which column holds no packed blocks. totalPages counts PLANNED pages; an overflowing page spills onto an extra physical sheet the numbering does not count, so check totals.overflowPt before quoting a page count. IMPORTANT, and it is not a bug: CVX has NO layout levers — the layout is a function of the content, so calling this twice without editing cv-content/ returns exactly the same answer. emptyColumn/emptyColumnPages are DIAGNOSTICS, NOT TARGETS: a page whose sidebar outlasts the experience list is normal, and packing to remove one measurably produces worse CVs (thin, fragmented pages). The one exception has its own warning code: page1-no-experience means page 1 carries no roles at all, which IS worth raising with the user. CVX renders 100% of the YAML and never drops, clips, or hides text to fit; if the user wants fewer pages, surface the trade-off (shorter bullets, fewer roles, a section they agree to cut) and let them decide what goes — never drop content on your own initiative to hit a page count. Once they have chosen, making the edit is your job. These numbers price the layout — they do not tell you whether the page looks right. Open the PDF that build_pdf returns and look at it.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: {
          type: 'string',
          description:
            'Absolute path of the workspace folder containing cv-content/. Nothing is written. Defaults to the server working directory.'
        }
      },
      additionalProperties: false
    },
    handler: planLayout
  }
]
