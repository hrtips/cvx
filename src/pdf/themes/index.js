// ── Theme Auto-Discovery ────────────────────────────────────────────────────
// Scans this directory for theme files. Each .js file (except index.js) must
// export a default theme object with a `name` property.
//
// To add a new theme: create a new .js file in this folder, done.
// ────────────────────────────────────────────────────────────────────────────

import { readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, basename } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

// Eagerly import all known themes — these are the static fallbacks
// that always work (even in Vite where fs isn't available).
import { tealTheme }  from './teal.js'
import { coralTheme } from './coral.js'
import { monoTheme }  from './mono.js'

const STATIC_THEMES = {
  teal:  tealTheme,
  coral: coralTheme,
  mono:  monoTheme,
}

/**
 * Discover themes dynamically by scanning the themes directory.
 * Falls back to static imports if fs scanning fails (e.g., in browser).
 */
let _discovered = null

export async function discoverThemes() {
  if (_discovered) return _discovered

  try {
    const files = readdirSync(__dir)
      .filter(f => f.endsWith('.js') && f !== 'index.js')

    const themes = { ...STATIC_THEMES }

    for (const file of files) {
      const name = basename(file, '.js')
      if (themes[name]) continue  // already loaded statically

      try {
        const mod = await import(join(__dir, file))
        // Find the exported theme object (named export with `name` property)
        const themeObj = Object.values(mod).find(v => v && typeof v === 'object' && v.name)
        if (themeObj) {
          themes[themeObj.name] = themeObj
        }
      } catch { /* skip files that fail to import */ }
    }

    _discovered = themes
    return themes
  } catch {
    // fs not available (browser) — return static themes
    _discovered = STATIC_THEMES
    return STATIC_THEMES
  }
}

// Synchronous access for Vite/browser (uses only static imports)
export const THEMES = STATIC_THEMES

// Re-export for convenience
export { tealTheme }  from './teal.js'
export { coralTheme } from './coral.js'
export { monoTheme }  from './mono.js'
