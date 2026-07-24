/**
 * export-pdf.js
 * Generates the CV as a PDF using @react-pdf/renderer.
 *
 * Everything is auto-discovered:
 *   Content: cv-content/*.yaml (any YAML file becomes a content key)
 *   Themes:  src/pdf/themes/*.js (any .js file with a name property)
 *   Layouts: cv-content/layouts/*.yaml (any .yaml file)
 *
 * Run:  npm run pdf
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'
import { load } from 'js-yaml'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { registerFonts } from '../src/pdf/fonts.js'
import CVDocument from '../src/pdf/CVDocument.jsx'
import { discoverThemes } from '../src/pdf/themes/index.js'
import { normalizeLayout } from '../src/pdf/loadLayout.js'
import { loadContent } from '../src/pdf/loadContent.js'

const __dir      = dirname(fileURLToPath(import.meta.url))
const contentDir = join(__dir, '../cv-content')
const fonts      = join(__dir, '../src/fonts')
const layoutsDir = join(contentDir, 'layouts')

registerFonts(fonts)

// ── Auto-discover everything ────────────────────────────────────────────────

const { config, content, profilePhoto } = loadContent(contentDir)

// Discover layouts from cv-content/layouts/*.yaml
function discoverLayouts() {
  const layouts = {}
  if (!existsSync(layoutsDir)) return layouts
  for (const file of readdirSync(layoutsDir).filter(f => f.endsWith('.yaml'))) {
    const name = basename(file, '.yaml')
    const parsed = load(readFileSync(join(layoutsDir, file), 'utf-8'))
    layouts[name] = normalizeLayout(parsed)
  }
  return layouts
}

const themes     = await discoverThemes()
const layouts    = discoverLayouts()
const themeName  = config.theme  ?? 'teal'
const layoutName = config.layout ?? 'two-column'

const theme  = themes[themeName]
const layout = layouts[layoutName] ?? undefined

if (!theme) {
  console.error(`Unknown theme "${themeName}". Available: ${Object.keys(themes).join(', ')}`)
  process.exit(1)
}

if (layoutName && !layout) {
  console.warn(`Layout "${layoutName}" not found in cv-content/layouts/. Using built-in default.`)
}

function deriveFilename(name) {
  const base = name ? name.toLowerCase().replace(/\s+/g, '-') : 'cv'
  const suffix = layoutName === 'single-column' ? '-ats' : ''
  return `${base}${suffix}.pdf`
}

const OUTPUT = deriveFilename(content.personal?.name)

console.log(`Rendering CV (theme: ${themeName}, layout: ${layoutName})…`)

const buf = await renderToBuffer(
  createElement(CVDocument, {
    ...content,
    profilePhoto,
    config,
    theme,
    layout,
  })
)

writeFileSync(OUTPUT, buf)
console.log(`✅ PDF saved: ${OUTPUT}  (${(buf.byteLength / 1024).toFixed(0)} KB)`)
