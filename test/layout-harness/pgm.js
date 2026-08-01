// ── Minimal PNM/PGM reader + ink analysis (pure Node, no dependency) ───────
//
// `pdftoppm -gray` emits the plain, uncompressed "P5" PGM format: a tiny
// whitespace-separated text header (magic, width, height, maxval) followed
// by one raw byte per pixel. That is trivial to parse without a real image
// library, which keeps the C0 harness inside "pure Node + vitest + pdftoppm"
// — no image-decoding dependency needed (unlike PNG, which is DEFLATE-
// compressed and would need real chunk parsing).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse a P5 (binary grayscale) PGM buffer.
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, maxval: number, pixels: Buffer }}
 */
export function parsePGM(buf) {
  if (buf[0] !== 0x50 || buf[1] !== 0x35) {
    // "P5"
    throw new Error('parsePGM: not a P5 (binary grayscale) PGM file')
  }
  let i = 2
  const tokens = []
  const isSpace = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d
  while (tokens.length < 3) {
    while (isSpace(buf[i])) i++
    if (buf[i] === 0x23) {
      // '#' comment — skip to end of line
      while (buf[i] !== 0x0a) i++
      continue
    }
    const start = i
    while (!isSpace(buf[i])) i++
    tokens.push(buf.subarray(start, i).toString('ascii'))
  }
  i++ // exactly one whitespace byte separates the header from pixel data
  const [width, height, maxval] = tokens.map(Number)
  const pixels = buf.subarray(i, i + width * height)
  return { width, height, maxval, pixels }
}

/**
 * Estimate the "ink ratio" of a rectangular band: the fraction of pixels
 * substantially darker than the band's own background. Background is taken
 * as the modal (most frequent) grey value in the band rather than a fixed
 * constant, because a sidebar's tinted fill (~0xf1) and a white main column
 * (0xff) are both legitimate "blank" backgrounds — the mode adapts to
 * whichever the band actually is.
 *
 * @param {Buffer} pixels        full-page pixel buffer (row-major, 1 byte/px)
 * @param {number} width         full page width in pixels
 * @param {{x0,x1,y0,y1}} box     band to inspect (pixel coordinates, half-open)
 * @param {number} [darkDelta]   how much darker than the mode counts as "ink"
 * @returns {{ ink: number, bg: number, n: number }} ink = ratio in [0,1]
 */
export function bandInk(pixels, width, { x0, x1, y0, y1 }, darkDelta = 20) {
  const hist = new Array(256).fill(0)
  let n = 0
  for (let y = y0; y < y1; y++) {
    const rowStart = y * width
    for (let x = x0; x < x1; x++) {
      hist[pixels[rowStart + x]]++
      n++
    }
  }
  let bg = 0,
    bgCount = -1
  for (let v = 0; v < 256; v++)
    if (hist[v] > bgCount) {
      bgCount = hist[v]
      bg = v
    }
  let ink = 0
  for (let v = 0; v < Math.max(0, bg - darkDelta); v++) ink += hist[v]
  return { ink: n > 0 ? ink / n : 0, bg, n }
}

/**
 * Count contiguous vertical "ink bands" (runs of rows containing at least
 * one ink pixel) within a rectangular region — a cheap, script-agnostic
 * proxy for "how many wrapped lines of text render here". Works even when
 * the glyphs themselves are unreadable (e.g. missing-glyph tofu), since it
 * only looks at *where* ink is, never what it says.
 *
 * @param {Buffer} pixels
 * @param {number} width
 * @param {{x0,x1,y0,y1}} box
 * @param {number} [darkDelta]
 * @returns {number}
 */
export function countInkBands(pixels, width, { x0, x1, y0, y1 }, darkDelta = 20) {
  const { bg } = bandInk(pixels, width, { x0, x1, y0, y1 }, darkDelta)
  const threshold = bg - darkDelta
  let bands = 0
  let prevInk = false
  for (let y = y0; y < y1; y++) {
    const rowStart = y * width
    let rowInk = false
    for (let x = x0; x < x1; x++) {
      if (pixels[rowStart + x] < threshold) {
        rowInk = true
        break
      }
    }
    if (rowInk && !prevInk) bands++
    prevInk = rowInk
  }
  return bands
}
