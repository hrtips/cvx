// C0 — packer-decision invariants (research/sprint-layout-engine.md C0 /
// research/layout-packing-design.md §11): every block placed exactly once,
// order preserved, Invariant 0 (nothing dropped/clipped/duplicated), and no
// orphaned heading, asserted as pure functions over the LayoutPlan shape
// `{ pages: [{ index, main, sidebar }], totalPages }`.
//
// Two tiers:
//   1. Self-test the ruler itself on synthetic plans (both the "should pass"
//      and "should catch this violation" directions) — this is the part
//      that stays meaningful forever, independent of the engine.
//   2. Apply it to what the CURRENT engine actually exposes: packExperiences()
//      really does pack the main column, so those assertions run for real,
//      today, as HARD invariants — every fixture must satisfy them, full
//      stop (see layoutRenderOracle.test.js, where this runs across the
//      whole curated fixture set, not just the scaffold). As of C3a the
//      SIDEBAR is packed for real too (layout.js's packSidebar() +
//      planTwoColumn()), so three of C0's four deferred sidebar assertions
//      are now real assertions against a real per-page plan. The fourth
//      (heading orphaned by an item-level split) stays `.todo`: with
//      whole-section granularity a title and its items are one atomic block,
//      so that state is unreachable — see its reason.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import {
  deriveSidebarMetrics,
  identityH,
  packExperiences,
  sidebarSectionH
} from '../src/pdf/layout.js'
import { tealTheme } from '../src/pdf/themes/teal.js'
import {
  expBlockId,
  experienceBlockIds,
  mainPlanFromPackResult,
  summaryBlockIds
} from './layout-harness/blocks.js'
import { buildContent } from './layout-harness/contentSpecs.js'
import { buildFixturePlan } from './layout-harness/fixtures.js'
import {
  contentFormsPrefix,
  flowIds,
  frontLoadHolds,
  frontLoadMaximal,
  invariant0,
  noEmptyColumn,
  noOrphanHeading,
  noPageOverBudget,
  orderPreserved,
  placedExactlyOnce
} from './layout-harness/invariants.js'
import {
  expectedIdentityH,
  expectedRefereesH,
  expectedSectionH,
  expectedSidebarBudget,
  multiLineRows,
  SECTION_DIVIDER_H,
  singleLineRowsFor
} from './layout-harness/sidebarBudget.js'
import { presentSidebarKeys, realSidebarPlan } from './layout-harness/sidebarPlan.js'
import { harnessMeasurer } from './layout-harness/structuralFacts.js'

/** layout.js quantizes every height/budget to hundredths before comparing; the oracle's raw arithmetic must be put on the same footing. */
const quantized = (/** @type {number} */ n) => Math.round(n * 100) / 100

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const TEMPLATE = path.join(ROOT, 'template', 'cv-content')

function readYaml(dir, file) {
  return load(readFileSync(path.join(dir, file), 'utf8'))
}

// ── Tier 1: the ruler itself, on synthetic plans ────────────────────────────

describe('invariants.js — self-test on synthetic plans', () => {
  it('placedExactlyOnce passes on a duplicate-free list and catches a duplicate', () => {
    expect(placedExactlyOnce(['a', 'b', 'c']).ok).toBe(true)
    const bad = placedExactlyOnce(['a', 'b', 'a'])
    expect(bad.ok).toBe(false)
    expect(bad.duplicates).toEqual([{ id: 'a', count: 2 }])
  })

  it('orderPreserved passes when relative order matches and fails on a swap', () => {
    expect(orderPreserved(['a', 'b', 'c'], ['a', 'b', 'c']).ok).toBe(true)
    // Extra ids not in expectedOrder are ignored (e.g. a page's sidebar ids
    // interleaved with main ids in some other representation).
    expect(orderPreserved(['x', 'a', 'y', 'b', 'c'], ['a', 'b', 'c']).ok).toBe(true)
    expect(orderPreserved(['b', 'a', 'c'], ['a', 'b', 'c']).ok).toBe(false)
  })

  it('invariant0 passes when the rendered set equals the expected set, and reports both directions of mismatch', () => {
    expect(invariant0(['a', 'b'], ['a', 'b']).ok).toBe(true)
    expect(invariant0(['a'], ['a', 'b'])).toEqual({ ok: false, missing: ['b'], unexpected: [] })
    expect(invariant0(['a', 'z'], ['a'])).toEqual({ ok: false, missing: [], unexpected: ['z'] })
  })

  it('noOrphanHeading flags a heading with nothing after it on its page, and a heading immediately followed by another heading', () => {
    const isHeading = (id) => id.startsWith('title:')
    const orphanAtPageEnd = { pages: [{ index: 0, main: ['title:x'] }] }
    expect(noOrphanHeading(orphanAtPageEnd, 'main', isHeading).ok).toBe(false)
    const headingThenHeading = { pages: [{ index: 0, main: ['title:x', 'title:y', 'body:y1'] }] }
    expect(noOrphanHeading(headingThenHeading, 'main', isHeading).ok).toBe(false)
    const fine = { pages: [{ index: 0, main: ['title:x', 'body:x1'] }] }
    expect(noOrphanHeading(fine, 'main', isHeading).ok).toBe(true)
  })

  // frontLoadHolds/noPageOverBudget are kept as pure, unit-tested utilities
  // (reusable by a later chunk) even though C0 no longer wires them into
  // the fixture pipeline: they depend on a per-page "fill ratio" number,
  // and the char-width estimator that used to produce one for this harness
  // has been retired in favour of the real exported layout.js functions
  // (see estimator.js) without carrying that specific application forward
  // — front-load/budget assertions on today's (loose, ~20-33%-over)
  // estimate are out of scope for this pass (explicitly deferred, not
  // silently dropped — see research/c0-baseline.md).
  it('frontLoadHolds passes non-increasing fills and fails when a later page is fuller, outside tolerance', () => {
    expect(frontLoadHolds([1, 0.8, 0.5]).ok).toBe(true)
    expect(frontLoadHolds([0.5, 0.52], 0.05).ok).toBe(true) // within tolerance
    expect(frontLoadHolds([0.3, 0.9]).ok).toBe(false)
  })

  it('noPageOverBudget flags a fill ratio past 1 + tolerance', () => {
    expect(noPageOverBudget([0.9, 1.0]).ok).toBe(true)
    expect(noPageOverBudget([0.9, 1.5]).ok).toBe(false)
  })

  it("frontLoadMaximal passes when the next page's first block genuinely did not fit and fails when it would have", () => {
    // page 0 used 90 of 100; page 1 starts with a 50pt block -> could not fit.
    const tight = [
      { used: 90, budget: 100, blockCount: 2, firstBlockHeight: 20, gapBefore: 0 },
      { used: 50, budget: 100, blockCount: 1, firstBlockHeight: 50, gapBefore: 0 }
    ]
    expect(frontLoadMaximal(tight).ok).toBe(true)
    // page 0 used 20 of 100; page 1's 50pt first block would have fit -> lazy.
    const lazy = [
      { used: 20, budget: 100, blockCount: 1, firstBlockHeight: 20, gapBefore: 0 },
      { used: 50, budget: 100, blockCount: 1, firstBlockHeight: 50, gapBefore: 0 }
    ]
    expect(frontLoadMaximal(lazy).ok).toBe(false)
    expect(frontLoadMaximal(lazy).violations).toEqual([
      { page: 0, kind: 'lazy', used: 20, budget: 100, wouldUse: 70 }
    ])
    // the separator counts against the fit, exactly as the packer charges it
    expect(
      frontLoadMaximal([
        { used: 60, budget: 100, blockCount: 1, firstBlockHeight: 10, gapBefore: 0 },
        { used: 35, budget: 100, blockCount: 1, firstBlockHeight: 35, gapBefore: 10 }
      ]).ok
    ).toBe(true)
    // a page with no blocks at all (an empty residual page) is never a violation
    expect(
      frontLoadMaximal([
        { used: 10, budget: 100, blockCount: 1, firstBlockHeight: 10, gapBefore: 0 },
        { used: 0, budget: 100, blockCount: 0, firstBlockHeight: null, gapBefore: 0 }
      ]).ok
    ).toBe(true)
  })

  it('frontLoadMaximal flags a MULTI-block page over budget (the direction that catches a wrong budget), but not the forced single-block overflow Invariant 0 requires', () => {
    // 140 used against a 100 budget with two blocks on the page: the packer had
    // a choice and took too much — a real over-budget page.
    const overfull = [{ used: 140, budget: 100, blockCount: 2, firstBlockHeight: 70, gapBefore: 0 }]
    expect(frontLoadMaximal(overfull).violations).toEqual([
      { page: 0, kind: 'overfull', used: 140, budget: 100 }
    ])
    // One block taller than any page: placed anyway rather than dropped. Legal.
    expect(
      frontLoadMaximal([
        { used: 500, budget: 100, blockCount: 1, firstBlockHeight: 500, gapBefore: 0 }
      ]).ok
    ).toBe(true)
  })

  it('contentFormsPrefix accepts content that runs out at the tail and flags an interior hole', () => {
    const tail = {
      pages: [
        { index: 0, main: ['a'], sidebar: ['x'] },
        { index: 1, main: ['b'], sidebar: [] },
        { index: 2, main: [], sidebar: [] }
      ]
    }
    expect(contentFormsPrefix(tail, 'main').ok).toBe(true)
    expect(contentFormsPrefix(tail, 'sidebar').ok).toBe(true)
    // page 1 blank while page 2 has content — a mis-zipped coordinator
    const hole = {
      pages: [
        { index: 0, main: ['a'], sidebar: ['x'] },
        { index: 1, main: ['b'], sidebar: [] },
        { index: 2, main: ['c'], sidebar: ['y'] }
      ]
    }
    expect(contentFormsPrefix(hole, 'sidebar').ok).toBe(false)
    expect(contentFormsPrefix(hole, 'sidebar').holes).toEqual([1])
  })

  it('noEmptyColumn flags exactly one side empty while the other has content, and exempts declared residual pages', () => {
    const bad = { pages: [{ index: 0, main: [], sidebar: ['x'] }] }
    expect(noEmptyColumn(bad).ok).toBe(false)
    expect(noEmptyColumn(bad, { allowedResidualPages: new Set([0]) }).ok).toBe(true)
    const bothEmpty = { pages: [{ index: 0, main: [], sidebar: [] }] } // not "one empty column" — a genuinely blank page, different bug
    expect(noEmptyColumn(bothEmpty).ok).toBe(true)
    const fine = { pages: [{ index: 0, main: ['a'], sidebar: ['b'] }] }
    expect(noEmptyColumn(fine).ok).toBe(true)
  })
})

// ── Tier 2: applied to the CURRENT engine's real main-column plan ──────────
// These are HARD invariants — every fixture must satisfy them (see
// structuralFacts.js's HARD_INVARIANT_KEYS and layoutRenderOracle.test.js,
// which runs the same four checks across the full curated fixture set).

// Every pack in this tier uses the REAL measurer (harnessMeasurer()) and the
// real theme, so the plan asserted here is the plan `cvx build` paginates —
// structuralFacts.js was fixed this way in C3a and this tier now matches it.
// (Pre-C3a these calls passed `undefined` for both, i.e. the loose char-width
// estimate, so the main column's invariants were asserted on a pagination
// nothing ever renders.)
describe('main-column plan (packExperiences really packs this — testable today)', () => {
  function planFor(dir) {
    const summary = readYaml(dir, 'summary.yaml')
    const experience = readYaml(dir, 'experience.yaml')
    const config = readYaml(dir, 'config.yaml')
    const packed = packExperiences(experience, summary, config, tealTheme, harnessMeasurer())
    return { packed, summary, experience }
  }

  it('every bullet + entry head is placed exactly once, in order, on the shipped scaffold (Invariant 0)', () => {
    const { packed, summary, experience } = planFor(TEMPLATE)
    const plan = mainPlanFromPackResult(packed, summary)
    const actual = flowIds(plan, 'main')
    const expected = [...summaryBlockIds(summary), ...experienceBlockIds(experience)]

    expect(invariant0(actual, expected).ok).toBe(true)
    expect(placedExactlyOnce(actual).ok).toBe(true)
    expect(orderPreserved(actual, expected).ok).toBe(true)
    expect(noOrphanHeading(plan, 'main', (id) => id.endsWith('::head')).ok).toBe(true)
  })

  it('holds on a maxed-out synthetic CV too (~60-item single oversized section, overflowing text, multi-page)', () => {
    const { fixtures } = buildFixturePlan()
    const spec = fixtures.find((f) => f.id === 'risk-maxed-out')
    const content = buildContent(spec)
    const packed = packExperiences(
      content.experience,
      content.summary,
      content.config,
      tealTheme,
      harnessMeasurer()
    )
    const plan = mainPlanFromPackResult(packed, content.summary)
    const actual = flowIds(plan, 'main')
    const expected = [
      ...summaryBlockIds(content.summary),
      ...experienceBlockIds(content.experience)
    ]

    expect(invariant0(actual, expected).ok).toBe(true)
    expect(placedExactlyOnce(actual).ok).toBe(true)
    expect(orderPreserved(actual, expected).ok).toBe(true)
  })

  it('does not collide when two entries share the same role+company (e.g. two separate stints) — regression for the expBlockId hardening', () => {
    const summary = ['A summary bullet.']
    const experience = [
      {
        role: 'Engineer',
        company: 'Acme',
        bullets: ['First stint bullet one.', 'First stint bullet two.']
      },
      { role: 'Engineer', company: 'Acme', bullets: ['Second stint bullet one.'] }
    ]
    const packed = packExperiences(experience, summary, {}, tealTheme, harnessMeasurer())
    const plan = mainPlanFromPackResult(packed, summary)
    const actual = flowIds(plan, 'main')
    const expected = [...summaryBlockIds(summary), ...experienceBlockIds(experience)]

    // Before the fix, expBlockId(e) => `exp:${role}::${company}` alone would
    // make both entries' "head" ids collide, so a genuinely-dropped/duplicated
    // fragment for either entry could hide behind the other's id.
    expect(expBlockId(0, experience[0])).not.toBe(expBlockId(1, experience[1]))
    expect(invariant0(actual, expected).ok).toBe(true)
    expect(placedExactlyOnce(actual).ok).toBe(true)
    expect(orderPreserved(actual, expected).ok).toBe(true)
  })
})

// ── Tier 2b: sidebar — the engine packs this for real as of C3a ─────────────
// packSidebar() measures every section and planTwoColumn() distributes the
// flow across P = max(P_main, P_sidebar) pages, so these assertions run
// against a real per-page plan (see test/layout-harness/sidebarPlan.js).
// Granularity: a section is ATOMIC in this slice — item-level splitting of an
// over-tall section is the next slice, and exactly one assertion below still
// waits on it (see its `.todo` reason).

describe('sidebar plan (packSidebar + planTwoColumn — really packed as of C3a)', () => {
  /** The shipped scaffold, as a content bag (minus the photo — see below). */
  function scaffoldContent(extra = {}) {
    return {
      personal: readYaml(TEMPLATE, 'personal.yaml'),
      summary: readYaml(TEMPLATE, 'summary.yaml'),
      experience: readYaml(TEMPLATE, 'experience.yaml'),
      config: readYaml(TEMPLATE, 'config.yaml'),
      achievements: readYaml(TEMPLATE, 'achievements.yaml'),
      education: readYaml(TEMPLATE, 'education.yaml'),
      certifications: readYaml(TEMPLATE, 'certifications.yaml'),
      competencies: readYaml(TEMPLATE, 'competencies.yaml'),
      languages: readYaml(TEMPLATE, 'languages.yaml'),
      publications: readYaml(TEMPLATE, 'publications.yaml'),
      referees: readYaml(TEMPLATE, 'referees.yaml'),
      ...extra
    }
  }

  it('every present section key is placed on exactly one page, on the shipped scaffold', () => {
    const content = scaffoldContent()
    const { plan } = realSidebarPlan(content)
    const placed = plan.pages.flatMap((p) => p.sidebarKeys)

    expect(invariant0(placed, presentSidebarKeys(content)).ok).toBe(true)
    expect(placedExactlyOnce(placed).ok).toBe(true)
  })

  // NAMED FOR WHAT IT CHECKS. Review's finding: the previous version of this
  // test expanded item ids from the section key on BOTH sides
  // (sectionBlockIds() in the expected AND the actual), so no item-level fact
  // was verified — it was a section-level check wearing an item-level name.
  // What IS real here, and what caught the pre-C3 engine rendering 100 of 329
  // sidebar items more than once, is section-level: every present section
  // appears on exactly one page, in flow order, none dropped, none invented.
  // The genuine item-level check (every item's text survives the render) lives
  // in contentOracle.js; the item-level *plan* check is `.todo` below.
  it('every present sidebar SECTION is placed exactly once, in flow order, none dropped or invented (section-level Invariant 0)', () => {
    for (const content of [
      scaffoldContent(),
      scaffoldContent({ profilePhoto: 'data:image/jpeg;base64,x' }),
      // A tall sidebar against a one-page main column — the shape that used to
      // overflow, and now genuinely needs more pages than the main flow.
      buildContent(
        buildFixturePlan().fixtures.find((f) => f.id === 'risk-tall-sidebar-short-main')
      ),
      buildContent(buildFixturePlan().fixtures.find((f) => f.id === 'edge-minimal'))
    ]) {
      const { plan } = realSidebarPlan(content)
      const actual = plan.pages.flatMap((p) => p.sidebarKeys)
      const expected = presentSidebarKeys(content)

      expect(invariant0(actual, expected)).toEqual({ ok: true, missing: [], unexpected: [] })
      expect(placedExactlyOnce(actual).ok).toBe(true)
      expect(orderPreserved(actual, expected).ok).toBe(true)
    }
  })

  // The item-level fact the no-poppler tier CAN falsify: a section's measured
  // height must grow by its per-item increment for every item it holds. This
  // catches an item silently skipped by the measurement (a stray `.slice`, a
  // `for` bound off by one) — the mis-measurement that a whole-section packer
  // turns straight into an overflow. Increments come from sidebarBudget.js,
  // derived from the theme's raw tokens with no call into layout.js.
  it('every sidebar item contributes its own measured height — none silently skipped', () => {
    const sm = deriveSidebarMetrics(tealTheme)
    const measure = harnessMeasurer()
    const rows = []
    for (const [key, build] of [
      [
        'education',
        (n) => ({
          education: Array.from({ length: n }, (_, i) => ({
            degree: `Degree ${i}`,
            institution: `Institution ${i}`,
            period: '1990 – 1994'
          }))
        })
      ],
      [
        'certifications',
        (n) => ({
          certifications: Array.from({ length: n }, (_, i) => ({
            name: `Cert ${i}`,
            issuer: `Issuer ${i}`,
            year: '2000'
          }))
        })
      ],
      [
        'publications',
        (n) => ({
          publications: Array.from({ length: n }, (_, i) => ({
            title: `Pub ${i}`,
            venue: `Venue ${i}`,
            year: '2000'
          }))
        })
      ],
      [
        'languages',
        (n) => ({
          languages: Array.from({ length: n }, (_, i) => ({
            language: `Lang ${i}`,
            proficiency: 'Native'
          }))
        })
      ]
    ]) {
      for (const n of [1, 2, 5]) {
        const content = { personal: { name: 'N' }, summary: [], experience: [], ...build(n) }
        rows.push({
          key,
          n,
          measured: sidebarSectionH(key, content, sm, measure),
          expected: quantized(expectedSectionH(key, n))
        })
      }
    }
    expect(rows.map((r) => `${r.key}x${r.n}=${r.measured}`)).toEqual(
      rows.map((r) => `${r.key}x${r.n}=${r.expected}`)
    )
  })

  it('the identity block injected on every page measures what the theme says it should — including the photo term', () => {
    const rows = []
    // Synthetic single-line personal on purpose: the oracle's arithmetic assumes
    // one line per identity row, and the shipped scaffold's own title wraps to
    // two (asserted below). The scaffold's identity height is verified instead by
    // render, at 0.00pt, in layoutSidebarMeasureDiff.test.js.
    const personal = {
      name: 'Jordan Rivera',
      title: 'Senior Programme Lead',
      company: 'Example Co'
    }
    for (const [kind, photo] of [
      ['identity-photo', false],
      ['identity-photo', true],
      ['identity-compact', false]
    ]) {
      const content = {
        personal,
        summary: [],
        experience: [],
        ...(photo ? { profilePhoto: 'x' } : {})
      }
      rows.push({
        kind,
        photo,
        measured: identityH([kind], content, deriveSidebarMetrics(tealTheme), harnessMeasurer()),
        expected: quantized(expectedIdentityH(kind, { photo }))
      })
    }
    expect(rows.map((r) => `${r.kind}/photo=${r.photo}=${r.measured}`)).toEqual(
      rows.map((r) => `${r.kind}/photo=${r.photo}=${r.expected}`)
    )
  })

  // The ~580pt eight-referee block is what drives C3a's two page-count
  // regressions, so its height gets an independent check here too (the render
  // one is poppler-gated). Its per-entry ruled separator is the dominant term.
  it("the multi-entry referees block — the section driving C3a's page-count regressions — measures its separators independently", () => {
    const shape = { title: true, email: true, phone: true }
    const referees = Array.from({ length: 8 }, (_, i) => ({
      name: `Referee ${i}`,
      title: `Title ${i}`,
      company: `Company ${i}`,
      email: `referee${i}@example.com`,
      phone: '+1 (555) 010-0200'
    }))
    const sm = deriveSidebarMetrics(tealTheme)
    const measure = harnessMeasurer()
    const base = { personal: { name: 'N' }, summary: [], experience: [] }
    expect(sidebarSectionH('referees', { ...base, referees }, sm, measure)).toBe(
      quantized(expectedRefereesH(8, shape))
    )
    // one entry, and the empty placeholder, from the same independent arithmetic
    expect(
      sidebarSectionH('referees', { ...base, referees: referees.slice(0, 1) }, sm, measure)
    ).toBe(quantized(expectedRefereesH(1, shape)))
    expect(sidebarSectionH('referees', { ...base, referees: [] }, sm, measure)).toBe(
      quantized(expectedRefereesH(0, shape))
    )
    // ...and it really is dominated by the separators, so this is not a
    // coincidence of two small numbers
    expect(expectedRefereesH(8, shape)).toBeGreaterThan(500)
  })

  it('the single-line assumption every expected number above rests on actually holds for the fixture corpus — and the guard is not vacuous (the shipped scaffold DOES wrap, which is why its numbers are render-verified instead)', () => {
    const measure = harnessMeasurer()
    const offenders = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const bad = multiLineRows(measure, singleLineRowsFor(content))
      if (bad.length > 0) offenders.push({ id: spec.id, bad })
    }
    expect(offenders).toEqual([])

    // The guard has teeth: real content wraps. The scaffold's long publication
    // title and degree names are exactly why sidebarBudget.js's arithmetic is
    // scoped to the synthetic corpus and the scaffold is checked by render.
    const scaffoldBad = multiLineRows(measure, singleLineRowsFor(scaffoldContent()))
    expect(scaffoldBad.length).toBeGreaterThan(0)
  })

  it('the inter-section divider the front-load check charges is the one buildSidebar renders', () => {
    expect(deriveSidebarMetrics(tealTheme).sectionDividerH).toBe(SECTION_DIVIDER_H)
  })

  // FALSIFIABILITY, the point of this whole tier. `budget` here is
  // sidebarBudget.js's expectedSidebarBudget() — theme arithmetic, no call into
  // layout.js — so a wrong budget formula in packSidebar fails HERE. Asserting
  // the packer's own budget equals it is the direct form of that check; the
  // front-load/over-budget assertions below then run against the independent
  // number, so they mean something too.
  it("packSidebar's page budgets match an independently derived bodyHeight - identity - padding - safety", () => {
    const rows = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { pageFills } = realSidebarPlan(content)
      pageFills.forEach((p, i) => {
        if (p.packerBudget === null) return // a residual page the sidebar never reached
        rows.push({
          id: spec.id,
          page: i,
          packer: p.packerBudget,
          independent: quantized(p.budget)
        })
      })
    }
    expect(rows.length).toBeGreaterThan(30)
    expect(rows.filter((r) => r.packer !== r.independent)).toEqual([])
  })

  it('the same holds with a profile photo on page 1, which is the term that makes page 1 much tighter', () => {
    const content = scaffoldContent({ profilePhoto: 'data:image/jpeg;base64,x' })
    const { pageFills } = realSidebarPlan(content)
    expect(pageFills[0].packerBudget).toBe(quantized(expectedSidebarBudget(0, { photo: true })))
    // ...and the photo really is the difference, so the assertion above is not
    // accidentally photo-blind.
    expect(expectedSidebarBudget(0, { photo: true })).toBeLessThan(
      expectedSidebarBudget(0, { photo: false }) - 200
    )
  })

  it("the sidebar column front-loads across pages: every page is maximal against the INDEPENDENT budget — the next page's first section provably did not fit, and no multi-section page exceeds it", () => {
    const failures = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { pageFills } = realSidebarPlan(content)
      const result = frontLoadMaximal(pageFills)
      if (!result.ok) failures.push({ id: spec.id, violations: result.violations })
    }
    expect(failures).toEqual([])
  })

  it("G1: each flow runs out only at the tail (no interior page has an empty column), and the residual is exactly the two flows' page-count difference", () => {
    const holes = []
    const wrongTotal = []
    const wrongResidual = []
    const beyondResidual = []

    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { plan, layoutPlan } = realSidebarPlan(content)

      // (a) An interior blank column would mean the coordinator mis-zipped the
      // two independently-packed flows. This is the falsifiable half of G1.
      for (const flow of ['main', 'sidebar']) {
        const r = contentFormsPrefix(layoutPlan, flow)
        if (!r.ok) holes.push({ id: spec.id, flow, holes: r.holes })
      }

      // (b) P is exactly max — never padded with pages nothing lands on.
      const expectedTotal = Math.max(1, plan.mainPageCount, plan.sidebarPageCount)
      if (plan.totalPages !== expectedTotal) {
        wrongTotal.push({ id: spec.id, got: plan.totalPages, want: expectedTotal })
      }

      // (c) ...so the number of pages with an empty column is exactly the
      // difference between the two flows' page counts. Bigger means wasted
      // sheets; smaller means a flow's content went somewhere it should not.
      const empties = layoutPlan.pages.filter(
        (p) => ((p.main ?? []).length === 0) !== ((p.sidebar ?? []).length === 0)
      ).length
      const wantEmpties = Math.abs(plan.mainPageCount - plan.sidebarPageCount)
      if (empties !== wantEmpties) {
        wrongResidual.push({ id: spec.id, got: empties, want: wantEmpties })
      }

      // (d) and no empty column before the shorter flow ended
      const residual = new Set(
        layoutPlan.pages
          .filter((p) => p.index >= Math.min(plan.mainPageCount, plan.sidebarPageCount))
          .map((p) => p.index)
      )
      const v = noEmptyColumn(layoutPlan, { allowedResidualPages: residual }).violations
      if (v.length > 0) beyondResidual.push({ id: spec.id, violations: v })
    }

    expect(holes).toEqual([])
    expect(wrongTotal).toEqual([])
    expect(wrongResidual).toEqual([])
    expect(beyondResidual).toEqual([])
  })

  // The one assertion still blocked, and honestly so: with whole-section
  // granularity a section title and its items are ONE atomic block, so "the
  // heading got separated from its items by a split" is not a state the packer
  // can reach — there is nothing to assert yet. It becomes reachable (and this
  // must be implemented) in the item-splitting slice, where a section may be
  // cut between items and its title repeated with a "cont." marker.
  //
  // `.todo` (not `.skip`) and NOT empty-bodied: the body calls expect.fail() so
  // that deleting `.todo` without writing the real assertion fails loudly
  // instead of passing vacuously (vitest never executes a `.todo` body).
  // Also back to `.todo` after review, honestly: an item-level PLACEMENT check
  // needs the plan to carry item ranges. While a section is atomic, the only
  // way to say "which page is item k on" is to expand it from the section key —
  // which is what the expected side does too, so the check would compare a
  // derivation against itself. The item-level guarantee is currently carried by
  // contentOracle.js (every item's text found in the rendered PDF, 0 violations
  // across 58 variant checks) and, for measurement, by the per-item-increment
  // test above.
  it.todo('every sidebar ITEM is placed exactly once across pages — pending the item-splitting slice (C3b: the plan carries section keys, not item ranges, so both sides of the comparison would expand from the same key; render-level item completeness is covered by contentOracle.js meanwhile)', () => {
    expect.fail(
      'implement once packSidebar emits item ranges (startItem/endItem) — do not un-todo without one'
    )
  })

  it.todo('no sidebar section heading is orphaned by an item-level split — pending the item-splitting slice (C3b: sections are atomic today, so a title can never be separated from its items; the failure mode does not exist to be exercised)', () => {
    expect.fail(
      'implement the real orphan-heading assertion when sections split at item boundaries — do not un-todo without one'
    )
  })
})
