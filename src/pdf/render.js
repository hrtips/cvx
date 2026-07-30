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
import { estimatePage1Overflow, PAGE1_OVERFLOW_WARN_THRESHOLD } from './layout.js'
import { loadContent } from './loadContent.js'
import { normalizeLayout } from './loadLayout.js'
import {
  createMeasurer,
  describeUnsupportedGlyphFinding,
  findUnsupportedGlyphs
} from './measure.js'
import { setupReproducibility } from './reproducible.js'
import { discoverThemes } from './themes/index.js'

/** Discover layouts from <contentDir>/layouts/*.yaml, keyed by filename. */
export function discoverLayouts(layoutsDir) {
  const layouts = {}
  if (!existsSync(layoutsDir)) return layouts
  for (const file of readdirSync(layoutsDir).filter((f) => f.endsWith('.yaml'))) {
    layouts[basename(file, '.yaml')] = normalizeLayout(
      load(readFileSync(join(layoutsDir, file), 'utf-8'))
    )
  }
  return layouts
}

function deriveFilename(name, suffix) {
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
function tryCreateMeasurer(fontsDir, warn) {
  try {
    return createMeasurer(fontsDir)
  } catch (err) {
    warn(
      `Could not load real font metrics from ${fontsDir} (${err.message}) — falling back to the approximate char-width estimator for pagination.`
    )
    return undefined
  }
}

/** Warn about any text CVX will render invisibly (no glyph in the bundled font) — see measure.js's module docblock (design doc G-a). */
function warnAboutUnsupportedGlyphs(measure, content, warn) {
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

/**
 * Render a CV to a PDF buffer.
 *
 * @param {object} opts
 * @param {string}  opts.contentDir  absolute path to the cv-content directory
 * @param {string}  opts.fontsDir    absolute path to the Lato fonts directory
 * @param {boolean} [opts.ats]       render the standalone ATS document instead
 * @param {Record<string, string|undefined>} [opts.env] environment (SOURCE_DATE_EPOCH support)
 * @param {(msg: string) => void} [opts.warn]
 * @returns {Promise<{buffer: Buffer, filename: string, themeName: string|null, layoutName: string|null}>}
 */
export async function renderCV({
  contentDir,
  fontsDir,
  ats = false,
  env = process.env,
  warn = console.warn
}) {
  if (!existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}\nRun "cvx init" to scaffold one.`)
  }

  registerFonts(fontsDir)
  const { creationDate } = setupReproducibility(env)
  const { config, content, profilePhoto } = loadContent(contentDir)

  // Real font metrics (C2): injected into layout.js's packing functions
  // (isomorphic — never imported there directly) and used to detect text
  // the bundled font has no glyph for, regardless of which variant is
  // being built (both render through the same Lato font).
  const measure = tryCreateMeasurer(fontsDir, warn)
  warnAboutUnsupportedGlyphs(measure, content, warn)

  if (ats) {
    const buffer = await renderToBuffer(
      createElement(ATSDocument, { ...content, profilePhoto, config, creationDate })
    )
    return {
      buffer,
      filename: deriveFilename(content.personal?.name, '-ats'),
      themeName: null,
      layoutName: null
    }
  }

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

  const overflow = estimatePage1Overflow(
    content.experience ?? [],
    content.summary ?? [],
    config,
    theme,
    measure
  )
  if (overflow > PAGE1_OVERFLOW_WARN_THRESHOLD) {
    warn(
      `page1ExperienceCount: ${config.page1ExperienceCount} likely does not fit on page 1 ` +
        `(estimate ≈${overflow - PAGE1_OVERFLOW_WARN_THRESHOLD}pt past the safety margin) — ` +
        `overflowing content is clipped at the page edge. Check the rendered page 1; ` +
        `reduce page1ExperienceCount, set page1SplitBullets, or remove both for automatic pagination.`
    )
  }

  const buffer = await renderToBuffer(
    // CVDocument renders a react-pdf <Document>; renderToBuffer's param is typed
    // as a Document element, which a wrapping component's type can't express.
    /** @type {Parameters<typeof renderToBuffer>[0]} */ (
      /** @type {unknown} */ (
        createElement(CVDocument, {
          ...content,
          profilePhoto,
          config,
          theme,
          layout,
          creationDate,
          measure
        })
      )
    )
  )
  const suffix = layoutName === 'single-column' ? '-ats' : ''
  return { buffer, filename: deriveFilename(content.personal?.name, suffix), themeName, layoutName }
}
