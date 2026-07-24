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
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { registerFonts } from '../src/pdf/fonts.js'
import { setupReproducibility } from '../src/pdf/reproducible.js'
import ATSDocument from '../src/pdf/ATSDocument.jsx'
import { loadContent } from '../src/pdf/loadContent.js'

const __dir      = dirname(fileURLToPath(import.meta.url))
const contentDir = join(__dir, '../cv-content')
const fonts      = join(__dir, '../src/fonts')

registerFonts(fonts)

const { creationDate } = setupReproducibility(process.env)

const { config, content, profilePhoto } = loadContent(contentDir)

function deriveFilename(name) {
  if (name) return `${name.toLowerCase().replace(/\s+/g, '-')}-ats.pdf`
  return 'cv-ats.pdf'
}

const OUTPUT = deriveFilename(content.personal?.name)

console.log('Rendering ATS CV…')

const buf = await renderToBuffer(
  createElement(ATSDocument, {
    ...content,
    profilePhoto,
    config,
    creationDate,
  })
)

writeFileSync(OUTPUT, buf)
console.log(`✅ ATS PDF saved: ${OUTPUT}  (${(buf.byteLength / 1024).toFixed(0)} KB)`)
