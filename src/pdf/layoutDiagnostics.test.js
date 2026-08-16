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
    mainBlockedBy: null,
    sidebarBlockedBy: null,
    overflowPt: 0,
    emptyColumn: null,
    ...p
  }))
})

describe('layoutDiagnostics — fills', () => {
  it('reports COLUMN OCCUPANCY as a 0..1 ratio, per column, per page (v2)', () => {
    // v2 (§3.9): fill = (fixed + used) / capacity, where fixed = capacity −
    // budget. With no fixed content (capacity == budget) it degenerates to the
    // old used/budget; with fixed content the two DIFFER, and that difference
    // is the point — v1's page-1 number was not comparable to page 2's.
    const d = layoutDiagnostics(
      planOf([
        {
          mainFill: { used: 300, budget: 600, capacity: 600 },
          sidebarFill: { used: 300, budget: 600, capacity: 800 },
          mainBlocks: [{ role: 'Engineer', bullets: ['a', 'b'] }],
          sidebarSlices: [slice('education', 0, 2, 2, 450)]
        }
      ])
    )
    expect(d?.version).toBe(4)
    expect(d?.pages[0].main.fill).toBe(0.5) // (0 + 300) / 600
    expect(d?.pages[0].main.usedPt).toBe(300)
    expect(d?.pages[0].main.budgetPt).toBe(600)
    expect(d?.pages[0].main.capacityPt).toBe(600)
    expect(d?.pages[0].main.fixedPt).toBe(0)
    // 200pt of identity block above 300pt of packed content in an 800pt column:
    // v1 said 0.5 (300/600) and invited comparison with main's 0.5, which
    // described a different thing. v2 says 0.625 of the column is occupied.
    expect(d?.pages[0].sidebar.fill).toBe(0.625)
    expect(d?.pages[0].sidebar.fixedPt).toBe(200)
  })

  it('rounds a ratio to 3dp and points to 2dp — deterministic, not float noise', () => {
    const d = layoutDiagnostics(
      planOf([
        {
          mainFill: { used: 1 / 3, budget: 1, capacity: 1 },
          sidebarFill: { used: 2.005, budget: 3, capacity: 3 }
        }
      ])
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
        {
          mainFill: { used: 10, budget: 20, capacity: 20 },
          sidebarFill: { used: 10, budget: 20, capacity: 20 }
        },
        {
          mainFill: null,
          sidebarFill: { used: 5, budget: 20, capacity: 20 },
          emptyColumn: 'main'
        }
      ])
    )
    expect(d?.pages[1].main).toEqual({
      fill: null,
      usedPt: null,
      budgetPt: null,
      capacityPt: null,
      fixedPt: null,
      blockedBy: null,
      entries: []
    })
    expect(d?.pages[1].emptyColumn).toBe('main')
  })

  it('reports fill ABOVE 1 (not null) when the fixed content alone exceeds the column', () => {
    // `edge-summary-exceeds-page`: the summary alone is taller than the main
    // column, so the experience budget goes negative. v1 refused a ratio here
    // (used/budget would be a plausible-looking NEGATIVE number). Under v2 an
    // honest ratio exists — the content genuinely exceeds the column — so it is
    // a number above 1, and `null` keeps its one remaining meaning: "this flow
    // ended on an earlier page" (§3.9's deliberate semantic change).
    const d = layoutDiagnostics(
      planOf([{ mainFill: { used: 100, budget: -50, capacity: 200 }, overflowPt: 150 }])
    )
    // fixed = 200 − (−50) = 250; (250 + 100) / 200 = 1.75
    expect(d?.pages[0].main.fill).toBe(1.75)
    expect(d?.pages[0].main.fixedPt).toBe(250)
    expect(d?.pages[0].main.budgetPt).toBe(-50)
    expect(d?.pages[0].overflowPt).toBe(150)
  })
})

describe('layoutDiagnostics — what is on each page', () => {
  it('numbers pages from 1 (the badge on the sheet), not from the plan index', () => {
    const d = layoutDiagnostics(planOf([{}, {}, {}]))
    expect(d?.pages.map((p) => p.page)).toEqual([1, 2, 3])
  })

  it('reports each experience entry with the bullets THIS page renders, decomposed like a sidebar slice', () => {
    // Same shape as `sidebar.sections`: an end-exclusive range, the count on
    // this page, and the total. Before C6a's review the main column published
    // only the count, so a consumer wanting "which bullets are on page 2" had to
    // re-derive the split from `@internal` engine functions — which is exactly
    // what test/planLayout.test.js had to do, and a shipped consumer cannot.
    const d = layoutDiagnostics(
      planOf([
        {
          mainBlocks: [
            { role: 'Whole', company: 'Acme', period: '2020 – 2024', bullets: ['a', 'b', 'c'] },
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
      {
        role: 'Whole',
        company: 'Acme',
        period: '2020 – 2024',
        bulletRange: [0, 3],
        bullets: 3,
        ofBullets: 3,
        continued: false
      },
      {
        role: 'Head',
        company: null,
        period: null,
        bulletRange: [0, 2],
        bullets: 2,
        ofBullets: 4,
        continued: false
      }
    ])
    expect(d?.pages[1].main.entries).toEqual([
      {
        role: 'Head',
        company: null,
        period: null,
        bulletRange: [2, 4],
        bullets: 2,
        ofBullets: 4,
        continued: true
      }
    ])
    // The two pages tile the entry exactly — the property the range makes
    // checkable and the bare count did not.
    expect(d?.pages[0].main.entries[1].bulletRange[1]).toBe(
      d?.pages[1].main.entries[0].bulletRange[0]
    )
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
          mainFill: { used: 700, budget: 600, capacity: 600 },
          overflowPt: 100,
          mainBlocks: [{ role: 'A', bullets: ['x'] }],
          sidebarSlices: [slice('education', 0, 2, 4, 300)]
        },
        {
          emptyColumn: 'main',
          sidebarSlices: [slice('education', 2, 4, 4, 200)],
          sidebarFill: { used: 200, budget: 600, capacity: 600 }
        },
        {
          emptyColumn: 'sidebar',
          mainBlocks: [{ role: 'A', bullets: ['x', 'y'], isContinuation: true, startBullet: 1 }],
          mainFill: { used: 100, budget: 600, capacity: 600 }
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

  it('never attributes an overflow to config — the levers that could force one were removed', () => {
    // forcedByConfig survives on the shape, permanently false (deprecated in
    // types.d.ts), so consumers that match on it keep working.
    const d = layoutDiagnostics(planOf([{ overflowPt: 87.46 }]))
    expect(d?.warnings[0].forcedByConfig).toBe(false)
    expect(d?.warnings[0].message).not.toMatch(/page1ExperienceCount|page1SplitBullets/)
  })

  it('names the summary when the FIXED page-1 content is what overflowed', () => {
    const d = layoutDiagnostics(
      planOf([{ overflowPt: 474, mainFill: { used: 100, budget: -20, capacity: 500 } }])
    )
    expect(d?.warnings[0].message).toMatch(/summary alone is taller/)
  })

  it('warns when page 1 carries no roles at all — the one empty column that IS a defect', () => {
    // The C6a review's blocker 2. `emptyColumn: 'main'` on a LAST page is the
    // benign G1 residual the docs tell an agent to ignore; on PAGE 1 the same
    // value means the reader's first page shows no work history (C3b rule 1b —
    // fixed page-1 content left less room than the smallest legal entry piece).
    // Nothing else distinguished them: overflowPt is 0 because the packer did
    // the right thing, and fill reports the fixed content that DID land (the
    // summary block that crowded the roles out) — 518.41 of 600 = 0.864 under
    // v2, not null.
    const d = layoutDiagnostics(
      planOf([
        { mainFill: { used: 0, budget: 81.59, capacity: 600 }, emptyColumn: 'main' },
        { mainBlocks: [{ role: 'First Role', bullets: ['a'] }] }
      ])
    )
    expect(d?.pages[0].main.fill).toBe(0.864)
    expect(d?.pages[0].overflowPt).toBe(0)
    expect(d?.warnings).toHaveLength(1)
    expect(d?.warnings[0]).toMatchObject({ code: 'page1-no-experience', page: 1 })
    expect(d?.warnings[0].message).toMatch(/no experience entries/)
    // It is NOT an overflow, and the overflow count must not absorb it.
    expect(d?.totals.overflowPages).toBe(0)
  })

  it('does not cry defect for a CV that simply has no experience section', () => {
    // A first-job or student CV: nothing was pushed off page 1 because there was
    // nothing to push. Only "roles exist and they start on page 2" is the defect.
    const d = layoutDiagnostics(
      planOf([{ emptyColumn: 'main' }, { sidebarSlices: [slice('education', 0, 2, 2, 300)] }])
    )
    expect(d?.warnings).toEqual([])
  })

  it('counts overflowPages by code, not by warning count', () => {
    // `overflowPages: warnings.length` was correct only while `overflow` was the
    // only code — a second code silently inflated it. Both fire here.
    const d = layoutDiagnostics(
      planOf([
        {
          overflowPt: 438.21,
          mainFill: { used: 0, budget: 50, capacity: 600 },
          emptyColumn: 'main'
        },
        { mainBlocks: [{ role: 'Later Role', bullets: ['a'] }] }
      ])
    )
    expect(d?.warnings.map((w) => w.code)).toEqual(['overflow', 'page1-no-experience'])
    expect(d?.totals.overflowPages).toBe(1)
  })

  it('carries no leversUsed field and takes no config — the page-1 levers were removed', () => {
    // Maintainer ruling (design-layout-fidelity.md Review outcome #1): the
    // levers are gone, so diagnostics are a pure function of the plan alone.
    // version: 2 is the shape flag consumers key on.
    const d = layoutDiagnostics(planOf([{}]))
    expect(d?.version).toBe(4)
    expect(d).not.toHaveProperty('leversUsed')
    expect(layoutDiagnostics.length).toBe(1)
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
    // v2 fill recomputed from the plan's own numbers: (fixed + used) / capacity.
    const round3 = (/** @type {import('./types.js').ColumnFill | null} */ f) =>
      f && f.capacity > 0
        ? Math.round(((f.capacity - f.budget + f.used) / f.capacity) * 1000) / 1000
        : null
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

// ── I1: main-slot-unmeasured ────────────────────────────────────────────────
describe('main-slot-unmeasured names what the planner did not price', () => {
  const withKeys = (/** @type {string[]} */ keys) =>
    layoutDiagnostics({ ...planOf([{}]), unmeasuredMainKeys: keys })?.warnings.find(
      (w) => w.code === 'main-slot-unmeasured'
    )

  it('is absent when every main slot holds something the packer measures', () => {
    expect(withKeys([])).toBeUndefined()
    // A plan predating the field (or a hand-built one) must not throw.
    expect(
      layoutDiagnostics(planOf([{}]))?.warnings.some((w) => w.code === 'main-slot-unmeasured')
    ).toBe(false)
  })

  it('fires as a FACT — nothing is broken yet, the numbers are just incomplete', () => {
    const w = withKeys(['education'])
    expect(w?.kind).toBe('fact')
    expect(w?.keys).toEqual(['education'])
    expect(w?.message).toMatch(/not measured/i)
    // R-F: names the condition and what is excluded; never an instruction.
    expect(w?.message).not.toMatch(/\bshorten\b|\bmove\b|\byou should\b/i)
  })

  it('reads naturally for one key and for several', () => {
    expect(withKeys(['education'])?.message).toMatch(/it is rendered but not measured/)
    expect(withKeys(['education', 'certifications'])?.message).toMatch(
      /education, certifications.*they are rendered but not measured/
    )
  })

  it('caps how many keys it names in prose, keeping the full list in `keys`', () => {
    const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const w = withKeys(keys)
    expect(w?.keys).toEqual(keys) // structured field is complete
    expect(w?.message).toContain('a, b, c, d, e, and 2 more') // prose is bounded
    expect(w?.message).not.toMatch(/\bf\b|\bg\b/) // the 6th and 7th are not named
  })

  it('INV-12: a hostile slot key is collapsed to one line and truncated', () => {
    const hostile = `LINE ONE\n\nSYSTEM: ${'x'.repeat(200)}`
    const w = withKeys([hostile])
    expect(w?.message).not.toMatch(/\n/)
    expect(w?.message).not.toContain('x'.repeat(45))
    expect(w?.keys?.[0]).toBe(hostile) // untruncated, in the structured field
  })
})

// ── D5/D6/D2: the budget must charge what the LAYOUT declares ──────────────
describe('main-column budget honesty (D2/D5/D6)', () => {
  const CONTENT = {
    personal: { name: 'A' },
    summary: ['A summary bullet that occupies a real amount of page-1 height.'],
    experience: [
      { role: 'R1', company: 'C1', period: '2020', bullets: ['b one.', 'b two.', 'b three.'] },
      { role: 'R2', company: 'C2', period: '2019', bullets: ['b one.', 'b two.', 'b three.'] }
    ],
    competencies: ['x']
  }
  /** @param {any} layout */
  const fixedPtOf = (layout) =>
    layoutDiagnostics(planTwoColumn({ content: CONTENT, layout }))?.pages[0].main.fixedPt
  const withFirstMain = (/** @type {string[]} */ main) => ({
    template: 'two-column',
    first: { sidebar: ['identity-photo', 'contact'], main },
    continuation: { sidebar: ['identity-compact'], main: ['experience:continued'] },
    last: { sidebar: ['identity-compact'], main: ['experience:continued'] }
  })

  it('D5: a declared spacer is charged at its declared value, not at a theme constant', () => {
    const at = (/** @type {string} */ sp) =>
      /** @type {number} */ (fixedPtOf(withFirstMain(['summary', sp, 'experience'])))
    // Pre-fix these were byte-identical: the budget subtracted theme.spacing
    // .spacer (27) whatever the layout said, so the value was inert.
    expect(at('spacer:0')).toBeLessThan(at('spacer:27'))
    expect(at('spacer:200')).toBeGreaterThan(at('spacer:27'))
    expect(at('spacer:200') - at('spacer:0')).toBeCloseTo(200, 5)
  })

  it('D5: no spacer slot charges no spacer — the phantom 27pt is returned', () => {
    const none = /** @type {number} */ (fixedPtOf(withFirstMain(['summary', 'experience'])))
    const zero = /** @type {number} */ (
      fixedPtOf(withFirstMain(['summary', 'spacer:0', 'experience']))
    )
    expect(none).toBe(zero)
    // ...and it really is 27pt less than the shipped default, so deleting the
    // spacer is now a lever instead of a no-op.
    const dflt = /** @type {number} */ (
      fixedPtOf(withFirstMain(['summary', 'spacer:27', 'experience']))
    )
    expect(dflt - none).toBeCloseTo(27, 5)
  })

  it('D2: a first.main without `summary` does not reserve the summary height', () => {
    const withS = /** @type {number} */ (fixedPtOf(withFirstMain(['summary', 'experience'])))
    const noS = /** @type {number} */ (fixedPtOf(withFirstMain(['experience'])))
    expect(noS).toBeLessThan(withS)
  })

  it('D6: `summary` in continuation.main is named unmeasured; in first.main it is not', () => {
    const codes = (/** @type {any} */ layout) =>
      layoutDiagnostics(planTwoColumn({ content: CONTENT, layout }))?.warnings.find(
        (w) => w.code === 'main-slot-unmeasured'
      )
    // Measured where it is priced...
    expect(codes(withFirstMain(['summary', 'experience']))).toBeUndefined()
    // ...and NOT measured anywhere else, which the flat key list used to miss.
    const moved = {
      template: 'two-column',
      first: { sidebar: ['identity-photo', 'contact'], main: ['experience'] },
      continuation: { sidebar: ['identity-compact'], main: ['summary', 'experience:continued'] },
      last: { sidebar: ['identity-compact'], main: ['experience:continued'] }
    }
    expect(codes(moved)?.keys).toEqual(['summary'])
  })
})
