// ── Mono Theme ──────────────────────────────────────────────────────────────
// ATS-safe monochrome — black on white, no decorative colour.
// ────────────────────────────────────────────────────────────────────────────

import { tealTheme } from './teal.js'

export const monoTheme = {
  ...tealTheme,
  name: 'mono',

  palette: {
    accent:      '#000000',
    sidebarBg:   '#ffffff',
    textDark:    '#000000',
    textBody:    '#333333',
    textMuted:   '#555555',
    textContact: '#444444',
    tagBg:       '#eeeeee',
    tagText:     '#333333',
    divider:     '#000000',
    white:       '#ffffff',
  },
}
