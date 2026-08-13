// ── Measure-vs-render diff harness (C2: now populated with the real measurer) ──
//
// C0 built this as a stub (three-way comparison ready before C2 existed);
// C2 (src/pdf/measure.js) is now real, so this compares THREE things per
// corpus row, not two:
//   - estimated  layout.js's OLD char-width formula (pre-C2 default, now the
//                isomorphic browser-preview fallback — see layout.js)
//   - measured   the NEW fontkit-based real measurer (src/pdf/measure.js) —
//                what `cvx build`/`cvx validate` actually pack against today
//   - rendered   ground truth: render the string for real (actual react-pdf
//                + pinned Lato pipeline) and count it — NOT a text-
//                extraction trick (subset-font PDFs carry glyph ids;
//                recovering readable text needs pdftotext's ToUnicode
//                machinery, which this harness deliberately avoids for
//                *measurement* — see contentOracle.js for where pdftotext IS
//                used, for a different purpose). Rasterize with `pdftoppm
//                -gray` and count contiguous vertical bands of ink
//                (pgm.js's countInkBands) — a script-agnostic proxy for "how
//                many lines did this wrap to" that works even when a
//                script's glyphs don't render (see the non-Latin corpus rows
//                below).
//
// `measured` should track `rendered` far more closely than `estimated` does
// — that gap closing is C2's acceptance evidence (research/c0-baseline.md
// records the before/after numbers).
//
// Why "render + rasterize" and not a direct @react-pdf/textkit
// `layoutEngine()` call ("the engine's own line-breaker", verified against
// it per the design doc): a standalone invocation was attempted, mirroring
// @react-pdf/layout's own engine configuration as closely as possible from
// its published source. It hit a reproducible internal crash ("Cannot
// destructure property 'string' of 'attributedString' as it is undefined",
// several frames deep in scriptItemizer/preprocessRuns) — reproducible even
// for the trivial input "Hi", and not resolvable from textkit's public
// README/API within reasonable effort (its `layoutEngine` is an internal
// implementation detail of @react-pdf/layout, not a documented standalone
// entry point). The render-based check used instead is arguably stronger
// anyway: it *is* textkit under the hood (react-pdf's <Text> uses it for
// real line-breaking), exercised through the exact font-store/hyphenation
// configuration CVX ships with, end to end — no risk of a hand-assembled
// engine config subtly not matching production.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Document, Page, renderToBuffer, Text, View } from '@react-pdf/renderer'
import { createElement } from 'react'
import { registerFonts } from '../../src/pdf/fonts.js'
import { createMeasurer } from '../../src/pdf/measure.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { bulletWidth, deriveMetrics, lineCount } from './estimator.js'
import { countInkBands, parsePGM } from './pgm.js'
import { mkFixtureDir, pdftoppmGray, ROOT } from './scaffold.js'
import { LONG_URL, NON_LATIN_PHRASES, sentencesFor } from './textPool.js'

let fontsRegistered = false
function ensureFonts() {
  if (fontsRegistered) return
  registerFonts(path.join(ROOT, 'src', 'fonts'))
  fontsRegistered = true
}

let measurer
function ensureMeasurer() {
  if (!measurer) measurer = createMeasurer(path.join(ROOT, 'src', 'fonts'))
  return measurer
}

const PAD = 40

/**
 * Render `text` alone, at `fontSize` within a box `maxWidth` pt wide, using
 * the real Lato font + react-pdf pipeline, then count rendered ink bands —
 * the "actual" side of the diff. `fontWeight`/`fontStyle` (review round 2,
 * SHOULD #5) let the corpus exercise bold roles/names and the italic
 * description, not just the upright-400 body style — mirrors fonts.js's
 * registerFonts() table exactly (e.g. fontWeight:600 IS a registered weight
 * there, resolving to Lato-Bold.ttf, same as measure.js's own
 * nearestWeightBucket()).
 */
export async function renderedLineCount(
  text,
  {
    fontSize,
    maxWidth,
    fontFamily = 'Lato',
    lineHeight = tealTheme.typography.body.leading,
    fontWeight,
    fontStyle,
    dpi = 150
  } = {}
) {
  ensureFonts()
  const textStyle = {
    fontSize,
    fontFamily,
    lineHeight,
    ...(fontWeight ? { fontWeight } : {}),
    ...(fontStyle ? { fontStyle } : {})
  }
  const doc = createElement(
    Document,
    {},
    createElement(
      Page,
      { size: 'A4' },
      createElement(
        View,
        { style: { padding: PAD } },
        createElement(
          View,
          { style: { width: maxWidth } },
          createElement(Text, { style: textStyle }, text)
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

/**
 * The OLD "estimated" side — layout.js's char-width formula (re-exported
 * from layout.js via estimator.js — see that module for why it's a
 * re-export, not a mirror). Deliberately takes no weight/italic: the
 * char-width formula this represents never varied by style either (a single
 * global `charWidthFraction` regardless of what's being measured — see
 * layout.js's `lineCount()`), so `estimated` ignores a corpus row's
 * `weight`/`italic` exactly as production does when no measurer is
 * injected — that style-blindness is itself part of what makes it loose.
 */
export function estimatedLineCount(text, fontSize, maxWidth) {
  return lineCount(text, fontSize, maxWidth, tealTheme.typography.charWidthFraction)
}

/** The NEW "measured" side (C2) — real fontkit metrics against the pinned Lato TTFs, exactly what render.js injects into layout.js today. `opts` mirrors measure.js's `{weight, italic}`. */
export function measuredLineCount(text, fontSize, maxWidth, opts = {}) {
  return ensureMeasurer().lineCount(text, fontSize, maxWidth, opts)
}

const BODY_SIZE = tealTheme.typography.body.size // 9pt — same as an experience bullet
// Real layout.js widths, not hand-picked round numbers: BULLET_WIDTH is what
// an experience/summary bullet actually wraps against — since S3 that is
// bulletWidth(m, measure) (the dash's real advance + BulletList's 5pt
// marginRight; design-layout-fidelity.md §3.4), NOT the old
// innerW − bulletIndent, which was 1.12pt too wide and could under-count a
// wrapped line. innerW is what the entry description and role wrap against.
const METRICS = deriveMetrics(tealTheme)
const INNER_WIDTH = METRICS.innerW
const BULLET_WIDTH = bulletWidth(METRICS, createMeasurer(path.join(ROOT, 'src', 'fonts')))
// The sidebar isn't packed/measured by layout.js at all today (it's a fixed
// per-page-kind section list — see blocks.js/sidebarPlan.js), so there is no
// "real call site" width to import here the way bulletW/innerW are. This is
// the same derivation shape as deriveMetrics' own mainW/innerW math, applied
// to the sidebar column instead, for corpus breadth (SHOULD #5's "a sidebar
// row at ~7.5pt and the real sidebar width") — approximate in that specific
// sidebar sections pad slightly differently (e.g. IdentityCompact.jsx's own
// chrome.identityPl/identityPr vs this geometry.sidebarPad), close enough for
// broadening measurement-accuracy coverage, which is this corpus's purpose.
const { pageWidth, sidebarFraction, sidebarPad } = tealTheme.geometry
const SIDEBAR_WIDTH = pageWidth * sidebarFraction - sidebarPad.left - sidebarPad.right

// Deterministic corpus: Latin short/typical/long/long-token (§2 of the
// design doc: "today's char-width estimate overshoots ~34%") + non-Latin
// (design doc G-a: "measure non-Latin runs through the actual fallback
// font... How much drift breaks pagination?") + (review round 2, SHOULD #5)
// a spread of the OTHER real sizes/weights/styles CVX actually sets
// somewhere in the theme — a bold role, an italic description at the real
// inner width, a bold name, and a sidebar-sized row — so the measurer's
// accuracy claim isn't resting on bodySize/bulletW alone.
export const CORPUS = [
  {
    id: 'short',
    text: sentencesFor('short', 'diff-short', 1)[0],
    fontSize: BODY_SIZE,
    maxWidth: BULLET_WIDTH
  },
  {
    id: 'typical-bullet',
    text: sentencesFor('typical', 'diff-typical', 1)[0],
    fontSize: BODY_SIZE,
    maxWidth: BULLET_WIDTH
  },
  {
    id: 'long-bullet',
    text: sentencesFor('long', 'diff-long', 1)[0],
    fontSize: BODY_SIZE,
    maxWidth: BULLET_WIDTH
  },
  {
    id: 'long-token-url',
    text: `See ${LONG_URL} for details.`,
    fontSize: BODY_SIZE,
    maxWidth: BULLET_WIDTH
  },
  {
    id: 'description-italic',
    text: sentencesFor('long', 'diff-desc', 1)[0],
    fontSize: tealTheme.typography.description.size,
    maxWidth: INNER_WIDTH,
    italic: true
  },
  {
    id: 'role-bold',
    text: 'Group Chief Information Security Officer & Executive Vice President',
    fontSize: tealTheme.typography.role.size,
    maxWidth: INNER_WIDTH,
    weight: tealTheme.typography.role.weight
  },
  {
    id: 'sidebar-row',
    text: sentencesFor('typical', 'diff-sidebar', 1)[0],
    fontSize: tealTheme.typography.sidebarBody.size,
    maxWidth: SIDEBAR_WIDTH
  },
  {
    id: 'name-bold',
    text: 'Alexandria Cassandra Montgomery-Fitzgerald',
    fontSize: tealTheme.typography.name.size,
    maxWidth: SIDEBAR_WIDTH,
    weight: tealTheme.typography.name.weight
  },
  {
    id: 'non-latin-sinhala',
    text: NON_LATIN_PHRASES.sinhala,
    fontSize: tealTheme.typography.name.size,
    maxWidth: 150
  },
  {
    id: 'non-latin-tamil',
    text: NON_LATIN_PHRASES.tamil,
    fontSize: tealTheme.typography.name.size,
    maxWidth: 150
  },
  {
    id: 'non-latin-devanagari',
    text: NON_LATIN_PHRASES.devanagari,
    fontSize: tealTheme.typography.name.size,
    maxWidth: 150
  }
]

/**
 * Run the full corpus, returning
 * `{ id, estimated, measured, rendered, estimatedErrorPct, measuredErrorPct }[]`.
 * Both error percentages are signed relative to `rendered`: positive means
 * over-prediction (the design doc's documented ~20-34% overshoot for
 * `estimated`), negative means under-prediction (the more dangerous
 * direction — risks real clipping). `measured` should read consistently
 * closer to 0% than `estimated` — that gap is C2's whole point.
 */
export async function runDiffCorpus(corpus = CORPUS) {
  const rows = []
  for (const c of corpus) {
    const opts = { weight: c.weight ?? 400, italic: c.italic ?? false }
    const estimated = estimatedLineCount(c.text, c.fontSize, c.maxWidth)
    const measured = measuredLineCount(c.text, c.fontSize, c.maxWidth, opts)
    const rendered = await renderedLineCount(c.text, {
      fontSize: c.fontSize,
      maxWidth: c.maxWidth,
      fontWeight: c.weight,
      fontStyle: c.italic ? 'italic' : undefined
    })
    const errorPct = (predicted) =>
      rendered > 0 ? Math.round(((predicted - rendered) / rendered) * 100) : null
    rows.push({
      id: c.id,
      estimated,
      measured,
      rendered,
      estimatedErrorPct: errorPct(estimated),
      measuredErrorPct: errorPct(measured)
    })
  }
  return rows
}
