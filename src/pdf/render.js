// ── Render pipeline ─────────────────────────────────────────────────────────
// Single entry point for turning a cv-content directory into a PDF buffer.
// Shared by the repo export scripts (scripts/export-pdf*.js, run with tsx)
// and the published CLI (bin/cvx.js, run against lib/), so both always
// produce identical output.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { renderToBuffer } from '@react-pdf/renderer'
import { load } from 'js-yaml'
import { createElement } from 'react'
import ATSDocument from './ATSDocument.jsx'
import CVDocument from './CVDocument.jsx'
import { registerFonts } from './fonts.js'
import { overflowWarnings, planTwoColumn } from './layout.js'
import { loadContent } from './loadContent.js'
import { normalizeLayout } from './loadLayout.js'
import {
  createMeasurer,
  describeUnsupportedGlyphFinding,
  findUnsupportedGlyphs
} from './measure.js'
import { setupReproducibility } from './reproducible.js'
import { resolveDocument } from './resolveDocument.js'
import { discoverThemes } from './themes/index.js'

/** Discover layouts from <contentDir>/layouts/*.yaml, keyed by filename. */
export function discoverLayouts(/** @type {string} */ layoutsDir) {
  /** @type {Record<string, import('./types.js').NormalizedLayout>} */
  const layouts = {}
  if (!existsSync(layoutsDir)) return layouts
  for (const file of readdirSync(layoutsDir).filter((f) => f.endsWith('.yaml'))) {
    layouts[basename(file, '.yaml')] = normalizeLayout(
      /** @type {import('./types.js').RawLayout} */ (
        load(readFileSync(join(layoutsDir, file), 'utf-8'))
      )
    )
  }
  return layouts
}

/**
 * Control characters (NUL included) are never part of a name, and are the
 * classic way to truncate a path in a downstream consumer. Filtered by code
 * point rather than by a character-class regex: both linters flag a control
 * range in a literal, and two inline suppressions on one line reads worse
 * than saying the thing plainly.
 */
const withoutControlChars = (/** @type {string} */ s) =>
  [...s]
    .filter((ch) => {
      const cp = /** @type {number} */ (ch.codePointAt(0))
      return cp > 0x1f && cp !== 0x7f
    })
    .join('')

/**
 * The output filename, derived from the person's name.
 *
 * RV0: this is the one place CV content decides where bytes land on disk, and
 * it used to do it with no sanitisation — `name: "../Documents/Resume"` wrote
 * the PDF over that file, outside the workspace, with `validate --strict`
 * clean and the build reporting `✅`. INV-12 ("CV content is data, not
 * commands") was proven for layout numbers by the injection suite and never
 * asked about paths. A name is not a path.
 *
 * The rule, and why it is segment-wise rather than a `basename()`:
 * separators split, `.`/`..` segments are dropped, and what remains is JOINED
 * with hyphens rather than reduced to the last segment. `basename()` would
 * turn `../Documents/Resume` into `resume.pdf` — still inside the workspace,
 * but a likelier collision with a file the user already has than
 * `documents-resume.pdf` is. Nothing is silently discarded either way; this
 * keeps more of what was typed.
 *
 * Unicode letters survive deliberately. Reducing `José Álvarez` to
 * `jos-lvarez` would close the traversal by mangling a user's own name, which
 * is precisely the posture INV-14 rejects — CVX warns about what it cannot
 * render, it does not quietly rewrite it. Filesystems CVX targets take UTF-8.
 */
function deriveFilename(/** @type {string | undefined} */ name, /** @type {string} */ suffix) {
  const base = withoutControlChars((name ?? '').toLowerCase().replace(/\s+/g, '-'))
    .split(/[/\\]/)
    .filter((seg) => seg !== '' && seg !== '.' && seg !== '..')
    .join('-')
    // A leading dot would make the deliverable a hidden file the user cannot
    // find; it is never what a name meant.
    .replace(/^\.+/, '')
  return `${base || 'cv'}${suffix}.pdf`
}

/**
 * Build the real-font measurer for `fontsDir` (C2 / src/pdf/measure.js).
 * Never throws: fontsDir always ships with the package (lib/fonts) or the
 * repo (src/fonts), so this should always succeed, but measurement setup
 * failing is not a reason to fail an entire build — fall back to
 * layout.js's isomorphic char-width estimate and warn once instead.
 */
function tryCreateMeasurer(
  /** @type {string} */ fontsDir,
  /** @type {(msg: string) => void} */ warn
) {
  try {
    return createMeasurer(fontsDir)
  } catch (err) {
    warn(
      `Could not load real font metrics from ${fontsDir} (${/** @type {Error} */ (err).message}) — falling back to the approximate char-width estimator for pagination.`
    )
    return undefined
  }
}

/** Warn about any text CVX will render invisibly (no glyph in the bundled font) — see measure.js's module docblock (design doc G-a). */
function warnAboutUnsupportedGlyphs(
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {import('./types.js').CVContent} */ content,
  /** @type {(msg: string) => void} */ warn
) {
  if (!measure) return
  for (const finding of findUnsupportedGlyphs(measure, content)) {
    const where = finding.path === '(root)' ? finding.file : `${finding.file}${finding.path}`
    warn(
      `${where} ${describeUnsupportedGlyphFinding(finding)} ` +
        `CVX bundles Lato only (Western-European Latin coverage) and registers no fallback font — ` +
        `provide/replace with a font that covers this script if this text must be visible.`
    )
  }
}

function assertContentDir(/** @type {string} */ contentDir) {
  if (!existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}\nRun "cvx init" to scaffold one.`)
  }
}

/**
 * Load the content bag and build the measurer — the part of a build that is
 * identical for every variant, and the whole of what a dry run needs before it
 * can pack.
 *
 * Real font metrics (C2) are injected into layout.js's packing functions
 * (isomorphic — never imported there directly) and used to detect text the
 * bundled font has no glyph for, regardless of which variant is being built
 * (both render through the same Lato font).
 */
function loadAndMeasure(
  /** @type {string} */ contentDir,
  /** @type {string} */ fontsDir,
  /** @type {(msg: string) => void} */ warn
) {
  const { config, content, profilePhoto } = loadContent(contentDir)
  const measure = tryCreateMeasurer(fontsDir, warn)
  warnAboutUnsupportedGlyphs(measure, content, warn)
  return { config, content, profilePhoto, measure }
}

/**
 * Resolve theme + layout and PACK the document — everything `renderCV` does
 * before it touches a glyph, and therefore everything a dry run does at all.
 *
 * `renderCV` and `planCV` share this rather than each doing their own: a second
 * copy of the theme/layout/plan chain is exactly how a dry run comes to describe
 * a document that is not the one the build renders. (Pre-C3a the chain existed
 * three times — render.js, CVDocument.jsx and layout.js each defaulted
 * differently; `resolveDocument.js` collapsed that, and this collapses the
 * caller side of it.)
 *
 * @param {object} args
 * @param {string} args.contentDir
 * @param {import('./types.js').CVConfig} args.config
 * @param {import('./types.js').CVContent} args.content
 * @param {string | null} args.profilePhoto
 * @param {import('./types.js').Measurer | undefined} args.measure
 * @param {(msg: string) => void} args.warn
 */
async function resolveAndPlan({ contentDir, config, content, profilePhoto, measure, warn }) {
  const themes = await discoverThemes()
  const layouts = discoverLayouts(join(contentDir, 'layouts'))
  const layoutName = config.layout ?? 'two-column'
  const layout = layouts[layoutName] ?? undefined

  // RV7: the DEFAULT theme is resolveDocument's to choose, not this function's.
  // `config.theme ?? 'teal'` here is what made `LAYOUT_DEFAULT_THEME` dead on
  // every build while `validate` reached it — two surfaces, two themes, one
  // workspace. Only an EXPLICIT theme is validated here, because only an
  // explicit one can be wrong.
  if (config.theme && !themes[config.theme]) {
    throw new Error(`Unknown theme "${config.theme}". Available: ${Object.keys(themes).join(', ')}`)
  }
  if (layoutName && !layout) {
    warn(
      `Layout "${layoutName}" not found in ${join(contentDir, 'layouts')}. Using built-in default.`
    )
  }

  // Resolve theme/layout ONCE (resolveDocument.js) and plan the pagination here,
  // outside the React tree, so the plan is a value the caller owns rather than a
  // side effect of rendering. CVDocument receives it as a prop. Two reasons this
  // seam matters: the `plan_layout` dry-run (plan + diagnostics, no glyphs)
  // needs the plan without a render, and computing it twice through two
  // different fallback chains would measure a document that is not the one
  // drawn — which is exactly what happened before this, with render.js resolving
  // the theme, CVDocument re-resolving the layout, and layout.js defaulting
  // differently again.
  const resolved = resolveDocument({ config, themes, layout })
  const { themeName, activeTheme: theme } = resolved
  const plan = resolved.isSingleColumn
    ? undefined
    : planTwoColumn({
        content: /** @type {import('./types.js').CVContent} */ ({ ...content, profilePhoto }),
        layout: resolved.activeLayout,
        theme: resolved.activeTheme,
        measure
      })

  // Overflow warnings come off the PLAN this build is about to render, not off
  // a separate estimate: one warning per page that genuinely reaches past its
  // budget, whatever caused it (C3b). The old call site warned only for the
  // config-forced lever (since removed), so the far larger silent cases — an
  // over-tall summary, one page-tall bullet, one page-tall sidebar item —
  // produced an extra, unnumbered physical sheet with no diagnostic at all.
  // `overflowWarnings` emits at most one line per page.
  for (const { message } of overflowWarnings(plan)) warn(message)

  return { theme, layout, themeName, layoutName, resolved, plan }
}

/**
 * Pack a cv-content directory WITHOUT rendering it — the dry run behind the
 * `plan_layout` MCP tool (C6a / design doc §7.3).
 *
 * It runs the identical load → measure → resolve → pack chain `renderCV` runs
 * (literally the same two functions), and stops before the first glyph. So the
 * plan it returns is the plan a build of the same directory would use, by
 * construction rather than by agreement — `test/planLayout.test.js` still
 * checks it against a real render, because "by construction" has been wrong
 * here before.
 *
 * NO GLOBAL STATE IS TOUCHED, deliberately: no `registerFonts`, no
 * `setupReproducibility` (which seeds `Math.random` and swaps
 * `zlib.createDeflate` process-wide). A dry run must not be able to perturb the
 * bytes of a build that follows it in the same process — the byte-repro promise
 * is a gate on every chunk of this sprint, and `plan_layout` is called BETWEEN
 * builds by design.
 *
 * @param {object} opts
 * @param {string} opts.contentDir  absolute path to the cv-content directory
 * @param {string} opts.fontsDir    absolute path to the Lato fonts directory
 * @param {(msg: string) => void} [opts.warn]
 * @returns {Promise<{
 *   config: import('./types.js').CVConfig,
 *   themeName: string,
 *   layoutName: string,
 *   isSingleColumn: boolean,
 *   plan?: import('./types.js').LayoutPlan,
 * }>}
 *   `plan` is absent for the single-column/ATS variant: react-pdf auto-flows a
 *   single column and CVX never packs it, so there is genuinely nothing to plan.
 */
export async function planCV({ contentDir, fontsDir, warn = console.warn }) {
  assertContentDir(contentDir)
  const loaded = loadAndMeasure(contentDir, fontsDir, warn)
  const { themeName, layoutName, resolved, plan } = await resolveAndPlan({
    contentDir,
    ...loaded,
    warn
  })
  return {
    config: loaded.config,
    themeName,
    layoutName,
    isSingleColumn: resolved.isSingleColumn,
    plan
  }
}

/**
 * Render a CV to a PDF buffer.
 *
 * @param {object} opts
 * @param {string}  opts.contentDir  absolute path to the cv-content directory
 * @param {string}  opts.fontsDir    absolute path to the Lato fonts directory
 * @param {boolean} [opts.ats]       render the standalone ATS document instead
 * @param {Record<string, string | undefined>}  [opts.env]       environment (SOURCE_DATE_EPOCH support)
 * @param {(msg: string) => void} [opts.warn]
 * @returns {Promise<{buffer: Buffer, filename: string, themeName: string|null, layoutName: string|null, config?: import('./types.js').CVConfig, plan?: import('./types.js').LayoutPlan}>}
 *   `plan` is the two-column pagination plan (absent for the single-column/ATS
 *   variant, which auto-flows and is not packed). Returned so a caller can see
 *   what was paginated without re-deriving it — the seam `plan_layout`'s dry run
 *   and `build_pdf`'s layout diagnostics both hang off.
 */
export async function renderCV({
  contentDir,
  fontsDir,
  ats = false,
  env = process.env,
  warn = console.warn
}) {
  assertContentDir(contentDir)

  registerFonts(fontsDir)
  const { creationDate } = setupReproducibility(env)
  const { config, content, profilePhoto, measure } = loadAndMeasure(contentDir, fontsDir, warn)

  if (ats) {
    const buffer = await renderToBuffer(
      /** @type {Parameters<typeof renderToBuffer>[0]} */ (
        createElement(
          ATSDocument,
          /** @type {Parameters<typeof ATSDocument>[0]} */ ({
            ...content,
            profilePhoto,
            config,
            creationDate
          })
        )
      )
    )
    return {
      buffer,
      filename: deriveFilename(content.personal?.name, '-ats'),
      themeName: null,
      layoutName: null
    }
  }

  const { theme, layout, themeName, layoutName, plan } = await resolveAndPlan({
    contentDir,
    config,
    content,
    profilePhoto,
    measure,
    warn
  })

  const buffer = await renderToBuffer(
    /** @type {Parameters<typeof renderToBuffer>[0]} */ (
      createElement(
        CVDocument,
        /** @type {Parameters<typeof CVDocument>[0]} */ ({
          ...content,
          profilePhoto,
          config,
          theme,
          layout,
          creationDate,
          measure,
          plan
        })
      )
    )
  )
  // RV8: the suffix is a fact about the VARIANT the caller asked for, not about
  // the layout's name. Keying it on `layoutName` meant `layout: single-column`
  // — a documented, shipped option — made the DESIGNED build claim the ATS
  // build's filename, so `build --all` wrote both to `<name>-ats.pdf` and the
  // second silently destroyed the first while the envelope reported two
  // artifacts and `ok: true`. `renderCV` already knows which variant it is.
  const suffix = ats ? '-ats' : ''
  return {
    buffer,
    filename: deriveFilename(content.personal?.name, suffix),
    themeName,
    layoutName,
    plan
  }
}
