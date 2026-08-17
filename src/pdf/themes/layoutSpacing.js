// ── Template-declared spacing (D11) ─────────────────────────────────────────
//
// The one lever an author who will not alter their text can actually pull.
// Measured on the 2026-08-16 dogfood CV: tightening the between-entries gap by
// ~20% takes a 3-page CV to 2 with zero content change, and it is not a knife
// edge. Before this, that author had no working control at all — the three
// shipped themes are geometrically identical (palette only), the layout's old
// `geometry:` block was deleted because its keys were silently ignored, and
// user-space themes are unbuilt.
//
// WHY MULTIPLIERS, NOT POINTS. The named styles' ratios ARE the design (the
// same argument that made `typeScale` a single multiplier rather than per-token
// sizes). A scale preserves the rhythm inside a group and cannot hard-code a
// number that stops making sense when the type scale moves.
//
// WHY GROUPS, NOT ONE DENSITY. Measured both: a single density needs 0.90 to
// reach 2 pages on the dogfood CV, which also tightens spacing *inside* a job
// that did not need tightening. Scaling the between-entries gap alone reaches
// the same page count while leaving the reading rhythm within a job untouched —
// which is the typographically right instinct, so the surface should express it.
//
// WHY VERTICAL ONLY. Horizontal offsets (`bulletIndent`, `progPl`, `itemPl`,
// the contact icon widths) change wrap widths, hence line counts, hence every
// measurement in the engine. They stay unexposed — this is standing design law,
// not a scope decision.
//
// The resolver applies these to the THEME, in `resolveDocument` — the single
// chain both the planner and the renderer already go through. That is what
// makes model and render incapable of disagreeing about spacing: there is one
// scaled theme object and they both read it.

/**
 * Bounds for every group. Out-of-range is a VALIDATION ERROR with a field path,
 * never a clamp (ruling R-M): a clamped value renders something the author did
 * not ask for and never finds out about.
 *
 * The floor is a legibility bound — below it the entry divider's margin
 * approaches the divider's own visual weight and consecutive entries start to
 * read as one block. The ceiling is where a page wastes more than the extra
 * breathing room buys.
 */
export const SPACING_BOUNDS = Object.freeze({ min: 0.6, max: 1.5 })

/**
 * The closed key list. A key absent here is a validation error, so a typo fails
 * loudly the moment spacing starts working rather than doing nothing quietly —
 * which is exactly how the deleted `geometry:` block wasted everyone's time.
 *
 * Each group names the theme tokens it scales. Grouping is by what a READER
 * sees, not by which object the token happens to live in: `entryGap` is "the
 * space between one job and the next", which is an entry's own bottom margin
 * plus the rule's margins.
 *
 * @type {Readonly<Record<string, { spacing?: string[], chrome?: string[], label: string }>>}
 */
export const SPACING_GROUPS = Object.freeze({
  entryGap: {
    label: 'space between experience entries',
    spacing: ['entryMb'],
    chrome: ['dividerMargin']
  },
  bulletGap: {
    label: 'space between bullet items',
    spacing: ['bulletGap', 'summaryBulletGap']
  },
  sectionGap: {
    label: 'space around section boundaries',
    spacing: ['sectionGap', 'sectionTitleMb', 'sidebarTitleMb']
  }
})

export const SPACING_KEYS = Object.freeze(Object.keys(SPACING_GROUPS))

/**
 * Every group's multiplier for a layout, defaulting to 1 (identity).
 *
 * @param {{ spacing?: import('../types.js').LayoutSpacing }} [layout]
 * @returns {Record<string, number>}
 */
export function spacingScales(layout) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const key of SPACING_KEYS) {
    const v = /** @type {Record<string, unknown> | undefined} */ (layout?.spacing)?.[key]
    out[key] = typeof v === 'number' && Number.isFinite(v) ? v : 1
  }
  return out
}

/** True when nothing is overridden — the identity case, which must return the theme unchanged. */
export function isIdentitySpacing(/** @type {Record<string, number>} */ scales) {
  return SPACING_KEYS.every((k) => scales[k] === 1)
}

/**
 * A theme with the layout's spacing groups applied.
 *
 * Returns the SAME object when nothing is overridden — identity is not merely
 * "numerically equal", it is the same reference, so no build that declares no
 * spacing can possibly differ by a rounding step from one that never had the
 * feature.
 *
 * @param {import('../types.js').Theme} theme
 * @param {{ spacing?: import('../types.js').LayoutSpacing }} [layout]
 * @returns {import('../types.js').Theme}
 */
export function applyLayoutSpacing(theme, layout) {
  const scales = spacingScales(layout)
  if (isIdentitySpacing(scales)) return theme

  // Read every base value from an untouched snapshot, never from the object
  // being written. No two groups share a token today, but if one ever did,
  // reading the copy would compound the two scales silently.
  const baseSpacing = /** @type {Record<string, number>} */ ({ ...theme.spacing })
  const baseChrome = /** @type {Record<string, number>} */ ({ ...theme.chrome })
  const spacing = { ...baseSpacing }
  const chrome = { ...baseChrome }

  for (const [key, group] of Object.entries(SPACING_GROUPS)) {
    const k = scales[key]
    if (k === 1) continue
    for (const token of group.spacing ?? []) {
      if (typeof baseSpacing[token] === 'number') spacing[token] = round2(baseSpacing[token] * k)
    }
    for (const token of group.chrome ?? []) {
      if (typeof baseChrome[token] === 'number') chrome[token] = round2(baseChrome[token] * k)
    }
  }
  return /** @type {import('../types.js').Theme} */ ({ ...theme, spacing, chrome })
}

/**
 * Two decimal places. The engine quantizes to 0.01pt everywhere, so a scaled
 * token that carried more precision than that would put the model and the
 * renderer on different sides of a rounding boundary.
 */
function round2(/** @type {number} */ n) {
  return Math.round(n * 100) / 100
}
