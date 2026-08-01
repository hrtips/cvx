// ── One place that resolves theme + layout for a build ─────────────────────
//
// Both the renderer and (as of C3a) anything that wants the pagination PLAN
// without rendering need the same answers to "which layout object?" and "which
// theme object?". They used to be answered twice — render.js resolved the theme
// and passed `layout: undefined` when the file was missing, leaving CVDocument
// to apply `layout ?? LAYOUTS[name] ?? TWO_COLUMN_LAYOUT`, while layout.js
// applied its own default. Three fallback chains for one decision means a
// second `planTwoColumn()` call can measure a document that is not the one
// rendered. This module is the single chain; every caller goes through it.
// ────────────────────────────────────────────────────────────────────────────

import { LAYOUTS, TWO_COLUMN_LAYOUT } from './defaultLayouts.js'
import { monoTheme } from './themes/mono.js'
import { tealTheme } from './themes/teal.js'

/** Default theme per layout template — the designed layout is teal, the ATS one mono. */
/** @type {Record<string, import('./types.js').Theme>} */
const LAYOUT_DEFAULT_THEME = {
  'two-column': tealTheme,
  'single-column': monoTheme
}

/**
 * @param {object} args
 * @param {import('./types.js').CVConfig} [args.config]
 * @param {import('./types.js').Theme} [args.theme]   already-loaded theme object, if the caller has one
 * @param {import('./types.js').NormalizedLayout} [args.layout]  already-loaded layout object, if the caller has one
 * @returns {{
 *   layoutName: string,
 *   activeLayout: import('./types.js').ResolvedLayout,
 *   activeTheme: import('./types.js').Theme,
 *   isSingleColumn: boolean,
 *   packing: import('./types.js').CVConfig,
 * }}
 */
export function resolveDocument({ config, theme, layout } = {}) {
  const layoutName = config?.layout ?? 'two-column'
  const activeLayout = /** @type {import('./types.js').ResolvedLayout} */ (
    layout ?? LAYOUTS[layoutName] ?? TWO_COLUMN_LAYOUT
  )
  const activeTheme =
    theme ?? LAYOUT_DEFAULT_THEME[activeLayout.template ?? layoutName] ?? tealTheme

  return {
    layoutName,
    activeLayout,
    activeTheme,
    isSingleColumn: (activeLayout.template ?? layoutName) === 'single-column',
    // Normalised to the shape the packer reads: explicit nulls, never undefined,
    // so "unset" is one value rather than two.
    packing: {
      page1ExperienceCount: config?.page1ExperienceCount ?? null,
      page1SplitBullets: config?.page1SplitBullets ?? null
    }
  }
}
