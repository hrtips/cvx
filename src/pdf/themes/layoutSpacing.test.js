// D11 — template-declared spacing. The proof that the surface does what it
// says, scales only what it is allowed to, and is inert when unused.
import { describe, expect, it } from 'vitest'
import { resolveDocument } from '../resolveDocument.js'
import { tealTheme } from './teal.js'
import {
  applyLayoutSpacing,
  isIdentitySpacing,
  SPACING_BOUNDS,
  SPACING_GROUPS,
  SPACING_KEYS,
  spacingScales
} from './layoutSpacing.js'

/** Every horizontal token — scaling any of these changes wrap widths, hence
 *  line counts, hence every measurement in the engine. Standing design law. */
const HORIZONTAL = ['bulletIndent', 'progPl', 'itemPl', 'iconWidth', 'iconMr']

describe('applyLayoutSpacing — template spacing groups', () => {
  it('is the IDENTITY when no spacing is declared — the same object, not a copy', () => {
    // Reference identity, not deep equality: a build that declares no spacing
    // must be incapable of differing from one made before the feature existed,
    // including by a rounding step.
    expect(applyLayoutSpacing(tealTheme, undefined)).toBe(tealTheme)
    expect(applyLayoutSpacing(tealTheme, {})).toBe(tealTheme)
    expect(applyLayoutSpacing(tealTheme, { spacing: {} })).toBe(tealTheme)
    // ...and an explicit 1 is still identity.
    expect(applyLayoutSpacing(tealTheme, { spacing: { entryGap: 1 } })).toBe(tealTheme)
  })

  it('entryGap scales the between-entries tokens, and nothing else', () => {
    const t = applyLayoutSpacing(tealTheme, { spacing: { entryGap: 0.8 } })
    expect(t.spacing.entryMb).toBeCloseTo(tealTheme.spacing.entryMb * 0.8, 2)
    expect(t.chrome.dividerMargin).toBeCloseTo(tealTheme.chrome.dividerMargin * 0.8, 2)
    // Other groups untouched — this is the whole point of groups over a density.
    expect(t.spacing.bulletGap).toBe(tealTheme.spacing.bulletGap)
    expect(t.spacing.sectionGap).toBe(tealTheme.spacing.sectionGap)
    // The rule itself is a hairline, not whitespace: scaling it would make it
    // vanish or fatten rather than move the entries apart.
    expect(t.chrome.dividerHeight).toBe(tealTheme.chrome.dividerHeight)
  })

  it('each group scales exactly the tokens it declares', () => {
    for (const [key, group] of Object.entries(SPACING_GROUPS)) {
      const t = applyLayoutSpacing(tealTheme, { spacing: { [key]: 0.7 } })
      for (const token of group.spacing ?? []) {
        expect(
          /** @type {Record<string, number>} */ (t.spacing)[token],
          `${key} did not scale spacing.${token}`
        ).toBeCloseTo(/** @type {Record<string, number>} */ (tealTheme.spacing)[token] * 0.7, 2)
      }
      for (const token of group.chrome ?? []) {
        expect(
          /** @type {Record<string, number>} */ (t.chrome)[token],
          `${key} did not scale chrome.${token}`
        ).toBeCloseTo(/** @type {Record<string, number>} */ (tealTheme.chrome)[token] * 0.7, 2)
      }
    }
  })

  it('NEVER touches a horizontal token, under any combination of groups', () => {
    // Horizontal offsets change wrap widths and therefore every measured line
    // count. If one ever became scalable, this fails before the render does.
    const all = Object.fromEntries(SPACING_KEYS.map((k) => [k, 0.6]))
    const t = applyLayoutSpacing(tealTheme, { spacing: all })
    for (const token of HORIZONTAL) {
      expect(
        /** @type {Record<string, number>} */ (t.spacing)[token],
        `horizontal token ${token} was scaled`
      ).toBe(/** @type {Record<string, number>} */ (tealTheme.spacing)[token])
    }
    // The packing safety buffer is machinery, not design.
    expect(t.spacing.safety).toBe(tealTheme.spacing.safety)
  })

  it('leaves every unlisted token alone', () => {
    const all = Object.fromEntries(SPACING_KEYS.map((k) => [k, 0.75]))
    const t = applyLayoutSpacing(tealTheme, { spacing: all })
    const scaled = new Set(Object.values(SPACING_GROUPS).flatMap((g) => g.spacing ?? []))
    for (const [token, base] of Object.entries(tealTheme.spacing)) {
      if (scaled.has(token) || typeof base !== 'number') continue
      expect(/** @type {Record<string, number>} */ (t.spacing)[token], `${token} moved`).toBe(base)
    }
  })

  it('quantizes to 0.01pt so model and render cannot straddle a rounding step', () => {
    const t = applyLayoutSpacing(tealTheme, { spacing: { entryGap: 0.777 } })
    for (const v of [t.spacing.entryMb, t.chrome.dividerMargin]) {
      // `v * 100 === Math.round(v * 100)` looks equivalent and is not: 8.55*100
      // is 855.0000000000001 in IEEE, so that form fails on a value that IS
      // quantized. Compare the number to its own 2dp rounding instead.
      expect(v).toBe(Math.round(v * 100) / 100)
    }
  })

  it('spacingScales defaults every group to 1 and isIdentitySpacing agrees', () => {
    expect(spacingScales(undefined)).toEqual(Object.fromEntries(SPACING_KEYS.map((k) => [k, 1])))
    expect(isIdentitySpacing(spacingScales(undefined))).toBe(true)
    expect(isIdentitySpacing(spacingScales({ spacing: { entryGap: 0.9 } }))).toBe(false)
    // A non-numeric value is ignored here and rejected by validation — the
    // resolver must never throw on hand-written YAML.
    expect(spacingScales(/** @type {any} */ ({ spacing: { entryGap: 'tight' } })).entryGap).toBe(1)
  })

  it('bounds are a real range with the floor below 1 and the ceiling above it', () => {
    expect(SPACING_BOUNDS.min).toBeLessThan(1)
    expect(SPACING_BOUNDS.max).toBeGreaterThan(1)
  })
})

describe('resolveDocument — the single place spacing is applied', () => {
  it('hands the SAME scaled theme to whatever asks, so plan and render agree', () => {
    // This is the structural guarantee: there is one theme object, and both the
    // planner and the renderer read it. Applying spacing anywhere else would
    // reopen the model/render gap that D2-D6 were all instances of.
    const layout = {
      template: 'two-column',
      spacing: { entryGap: 0.8 },
      first: { sidebar: ['contact'], main: ['summary', 'experience'] }
    }
    const a = resolveDocument({ layout: /** @type {any} */ (layout) })
    const b = resolveDocument({ layout: /** @type {any} */ (layout) })
    expect(a.activeTheme.spacing.entryMb).toBeCloseTo(tealTheme.spacing.entryMb * 0.8, 2)
    // Deterministic: same input, same numbers (the repro gate depends on it).
    expect(b.activeTheme.spacing.entryMb).toBe(a.activeTheme.spacing.entryMb)
  })

  it('a layout with no spacing resolves to the untouched theme object', () => {
    const { activeTheme } = resolveDocument({
      layout: /** @type {any} */ ({
        template: 'two-column',
        first: { sidebar: ['contact'], main: ['summary', 'experience'] }
      })
    })
    expect(activeTheme).toBe(tealTheme)
  })
})
