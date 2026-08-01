// ── Rendered oracle — ground truth for the cross-column bugs the structural
//    plan can't see ────────────────────────────────────────────────────────
//
// packExperiences() only ever returns the MAIN column's plan; the sidebar
// isn't packed at all today (it's a fixed section→page-kind assignment,
// repeated verbatim onto however many *physical* pages react-pdf ends up
// emitting once a column's real content overflows one sheet). So the two
// known bugs this sprint exists to fix are invisible to any assertion made
// on packExperiences()'s return value:
//
//   (a) sidebar taller than one physical page -> an extra physical page
//       whose MAIN column is empty (react-pdf auto-continues the row).
//   (b) the corner badge, glued to the bottom of the main column's flow,
//       spills onto its own near-blank trailing physical page once the
//       column's content lands close enough to a page boundary.
//
// The only way to observe these today is to actually render and look at the
// pixels — hence this oracle: build the fixture via the real CLI (`cvx
// build` + `cvx build --ats`, as TWO separate processes — scaffold.js's
// buildAll(); see that file's docblock for why not the batched `cvx build
// --all`), rasterize every page (ONE `pdftoppm -gray` pass — no PNG needed,
// see below), and derive:
//
//   - pageCount      physical PDF page count (pdftoppm page count)
//   - blankPages     page indices whose whole-page ink ratio is under
//                    BLANK_PAGE_MAX_INK_RATIO
//   - emptyColumns   (designed variant only) page indices where the sidebar
//                    and/or main band has ZERO ink bands (pgm.js's
//                    countInkBands — presence-based, not an area-ratio
//                    threshold: any real content, however sparse, produces
//                    at least one band and is never flagged)
//
// Both signals were originally byte-size/area-ratio heuristics; review
// (adversarial + architect) flagged the empty-column one as a false-
// positive risk on genuinely sparse-but-real content (e.g. a single-page
// CV with just a short summary + one experience entry was wrongly flagged
// "main empty" at a 3%-ink-area threshold) and the blank-page one as
// PNG-encoder/version-dependent. Both are now derived from the SAME
// grayscale rasterization: blank-page is a whole-page ink *ratio* (still a
// threshold, but resolution/antialiasing-robust, not compression-implementation-
// dependent); empty-column is ink-band *presence* (zero bands — no
// threshold to mis-tune). See research/c0-baseline.md for the calibration
// numbers and the one known trade-off this introduces (documented there,
// not hidden): the corner badge itself always contributes exactly one ink
// band to the main region on any page it lands on, so a physical page
// where main has genuinely run out of content but the badge is still
// present (bug (a)'s classic shape) reads as "1 band", not "0" — it is no
// longer flagged by THIS signal specifically. It is still visible via (i)
// the physical-vs-logical pageCount mismatch and (ii) the pdftotext
// content-completeness oracle (contentOracle.js) proving the sidebar's
// content rendered in full regardless of which physical page it landed on.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { bandInk, countInkBands, parsePGM } from './pgm.js'
import { buildAll, pdftoppmGray } from './scaffold.js'

/**
 * Whole-page ink ratio below which a page counts as "blank". Calibrated
 * against the shipped scaffold (see research/c0-baseline.md): the badge-
 * only trailing page (bug b) measures ≈0.37% whole-page ink; the sidebar-
 * overflow page (bug a, which has real referees/publications content in
 * the sidebar and should NOT read as blank) measures ≈1.75%; ordinary
 * content pages measure 13–25%. 1% sits with comfortable margin on both
 * sides of that gap.
 */
export const BLANK_PAGE_MAX_INK_RATIO = 0.01

const { sidebarFraction, topBar, pageHeight } = tealTheme.geometry

function pageRegions(width, height) {
  const splitX = Math.round(width * sidebarFraction)
  const topSkip = Math.round(height * (topBar / pageHeight)) // skip the solid-colour top bar — constant per page, not informative
  return {
    sidebar: { x0: 0, x1: splitX, y0: topSkip, y1: height },
    main: { x0: splitX, x1: width, y0: topSkip, y1: height },
    whole: { x0: 0, x1: width, y0: topSkip, y1: height }
  }
}

function round3(n) {
  return Math.round(n * 1000) / 1000
}

/**
 * Rasterize + analyze one rendered PDF.
 *
 * @param {string} pdfPath
 * @param {'designed'|'ats'} variant
 * @param {string} workDir  scratch dir for the rasterized pages
 */
export function analyzeVariant(pdfPath, variant, workDir) {
  const grayPages = pdftoppmGray(pdfPath, path.join(workDir, `gray-${variant}`, 'p'))
  const pageCount = grayPages.length

  const blankPages = []
  const pageInk = [] // informational only — not part of the baseline-locked comparison
  const emptyColumns = variant === 'designed' ? [] : null

  grayPages.forEach((p, i) => {
    const { width, height, pixels } = parsePGM(readFileSync(p))
    const regions = pageRegions(width, height)

    const wholeInk = round3(bandInk(pixels, width, regions.whole).ink)
    pageInk.push(wholeInk)
    if (wholeInk < BLANK_PAGE_MAX_INK_RATIO) blankPages.push(i)

    if (variant === 'designed') {
      const sidebarBands = countInkBands(pixels, width, regions.sidebar)
      const mainBands = countInkBands(pixels, width, regions.main)
      const emptySidebar = sidebarBands === 0
      const emptyMain = mainBands === 0
      if (emptySidebar || emptyMain) {
        emptyColumns.push({
          page: i,
          side: emptyMain && emptySidebar ? 'both' : emptyMain ? 'main' : 'sidebar'
        })
      }
    }
  })

  return { pageCount, blankPages, emptyColumns, pageInk }
}

/**
 * Full oracle over one fixture directory (containing cv-content/): builds
 * both variants via the real CLI, then analyzes each. Returns `{ ok: false,
 * ... }` without throwing if the build itself fails (e.g. an invalid
 * fixture) — that is itself an observable fact worth recording.
 */
export function runOracle(fixtureDir) {
  const { code, result, stderr } = buildAll(fixtureDir)
  if (code !== 0 || !result?.ok) {
    return { ok: false, code, stderr: stderr?.slice(0, 2000) }
  }

  const facts = { ok: true }
  for (const out of result.outputs) {
    const variant = out.ats ? 'ats' : 'designed'
    const pdfPath = path.join(fixtureDir, out.filename)
    // pdfPath is echoed back for callers that need the already-built PDF
    // again (e.g. contentOracle.js's pdftotext pass) without re-invoking
    // the CLI — informational only, stripped by baseline.js's
    // normalizeVariantFacts() before any baseline comparison.
    facts[variant] = { ...analyzeVariant(pdfPath, variant, fixtureDir), pdfPath }
  }
  return facts
}
