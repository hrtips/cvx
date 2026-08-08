// ── layoutDiagnostics: the plan, re-expressed (C6a) ────────────────────────
//
// Two kinds of assertion here, deliberately:
//
//   1. Against a HAND-BUILT plan, where every number is chosen so the expected
//      output is arithmetic a reader can check in their head (0.5, 0.25, ...).
//      A diagnostics bug that reports a fill contradicting the plan is what
//      these catch, and each one was verified by seeding exactly that mutation.
//   2. Against a REAL plan from `planTwoColumn`, so the shape cannot drift from
//      the plan it claims to describe (a field renamed in layout.js would leave
//      the hand-built tests green).
//
// What is NOT here: any assertion that a diagnostic can be moved by CV text.
// That is the injection guard, and it lives where the untrusted path actually
// runs — test/planLayout.test.js (through the MCP tool, off real YAML).

import { describe, expect, it } from 'vitest'
import { planTwoColumn } from './layout.js'
import { layoutDiagnostics } from './layoutDiagnostics.js'

/**
 * A slice as `packSidebar` publishes it.
 *
 * @param {string} key
 * @param {number} start
 * @param {number} end
 * @param {number} itemCount
 * @param {number} height
 * @param {number} [gapBefore]
 * @returns {import('./types.js').SidebarSlice}
 */
const slice = (key, start, end, itemCount, height, gapBefore = 0) => ({
  key,
  start,
  end,
  itemCount,
  height,
  gapBefore
})

/**
 * A plan with the numbers picked for legibility: page 1 is exactly half-full in
 * the main column and three-quarters in the sidebar.
 *
 * @param {Partial<import('./types.js').LayoutPlanPage>[]} pages
 * @returns {import('./types.js').LayoutPlan}
 */
const planOf = (pages) => ({
  totalPages: pages.length,
  mainPageCount: pages.length,
  sidebarPageCount: pages.length,
  pages: pages.map((p, index) => ({
    index,
    identity: ['identity-compact'],
    mainBlocks: [],
    sidebarSlices: [],
    mainFill: null,
    sidebarFill: null,
    overflowPt: 0,
    emptyColumn: null,
    ...p
  }))
})

describe('layoutDiagnostics — fills', () => {
  it('reports used/budget as a 0..1 ratio, per column, per page', () => {
    const d = layoutDiagnostics(
      planOf([
        {
          mainFill: { used: 300, budget: 600 },
          sidebarFill: { used: 450, budget: 600 },
          mainBlocks: [{ role: 'Engineer', bullets: ['a', 'b'] }],
          sidebarSlices: [slice('education', 0, 2, 2, 450)]
        }
      ])
    )
    expect(d?.pages[0].main.fill).toBe(0.5)
    expect(d?.pages[0].main.usedPt).toBe(300)
    expect(d?.pages[0].main.budgetPt).toBe(600)
    expect(d?.pages[0].sidebar.fill).toBe(0.75)
  })

  it('rounds a ratio to 3dp and points to 2dp — deterministic, not float noise', () => {
    const d = layoutDiagnostics(
      planOf([{ mainFill: { used: 1 / 3, budget: 1 }, sidebarFill: { used: 2.005, budget: 3 } }])
    )
    expect(d?.pages[0].main.fill).toBe(0.333)
    expect(d?.pages[0].sidebar.fill).toBe(0.668)
    expect(d?.pages[0].sidebar.usedPt).toBe(2.01)
  })

  it('reports nulls, not zeros, for a column whose flow ended on an earlier page', () => {
    // The G1 residual: the sidebar outlasts the experience list, so page 2's
    // main column has no metrics at all. Reporting `fill: 0` would say "this
    // page's main column is empty and that is a 0% fill of a real budget",
    // which is a different (and wrong) claim from "this flow ended".
    const d = layoutDiagnostics(
      planOf([
        { mainFill: { used: 10, budget: 20 }, sidebarFill: { used: 10, budget: 20 } },
        { mainFill: null, sidebarFill: { used: 5, budget: 20 }, emptyColumn: 'main' }
      ])
    )
    expect(d?.pages[1].main).toEqual({
      fill: null,
      usedPt: null,
      budgetPt: null,
      entries: []
    })
    expect(d?.pages[1].emptyColumn).toBe('main')
  })

  it('reports fill: null (not a negative ratio) when the budget itself is negative', () => {
    // `edge-summary-exceeds-page`: the summary alone is taller than the main
    // column, so the experience budget goes negative. used/budget would be a
    // plausible-looking negative number; the honest answer is "no fill" plus
    // the overflow warning.
    const d = layoutDiagnostics(planOf([{ mainFill: { used: 100, budget: -50 }, overflowPt: 150 }]))
    expect(d?.pages[0].main.fill).toBe(null)
    expect(d?.pages[0].main.budgetPt).toBe(-50)
    expect(d?.pages[0].overflowPt).toBe(150)
  })
})

describe('layoutDiagnostics — what is on each page', () => {
  it('numbers pages from 1 (the badge on the sheet), not from the plan index', () => {
    const d = layoutDiagnostics(planOf([{}, {}, {}]))
    expect(d?.pages.map((p) => p.page)).toEqual([1, 2, 3])
  })

  it('reports each experience entry with the bullets THIS page renders', () => {
    const d = layoutDiagnostics(
      planOf([
        {
          mainBlocks: [
            { role: 'Whole', bullets: ['a', 'b', 'c'] },
            { role: 'Head', bullets: ['a', 'b', 'c', 'd'], endBullet: 2 }
          ]
        },
        {
          mainBlocks: [
            { role: 'Head', bullets: ['a', 'b', 'c', 'd'], isContinuation: true, startBullet: 2 }
          ]
        }
      ])
    )
    expect(d?.pages[0].main.entries).toEqual([
      { role: 'Whole', bullets: 3, continued: false },
      { role: 'Head', bullets: 2, continued: false }
    ])
    expect(d?.pages[1].main.entries).toEqual([{ role: 'Head', bullets: 2, continued: true }])
  })

  it('reports each sidebar section as a range of its items, marking a continuation', () => {
    const d = layoutDiagnostics(
      planOf([
        { sidebarSlices: [slice('certifications', 0, 6, 10, 400)] },
        { sidebarSlices: [slice('certifications', 6, 10, 10, 260)] }
      ])
    )
    expect(d?.pages[0].sidebar.sections).toEqual([
      {
        key: 'certifications',
        items: 6,
        of: 10,
        range: [0, 6],
        continued: false,
        heightPt: 400
      }
    ])
    expect(d?.pages[1].sidebar.sections[0]).toMatchObject({
      items: 4,
      of: 10,
      range: [6, 10],
      continued: true
    })
  })
})

describe('layoutDiagnostics — totals and warnings', () => {
  it('counts overflow pages, empty columns and splits', () => {
    const d = layoutDiagnostics(
      planOf([
        {
          mainFill: { used: 700, budget: 600 },
          overflowPt: 100,
          mainBlocks: [{ role: 'A', bullets: ['x'] }],
          sidebarSlices: [slice('education', 0, 2, 4, 300)]
        },
        {
          emptyColumn: 'main',
          sidebarSlices: [slice('education', 2, 4, 4, 200)],
          sidebarFill: { used: 200, budget: 600 }
        },
        {
          emptyColumn: 'sidebar',
          mainBlocks: [{ role: 'A', bullets: ['x', 'y'], isContinuation: true, startBullet: 1 }],
          mainFill: { used: 100, budget: 600 }
        }
      ])
    )
    expect(d?.totals).toEqual({
      overflowPages: 1,
      overflowPt: 100,
      emptyColumnPages: 2,
      splitSections: 1,
      splitEntries: 1
    })
  })

  it('takes its overflow warnings from overflowWarnings() — same threshold, same words', () => {
    const quiet = layoutDiagnostics(planOf([{ overflowPt: 10 }]))
    expect(quiet?.warnings).toEqual([]) // under the safety-margin backstop
    expect(quiet?.totals.overflowPages).toBe(0)

    const loud = layoutDiagnostics(planOf([{ overflowPt: 438.21 }]))
    expect(loud?.warnings).toHaveLength(1)
    expect(loud?.warnings[0]).toMatchObject({
      code: 'overflow',
      page: 1,
      overflowPt: 438.21,
      forcedByConfig: false
    })
    expect(loud?.warnings[0].message).toMatch(/over budget/)
    expect(loud?.warnings[0].message).toMatch(/extra physical sheet/)
  })

  it('attributes a page-1 overflow to the user`s own lever when config set one', () => {
    const d = layoutDiagnostics(planOf([{ overflowPt: 87.46 }]), {
      page1ExperienceCount: 3,
      page1SplitBullets: 2
    })
    expect(d?.warnings[0].forcedByConfig).toBe(true)
    expect(d?.warnings[0].message).toMatch(/page1ExperienceCount: 3/)
    expect(d?.warnings[0].message).toMatch(/page1SplitBullets: 2/)
  })

  it('names the summary when the FIXED page-1 content is what overflowed', () => {
    const d = layoutDiagnostics(planOf([{ overflowPt: 474, mainFill: { used: 100, budget: -20 } }]))
    expect(d?.warnings[0].message).toMatch(/summary alone is taller/)
  })
})

describe('layoutDiagnostics — the ATS/single-column answer', () => {
  it('is null, not an empty plan', () => {
    // react-pdf auto-flows a single column; CVX never packs it, so there is no
    // plan. An empty shape would read as "a one-page CV with nothing on it".
    expect(layoutDiagnostics(undefined)).toBe(null)
  })
})

describe('layoutDiagnostics — against a real plan', () => {
  const content = {
    personal: { name: 'Real Person', title: 'Role', company: 'Co' },
    summary: ['One line of summary.'],
    experience: [
      { role: 'Recent', company: 'C', period: '2020', bullets: ['a', 'b', 'c'] },
      { role: 'Older', company: 'D', period: '2015', bullets: ['d', 'e'] }
    ],
    education: [{ degree: 'BSc', institution: 'Uni', period: '2000' }],
    certifications: Array.from({ length: 40 }, (_, i) => ({
      name: `Certification number ${i}`,
      issuer: 'Some Issuer',
      year: `${2000 + i}`
    }))
  }
  const plan = planTwoColumn({ content })
  const d = layoutDiagnostics(plan)

  it('describes the same document the plan does', () => {
    expect(d?.totalPages).toBe(plan.totalPages)
    expect(d?.mainPageCount).toBe(plan.mainPageCount)
    expect(d?.sidebarPageCount).toBe(plan.sidebarPageCount)
    expect(d?.pages).toHaveLength(plan.totalPages)
    expect(plan.totalPages).toBeGreaterThan(1) // the fixture genuinely paginates
  })

  it('each page`s reported fill is that page`s own used/budget — not another page`s', () => {
    // The mutation this kills: `plan.pages[0].mainFill` for every page, or
    // main/sidebar transposed. Both leave the shape valid and every number
    // plausible, which is why this compares the WHOLE per-page projection in
    // one equality rather than spot-checking a field.
    const round3 = (/** @type {import('./types.js').ColumnFill | null} */ f) =>
      f && f.budget > 0 ? Math.round((f.used / f.budget) * 1000) / 1000 : null
    const fromPlan = plan.pages.map((p) => ({
      main: round3(p.mainFill),
      sidebar: round3(p.sidebarFill),
      sections: p.sidebarSlices.map((s) => s.key),
      roles: p.mainBlocks.map((b) => b.role)
    }))
    const fromDiagnostics = (d?.pages ?? []).map((p) => ({
      main: p.main.fill,
      sidebar: p.sidebar.fill,
      sections: p.sidebar.sections.map((s) => s.key),
      roles: p.main.entries.map((e) => e.role)
    }))
    expect(fromDiagnostics).toEqual(fromPlan)
    // Distinct per page, so a "same answer everywhere" bug cannot pass.
    expect(new Set(fromPlan.map((p) => p.sidebar)).size).toBeGreaterThan(1)
  })

  it('reports a real split section as a continuation with an item range', () => {
    const certs = d?.pages.flatMap((p) =>
      p.sidebar.sections.filter((s) => s.key === 'certifications')
    )
    expect(certs?.length).toBeGreaterThan(1) // 40 certifications do not fit one page
    expect(certs?.[0].continued).toBe(false)
    expect(certs?.[1].continued).toBe(true)
    // The ranges tile the whole section: nothing dropped, nothing duplicated.
    expect(certs?.[0].range[0]).toBe(0)
    expect(certs?.[certs.length - 1].range[1]).toBe(40)
    expect(certs?.reduce((n, s) => n + s.items, 0)).toBe(40)
    expect(d?.totals.splitSections).toBe((certs?.length ?? 0) - 1)
  })

  it('every page`s sidebar sections sum to that page`s used height', () => {
    const off = (d?.pages ?? [])
      .filter((p) => p.sidebar.usedPt !== null)
      .map((p) => {
        const sum = plan.pages[p.page - 1].sidebarSlices.reduce(
          (n, s) => n + s.height + s.gapBefore,
          0
        )
        return { page: p.page, usedPt: p.sidebar.usedPt, sumOfSlices: Math.round(sum * 100) / 100 }
      })
      .filter((r) => Math.abs(Number(r.usedPt) - r.sumOfSlices) >= 0.011)
    expect(off).toEqual([])
  })
})
