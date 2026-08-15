// I3 — `main-column-empty`: a multi-page CV whose wide column is never used.
//
// The dogfood shape (F4): a student CV rendered two pages whose main column was
// blank on both, and the diagnostics said nothing — `emptyColumn` carried the
// data, but as a per-page field labelled "not a target", which is exactly what
// a reader skims past (and should, for the shape it usually names).
//
// THE BOUNDARY, corrected by this file: "non-last page" is the WRONG scope,
// and writing it that way flagged pages 2..n-1 of any CV whose sidebar
// outlasts a short experience list — the exact residual C4 measured as
// anti-correlated with quality. What distinguishes the dogfood shape is not
// where the blank column sits but whether the main flow ever produced
// anything: a residual ENDS, this never starts. So the condition is "no main
// content on any page", which a residual cannot satisfy.
//
// Also: a one-page CV never fires it, kind is 'fact', and no new aggregate is
// added (emptyColumnPages already counts this shape).

import { describe, expect, it } from 'vitest'
import { planTwoColumn } from './layout.js'
import { layoutDiagnostics } from './layoutDiagnostics.js'

const PERSONAL = { name: 'Alpha Tester', title: 'Engineer' }
const words = (/** @type {number} */ n, /** @type {number} */ seed = 0) =>
  Array.from({ length: n }, (_, i) => `word${i}${seed}`).join(' ')

/** A sidebar tall enough to need `pages` pages on its own. */
const tallSidebar = (/** @type {number} */ items) =>
  /** @type {any} */ ({
    personal: PERSONAL,
    competencies: Array.from({ length: items }, (_, i) => `Competency number ${i + 1}`),
    certifications: Array.from({ length: Math.ceil(items / 4) }, (_, i) => ({
      name: `Certification number ${i + 1} with a reasonably long name attached to it`,
      issuer: 'Issuing Body'
    }))
  })

const codesOf = (/** @type {any} */ d) => (d?.warnings ?? []).map((/** @type {any} */ w) => w.code)
const factOf = (/** @type {any} */ d) =>
  (d?.warnings ?? []).find((/** @type {any} */ w) => w.code === 'main-column-empty')

describe('main-column-empty fires only where a blank wide column is a defect-shaped fact', () => {
  it('fires when the main column renders nothing on any page', () => {
    // No summary and no experience: the wide column is unused for the whole
    // document, and the sidebar needs several pages.
    const plan = planTwoColumn({
      content: { experience: [], summary: [], ...tallSidebar(90) }
    })
    expect(plan.totalPages).toBeGreaterThan(1)
    const d = layoutDiagnostics(plan)
    const w = factOf(d)
    expect(w).toBeDefined()
    expect(w?.kind).toBe('fact')
    // It names every page, because every page is the condition.
    expect(w?.pages).toEqual(plan.pages.map((_, i) => i + 1))
  })

  it('does NOT fire on the C4 residual — a main flow that ends before the sidebar does', () => {
    // Real experience content on page 1, sidebar running to page 5: pages 2-5
    // have blank main columns and every one is normal. This fixture is why the
    // predicate is "never started" rather than "not the last page" — it has
    // THREE non-last blank pages.
    const plan = planTwoColumn({
      content: {
        experience: [
          {
            role: 'Alpha Engineer',
            company: 'Bravo Systems',
            period: '2020 – 2024',
            bullets: [`Delivered the charlie subsystem: ${words(14, 1)}.`]
          }
        ],
        summary: [`Summary: ${words(16, 2)}.`],
        ...tallSidebar(90)
      }
    })
    expect(plan.totalPages).toBeGreaterThan(1)
    // Several NON-LAST pages are blank — the naive scope fired on all of them.
    expect(plan.pages.slice(1, -1).every((p) => p.emptyColumn === 'main')).toBe(true)
    expect(plan.pages.at(-1)?.emptyColumn).toBe('main')
    // …and it is not reported as this fact.
    expect(codesOf(layoutDiagnostics(plan))).not.toContain('main-column-empty')
  })

  it('never fires on a one-page CV', () => {
    const plan = planTwoColumn({
      content: { experience: [], summary: [], personal: PERSONAL, competencies: ['Alpha'] }
    })
    expect(plan.totalPages).toBe(1)
    expect(codesOf(layoutDiagnostics(plan))).not.toContain('main-column-empty')
  })

  it('does not fire when the main column carries a summary', () => {
    // I2's semantics: fixed content is content. A student CV whose page 1
    // holds a summary is not this shape.
    const plan = planTwoColumn({
      content: { experience: [], summary: [`Summary: ${words(16, 3)}.`], ...tallSidebar(90) }
    })
    // Page 1 carries the summary, so the main column is used and the
    // condition ("nothing anywhere") is not met.
    expect(codesOf(layoutDiagnostics(plan))).not.toContain('main-column-empty')
  })

  it('R-F: it names the condition and prices it, without prescribing the layout move', () => {
    const plan = planTwoColumn({
      content: { experience: [], summary: [], ...tallSidebar(90) }
    })
    const w = factOf(layoutDiagnostics(plan))
    expect(w?.message).toBeDefined()
    expect(w?.message).not.toMatch(/^\s*(move|add|put|fill)\b/i)
    expect(w?.message).not.toMatch(/\byou should\b|\bthe fix is\b|\braise it with\b/i)
    expect(w?.message).not.toMatch(/\n/)
    // It says WHICH pages and what is there instead.
    expect(w?.message).toMatch(/main column/i)
  })

  it('is not aggregated into a new total', () => {
    const plan = planTwoColumn({
      content: { experience: [], summary: [], ...tallSidebar(90) }
    })
    const d = layoutDiagnostics(plan)
    // emptyColumnPages already exists and stays the only count of this shape.
    expect(d?.totals).toBeDefined()
    expect(Object.keys(d?.totals ?? {})).not.toContain('mainColumnEmptyPages')
  })
})
