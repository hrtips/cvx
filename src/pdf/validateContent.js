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
import { overflowWarnings, planTwoColumn, SIDEBAR_SECTION_KEYS } from './layout.js'
import { normalizeLayout } from './loadLayout.js'
import {
  createMeasurer,
  describeUnsupportedGlyphFinding,
  findUnsupportedGlyphs
} from './measure.js'
import { PHOTO_EXTENSIONS } from './profilePhoto.js'
import { THEMES } from './themes/index.js'

const Ajv2020 = /** @type {any} */ (Ajv2020Module).default ?? Ajv2020Module

const SCHEMA_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
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

function didYouMean(/** @type {string} */ word, /** @type {string[]} */ candidates) {
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
    const theme = THEMES[/** @type {string} */ (config.theme)] ?? THEMES.teal
    try {
      const plan = planTwoColumn({
        content: /** @type {import('./types.js').CVContent} */ (/** @type {unknown} */ (docs)),
        theme,
        measure
      })
      for (const w of overflowWarnings(plan)) {
        add('warning', 'summary.yaml', 'page-overflow', {
          message: w.message,
          suggestion: `page ${w.page} of the render carries a single block taller than a whole page, which no pagination can fit`
        })
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
      sidebar.forEach((key, i) => {
        if (typeof key !== 'string') return
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
