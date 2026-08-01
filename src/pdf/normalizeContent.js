// ── Unicode NFC normalization for loaded content ────────────────────────────
// Shared between src/pdf/loadContent.js (Node/CLI/MCP) and cv-content/
// index.js (Vite/browser) so both content-loading paths behave identically.
// Isomorphic, zero dependencies — String.prototype.normalize is native in
// Node and every evergreen browser — matches src/pdf/profilePhoto.js's role
// as a tiny pure helper already shared between the two loaders.
//
// Why (review round 2, SHOULD #4): YAML authored/edited on macOS (and by
// some editors/tools generally) can decompose accented characters into NFD
// form — a base letter plus one or more separate COMBINING MARK codepoints
// (e.g. "é" as U+0065 "e" + U+0301 COMBINING ACUTE ACCENT) — instead of NFC,
// a single precomposed codepoint (U+00E9). The two forms are canonically
// equivalent and look identical in a text editor, but code that reasons
// about codepoints one at a time does NOT treat them the same:
//   - src/pdf/measure.js's unsupportedChars() (design doc G-a) checks glyph
//     coverage per codepoint. The bundled Lato TTFs have NO glyph for any
//     bare combining mark (verified directly: U+0301/U+0302/U+0303 all
//     `hasGlyphForCodePoint === false`) even though they DO have the
//     precomposed Western-European letters built from them (e.g. U+00E9
//     'é' is fully supported). So NFD input false-POSITIVEs — "José"
//     wrongly flagged as containing an unrenderable character — for text
//     that renders perfectly fine once normalized. For content Lato
//     genuinely can't render (e.g. Vietnamese, which combines marks Lato
//     also lacks), NFD input instead reports the wrong thing: two stray
//     "combining mark" artifacts rather than the one real precomposed
//     character actually missing — still a warning, just a confusing and
//     imprecise one.
//   - Text rendering (react-pdf/fontkit) can drop or mis-position an accent
//     built from a combining mark the font has no glyph for at all, even
//     when shaping would otherwise be able to attach it.
// Normalizing every string to NFC once, at load — before either rendering
// or measuring ever sees it — fixes both: the common case (accented Latin
// scripts Lato actually supports) never warns or mis-renders, and a
// genuinely unsupported script (design doc G-a) still warns, correctly and
// precisely, on the real character.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Recursively NFC-normalize every string in `value` (plain data only —
 * strings, arrays, and plain objects, exactly the shape js-yaml/Vite's YAML
 * import produce). Non-string leaves (numbers, booleans, null) pass through
 * unchanged.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeContent(value) {
  if (typeof value === 'string') return value.normalize('NFC')
  if (Array.isArray(value)) return value.map(normalizeContent)
  if (value != null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {}
    for (const [key, v] of Object.entries(value)) out[key] = normalizeContent(v)
    return out
  }
  return value
}
