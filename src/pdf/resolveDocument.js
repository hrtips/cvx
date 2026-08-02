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
    //
    // THIS IS A WHITELIST, and a future layout lever has to be added here or it
    // does not exist. C4 learned it the expensive way: a `fill: 'balance'`
    // prototype was gated on `config.fill` inside `planTwoColumn`, and because
    // this object never carried `fill`, the gate was DEAD on the real render
    // path — the evaluation only reached it by calling `planTwoColumn` directly
    // and passing a hand-built config. So the rule for any C6 lever
    // (`fill`, `density`, `weights`, `targetPages`, `order`, `buckets`) is
    // three things in ONE commit: the key plumbed through here, the key added
    // to `schema/v1/cvx.schema.json` (config is `additionalProperties: false`,
    // so an un-schema'd key fails `cvx validate`), and a lever axis in
    // `test/layout-harness/fixtures.js`. Miss the first and the lever silently
    // does nothing; miss the third and every invariant in the C0 suite passes
    // without ever executing the new code path (demonstrated in C4: a `balance`
    // mode seeded to DROP a block left the whole suite green).
    packing: {
      page1ExperienceCount: config?.page1ExperienceCount ?? null,
      page1SplitBullets: config?.page1SplitBullets ?? null
    }
  }
}
