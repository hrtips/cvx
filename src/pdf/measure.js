// ── Real font metrics (fontkit) — Node-only, NEVER imported by layout.js ───
//
// layout.js ships in the Vite browser bundle (the in-app preview), so it
// must stay isomorphic: no fontkit, no node:fs/node:path. This module is the
// thing render.js (which has `fontsDir`) builds and *injects* into
// layout.js's packing functions as an optional `measure` parameter — see
// createMeasurer() below and layout.js's `measure ?? <char-approx>` call
// sites. The browser preview never sees this file and keeps using the loose
// char-width estimate (advisory only).
//
// Design doc §5 / sprint C2. Two capabilities:
//   1. `lineCount`/`widthOf` — real greedy word-wrap using fontkit glyph
//      advances against the pinned Lato TTFs (the exact metrics
//      @react-pdf/renderer renders through — it uses fontkit internally
//      too), replacing the ~20–34%-loose character-width estimate.
//   2. `unsupportedChars` — Lato is a narrow, Western-European-Latin subset
//      (264 codepoints in the bundled TTFs; no Cyrillic, Greek, Vietnamese,
//      Turkish ş/ğ, Czech/Romanian diacritics, or any non-Latin script) and
//      CVX registers no fallback font. Text containing a codepoint Lato has
//      no glyph for renders INVISIBLY today, silently — C0 found this by
//      accident (a Sinhala name). This turns that into a loud, honest warning
//      (see findUnsupportedGlyphs() below) instead of fixing the invisible
//      text itself — bundling a fallback font (e.g. Noto) is explicitly out
//      of scope this pass (tarball-size budget; the maintainer's call to
//      make separately).
// ─────────────────────────────────────────────────────────────────────────

import path from 'node:path'
import { openSync } from 'fontkit'

// Mirrors fonts.js's registerFonts() weight table exactly: only 300 and 400
// have a registered italic file; 500 aliases to the 400 (Regular) file and
// 600 aliases to the 700 (Bold) file — there is no separate 500 or 600
// weight TTF. A measurer that didn't mirror this would silently measure
// against a font file @react-pdf/renderer would never actually pick.
function fontFileFor(/** @type {number} */ weight, /** @type {boolean} */ italic) {
  const w = nearestWeightBucket(weight)
  if (w === 300) return italic ? 'Lato-LightItalic.ttf' : 'Lato-Light.ttf'
  if (w >= 600) return italic ? 'Lato-BoldItalic.ttf' : 'Lato-Bold.ttf' // 600 has no own file — aliases to Bold, same as fonts.js
  return italic ? 'Lato-Italic.ttf' : 'Lato-Regular.ttf' // 400 and 500 both alias to Regular
}

const WEIGHT_BUCKETS = [300, 400, 500, 600, 700]
function nearestWeightBucket(/** @type {number} */ weight) {
  if (!weight) return 400
  return WEIGHT_BUCKETS.reduce(
    (best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best),
    400
  )
}

// Codepoints that are never "visibly missing" even without a glyph: ASCII
// control characters, and zero-width Unicode formatting characters (joiners,
// BOM) that legitimately have no visible glyph in ANY font.
function isSkippableCodePoint(/** @type {number} */ cp) {
  return cp <= 0x1f || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfeff
}

/**
 * Build a measurer bound to the Lato TTFs in `fontsDir`. Fonts are opened
 * once, synchronously, from the pinned files (pure disk reads, no network,
 * no RNG) and memoized for the life of the measurer — deterministic and
 * cheap to call repeatedly within one build.
 *
 * @param {string} fontsDir  absolute path to the directory containing the
 *   Lato-*.ttf files (render.js resolves this; e.g. lib/fonts or src/fonts)
 * @returns {import('./types.js').Measurer}
 */
export function createMeasurer(fontsDir) {
  const fontCache = new Map()
  const widthCache = new Map()

  function fontFor(/** @type {number} */ weight, /** @type {boolean} */ italic) {
    const file = fontFileFor(weight, italic)
    if (!fontCache.has(file)) fontCache.set(file, openSync(path.join(fontsDir, file)))
    return fontCache.get(file)
  }

  /**
   * Advance width, in pt, of `text` set at `size`pt in the given
   * weight/style. Empty string -> 0.
   *
   * `letterSpacing` mirrors the CSS/react-pdf `letterSpacing` style property
   * (textkit's `characterSpacing`), which several sidebar styles set — the
   * identity name (0.3) and every sidebar section title (1.2) — and which
   * measurably changes where a line breaks: "CORE COMPETENCIES" at 7pt is
   * 73.54pt of pure glyph advance but 93.94pt with the theme's 1.2 spacing.
   * textkit adds the spacing to EVERY glyph's advance (its `isLast` guard,
   * `i === positions.length`, can never be true — the last index is
   * `length - 1`), so the run width it breaks against is
   * `advance + glyphCount * letterSpacing`; that is what this reproduces.
   * Verified against `pdftotext -bbox` on a real render: the *visual* extent
   * comes out one `letterSpacing` short of this (the final glyph's trailing
   * spacing is empty), e.g. 92.7pt observed vs 93.94pt here — the extra
   * trailing unit is genuinely part of the advance the line breaker uses.
   */
  function widthOf(
    /** @type {string} */ text,
    /** @type {number} */ size,
    /** @type {{weight?: number, italic?: boolean, letterSpacing?: number}} */ {
      weight = 400,
      italic = false,
      letterSpacing = 0
    } = {}
  ) {
    if (!text) return 0
    const key = `${weight}|${italic}|${size}|${letterSpacing}|${text}`
    const cached = widthCache.get(key)
    if (cached !== undefined) return cached
    const font = fontFor(weight, italic)
    const run = font.layout(text)
    const w =
      (run.advanceWidth / font.unitsPerEm) * size +
      (letterSpacing ? run.glyphs.length * letterSpacing : 0)
    widthCache.set(key, w)
    return w
  }

  /**
   * Greedy word-wrap: how many lines does `text` take at `size`pt within
   * `maxWidth`pt? Breaks on whitespace runs only — this app disables
   * hyphenation everywhere (fonts.js's `registerHyphenationCallback(word =>
   * [word])`), so a "word" never splits mid-token; a single word wider than
   * maxWidth overflows its own line rather than being cut, mirroring how
   * @react-pdf's real line breaker treats an unbreakable run with
   * hyphenation disabled.
   */
  function lineCount(
    /** @type {string} */ text,
    /** @type {number} */ size,
    /** @type {number} */ maxWidth,
    /** @type {{weight?: number, italic?: boolean, letterSpacing?: number}} */ opts = {}
  ) {
    if (!text) return 1
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) return 1

    const spaceWidth = widthOf(' ', size, opts)
    let lines = 1
    let currentWidth = 0
    for (const word of words) {
      const wordWidth = widthOf(word, size, opts)
      if (currentWidth === 0) {
        currentWidth = wordWidth
        continue
      }
      const withSpace = currentWidth + spaceWidth + wordWidth
      if (withSpace > maxWidth) {
        lines += 1
        currentWidth = wordWidth
      } else {
        currentWidth = withSpace
      }
    }
    return lines
  }

  /**
   * The line height react-pdf/textkit uses for a `<Text>` with NO explicit
   * `lineHeight` style, as a multiple of font size:
   * `(lineGap + ascent - descent) / unitsPerEm` — textkit's
   * `height(run) = run.attributes.lineHeight || lineGap + ascent - descent`,
   * all three scaled by `size / unitsPerEm`.
   *
   * Plenty of the sidebar's styles omit `lineHeight` (the education
   * institution/period rows, the competency tags, the referee name, ...), so
   * layout.js's sidebar measurement needs this number. Reading it from the
   * font — rather than hard-coding Lato's 1.2 — means a font swap changes the
   * measurement instead of silently invalidating it. (layout.js still carries
   * `NATURAL_LINE_HEIGHT` as the isomorphic fallback for the browser preview,
   * where no measurer exists, and measure.test.js pins the two together.)
   */
  function naturalLineHeight(
    /** @type {{weight?: number, italic?: boolean}} */ { weight = 400, italic = false } = {}
  ) {
    const font = fontFor(weight, italic)
    return (font.lineGap + font.ascent - font.descent) / font.unitsPerEm
  }

  /**
   * Which characters in `text` does the bundled font have no glyph for?
   * Returns the distinct offending characters, in first-occurrence order.
   * Glyph coverage is the same across Lato's weights/styles for our
   * purposes (they're the same type family at the same subset), so this
   * always checks against the upright Regular file regardless of what
   * weight/style the text will actually render in.
   */
  function unsupportedChars(/** @type {string} */ text) {
    if (!text) return []
    const font = fontFor(400, false)
    const seen = new Set()
    for (const ch of text) {
      const codePoint = /** @type {number} */ (ch.codePointAt(0))
      if (isSkippableCodePoint(codePoint)) continue
      if (!font.hasGlyphForCodePoint(codePoint)) seen.add(ch)
    }
    return [...seen]
  }

  return { lineCount, widthOf, naturalLineHeight, unsupportedChars }
}

/**
 * Walk a content bag (the same `{ personal, summary, experience, ... }`
 * shape loadContent.js / validateContent.js's `docs` produce — one entry
 * per content file) and find every string leaf containing a character the
 * measurer's font has no glyph for. `config`, `profilePhoto`, and
 * `keywords` are skipped: config/photo aren't rendered text, and
 * keywords.yaml is explicitly metadata-only ("NOT printed on the page" —
 * see keywords.yaml's own header), so a missing glyph there has no visible
 * consequence.
 *
 * @param {ReturnType<typeof createMeasurer>} measurer
 * @param {object} contentBag
 * @returns {{ file: string, path: string, text: string, chars: string[] }[]}
 *   `path` is a JSON-Pointer relative to `file` (e.g. "/name", "/0/bullets/1"),
 *   matching the shape validateContent.js's other findings already use.
 */
export function findUnsupportedGlyphs(
  measurer,
  contentBag,
  { skipKeys = ['config', 'profilePhoto', 'keywords'] } = {}
) {
  /** @type {{ file: string, path: string, text: string, chars: string[] }[]} */
  const findings = []

  function walk(
    /** @type {unknown} */ value,
    /** @type {string} */ file,
    /** @type {string} */ pointer
  ) {
    if (value == null) return
    if (typeof value === 'string') {
      const chars = measurer.unsupportedChars(value)
      if (chars.length > 0) findings.push({ file, path: pointer || '(root)', text: value, chars })
      return
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        walk(v, file, `${pointer}/${i}`)
      })
      return
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, file, `${pointer}/${k}`)
    }
  }

  for (const [key, value] of Object.entries(contentBag)) {
    if (skipKeys.includes(key)) continue
    walk(value, `${key}.yaml`, '')
  }
  return findings
}

/** One-line, human-readable description of a findUnsupportedGlyphs() finding — shared wording for render.js's warn() and validateContent.js's finding message. */
export function describeUnsupportedGlyphFinding(/** @type {{ chars: string[] }} */ { chars }) {
  const preview = chars.slice(0, 8).join('')
  const more = chars.length > 8 ? '…' : ''
  return `contains character(s) the bundled font can't render (${preview}${more}) — they will be invisible in the PDF.`
}
