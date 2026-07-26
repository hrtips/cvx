/**
 * MCP tool implementations — transport-agnostic.
 *
 * Four tools, each a thin wrapper over the same library functions the CLI
 * uses, returning the same JSON shapes as the CLI's --json envelopes. The
 * MCP server (server.js) only marshals these in and out of the protocol.
 *
 * Every tool takes an optional `dir` — the workspace folder that contains
 * (or will receive) cv-content/. MCP clients don't reliably set the server's
 * working directory, so agents should pass it explicitly.
 */
import { existsSync, cpSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, resolve, basename } from 'path'
import { validateContent } from '../pdf/validateContent.js'
import { renderCV } from '../pdf/render.js'
import { discoverThemes } from '../pdf/themes/index.js'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const workspace = (dir) => resolve(dir ?? process.cwd())
const contentDirOf = (dir) => join(workspace(dir), 'cv-content')

export async function getSchema({ dir } = {}) {
  const schema = JSON.parse(readFileSync(join(pkgRoot, 'schema', 'v1', 'cvx.schema.json'), 'utf8'))
  const themes = Object.keys(await discoverThemes()).map((name) => ({ name, default: name === 'teal' }))

  const layoutsDir = join(contentDirOf(dir), 'layouts')
  const builtIn = ['two-column', 'single-column']
  const names = new Set(builtIn)
  const layouts = builtIn.map((name) => ({ name, default: name === 'two-column', source: 'built-in' }))
  if (existsSync(layoutsDir)) {
    for (const f of readdirSync(layoutsDir).filter((f) => f.endsWith('.yaml'))) {
      const name = basename(f, '.yaml')
      if (!names.has(name)) layouts.push({ name, default: false, source: 'cv-content/layouts' })
      names.add(name)
    }
  }
  return { schemaVersion: 1, schema, themes, layouts }
}

export async function initCv({ dir } = {}) {
  const dest = contentDirOf(dir)
  if (existsSync(dest)) {
    return { ok: false, error: { code: 'already-exists', message: `${dest} already exists — refusing to overwrite` } }
  }
  cpSync(join(pkgRoot, 'template', 'cv-content'), dest, { recursive: true })
  return {
    ok: true,
    dest,
    nextSteps: [
      'Edit the YAML files in cv-content/ with real, truthful details (see AGENTS.md there)',
      'Replace or delete cv-content/images/profile.jpg — it is the example person\'s photo; never ship it on a real CV',
      'Ask the user for their photo (square, 400x400px+) — it cannot be generated; the CV renders fine without one',
      'Run validate_cv after every edit, then build_pdf',
    ],
  }
}

export async function validateCv({ dir, strict = true } = {}) {
  const result = validateContent({ contentDir: contentDirOf(dir), strict })
  return { ok: result.ok, schemaVersion: 1, strict, errors: result.errors, warnings: result.warnings, checked: result.checked }
}

export async function buildPdf({ dir, ats = false } = {}) {
  // lib/fonts in the published package; src/fonts in a repo checkout pre-build
  const libFonts = join(pkgRoot, 'lib', 'fonts')
  const warnings = []
  const { buffer, filename, themeName, layoutName } = await renderCV({
    contentDir: contentDirOf(dir),
    fontsDir: existsSync(libFonts) ? libFonts : join(pkgRoot, 'src', 'fonts'),
    ats,
    warn: (msg) => warnings.push(msg),
  })
  const path = join(workspace(dir), filename)
  writeFileSync(path, buffer)
  return { ok: true, filename, path, bytes: buffer.byteLength, ats, theme: ats ? null : themeName, layout: ats ? null : layoutName, warnings }
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
      'Call this FIRST, before writing or editing any cv-content YAML. Returns the canonical JSON Schema for every content file (personal, summary, experience, education, competencies, achievements, referees, keywords, config, layouts) plus the available themes and layouts. The schema is the authoritative contract for keys and shapes.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Absolute path of the workspace folder containing cv-content/. Defaults to the server working directory.' },
      },
      additionalProperties: false,
    },
    handler: getSchema,
  },
  {
    name: 'init_cv',
    title: 'Scaffold a starter cv-content/ folder',
    description:
      'Creates cv-content/ with a complete example CV (Bruce Wayne) in the given workspace folder. Call when the user wants to start a CV and no cv-content/ exists. Refuses to overwrite an existing folder. After init, replace the example content with the user\'s real, truthful details — never invent facts.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Absolute path of the workspace folder to scaffold into. Defaults to the server working directory.' },
      },
      additionalProperties: false,
    },
    handler: initCv,
  },
  {
    name: 'validate_cv',
    title: 'Validate cv-content/ and get every problem at once',
    description:
      'Checks every YAML file in cv-content/ against the canonical schema plus practical checks (missing required files, unknown theme/layout, photo problems, stray files). Returns all errors and warnings with file + field paths and suggested fixes. Call after every edit and always before build_pdf. Fix errors, re-validate, then build.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Absolute path of the workspace folder containing cv-content/. Defaults to the server working directory.' },
        strict: { type: 'boolean', description: 'Treat warnings (e.g. unknown keys) as errors. Default true — recommended for agents.', default: true },
      },
      additionalProperties: false,
    },
    handler: validateCv,
  },
  {
    name: 'build_pdf',
    title: 'Render cv-content/ to a PDF',
    description:
      'Renders cv-content/ to a pixel-perfect CV PDF in the workspace folder, named after the person (e.g. jane-doe.pdf). Set ats: true for the ATS-safe single-column variant (machine-friendly, no colours; produces <name>-ats.pdf). Run validate_cv first — a build with invalid content can fail or render wrong.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: 'Absolute path of the workspace folder containing cv-content/. The PDF is written here. Defaults to the server working directory.' },
        ats: { type: 'boolean', description: 'Build the ATS-safe single-column variant instead of the designed two-column CV.', default: false },
      },
      additionalProperties: false,
    },
    handler: buildPdf,
  },
]
