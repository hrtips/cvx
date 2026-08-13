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

function deriveFilename(/** @type {string | undefined} */ name, /** @type {string} */ suffix) {
  const base = name ? name.toLowerCase().replace(/\s+/g, '-') : 'cv'
  return `${base}${suffix}.pdf`
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
  const themeName = config.theme ?? 'teal'
  const layoutName = config.layout ?? 'two-column'

  const theme = themes[themeName]
  const layout = layouts[layoutName] ?? undefined

  if (!theme) {
    throw new Error(`Unknown theme "${themeName}". Available: ${Object.keys(themes).join(', ')}`)
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
  const resolved = resolveDocument({ config, theme, layout })
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
  const suffix = layoutName === 'single-column' ? '-ats' : ''
  return {
    buffer,
    filename: deriveFilename(content.personal?.name, suffix),
    themeName,
    layoutName,
    plan
  }
}
