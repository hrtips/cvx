import { Font } from '@react-pdf/renderer'

/** The one font family CVX registers. Named so the reset below can't drift from it. */
const FAMILY = 'Lato'

/**
 * Drop any previous registration of `FAMILY`, so `registerFonts` REPLACES the
 * family instead of appending to it.
 *
 * ## Why this exists — silent content loss across two renders in one process
 *
 * `@react-pdf/renderer` keeps ONE process-global font registry (`FontStore`),
 * and each registered source caches the parsed fontkit font object on itself
 * (`FontSource.data`). Every render in the process therefore shares one fontkit
 * instance per font file. fontkit, in turn, memoizes `Glyph` objects on the font
 * (`font._glyphs`, keyed by glyph id ALONE) and each `Glyph` keeps the
 * `codePoints` it was FIRST created with.
 *
 * At the very end of a render, embedding the font subset calls
 * `font.getGlyph(gid)` with NO characters (fontkit's `TTFSubset._addGlyph`), so
 * every glyph the layout stage had not already cached on that instance gets
 * cached with `codePoints: []`. (CVX registers one file under two weights —
 * Lato-Bold at 600 and 700 — which makes two fontkit instances of it, while
 * pdfkit de-duplicates embedded fonts by PostScript name and funnels all
 * encoding through one of them. So the embedding instance routinely meets
 * glyphs its own layout never saw.)
 *
 * The NEXT render then lays text out through that poisoned instance, and
 * `@react-pdf/textkit` derives its glyph↔string index maps from
 * `glyph.codePoints.length`: a glyph reporting zero code points collapses onto
 * its predecessor's string index, and line slicing drops it. The letters are
 * then absent from the page AND from the text layer — the build still reports
 * success. Measured on the shipped scaffold (v1.6.0): a designed build followed
 * by an ATS build in one process lost 17 distinct Lato-Bold glyphs, rendering
 * "Founder & Field Commander – Gotham Operations" as "oun er iel Co an er ot a
 * O eration". `research/archive/c0-retro.md` finding 1 is the same bug class, caught
 * before v1.5.0 in `cvx build --all` and fixed there by process isolation;
 * `bin/cvx.js buildAll()` still isolates, but the MCP server (long-lived, and
 * told by skills/cvx/SKILL.md to build both variants) never got that fix.
 *
 * Re-registering the family replaces its `FontSource` objects, so the next
 * render loads a FRESH fontkit instance with an empty glyph cache. `renderCV`
 * calls `registerFonts` once per render, which makes "every render starts from
 * clean font state" an invariant of the render pipeline rather than something
 * each caller has to remember. It also stops `sources` from growing by eight
 * entries per build in a long-lived MCP server.
 *
 * Guarded by `src/pdf/fonts.test.js` (the registry assumption, which fails
 * loudly if an upstream bump makes this a no-op) and by
 * `test/renderIsolation.test.js` (the rendered content itself).
 */
function dropPreviousRegistration() {
  delete Font.getRegisteredFonts()[FAMILY]
}

/**
 * Register Lato TTF fonts.
 * @param {string} base  base path/URL without trailing slash
 *   Browser:  '/src/fonts'
 *   Node:     '/absolute/path/to/src/fonts'
 *
 * Lato only has 300 / 400 / 700 weights — 500 maps to Regular, 600 maps to Bold.
 */
export function registerFonts(base) {
  // Shared with the browser bundle, so node:path is off-limits. Windows
  // callers hand us backslash paths; Node's fs accepts forward slashes on
  // every platform, so normalising is enough.
  base = base.replace(/\\/g, '/')
  dropPreviousRegistration()
  Font.register({
    family: FAMILY,
    fonts: [
      { src: `${base}/Lato-Light.ttf`, fontWeight: 300 },
      { src: `${base}/Lato-LightItalic.ttf`, fontWeight: 300, fontStyle: 'italic' },
      { src: `${base}/Lato-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/Lato-Italic.ttf`, fontWeight: 400, fontStyle: 'italic' },
      { src: `${base}/Lato-Regular.ttf`, fontWeight: 500 },
      { src: `${base}/Lato-Bold.ttf`, fontWeight: 600 },
      { src: `${base}/Lato-Bold.ttf`, fontWeight: 700 },
      { src: `${base}/Lato-BoldItalic.ttf`, fontWeight: 700, fontStyle: 'italic' }
    ]
  })
  // Disable automatic hyphenation — words should never be split mid-word
  Font.registerHyphenationCallback((word) => [word])
}
