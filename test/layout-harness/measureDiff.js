// ── Measure-vs-render diff harness (stub for C2) ────────────────────────────
//
// C2's job is to replace layout.js's char-width `lineCount` estimator with a
// real fontkit measurer. C0's job is to have the *comparison* ready before
// that happens, so C2 can drop its real measurer in and immediately show a
// number improving. There is no real measurer yet (that's the point), so
// the "actual" side here is a genuinely rendered, then rasterized, line
// count — not a text-extraction trick (PDF text streams for embedded/
// subset fonts carry glyph ids, and recovering readable text needs the
// ToUnicode CMap machinery poppler already has via `pdftotext`; this harness
// deliberately stays inside "pure Node + vitest + pdftoppm" and never shells
// out to pdftotext or any other extra tool). Instead: render the string in
// an isolated <Text> box at the real font/size/width via the *actual*
// react-pdf + pinned Lato pipeline, rasterize with `pdftoppm -gray`, and
// count contiguous vertical bands of ink (pgm.js's countInkBands) — a
// script-agnostic proxy for "how many lines did this wrap to" that works
// even when a script's glyphs don't render (see the non-Latin corpus rows
// below, and research/c0-baseline.md's fallback-font finding).
//
// Interface C2 drops into: swap `estimatedLineCount()`'s body for a call
// into the new src/pdf/measure.js and this file's `runDiffCorpus()` needs
// no other change — the corpus and the "rendered" side are already real.
// ─────────────────────────────────────────────────────────────────────────

import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { writeFileSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { registerFonts } from '../../src/pdf/fonts.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { ROOT, mkFixtureDir, pdftoppmGray } from './scaffold.js'
import { parsePGM, countInkBands } from './pgm.js'
import { lineCount } from './estimator.js'
import { sentencesFor, LONG_URL, NON_LATIN_PHRASES } from './textPool.js'

let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  registerFonts(path.join(ROOT, 'src', 'fonts'))
  fontsRegistered = true
}

const PAD = 40

/**
 * Render `text` alone, at `fontSize` within a box `maxWidth` pt wide, using
 * the real Lato font + react-pdf pipeline, then count rendered ink bands —
 * the "actual" side of the diff.
 */
export async function renderedLineCount(text, { fontSize, maxWidth, fontFamily = 'Lato', lineHeight = tealTheme.typography.body.leading, dpi = 150 } = {}) {
  ensureFonts()
  const doc = createElement(Document, {},
    createElement(Page, { size: 'A4' },
      createElement(View, { style: { padding: PAD } },
        createElement(View, { style: { width: maxWidth } },
          createElement(Text, { style: { fontSize, fontFamily, lineHeight } }, text)
        )
      )
    )
  )
  const buffer = await renderToBuffer(doc)
  const dir = mkFixtureDir('measure-diff')
  const pdfPath = path.join(dir, 'x.pdf')
  writeFileSync(pdfPath, buffer)
  const [pgmPath] = pdftoppmGray(pdfPath, path.join(dir, 'p'), dpi)
  const { width, height, pixels } = parsePGM(readFileSync(pgmPath))
  return countInkBands(pixels, width, { x0: 0, x1: width, y0: 0, y1: height })
}

/** The "estimated" side — layout.js's private char-width formula, mirrored in estimator.js. */
export function estimatedLineCount(text, fontSize, maxWidth) {
  return lineCount(text, fontSize, maxWidth, tealTheme.typography.charWidthFraction)
}

const BODY_SIZE = tealTheme.typography.body.size // 9pt — same as an experience bullet
const BULLET_WIDTH = 200 // representative main-column bullet width (pt)

// Deterministic corpus: Latin short/typical/long/long-token (§2 of the
// design doc: "today's char-width estimate overshoots ~34%") + non-Latin
// (design doc G-a: "measure non-Latin runs through the actual fallback
// font... How much drift breaks pagination?"). Sizes/widths chosen to match
// how layout.js actually calls lineCount() for a bullet (bodySize, bulletW).
export const CORPUS = [
  { id: 'short', text: sentencesFor('short', 'diff-short', 1)[0], fontSize: BODY_SIZE, maxWidth: BULLET_WIDTH },
  { id: 'typical-bullet', text: sentencesFor('typical', 'diff-typical', 1)[0], fontSize: BODY_SIZE, maxWidth: BULLET_WIDTH },
  { id: 'long-bullet', text: sentencesFor('long', 'diff-long', 1)[0], fontSize: BODY_SIZE, maxWidth: BULLET_WIDTH },
  { id: 'long-token-url', text: `See ${LONG_URL} for details.`, fontSize: BODY_SIZE, maxWidth: BULLET_WIDTH },
  { id: 'non-latin-sinhala', text: NON_LATIN_PHRASES.sinhala, fontSize: tealTheme.typography.name.size, maxWidth: 150 },
  { id: 'non-latin-tamil', text: NON_LATIN_PHRASES.tamil, fontSize: tealTheme.typography.name.size, maxWidth: 150 },
  { id: 'non-latin-devanagari', text: NON_LATIN_PHRASES.devanagari, fontSize: tealTheme.typography.name.size, maxWidth: 150 },
]

/**
 * Run the full corpus, returning `{ id, estimated, rendered, errorPct }[]`.
 * `errorPct` is signed: positive means the estimator over-predicts lines
 * (matches the design doc's documented ~34% overshoot), negative means it
 * under-predicts (the more dangerous direction — risks real clipping).
 */
export async function runDiffCorpus(corpus = CORPUS) {
  const rows = []
  for (const c of corpus) {
    const estimated = estimatedLineCount(c.text, c.fontSize, c.maxWidth)
    const rendered = await renderedLineCount(c.text, { fontSize: c.fontSize, maxWidth: c.maxWidth })
    const errorPct = rendered > 0 ? Math.round(((estimated - rendered) / rendered) * 100) : null
    rows.push({ id: c.id, estimated, rendered, errorPct })
  }
  return rows
}
