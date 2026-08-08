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

  it('pins the upstream behaviour that makes stale font state dangerous', async () => {
    // The leak this fix defends against: fontkit memoizes Glyph objects on the
    // font keyed by glyph id ALONE, and each keeps the code points of the FIRST
    // lookup — so a lookup with no code points (what subset embedding does at
    // the end of every render) poisons that glyph for every later render
    // sharing the font. @react-pdf/textkit then drops zero-code-point glyphs
    // when it slices lines, which is how letters vanish from the page.
    //
    // If this assertion fails, upstream has changed the model the fix was built
    // against: re-read src/pdf/fonts.js before touching anything.
    registerFonts(FONTS_DIR)
    const font = await loadFace(700)
    const gid = font.layout('F').glyphs[0].id
    expect(font.getGlyph(gid).codePoints).toEqual([70]) // 'F', looked up WITH characters
    expect(font.layout('F').glyphs[0].codePoints).toEqual([70])

    // The same glyph id on a font that has not seen the character yet, looked
    // up the way fontkit's subset encoder does it: cached with no code points,
    // and every later layout gets that same object back.
    registerFonts(FONTS_DIR)
    const fresh = await loadFace(700)
    expect(fresh).not.toBe(font) // the replacement really is a different instance
    fresh.getGlyph(gid)
    expect(fresh.layout('F').glyphs[0].codePoints).toEqual([])
  })
})
