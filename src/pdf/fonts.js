import { Font } from '@react-pdf/renderer'

/**
 * Register Lato TTF fonts.
 * @param {string} base  base path/URL without trailing slash
 *   Browser:  '/src/fonts'
 *   Node:     '/absolute/path/to/src/fonts'
 *
 * Lato only has 300 / 400 / 700 weights — 500 maps to Regular, 600 maps to Bold.
 */
export function registerFonts(base) {
  Font.register({
    family: 'Lato',
    fonts: [
      { src: `${base}/Lato-Light.ttf`,        fontWeight: 300 },
      { src: `${base}/Lato-LightItalic.ttf`,  fontWeight: 300, fontStyle: 'italic' },
      { src: `${base}/Lato-Regular.ttf`,       fontWeight: 400 },
      { src: `${base}/Lato-Italic.ttf`,        fontWeight: 400, fontStyle: 'italic' },
      { src: `${base}/Lato-Regular.ttf`,       fontWeight: 500 },
      { src: `${base}/Lato-Bold.ttf`,          fontWeight: 600 },
      { src: `${base}/Lato-Bold.ttf`,          fontWeight: 700 },
      { src: `${base}/Lato-BoldItalic.ttf`,    fontWeight: 700, fontStyle: 'italic' },
    ],
  })
  // Disable automatic hyphenation — words should never be split mid-word
  Font.registerHyphenationCallback(word => [word])
}
