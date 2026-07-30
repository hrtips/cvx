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
//      whole curated fixture set, not just the scaffold). The sidebar is
//      NOT packed today (fixed section->page-kind assignment, never
//      measured or split — see blocks.js/sidebarPlan.js's module docblocks)
//      — assertions that need real sidebar packing are `.todo`, with the
//      reason in the title and a body that fails loudly if anyone removes
//      `.todo` without actually implementing them; C3 is expected to
//      implement-and-un-todo them once packSidebar() lands.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { packExperiences } from '../src/pdf/layout.js'
import {
  expBlockId,
  experienceBlockIds,
  mainPlanFromPackResult,
  summaryBlockIds
} from './layout-harness/blocks.js'
import { buildContent } from './layout-harness/contentSpecs.js'
import { buildFixturePlan } from './layout-harness/fixtures.js'
import {
  flowIds,
  frontLoadHolds,
  invariant0,
  noEmptyColumn,
  noOrphanHeading,
  noPageOverBudget,
  orderPreserved,
  placedExactlyOnce
} from './layout-harness/invariants.js'
import { presentSidebarKeys, sidebarStructuralPlan } from './layout-harness/sidebarPlan.js'

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

describe('main-column plan (packExperiences really packs this — testable today)', () => {
  function planFor(dir) {
    const summary = readYaml(dir, 'summary.yaml')
    const experience = readYaml(dir, 'experience.yaml')
    const config = readYaml(dir, 'config.yaml')
    const packed = packExperiences(experience, summary, config, undefined)
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
    const packed = packExperiences(content.experience, content.summary, content.config, undefined)
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
    const packed = packExperiences(experience, summary, {}, undefined)
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

// ── Tier 2b: sidebar — only section-presence is testable; item-level packing isn't real yet ──

describe('sidebar plan (structural / whole-section only — the engine does not pack the sidebar today)', () => {
  it('every present section key is reachable somewhere in the static per-page assignment, on the shipped scaffold', () => {
    const experience = readYaml(TEMPLATE, 'experience.yaml')
    const summary = readYaml(TEMPLATE, 'summary.yaml')
    const config = readYaml(TEMPLATE, 'config.yaml')
    const packed = packExperiences(experience, summary, config, undefined)

    const content = {
      achievements: readYaml(TEMPLATE, 'achievements.yaml'),
      education: readYaml(TEMPLATE, 'education.yaml'),
      certifications: readYaml(TEMPLATE, 'certifications.yaml'),
      competencies: readYaml(TEMPLATE, 'competencies.yaml'),
      languages: readYaml(TEMPLATE, 'languages.yaml'),
      publications: readYaml(TEMPLATE, 'publications.yaml')
    }
    const sbPlan = sidebarStructuralPlan(packed.totalPages)
    const actual = [...new Set(flowIds(sbPlan, 'sidebar'))]
    const expected = presentSidebarKeys(content)
    expect(invariant0(actual, expected).missing).toEqual([])
  })

  // Everything below needs the sidebar to actually be *packed* — measured,
  // split at item boundaries, and coordinated against the main column's
  // page count (design doc §4.5's packSidebar() / packToExactly()). None of
  // that exists yet: today the sidebar is a fixed key list per page-kind
  // (CVDocument.jsx's TWO_COLUMN_LAYOUT), repeated verbatim onto however
  // many *physical* pages react-pdf happens to need once it overflows —
  // which is exactly bug (a)/(b) this sprint exists to fix (see
  // renderOracle.js and research/c0-baseline.md for the rendered evidence).
  //
  // `.todo` (not `.skip`) and NOT empty-bodied: each has a real body that
  // calls expect.fail() so that if someone deletes `.todo` without actually
  // writing the real assertions, the test fails loudly instead of passing
  // vacuously (vitest never executes a `.todo` test's body, whatever it
  // is — confirmed: these bodies are dead code today, by design, until C3
  // implements the real check and removes both `.todo` and the fail()).
  it.todo('every sidebar ITEM (not just whole sections) is placed exactly once — pending engine support (C3: packSidebar() does not exist; sections are never split at item boundaries, so there is no item-level plan to assert on)', () => {
    expect.fail(
      'implement the real item-level assertion when packSidebar() lands (C3) — do not un-todo without one'
    )
  })

  it.todo('no sidebar section heading is orphaned by an item-level split — pending engine support (C3: sections cannot split at all today, so this failure mode literally cannot be exercised; the closest current risk, a WHOLE section overflowing onto an empty-main-column physical page, is bug (a), covered by the render oracle instead)', () => {
    expect.fail(
      'implement the real orphan-heading assertion when packSidebar() lands (C3) — do not un-todo without one'
    )
  })

  it.todo('the sidebar column front-loads across pages — pending engine support (C3: there is no per-page sidebar budget/fill at all today — sections are assigned to page-kinds statically, not measured, so a "fill ratio" cannot be computed)', () => {
    expect.fail(
      'implement the real front-load assertion when packSidebar() lands (C3) — do not un-todo without one'
    )
  })

  it.todo('no page has an empty column beyond the deliberate residual (G1), assessed from the structural plan alone — pending engine support (C3: the structural plan is blind to *physical* page overflow — react-pdf silently continues a too-tall column onto extra physical pages the structural plan never sees; see renderOracle.js, which IS able to observe this today and is baseline-locked in layoutRenderOracle.test.js)', () => {
    expect.fail(
      'implement the real structural empty-column assertion when packSidebar() lands (C3) — do not un-todo without one'
    )
  })
})
