// Font registration is the seam that keeps two renders in one process from
// corrupting each other (see registerFonts' docblock, and
// test/renderIsolation.test.js for the rendered-content half of the
// regression). What is asserted here is the INVARIANT the fix rests on —
// "every registerFonts() call hands the next render a registry with no font
// state carried over from the last one" — and the upstream behaviour it
// defends against. These run everywhere; the content oracle needs poppler and
// is skipped on most CI legs, so this is the leg that must fail loudly if an
// @react-pdf bump quietly turns the fix into a no-op (e.g. if
// getRegisteredFonts() starts returning a copy rather than the live map).

import { fileURLToPath } from 'node:url'
import { Font } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { registerFonts } from './fonts.js'

const FONTS_DIR = fileURLToPath(new URL('../fonts', import.meta.url))

function lato() {
  const family = Font.getRegisteredFonts().Lato
  if (!family) throw new Error('Lato is not registered')
  return family
}

/**
 * Load one face the way a render does and hand back its parsed fontkit font —
 * the object holding the glyph cache a previous render can poison.
 *
 * `any`: fontkit's per-font glyph cache and Glyph shape are precisely the
 * upstream internals this file exists to pin, and @react-pdf's public `Font`
 * type models neither.
 *
 * @param {number} fontWeight
 * @returns {Promise<any>}
 */
async function loadFace(fontWeight) {
  await Font.load({ fontFamily: 'Lato', fontWeight, fontStyle: 'normal' })
  const source = lato().sources.find((s) => s.fontWeight === fontWeight && s.fontStyle === 'normal')
  return /** @type {any} */ (source?.data)
}

describe('registerFonts', () => {
  it('registers the eight Lato faces', () => {
    registerFonts(FONTS_DIR)
    const faces = lato().sources.map((s) => `${s.fontWeight}${s.fontStyle === 'italic' ? 'i' : ''}`)
    expect(faces).toEqual(['300', '300i', '400', '400i', '500', '600', '700', '700i'])
  })

  it('REPLACES the family on every call — it never appends, and never carries a loaded font over', async () => {
    registerFonts(FONTS_DIR)
    const before = lato().sources
    await loadFace(700)
    expect(before.some((s) => s.data !== null)).toBe(true)

    registerFonts(FONTS_DIR)

    // Eight, not sixteen: a long-lived MCP server registers once per build, and
    // resolution always picks the FIRST match — so an appended registration
    // would leave every render using the same, increasingly stale, font object.
    expect(lato().sources).toHaveLength(8)
    // Fresh source objects with nothing loaded, so the next render parses fresh
    // fontkit fonts with empty glyph caches. If this fails, the isolation fix is
    // dead and renders can silently lose glyphs again.
    for (const source of lato().sources) {
      expect(before).not.toContain(source)
      expect(source.data).toBeNull()
    }
  })

  it('pins the upstream glyph-cache behaviour the fix was built against, as it is now', async () => {
    // The leak this fix was built against (fontkit 2, @react-pdf/renderer
    // <= 4.5): fontkit memoizes Glyph objects keyed by glyph id ALONE, a lookup
    // with no code points (what subset embedding does at the end of every
    // render) cached that glyph with `codePoints: []`, and every later layout
    // got that same object back. @react-pdf/textkit then dropped the glyph when
    // slicing lines, which is how letters vanished from the page.
    //
    // fontkit 3 (via @react-pdf/font 4.2, @react-pdf/renderer 4.9) still caches
    // the code-point-less lookup that way, but layout now returns a glyph of its
    // own carrying the real code points, so the poison no longer reaches text
    // layout. The reset in registerFonts stays: it is one line, it keeps a
    // long-lived MCP server's registry from growing, and it guards against this
    // regressing. test/renderIsolation.test.js still guards rendered content.
    //
    // If this assertion fails, upstream has changed the model again: re-read
    // src/pdf/fonts.js before touching anything.
    registerFonts(FONTS_DIR)
    const font = await loadFace(700)
    const gid = font.layout('F').glyphs[0].id
    expect(font.getGlyph(gid).codePoints).toEqual([70]) // 'F', looked up WITH characters

    registerFonts(FONTS_DIR)
    const fresh = await loadFace(700)
    expect(fresh).not.toBe(font) // the replacement really is a different instance
    const bare = fresh.getGlyph(gid) // looked up the way the subset encoder does it
    expect(bare.codePoints).toEqual([])
    const laidOut = fresh.layout('F').glyphs[0]
    expect(laidOut).not.toBe(bare) // layout no longer hands the cached object back…
    expect(laidOut.codePoints).toEqual([70]) // …so the letter keeps its code point
  })
})
