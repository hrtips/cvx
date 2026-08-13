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
//      planTwoColumn()); as of C3b it is packed at ITEM granularity, so all
//      four of C0's deferred sidebar assertions — including the two that were
//      unreachable while a section was one atomic block (item-level placement,
//      and a heading orphaned by a split) — are now real assertions against a
//      real per-page plan carrying real item ranges.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { TWO_COLUMN_LAYOUT } from '../src/pdf/defaultLayouts.js'
import {
  deriveMetrics,
  deriveSidebarMetrics,
  entryH,
  identityH,
  isContinuedSlice,
  overflowWarnings,
  packExperiences,
  sidebarFlowKeys,
  sidebarItemCount,
  sidebarSectionH,
  sidebarSliceH
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
  continuedTitleRows,
  expectedIdentityH,
  expectedRefereesH,
  expectedSectionH,
  expectedSidebarBudget,
  multiLineRows,
  oracleApplies,
  SECTION_DIVIDER_H,
  singleLineRowsFor
} from './layout-harness/sidebarBudget.js'
import {
  isSidebarHeadId,
  sidebarItemIds,
  sidebarPlanItemIds
} from './layout-harness/sidebarItems.js'
import { presentSidebarKeys, realSidebarPlan } from './layout-harness/sidebarPlan.js'
import { harnessMeasurer } from './layout-harness/structuralFacts.js'

/** layout.js quantizes every height/budget to hundredths before comparing; the oracle's raw arithmetic must be put on the same footing. */
const quantized = (/** @type {number} */ n) => Math.round(n * 100) / 100

/**
 * Fixtures whose content deliberately breaks sidebarBudget.js's single-line
 * assumption, so its token arithmetic cannot describe them. Named, not
 * detected-and-forgotten: they are the shapes C3b added to reach the page-1
 * cliff and G7's residual, and every check that skips them says how many it
 * skipped. Their heights are still verified — by render, in
 * layoutSidebarMeasureDiff.test.js, and by the render oracle's page counts.
 */
const NOT_TOKEN_DERIVABLE_FIXTURES = new Set(['edge-tall-identity', 'edge-page-tall-item'])

/** Every curated fixture, paired with its content bag and whether the token oracle applies. */
function fixtureContents() {
  const measure = harnessMeasurer()
  return buildFixturePlan().fixtures.map((spec) => {
    const content = buildContent(spec)
    return { spec, content, tokenDerivable: oracleApplies(measure, content) }
  })
}

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
    const packed = packExperiences(experience, summary, tealTheme, harnessMeasurer())
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
    const packed = packExperiences(experience, summary, tealTheme, harnessMeasurer())
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
// Granularity as of C3b: a section is a LIST, not an atom — packSidebar may cut
// it at an item boundary and emit `{ key, start, end, continued, itemCount }`
// per page, so item-level placement and split-induced heading orphans are both
// assertable here (they were the two `it.todo`s C0 left for this slice).

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

  /**
   * The sequence of section keys a plan places, collapsing a split section's
   * consecutive slices into ONE occurrence. C3b makes a repeated key legal —
   * but only as an immediately-following continuation, never as a section
   * revisited later (which is exactly the pre-C3 duplication bug).
   */
  function sectionRuns(plan) {
    const runs = []
    for (const page of plan.pages) {
      for (const slice of page.sidebarSlices) {
        if (runs[runs.length - 1] !== slice.key) runs.push(slice.key)
      }
    }
    return runs
  }

  it('every present section key is placed on exactly one contiguous run of pages, on the shipped scaffold', () => {
    const content = scaffoldContent()
    const { plan } = realSidebarPlan(content)
    const runs = sectionRuns(plan)

    expect(invariant0(runs, presentSidebarKeys(content)).ok).toBe(true)
    // Collapsing consecutive slices leaves each key exactly once: a section
    // that reappeared on a LATER page (the pre-C3 "repeat the whole section on
    // every continuation page" bug) survives the collapse and fails here.
    expect(placedExactlyOnce(runs).ok).toBe(true)
  })

  // What this checks, precisely: every present section appears, in flow order,
  // none dropped and none invented, and no section is visited twice. C3b allows
  // a section to span consecutive pages as slices (that is the whole point), so
  // `sectionRuns` collapses THOSE and only those. The item-level counterpart —
  // every ITEM placed exactly once, which needs the plan's item ranges — is
  // asserted further down, and the render-level one (every item's text survives
  // into the PDF) lives in contentOracle.js.
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
      const actual = sectionRuns(plan)
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

  it('the single-line assumption every expected number above rests on holds for the corpus, except the named fixtures that deliberately break it', () => {
    const measure = harnessMeasurer()
    const offenders = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const bad = multiLineRows(measure, singleLineRowsFor(content))
      if (bad.length > 0) offenders.push(spec.id)
    }
    // Exactly the fixtures C3b added to reach the cliff and G7's residual —
    // named, so a NEW fixture that quietly invalidates the token arithmetic
    // fails here instead of silently shrinking what the oracle covers.
    expect(new Set(offenders)).toEqual(NOT_TOKEN_DERIVABLE_FIXTURES)

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
    let skipped = 0
    for (const { spec, content, tokenDerivable } of fixtureContents()) {
      // A fixture with a multi-line personal.title/company has an identity
      // block this oracle's single-line NAME_BLOCK_H cannot describe; its
      // budget is verified by render instead (0.00pt, layoutSidebarMeasureDiff).
      if (!tokenDerivable) {
        skipped++
        continue
      }
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
    expect(skipped).toBe(NOT_TOKEN_DERIVABLE_FIXTURES.size)
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
    let checked = 0
    for (const { spec, content, tokenDerivable } of fixtureContents()) {
      // The maximality question is asked with `minUnit`, which is token-derived
      // — so a fixture the token oracle cannot describe is skipped LOUDLY here
      // rather than checked against numbers that do not apply to it.
      if (!tokenDerivable) continue
      checked++
      const { pageFills } = realSidebarPlan(content)
      const result = frontLoadMaximal(pageFills)
      if (!result.ok) failures.push({ id: spec.id, violations: result.violations })
    }
    expect(failures).toEqual([])
    expect(checked).toBe(buildFixturePlan().fixtures.length - NOT_TOKEN_DERIVABLE_FIXTURES.size)
  })

  it("G1: each flow runs out only at the tail (no interior page has an empty column), and the residual is exactly the two flows' page-count difference", () => {
    const holes = []
    const wrongTotal = []
    const wrongResidual = []
    const beyondResidual = []

    let endedEarly = 0
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { plan, layoutPlan } = realSidebarPlan(content)

      // C3b rule 1b: a page the packer produced but deliberately left empty,
      // because nothing of the next block fitted it. Structurally identifiable
      // — the flow is empty yet the packer recorded a fill for that page, which
      // it only does for pages it actually produced. (A page the flow never
      // reached at all has a null fill: that is the G1 residual, case (c).)
      const endedEarlyIn = (/** @type {'main'|'sidebar'} */ flow) =>
        new Set(
          plan.pages
            .filter(
              (p) =>
                (flow === 'main' ? p.mainBlocks.length : p.sidebarSlices.length) === 0 &&
                (flow === 'main' ? p.mainFill : p.sidebarFill) !== null
            )
            .map((p) => p.index)
        )

      // (a) An interior blank column would mean the coordinator mis-zipped the
      // two independently-packed flows. This is the falsifiable half of G1.
      // Rule-1b pages are exempted HERE and justified separately (the
      // "entry-free ONLY when..." test below proves each was necessary).
      for (const flow of /** @type {const} */ (['main', 'sidebar'])) {
        const allowedEmptyPages = endedEarlyIn(flow)
        endedEarly += allowedEmptyPages.size
        const r = contentFormsPrefix(layoutPlan, flow, { allowedEmptyPages })
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
      // ...plus the pages rule 1b deliberately ended early, which are a second,
      // separately-justified source of a blank column.
      const earlyMain = endedEarlyIn('main')
      const earlySidebar = endedEarlyIn('sidebar')
      const wantEmpties =
        Math.abs(plan.mainPageCount - plan.sidebarPageCount) + earlyMain.size + earlySidebar.size
      if (empties !== wantEmpties) {
        wrongResidual.push({ id: spec.id, got: empties, want: wantEmpties })
      }

      // (d) and no empty column before the shorter flow ended, other than those
      const residual = new Set([
        ...layoutPlan.pages
          .filter((p) => p.index >= Math.min(plan.mainPageCount, plan.sidebarPageCount))
          .map((p) => p.index),
        ...earlyMain,
        ...earlySidebar
      ])
      const v = noEmptyColumn(layoutPlan, { allowedResidualPages: residual }).violations
      if (v.length > 0) beyondResidual.push({ id: spec.id, violations: v })
    }

    expect(holes).toEqual([])
    expect(wrongTotal).toEqual([])
    expect(wrongResidual).toEqual([])
    expect(beyondResidual).toEqual([])
    // The exemption is exercised, so it is not silently covering nothing.
    expect(endedEarly).toBeGreaterThan(0)
  })

  // ── The two assertions C0 deferred to C3b, now implemented ────────────────
  //
  // Both were `.todo` because a whole-section packer could not reach the states
  // they describe: a section was one atomic block, so no item could be placed
  // on a different page from its siblings and no title could be separated from
  // its items. `packSidebar` now emits per-page item RANGES, so both are real.

  it('every sidebar ITEM is placed exactly once, in flow order, across every fixture (item-level Invariant 0)', () => {
    // The two sides are derived DIFFERENTLY, which is what makes this
    // falsifiable: `sidebarItemIds` walks the content arrays, while
    // `sidebarPlanItemIds` expands each planned slice's own [start, end). A
    // split that drops its last item, repeats one across the boundary, or
    // emits its slices out of order changes the plan side only.
    const failures = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { plan } = realSidebarPlan(content)
      const actual = sidebarPlanItemIds(plan, content)
      const expected = sidebarItemIds(content)
      const checks = {
        invariant0: invariant0(actual, expected),
        placedExactlyOnce: placedExactlyOnce(actual),
        orderPreserved: orderPreserved(actual, expected)
      }
      for (const [name, r] of Object.entries(checks)) {
        if (!r.ok) failures.push({ id: spec.id, check: name, detail: r })
      }
    }
    expect(failures).toEqual([])
  })

  it('the item-level check really is item-level: it reaches sections that were genuinely SPLIT across pages, and their ranges tile the section exactly', () => {
    // Guard against the whole assertion above going quiet if splitting ever
    // stops happening (or stops being exercised by the corpus): name the
    // fixtures that split, and check the tiling property directly.
    const splitSections = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { plan } = realSidebarPlan(content)
      const byKey = new Map()
      for (const page of plan.pages) {
        for (const s of page.sidebarSlices) {
          if (!byKey.has(s.key)) byKey.set(s.key, [])
          byKey.get(s.key).push(s)
        }
      }
      for (const [key, slices] of byKey) {
        if (slices.length === 1) continue
        splitSections.push(`${spec.id}:${key}x${slices.length}`)
        // tiles [0, itemCount): starts at 0, ends at itemCount, each slice
        // begins exactly where the previous ended, only the first is a head.
        expect(slices[0].start).toBe(0)
        expect(slices[slices.length - 1].end).toBe(slices[0].itemCount)
        expect(slices.map((s) => s.start).slice(1)).toEqual(slices.map((s) => s.end).slice(0, -1))
        expect(slices.map(isContinuedSlice)).toEqual(slices.map((_, i) => i > 0))
        for (const s of slices) expect(s.end - s.start).toBeGreaterThan(0)
      }
    }
    expect(splitSections.length).toBeGreaterThan(0)
  })

  it('no sidebar section heading is orphaned by an item-level split — every title has at least one of its own items under it, on the same page', () => {
    const orphans = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { layoutPlan } = realSidebarPlan(content)
      const r = noOrphanHeading(layoutPlan, 'sidebar', isSidebarHeadId)
      if (!r.ok) orphans.push({ id: spec.id, orphans: r.orphans })
    }
    expect(orphans).toEqual([])

    // ...and the check is not vacuous: fed a plan where a split put the title
    // on one page and its first item on the next, it fires.
    const orphanedBySplit = {
      pages: [
        { index: 0, sidebar: ['sb:certifications::head@0'] },
        { index: 1, sidebar: ['sb:certifications::head@0', 'sb:certifications::item:0:C0'] }
      ]
    }
    expect(noOrphanHeading(orphanedBySplit, 'sidebar', isSidebarHeadId).ok).toBe(false)
  })

  // ── The split's own budget arithmetic, against the INDEPENDENT oracle ─────

  it('a SPLIT page is filled to exactly the height the theme tokens say, and one more item would have overflowed it (split maximality)', () => {
    const rows = []
    const failures = []
    const skipped = []
    for (const { spec, content, tokenDerivable } of fixtureContents()) {
      if (!tokenDerivable) continue
      const { pageFills } = realSidebarPlan(content)
      pageFills.forEach((page, i) => {
        const next = pageFills[i + 1]
        if (!next?.continuesPrevious) return
        if (next.itemIncrement == null) {
          // competencies: its per-item height needs glyph widths, so this
          // oracle cannot derive it. Skipped LOUDLY, never waved through.
          skipped.push({ id: spec.id, page: i })
          return
        }
        // `budget` and `itemIncrement` are both sidebarBudget.js arithmetic over
        // the theme's raw tokens — no call into layout.js — so a wrong budget or
        // a mis-measured continued slice fails here.
        const used = page.oracleUsed === null ? page.used : quantized(page.oracleUsed)
        rows.push({ id: spec.id, page: i, oracleDerived: page.oracleUsed !== null })
        if (used > quantized(page.budget)) {
          failures.push({ id: spec.id, page: i, kind: 'over-budget', used, budget: page.budget })
        }
        if (used + next.itemIncrement <= quantized(page.budget)) {
          failures.push({
            id: spec.id,
            page: i,
            kind: 'under-split',
            used,
            increment: next.itemIncrement,
            budget: page.budget
          })
        }
      })
    }
    expect(failures).toEqual([])
    // The corpus really does exercise splits, and enough of them are fully
    // token-derivable that this is not resting on the packer's own `used`.
    expect(rows.length).toBeGreaterThan(3)
    expect(rows.filter((r) => r.oracleDerived).length).toBeGreaterThan(0)
    console.log(
      `split-maximality: ${rows.length} split boundaries checked ` +
        `(${rows.filter((r) => r.oracleDerived).length} with a fully token-derived page height), ` +
        `${skipped.length} skipped as not token-derivable`
    )
  })

  it("the packer's own page fill equals the independently derived one wherever the oracle can derive it — including on split pages", () => {
    const mismatches = []
    let checked = 0
    let splitPagesChecked = 0
    for (const { spec, content, tokenDerivable } of fixtureContents()) {
      if (!tokenDerivable) continue
      const { pageFills } = realSidebarPlan(content)
      pageFills.forEach((page, i) => {
        if (page.oracleUsed === null) return
        checked++
        if (page.continuesPrevious || pageFills[i + 1]?.continuesPrevious) splitPagesChecked++
        if (page.used !== quantized(page.oracleUsed)) {
          mismatches.push({ id: spec.id, page: i, packer: page.used, oracle: page.oracleUsed })
        }
      })
    }
    expect(mismatches).toEqual([])
    expect(checked).toBeGreaterThan(5)
    expect(splitPagesChecked).toBeGreaterThan(0)
  })

  it('the "(cont.)" title a split renders measures as one line, which is what lets the oracle charge one title height per slice', () => {
    const measure = harnessMeasurer()
    expect(multiLineRows(measure, continuedTitleRows())).toEqual([])
  })

  // ── Slice heights are MONOTONIC in item count ─────────────────────────────
  //
  // `largestFittingPrefix`'s binary search is exact only because
  // `sidebarSliceH(key, …, start, start + k)` is non-decreasing in `k`. That
  // obligation was documented in the CONSUMER (the search) and asserted
  // nowhere, which is backwards: it is a property of `SIDEBAR_SECTIONS`'
  // per-section height formulas, and C4's `glueAbove.shrink` is exactly the
  // kind of change that would quietly break it and turn every split
  // suboptimal-but-green. Swept here over the whole corpus, both measurers.
  it("every section's slice height is non-decreasing in item count, for every start offset (what makes the split search exact)", () => {
    const sm = deriveSidebarMetrics(tealTheme)
    const violations = []
    let comparisons = 0
    for (const measure of [harnessMeasurer(), undefined]) {
      for (const spec of buildFixturePlan().fixtures) {
        const content = buildContent(spec)
        for (const key of sidebarFlowKeys(TWO_COLUMN_LAYOUT)) {
          const n = sidebarItemCount(key, content)
          if (n < 2) continue
          for (let start = 0; start < n; start++) {
            let prev = Number.NEGATIVE_INFINITY
            for (let end = start + 1; end <= n; end++) {
              const h = Number(sidebarSliceH(key, content, sm, measure, start, end))
              comparisons++
              if (h < prev) violations.push({ id: spec.id, key, start, end, h, prev })
              prev = h
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
    expect(comparisons).toBeGreaterThan(2000)
  })

  // ── Overflow is now a closed, named set ───────────────────────────────────
  //
  // Before C3b's rule 1b, seven pages across the corpus reached past their
  // budget and each produced a physical sheet the plan never numbered — the
  // headline F3 defect. Rule 1b removes every REDUCIBLE one, so a non-zero
  // `overflowPt` should now be reachable only through content nothing can
  // paginate. This pins that set by name: a new entry means a regression or a
  // new deliberate case, and either way it has to be argued, not absorbed.
  // ('edge-forced-split-config' was the third entry until the
  // page1ExperienceCount / page1SplitBullets levers were REMOVED — maintainer
  // ruling. Its legacy keys are now ignored, it paginates automatically, and
  // it must NOT overflow: it moved from this allow-list to the general case.)
  const OVERFLOW_ALLOWED = {
    'edge-summary-exceeds-page':
      'the summary alone is taller than the main column. It is fixed page-1 content, not a packed block, so no pagination can help (see the packed-vs-fixed note in layout.js)',
    'edge-page-tall-item':
      "design doc G7's irreducible residual: one bullet and one certification each taller than a whole page"
  }

  it('no page reaches past its budget except the two named, argued cases — and each of those warns', () => {
    const unexpected = []
    const silent = []
    const noLongerOverflowing = []
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { plan } = realSidebarPlan(content)
      const over = plan.pages.filter((p) => p.overflowPt > 0)
      const allowed = spec.id in OVERFLOW_ALLOWED
      if (over.length > 0 && !allowed) {
        unexpected.push({ id: spec.id, pages: over.map((p) => `p${p.index}+${p.overflowPt}`) })
      }
      if (over.length === 0 && allowed) noLongerOverflowing.push(spec.id)
      // Whatever overflows must be REPORTED: an unnumbered sheet with no
      // diagnostic is the exact shape of the defect this slice is closing.
      const warnings = overflowWarnings(plan)
      if (over.length > 0 && warnings.length === 0) silent.push(spec.id)
    }
    expect(unexpected).toEqual([])
    expect(silent).toEqual([])
    // ...and the allow-list is not stale: every entry still reproduces.
    expect(noLongerOverflowing).toEqual([])
  })

  it('the overflow warning names the page and the amount, and says something different for each of the two causes', () => {
    const byId = {}
    for (const id of Object.keys(OVERFLOW_ALLOWED)) {
      const content = buildContent(buildFixturePlan().fixtures.find((f) => f.id === id))
      const { plan } = realSidebarPlan(content)
      byId[id] = overflowWarnings(plan)
    }
    // one warning per overflowing page, never two for the same page
    for (const [id, ws] of Object.entries(byId)) {
      const pages = ws.map((w) => w.page)
      expect(new Set(pages).size, `${id}: duplicate warnings for one page`).toBe(pages.length)
      for (const w of ws) {
        expect(w.message).toContain(`page ${w.page}`)
        expect(w.message).toMatch(/~\d+pt over budget/)
      }
    }
    expect(byId['edge-summary-exceeds-page'][0].message).toContain('summary alone')
    expect(byId['edge-page-tall-item'][0].message).toContain('cannot be split any further')
  })

  // ── Rule 1b: a page that ends early has to justify itself ────────────────
  it('a main-column page is left entry-free ONLY when the smallest legal piece of the next entry could not fit it', () => {
    const m = deriveMetrics(tealTheme)
    const measure = harnessMeasurer()
    const unjustified = []
    let ended = 0
    for (const spec of buildFixturePlan().fixtures) {
      const content = buildContent(spec)
      const { plan } = realSidebarPlan(content)
      plan.pages.forEach((page, i) => {
        if (page.mainBlocks.length > 0) return
        const next = plan.pages.slice(i + 1).find((p) => p.mainBlocks.length > 0)
        if (!next) return // the flow simply ran out — the G1 residual, not a deferral
        ended++
        // The smallest legal piece of the entry that DID start later: its head
        // plus one bullet (zero bullets would orphan the head). `entryH` is the
        // packer's own measurement — the independent term here is the BUDGET,
        // which comes from the theme arithmetic below.
        const entry = next.mainBlocks[0]
        const minUnit = entryH(
          {
            ...entry,
            startBullet: entry.startBullet ?? 0,
            endBullet: (entry.startBullet ?? 0) + 1
          },
          m,
          measure
        )
        const budget = Number(page.mainFill?.budget)
        if (minUnit <= budget) {
          unjustified.push({ id: spec.id, page: i, minUnit, budget })
        }
        // ...and it must have fitted where it actually went, or ending the page
        // early bought nothing.
        if (minUnit > Number(next.mainFill?.budget) && next.overflowPt === 0) {
          unjustified.push({ id: spec.id, page: i, kind: 'pointless-deferral' })
        }
      })
    }
    expect(unjustified).toEqual([])
    // The corpus really does exercise this now (it could not before C3b's
    // summary-length fixtures — every summary measured exactly 422.4pt).
    expect(ended).toBeGreaterThan(0)
  })

  it("page 1's experience budget really does go below the smallest legal entry piece on the cliff fixtures — the corpus can express the defect now", () => {
    const m = deriveMetrics(tealTheme)
    const measure = harnessMeasurer()
    const rows = []
    for (const id of ['edge-summary-crosses-cliff', 'edge-summary-exceeds-page']) {
      const content = buildContent(buildFixturePlan().fixtures.find((f) => f.id === id))
      const { plan } = realSidebarPlan(content)
      const entry = plan.pages.flatMap((p) => p.mainBlocks)[0]
      const minUnit = entryH({ ...entry, startBullet: 0, endBullet: 1 }, m, measure)
      rows.push({ id, budget: Number(plan.pages[0].mainFill?.budget), minUnit })
    }
    for (const r of rows) expect(r.budget).toBeLessThan(r.minUnit)
    // and one of them goes negative outright — the shape that used to cut the
    // first entry to a one-bullet prefix and make the page worse
    expect(rows.some((r) => r.budget < 0)).toBe(true)
  })
})
