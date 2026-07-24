// ── Coral Theme ─────────────────────────────────────────────────────────────
// Warm coral variant — inherits everything from teal, overrides palette only.
// ────────────────────────────────────────────────────────────────────────────

import { tealTheme } from './teal.js'

export const coralTheme = {
  ...tealTheme,
  name: 'coral',

  palette: {
    ...tealTheme.palette,
    accent:    '#c0534a',
    sidebarBg: '#fdf0ef',
    tagBg:     '#f5d0cd',
    tagText:   '#7a2920',
    divider:   '#e0b9b6',
  },
}
