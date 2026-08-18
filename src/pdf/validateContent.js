/**
 * validateContent.js — `cvx validate` engine.
 *
 * Validates every YAML file in cv-content/ against the canonical JSON Schema
 * (schema/v1/cvx.schema.json) and adds the checks the schema alone can't
 * express: required-in-practice files, theme/layout inventory, photo probe,
 * stray files. Reports everything at once; never stops at the first problem.
 *
 * Severity model: schema violations are errors, except unknown keys which are
 * warnings by default and errors under `strict` (agents pass --strict; humans
 * with extra keys keep working builds). Returns plain data — the CLI decides
 * how to print it.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020Module from 'ajv/dist/2020.js'
import { load as loadYaml } from 'js-yaml'
import { MAIN_SLOT_KEYS, overflowWarnings, planTwoColumn, SIDEBAR_SECTION_KEYS } from './layout.js'
import { normalizeLayout } from './loadLayout.js'
import {
  createMeasurer,
  describeUnsupportedGlyphFinding,
  findUnsupportedGlyphs
} from './measure.js'
import { PHOTO_EXTENSIONS } from './profilePhoto.js'
import { resolveDocument } from './resolveDocument.js'
import { THEMES } from './themes/index.js'
import { SPACING_BOUNDS, SPACING_KEYS } from './themes/layoutSpacing.js'

const Ajv2020 = /** @type {any} */ (Ajv2020Module).default ?? Ajv2020Module

// CVX_ASSET_ROOT overrides the package root for the standalone bundle, whose
// schema is extracted to a directory rather than sitting beside the code
// (unset in a normal install; see scripts/build-standalone.js).
const SCHEMA_PATH = join(
  process.env.CVX_ASSET_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  'schema',
  'v1',
  'cvx.schema.json'
)
/**
 * The key the canonical schema is registered under inside this Ajv instance.
 *
 * A literal, NOT `canonicalSchema.$id`: schema/v1/*.json deliberately declare
 * no `$id` (see the `$comment` at the top of cvx.schema.json — an `$id` naming
 * the `main` branch would resolve the per-file `$ref`s back to `main` and make
 * a scaffolded file's pinned `$schema=` URL cosmetic). Ajv needs *some* key to
 * `$ref` the canonical schema by; this is local to this process and never
 * appears in a file or on the network.
 */
const SCHEMA_KEY = 'cvx.schema.json'
const BUILT_IN_LAYOUTS = ['two-column', 'single-column']
// Files the default two-column layout cannot render without (the packer
// crashes on a missing list, and personal.name drives the filename).
const REQUIRED_FILES = ['personal', 'summary', 'experience']

/**
 * @typedef {{ path?: string, message: string, suggestion?: string }} RawFinding
 * @typedef {{ path: string, message: string, suggestion?: string, unknownKey?: boolean, keyword?: string }} MapFinding
 * @typedef {{ file: string, code: string, path: string, message: string, suggestion?: string }} Finding
 * @typedef {{ mark: { line: number }, reason?: string, message?: string }} YamlErr
 */

/** @type {any} */
let ajv
/** @type {any} */
let canonicalSchema
function getValidator(/** @type {string} */ def) {
  if (!ajv) {
    canonicalSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
    ajv = new Ajv2020({ allErrors: true, verbose: true })
    ajv.addSchema(canonicalSchema, SCHEMA_KEY)
  }
  if (!canonicalSchema.$defs[def]) return null
  return (
    ajv.getSchema(`${SCHEMA_KEY}#/$defs/${def}`) ??
    ajv.compile({ $ref: `${SCHEMA_KEY}#/$defs/${def}` })
  )
}

function levenshtein(/** @type {string} */ a, /** @type {string} */ b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = Math.min(
        m[i - 1][j] + 1,
        m[i][j - 1] + 1,
        m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
  return m[a.length][b.length]
}

function didYouMean(/** @type {string} */ word, /** @type {readonly string[]} */ candidates) {
  let best = null,
    bestDist = Infinity
  for (const c of candidates) {
    const d = levenshtein(word.toLowerCase(), c.toLowerCase())
    if (d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return bestDist <= Math.max(2, Math.floor(word.length / 3)) ? best : null
}

/**
 * Did the author actually write this slot as a KEY?
 *
 * `normalizeLayout` stringifies whatever it is given, so a malformed slot
 * (`- ~`, a number, a nested list) arrives at the renderability checks as a
 * plain string — and reporting `"a,b" cannot render in a main slot` quotes a
 * key nobody typed, on top of the shape error the schema already raised for
 * the same path. A second, invented diagnostic is worse than none.
 *
 * The object test mirrors `normalizeItem`'s own rule exactly: an object slot
 * names a key only when it has EXACTLY ONE. `{}` names no section and
 * `{summary: {}, experience: {}}` names two, so both stringify to
 * "[object Object]" — and the schema already reports each of them as a
 * min/maxProperties violation at the same path.
 *
 * Arrays are excluded explicitly, because `typeof [] === 'object'` and
 * `[] !== null` would otherwise make a nested list read as the legal object
 * form. Both of these were latent gaps in the sidebar arm too — never
 * exercised, because the only fixtures for them use MAIN slots, which nothing
 * checked until RV1.
 */
const authoredSlot = (/** @type {unknown} */ raw) =>
  raw === undefined ||
  typeof raw === 'string' ||
  (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length === 1)

const jsonType = (/** @type {unknown} */ v) =>
  v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v

/**
 * Turn ajv's error list into deduplicated, human-actionable findings.
 * oneOf handling: keep only the branch errors whose declared type matches the
 * actual instance type (e.g. an object bullet gets the object branch's
 * "missing text", not "must be string"); if no branch matches, emit one
 * summary error from the subschema description.
 */
function mapAjvErrors(/** @type {any[]} */ errors, /** @type {any} */ doc) {
  const oneOfPaths = new Set(errors.filter((e) => e.keyword === 'oneOf').map((e) => e.instancePath))
  /** @type {MapFinding[]} */
  const findings = []
  const seen = new Set()

  for (const err of errors) {
    const container = [...oneOfPaths].find((p) => err.instancePath.startsWith(p))
    if (container !== undefined && err.keyword !== 'oneOf') {
      // Branch error inside a oneOf: keep only if its branch type matches the instance.
      const instance = container
        .split('/')
        .slice(1)
        .reduce(
          (/** @type {any} */ v, /** @type {string} */ k) =>
            v?.[/** @type {any} */ (k === '' ? undefined : k)],
          doc
        )
      if (
        err.instancePath === container &&
        err.keyword === 'type' &&
        err.params.type !== jsonType(instance)
      )
        continue
    }

    /** @type {MapFinding} */
    let finding
    switch (err.keyword) {
      case 'required':
        finding = {
          path: err.instancePath || '(root)',
          message: `missing required key "${err.params.missingProperty}"`
        }
        break
      case 'additionalProperties': {
        const key = err.params.additionalProperty
        // Not a typo: these two were real config keys, REMOVED by maintainer
        // ruling (design-layout-fidelity.md, Review outcome #1) after being
        // measured as an anti-lever — the page count never moved and every
        // effective setting pushed content onto an unnumbered extra sheet.
        // A "did you mean" here would send the user hunting for a near-miss
        // spelling of a key that no longer exists.
        if (key === 'page1ExperienceCount' || key === 'page1SplitBullets') {
          finding = {
            path: err.instancePath || '(root)',
            message: `"${key}" was removed — automatic packing replaced it (it never reduced the page count, and forcing it pushed content onto an unnumbered extra sheet)`,
            suggestion: 'delete the key; pagination is automatic and never overflows',
            unknownKey: true
          }
          break
        }
        const guess = didYouMean(key, Object.keys(err.parentSchema?.properties ?? {}))
        finding = {
          path: err.instancePath || '(root)',
          message: `unknown key "${key}"`,
          suggestion: guess ? `did you mean "${guess}"?` : undefined,
          unknownKey: true
        }
        break
      }
      case 'enum': {
        const allowed = err.params.allowedValues
        const value = err.instancePath
          .split('/')
          .slice(1)
          .reduce((/** @type {any} */ v, /** @type {string} */ k) => v?.[k], doc)
        const guess = typeof value === 'string' ? didYouMean(value, allowed) : null
        finding = {
          path: err.instancePath || '(root)',
          message: `"${value}" is not one of: ${allowed.join(', ')}`,
          suggestion: guess ? `did you mean "${guess}"?` : undefined
        }
        break
      }
      case 'const':
        finding = {
          path: err.instancePath || '(root)',
          message: `must be ${JSON.stringify(err.params.allowedValue)}`
        }
        break
      case 'oneOf': {
        const desc = (err.parentSchema?.description ?? '').split('.')[0]
        finding = {
          path: err.instancePath || '(root)',
          message: desc ? `invalid shape — ${desc.toLowerCase()}` : 'invalid shape'
        }
        break
      }
      case 'type':
        finding = {
          path: err.instancePath || '(root)',
          message: `must be ${err.params.type.replace(',', ' or ')}`
        }
        break
      case 'minimum':
        finding = { path: err.instancePath || '(root)', message: `must be >= ${err.params.limit}` }
        break
      case 'minLength':
        finding = { path: err.instancePath || '(root)', message: 'must not be empty' }
        break
      default:
        finding = { path: err.instancePath || '(root)', message: err.message }
    }
    finding.keyword = err.keyword
    const key = `${finding.path}|${finding.message}`
    if (!seen.has(key)) {
      seen.add(key)
      findings.push(finding)
    }
  }
  // A oneOf summary ("invalid shape") is noise when a precise branch finding
  // already points inside the same instance.
  return findings
    .filter(
      (f, _, all) =>
        f.keyword !== 'oneOf' ||
        !all.some((o) => o !== f && (o.path === f.path || o.path.startsWith(`${f.path}/`)))
    )
    .map(({ keyword, ...f }) => f)
}

/**
 * Validate a cv-content directory. Returns { ok, errors, warnings, checked }.
 * Each finding: { file, path, message, suggestion?, code }.
 *
 * @param {object} opts
 * @param {string} opts.contentDir
 * @param {boolean} [opts.strict]
 * @param {string} [opts.fontsDir]  absolute path to the Lato fonts directory
 *   (same one render.js is given). When provided, powers two checks with
 *   real font metrics instead of the char-width estimate: the page-overflow
 *   estimate (C2) and the unsupported-glyph scan (design doc G-a). Omit to
 *   skip both real-measurement checks entirely — NOT to fall back to a loose
 *   approximation of them, which would be noisier than useful now that
 *   PAGE1_OVERFLOW_WARN_THRESHOLD is sized for accurate measurement (see
 *   layout.js). Every real call site (`cvx validate`, the `validate_cv` MCP
 *   tool) always has one available and passes it.
 */
export function validateContent(
  {
    contentDir,
    strict = false,
    fontsDir
  } = /** @type {import('./types.js').ValidateOptions} */ ({})
) {
  /** @type {Finding[]} */
  const errors = []
  /** @type {Finding[]} */
  const warnings = []
  /** @type {string[]} */
  const checked = []
  const measure = fontsDir && existsSync(fontsDir) ? createMeasurer(fontsDir) : undefined
  const add = (
    /** @type {'error'|'warning'} */ severity,
    /** @type {string} */ file,
    /** @type {string} */ code,
    /** @type {RawFinding} */ f
  ) =>
    (severity === 'error' ? errors : warnings).push({
      file,
      code,
      path: f.path ?? '(root)',
      message: f.message,
      ...(f.suggestion ? { suggestion: f.suggestion } : {})
    })

  if (!existsSync(contentDir)) {
    add('error', '', 'missing-content-dir', {
      message: 'content directory not found',
      suggestion: 'run "cvx init" to scaffold one'
    })
    return { ok: false, errors, warnings, checked }
  }

  getValidator('personal') // force schema load
  const knownDefs = Object.keys(canonicalSchema.$defs)
  /** @type {Record<string, unknown>} */
  const docs = {}
  const files = readdirSync(contentDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))

  for (const file of files) {
    const def = basename(file, file.endsWith('.yml') ? '.yml' : '.yaml')
    checked.push(file)
    if (file.endsWith('.yml')) {
      add('warning', file, 'wrong-extension', {
        message: 'file uses .yml — cvx only reads .yaml files, this file is ignored',
        suggestion: `rename to ${def}.yaml`
      })
      continue
    }
    let doc
    try {
      doc = loadYaml(readFileSync(join(contentDir, file), 'utf8'))
    } catch (e) {
      add('error', file, 'yaml-parse', {
        path: /** @type {YamlErr} */ (e).mark
          ? `line ${/** @type {YamlErr} */ (e).mark.line + 1}`
          : '(root)',
        message: `YAML parse error: ${/** @type {YamlErr} */ (e).reason ?? /** @type {YamlErr} */ (e).message}`
      })
      continue
    }
    docs[def] = doc
    if (doc == null) continue // empty file just drops the section

    const validate = getValidator(def)
    if (!validate) {
      const guess = didYouMean(
        def,
        knownDefs.filter(
          (d) =>
            !d.endsWith('Entry') &&
            ![
              'bulletItem',
              'progressionStep',
              'keywordGroup',
              'layoutSlot',
              'layoutPage',
              'layout',
              'nonEmptyString'
            ].includes(d)
        )
      )
      add('warning', file, 'unknown-file', {
        message: 'not a file cvx reads — it will be ignored',
        suggestion: guess ? `did you mean "${guess}.yaml"?` : undefined
      })
      continue
    }
    if (!validate(doc)) {
      for (const f of mapAjvErrors(validate.errors, doc)) {
        const severity = f.unknownKey && !strict ? 'warning' : 'error'
        add(severity, file, f.unknownKey ? 'unknown-key' : 'schema', f)
      }
    }
  }

  // Required-in-practice files (the default layouts crash without them).
  for (const req of REQUIRED_FILES) {
    if (docs[req] == null) {
      add('error', `${req}.yaml`, 'missing-file', {
        message: docs[req] === null ? 'file is empty but required' : 'file is missing but required',
        suggestion:
          req === 'personal'
            ? 'at minimum provide "name"'
            : 'the default layouts cannot render without it'
      })
    }
  }

  // Content that cannot fit the page it is planned onto: the surplus spills
  // onto extra PHYSICAL sheets the page numbering never counts, so surface it
  // here where agents look first. This runs the real two-flow packer — a plan,
  // not a render, so it costs milliseconds and no glyphs — against real font
  // metrics whenever `fontsDir` was given (see this function's docblock), which
  // makes this warning and `cvx build`'s agree by construction.
  //
  // Before C3b this covered only `page1ExperienceCount`; every other way to
  // overflow a page (an over-tall summary, one page-tall bullet, one page-tall
  // sidebar item) was silent. `overflowWarnings` is the general predicate and
  // emits at most one line per page.
  // ONLY on content that already passed the schema. The packer trusts its input
  // — `layout.js` does `typeof b === 'string' ? b : b.text` — so a bullet that
  // is neither (a bare `- ` in YAML parses to null) threw straight out of
  // validate: raw `Cannot read properties of null (reading 'text')`, exit 64,
  // and NO findings at all. The schema catches that content perfectly well
  // (`/0 must be string`); the estimate simply ran before the user was told.
  //
  // A crash is the worst possible failure for this command specifically: its
  // entire job is to explain what is wrong, and 64 says "you used the CLI
  // wrong" when the problem is in their file. Errors first, estimate second —
  // and the estimate is an extra courtesy on top of a clean bill of health, so
  // there is nothing to lose by skipping it when the news is already bad.
  const config = /** @type {import('./types.js').CVConfig} */ (docs.config ?? {})
  if (errors.length === 0 && Array.isArray(docs.experience) && docs.personal) {
    try {
      // Through the SAME chain the build uses. This block used to call
      // `planTwoColumn` with a theme looked up by name and NO layout, so
      // `validate` estimated a different document than `build` rendered
      // whenever a workspace had its own `layouts/*.yaml` — the divergence
      // ARCHITECTURE §8 tracked. Two things made that load-bearing rather than
      // untidy: D11's `spacing:` block lives on the layout and scales the theme
      // the measurements come from, and `section-has-no-slot` below is a
      // statement ABOUT the layout, invisible to a plan built without it (the
      // built-in default renders `referees`; the shipped layout file does not,
      // which is the whole defect).
      const layoutName = /** @type {string} */ (config.layout ?? 'two-column')
      const layoutPath = join(contentDir, 'layouts', `${layoutName}.yaml`)
      let userLayout
      if (existsSync(layoutPath)) {
        // A layout that fails to parse or validate is reported by its own
        // findings below; here it just means "estimate against the default".
        try {
          userLayout = normalizeLayout(
            /** @type {import('./types.js').RawLayout} */ (
              loadYaml(readFileSync(layoutPath, 'utf8'))
            )
          )
        } catch {
          userLayout = undefined
        }
      }
      // RV7: hand resolveDocument the REGISTRY and let it pick the default, the
      // same way render.js now does. Passing `THEMES[config.theme]` — undefined
      // whenever the user set no theme — is what made these two surfaces
      // disagree about which theme the document has.
      const resolved = resolveDocument({ config, themes: THEMES, layout: userLayout })
      const plan = planTwoColumn({
        content: /** @type {import('./types.js').CVContent} */ (/** @type {unknown} */ (docs)),
        layout: resolved.activeLayout,
        theme: resolved.activeTheme,
        measure
      })
      // Content the layout renders nowhere — the same predicate `build` reports
      // as `section-has-no-slot`, surfaced here so it is caught before a build
      // rather than after one.
      // A WARNING here and a DEFECT in the build diagnostics, deliberately, and
      // the asymmetry is the point rather than an oversight. `validate` asks
      // whether the workspace is well-formed, and this one is: keeping a
      // populated `referees.yaml` for the ATS variant while the designed layout
      // omits the slot is a legitimate setup, and the only escape hatch an
      // error would leave is emptying the file — which drops the content from
      // the ATS PDF too. `build` asks whether the artifact matches the content,
      // and there the answer is no: the two PDFs differ. Same condition, two
      // honest answers to two different questions.
      for (const key of plan.unplacedSections ?? []) {
        add('warning', `${key}.yaml`, 'section-has-no-slot', {
          message: `"${key}" has content, and no slot in layout "${layoutName}" renders it — it will appear in the ATS PDF and not in the designed one`,
          suggestion: `add "${key}" to a slot in cv-content/layouts/${layoutName}.yaml, or empty the file if the omission is intended`
        })
      }
      // RV9: the overflow half is TWO-COLUMN ONLY. `planTwoColumn` packs against
      // a fictional 312pt main column for a single-column document, whose real
      // render is ~511pt wide, auto-flowed by react-pdf, and has no plan, no
      // page budget and no page badge by construction (`render.js` returns
      // `diagnostics: null` for it, and the MCP tool description says so).
      // Publishing `page-overflow` there described a document that will never
      // exist — "it flows onto an extra physical sheet the page numbering does
      // not count", about a variant with no page numbering — and the
      // agent-facing docs teach that warning's remediation, so a driving LLM
      // would go and shorten a summary that has no overflow.
      //
      // `section-has-no-slot` above stays for both: it only asks which slot
      // lists mention which keys, with no geometry in it at all.
      if (!resolved.isSingleColumn) {
        for (const w of overflowWarnings(plan)) {
          add('warning', 'summary.yaml', 'page-overflow', {
            message: w.message,
            suggestion: `page ${w.page} of the render carries a single block taller than a whole page, which no pagination can fit`
          })
        }
      }
    } catch {
      // Belt and braces, and deliberately silent. Reaching here means the
      // packer threw on content the schema accepted — a bug in one of them,
      // not something the user can act on. Losing one advisory warning is a
      // fair price for `validate` never being the thing that crashes; the
      // findings it already gathered still reach the user.
    }
  }

  // Unsupported glyphs (design doc G-a): the bundled Lato TTFs cover only a
  // narrow Western-European-Latin subset (no Cyrillic, Greek, Vietnamese,
  // Turkish ş/ğ, Czech/Romanian diacritics, or any non-Latin script) and CVX
  // registers no fallback font — text using an unsupported character
  // renders INVISIBLY today, silently. Only runs with real font metrics
  // available (see this function's docblock); `config`/`keywords` are
  // skipped by findUnsupportedGlyphs() itself (metadata/settings, not
  // rendered text).
  if (measure) {
    for (const finding of findUnsupportedGlyphs(measure, docs)) {
      add('warning', finding.file, 'unsupported-glyphs', {
        path: finding.path,
        message: describeUnsupportedGlyphFinding(finding),
        suggestion:
          'CVX bundles Lato only and registers no fallback font — provide/replace with a font that covers this script if this text must be visible'
      })
    }
  }

  // Layout inventory: unknown layout warns (renderer falls back to built-in).
  const layoutsDir = join(contentDir, 'layouts')
  const userLayouts = existsSync(layoutsDir)
    ? readdirSync(layoutsDir)
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => basename(f, '.yaml'))
    : []
  if (
    typeof config.layout === 'string' &&
    ![...BUILT_IN_LAYOUTS, ...userLayouts].includes(config.layout)
  ) {
    add('warning', 'config.yaml', 'unknown-layout', {
      path: '/layout',
      message: `layout "${config.layout}" not found — the build will fall back to the built-in default`,
      suggestion: didYouMean(config.layout, [...BUILT_IN_LAYOUTS, ...userLayouts])
        ? `did you mean "${didYouMean(config.layout, [...BUILT_IN_LAYOUTS, ...userLayouts])}"?`
        : `available: ${[...BUILT_IN_LAYOUTS, ...userLayouts].join(', ')}`
    })
  }

  // User layout files validate against the layout schema.
  for (const name of userLayouts) {
    const file = `layouts/${name}.yaml`
    checked.push(file)
    let doc
    try {
      doc = loadYaml(readFileSync(join(layoutsDir, `${name}.yaml`), 'utf8'))
    } catch (e) {
      add('error', file, 'yaml-parse', {
        path: /** @type {YamlErr} */ (e).mark
          ? `line ${/** @type {YamlErr} */ (e).mark.line + 1}`
          : '(root)',
        message: `YAML parse error: ${/** @type {YamlErr} */ (e).reason ?? /** @type {YamlErr} */ (e).message}`
      })
      continue
    }
    if (doc == null) continue
    const validate = getValidator('layout')
    if (!validate(doc)) {
      for (const f of mapAjvErrors(validate.errors, doc)) {
        const severity = f.unknownKey && !strict ? 'warning' : 'error'
        add(severity, file, f.unknownKey ? 'unknown-key' : 'schema', f)
      }
    }

    // D11: template spacing is a multiplier with a legibility floor and a
    // waste ceiling. Out-of-range is an ERROR with a field path, never a clamp
    // (ruling R-M): a clamped value silently renders something the author did
    // not ask for. The schema carries the same bounds, so this is belt and
    // braces for a hand-written layout that skipped schema validation.
    const declaredSpacing = /** @type {Record<string, unknown>} */ (
      /** @type {any} */ (doc)?.spacing ?? {}
    )
    for (const [key, value] of Object.entries(declaredSpacing)) {
      if (!SPACING_KEYS.includes(key)) {
        add('error', file, 'unknown-spacing-key', {
          path: `/spacing/${key}`,
          message: `"${key}" is not a spacing group`,
          suggestion: `use one of: ${SPACING_KEYS.join(', ')}`
        })
        continue
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        add('error', file, 'spacing-not-a-number', {
          path: `/spacing/${key}`,
          message: `spacing.${key} must be a number (a multiplier of the theme's value, 1 = unchanged)`
        })
        continue
      }
      if (value < SPACING_BOUNDS.min || value > SPACING_BOUNDS.max) {
        add('error', file, 'spacing-out-of-range', {
          path: `/spacing/${key}`,
          message: `spacing.${key} is ${value} — outside the legible range ${SPACING_BOUNDS.min}–${SPACING_BOUNDS.max}`,
          suggestion: `${value < SPACING_BOUNDS.min ? 'below' : 'above'} the bound; try ${value < SPACING_BOUNDS.min ? SPACING_BOUNDS.min : SPACING_BOUNDS.max}`
        })
      }
    }

    // D2: a `sidebar` slot key the sidebar cannot render used to be dropped in
    // SILENCE — `packSidebar` skips any key `sidebarSectionH` returns null for,
    // and the two-column renderer only draws the slices the packer produced, so
    // e.g. `summary` in a sidebar slot deleted the whole section from the PDF
    // while `validate --strict` still reported ok. The schema cannot catch it
    // (layoutSlot is any non-empty string), so it is checked here. Sections are
    // semantically pinned to their column (§7.2), so this is a real error, not
    // a warning: INV-0 does not permit content to vanish quietly.
    for (const [pageKind, page] of Object.entries(normalizeLayout(doc) ?? {})) {
      const sidebar = /** @type {{ sidebar?: string[] }} */ (page)?.sidebar
      if (!Array.isArray(sidebar)) continue
      // Only slots the author actually WROTE as a key. `normalizeLayout`
      // stringifies whatever it is given, so a malformed slot (`- ~`, a number,
      // a nested list) arrives here as the string "null" — and reporting
      // `"null" cannot render in a sidebar slot` quotes a key nobody typed, on
      // top of the shape error the schema already raised for the same path. A
      // second, invented diagnostic is worse than none.
      const pages = /** @type {Record<string, { sidebar?: unknown[] }>} */ (
        /** @type {{ pages?: unknown }} */ (doc)?.pages ?? doc
      )
      const rawSlots = pages?.[pageKind]?.sidebar ?? []
      sidebar.forEach((key, i) => {
        if (typeof key !== 'string') return
        // A slot the author wrote as a KEY is a string, or the object form
        // (`{ spacer: n }`, `{ education: { continued: true } }`). Anything else
        // — null, a number, a nested list — is a shape the schema has already
        // rejected at this exact path, and `null` in particular reaches this
        // loop as the STRING "null" once normalized. (`typeof null === 'object'`
        // is why the first cut of this guard let it through.)
        if (!authoredSlot(rawSlots[i])) return
        if (key.startsWith('identity-') || key.startsWith('spacer:')) return
        if (SIDEBAR_SECTION_KEYS.includes(key.split(':')[0])) return
        add('error', file, 'slot-not-renderable', {
          path: `/${pageKind}/sidebar/${i}`,
          message: `"${key}" cannot render in a sidebar slot — it would be dropped from the PDF without warning`,
          suggestion: didYouMean(key, SIDEBAR_SECTION_KEYS)
            ? `did you mean "${didYouMean(key, SIDEBAR_SECTION_KEYS)}"?`
            : `move it to a main slot, or use one of: ${SIDEBAR_SECTION_KEYS.join(', ')}`
        })
      })
    }

    // RV1: the same guard for `main` slots, which D2 never covered — so the
    // identical typo was a hard error in one column and a silent deletion in
    // the other. `- experiance` in `first.main` on the shipped scaffold dropped
    // five of sixteen bullets with `validate --strict` clean, `build --strict`
    // reporting `ok: true` and `notices: []`, and the plan still publishing the
    // dropped bullets as `bulletRange: [0, 5]`.
    //
    // RV1, second half: main slots match the WHOLE key, not `split(':')[0]`. The prefix test
    // is right for the sidebar, where `education:continued` legitimately names a
    // sidebar section. In a main slot `:continued` is implemented for
    // `experience` alone (sections/registry.js), so `education:continued`
    // renders nothing — and `frobnicate:continued` walked straight past a check
    // that catches bare `frobnicate`.
    for (const [pageKind, page] of Object.entries(normalizeLayout(doc) ?? {})) {
      const main = /** @type {{ main?: string[] }} */ (page)?.main
      if (!Array.isArray(main)) continue
      const pages = /** @type {Record<string, { main?: unknown[] }>} */ (
        /** @type {{ pages?: unknown }} */ (doc)?.pages ?? doc
      )
      const rawSlots = pages?.[pageKind]?.main ?? []
      main.forEach((key, i) => {
        if (typeof key !== 'string') return
        // Same carve-out as the sidebar arm: a malformed slot is the schema's
        // to report, and quoting a key nobody typed is worse than silence.
        if (!authoredSlot(rawSlots[i])) return
        // Identity blocks draw in either column, same carve-out as the sidebar
        // arm. They are unpriced in a main slot, which is INV-3's known gap
        // (scheduled I4/I6) and reported by `main-slot-unmeasured` — a
        // different complaint from "this renders nothing", and not this
        // guard's to make.
        if (key.startsWith('identity-')) return
        if (MAIN_SLOT_KEYS.includes(key)) return
        // N4: `parseFloat('bogus')` is NaN and registry.js built a View with
        // `height: NaN` from it — silently, against a budget the planner had
        // already charged at a different number. A spacer must carry a real
        // number; `spacer:27abc` prefix-parses to 27, which is also not what
        // was written.
        if (key === 'spacer' || key.startsWith('spacer:')) {
          const arg = key.startsWith('spacer:') ? key.slice('spacer:'.length) : ''
          if (arg !== '' && Number.isFinite(Number(arg))) return
          add('error', file, 'slot-not-renderable', {
            path: `/${pageKind}/main/${i}`,
            message: `"${key}" is not a usable spacer — its height must be a number`,
            suggestion: `write it as \`- spacer: 27\` (points), not "${key}"`
          })
          return
        }
        add('error', file, 'slot-not-renderable', {
          path: `/${pageKind}/main/${i}`,
          message: `"${key}" cannot render in a main slot — it would be dropped from the PDF without warning`,
          suggestion: didYouMean(key, MAIN_SLOT_KEYS)
            ? `did you mean "${didYouMean(key, MAIN_SLOT_KEYS)}"?`
            : `use one of: ${MAIN_SLOT_KEYS.join(', ')}`
        })
      })
    }
  }

  // Photo probe: mirror profilePhoto.js rules and explain near-misses.
  const imagesDir = join(contentDir, 'images')
  if (existsSync(imagesDir)) {
    const images = readdirSync(imagesDir).filter((f) => !f.startsWith('.'))
    const match = images.find((f) => {
      const [base, ext] = [f.slice(0, f.lastIndexOf('.')), f.slice(f.lastIndexOf('.') + 1)]
      return base === 'profile' && PHOTO_EXTENSIONS.includes(ext.toLowerCase())
    })
    if (!match && images.length > 0) {
      const near = images.find((f) => f.toLowerCase().startsWith('profile.'))
      add('warning', 'images/', 'no-photo', {
        message: `no usable profile photo found (need profile.<${PHOTO_EXTENSIONS.join('|')}>)`,
        suggestion: near
          ? `"${near}" has an unsupported extension — convert it to one of: ${PHOTO_EXTENSIONS.join(', ')}`
          : `rename your photo to profile.jpg (found: ${images.slice(0, 3).join(', ')}${images.length > 3 ? ', …' : ''})`
      })
    }
  }

  return { ok: errors.length === 0, errors, warnings, checked }
}
