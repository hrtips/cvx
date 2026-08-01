// Minimal ambient declaration for the fontkit surface measure.js uses.
// fontkit ships no types; this covers only the calls we make.
declare module 'fontkit' {
  interface GlyphRun {
    advanceWidth: number
  }
  interface Font {
    unitsPerEm: number
    layout(text: string): GlyphRun
    hasGlyphForCodePoint(codePoint: number): boolean
  }
  export function openSync(path: string, postscriptName?: string): Font
}
