// ── Render pipeline ─────────────────────────────────────────────────────────
// Single entry point for turning a cv-content directory into a PDF buffer.
// Shared by the repo export scripts (scripts/export-pdf*.js, run with tsx)
// and the published CLI (bin/cvx.js, run against lib/), so both always
// produce identical output.
// ────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { load } from 'js-yaml'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { registerFonts } from './fonts.js'
import { setupReproducibility } from './reproducible.js'
import { loadContent } from './loadContent.js'
import { normalizeLayout } from './loadLayout.js'
import { discoverThemes } from './themes/index.js'
import CVDocument from './CVDocument.jsx'
import ATSDocument from './ATSDocument.jsx'

/** Discover layouts from <contentDir>/layouts/*.yaml, keyed by filename. */
export function discoverLayouts(layoutsDir) {
  const layouts = {}
  if (!existsSync(layoutsDir)) return layouts
  for (const file of readdirSync(layoutsDir).filter(f => f.endsWith('.yaml'))) {
    layouts[basename(file, '.yaml')] = normalizeLayout(load(readFileSync(join(layoutsDir, file), 'utf-8')))
  }
  return layouts
}

function deriveFilename(name, suffix) {
  const base = name ? name.toLowerCase().replace(/\s+/g, '-') : 'cv'
  return `${base}${suffix}.pdf`
}

/**
 * Render a CV to a PDF buffer.
 *
 * @param {object} opts
 * @param {string}  opts.contentDir  absolute path to the cv-content directory
 * @param {string}  opts.fontsDir    absolute path to the Lato fonts directory
 * @param {boolean} [opts.ats]       render the standalone ATS document instead
 * @param {object}  [opts.env]       environment (SOURCE_DATE_EPOCH support)
 * @param {(msg: string) => void} [opts.warn]
 * @returns {Promise<{buffer: Buffer, filename: string, themeName: string|null, layoutName: string|null}>}
 */
export async function renderCV({ contentDir, fontsDir, ats = false, env = process.env, warn = console.warn }) {
  if (!existsSync(contentDir)) {
    throw new Error(`Content directory not found: ${contentDir}\nRun "cvx init" to scaffold one.`)
  }

  registerFonts(fontsDir)
  const { creationDate } = setupReproducibility(env)
  const { config, content, profilePhoto } = loadContent(contentDir)

  if (ats) {
    const buffer = await renderToBuffer(
      createElement(ATSDocument, { ...content, profilePhoto, config, creationDate })
    )
    return { buffer, filename: deriveFilename(content.personal?.name, '-ats'), themeName: null, layoutName: null }
  }

  const themes     = await discoverThemes()
  const layouts    = discoverLayouts(join(contentDir, 'layouts'))
  const themeName  = config.theme  ?? 'teal'
  const layoutName = config.layout ?? 'two-column'

  const theme  = themes[themeName]
  const layout = layouts[layoutName] ?? undefined

  if (!theme) {
    throw new Error(`Unknown theme "${themeName}". Available: ${Object.keys(themes).join(', ')}`)
  }
  if (layoutName && !layout) {
    warn(`Layout "${layoutName}" not found in ${join(contentDir, 'layouts')}. Using built-in default.`)
  }

  const buffer = await renderToBuffer(
    createElement(CVDocument, { ...content, profilePhoto, config, theme, layout, creationDate })
  )
  const suffix = layoutName === 'single-column' ? '-ats' : ''
  return { buffer, filename: deriveFilename(content.personal?.name, suffix), themeName, layoutName }
}
