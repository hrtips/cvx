/**
 * export-pdf-ats.js
 * Generates an ATS-optimised plain CV PDF.
 * Content auto-discovered from cv-content/*.yaml.
 *
 * Run:  npm run pdf:ats
 */
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { renderCV } from '../src/pdf/render.js'

const __dir = dirname(fileURLToPath(import.meta.url))

try {
  console.log('Rendering ATS CV…')
  const { buffer, filename } = await renderCV({
    contentDir: join(__dir, '../cv-content'),
    fontsDir:   join(__dir, '../src/fonts'),
    ats: true,
  })
  writeFileSync(filename, buffer)
  console.log(`✅ ATS PDF saved: ${filename}  (${(buffer.byteLength / 1024).toFixed(0)} KB)`)
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
