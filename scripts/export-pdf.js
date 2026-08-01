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
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderCV } from '../src/pdf/render.js'

const __dir = dirname(fileURLToPath(import.meta.url))

try {
  const { buffer, filename, themeName, layoutName } = await renderCV({
    contentDir: join(__dir, '../cv-content'),
    fontsDir: join(__dir, '../src/fonts')
  })
  console.log(`Rendering CV (theme: ${themeName}, layout: ${layoutName})…`)
  writeFileSync(filename, buffer)
  console.log(`✅ PDF saved: ${filename}  (${(buffer.byteLength / 1024).toFixed(0)} KB)`)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
