// ── Plan-derived facts for one content bag ─────────────────────────────────
// Shared by generateBaseline.js (writes the recording) and
// layoutRenderOracle.test.js (re-derives the same facts and asserts them
// directly) — kept in one place so the two can never silently drift.
//
// Returns the FULL invariant-function results (not just booleans): callers
// hard-assert `.ok === true` on `main.*` and `sidebar.*` for every fixture
// (these are true invariants of the packer — placed exactly once, nothing
// dropped, order preserved, no orphaned heading — never allowed to be false,
// so they are NOT part of the baseline-lock; a regenerate must not be able to
// silently "record" one as false — see generateBaseline.js's
// abort-on-violation check) and get the violating ids for a readable failure
// message if one ever does trip.
//
// Only `logicalTotalPages` (planTwoColumn().totalPages) is a plain descriptive
// fact, kept in the baseline-lock next to the oracle's pageCount — the gap
// between the two IS one of this sprint's headline findings, not a pass/fail
// check.
//
// WHAT THE SIDEBAR INVARIANTS HERE PROVE, as of C3b: a genuine ITEM-level
// fact. The expected side (sidebarItemIds()) walks the CONTENT arrays; the
// actual side (sidebarPlanItemIds()) expands each planned slice's own
// `[start, end)` range. Those are two different derivations, so a split that
// drops, duplicates or reorders an item shows up on one side only. Pre-C3b both
// sides expanded from the section key — recorded honestly at the time as
// section-level (which is still what catches the pre-C3 engine repeating whole
// sections onto every continuation page: 100 of 329 items duplicated). The
// render-level guarantee (every item's text survives into the PDF) remains
// contentOracle.js's job and is unchanged.
//
// MEASURER (C3): the plan is built with the REAL fontkit measurer, the same
// one render.js injects. Pre-C3 this file called packExperiences() with no
// measurer, so `logicalTotalPages` came from the loose char-width estimate
// while the oracle's `pageCount` came from a render that used real metrics —
// the two were never comparable, which silently inflated the recorded
// "physical != logical" count (e.g. the shipped scaffold recorded logical 3 vs
// physical 3 while the render itself was numbering its badges "1 of 2").
// Both sides now measure the same way, so `pageCount === logicalTotalPages` is
// a meaningful statement about the engine.
// ─────────────────────────────────────────────────────────────────────────

import path from 'node:path'
import { planTwoColumn } from '../../src/pdf/layout.js'
import { createMeasurer } from '../../src/pdf/measure.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { experienceBlockIds, mainPlanFromPackResult, summaryBlockIds } from './blocks.js'
import {
  flowIds,
  invariant0,
  noOrphanHeading,
  orderPreserved,
  placedExactlyOnce
} from './invariants.js'
import { ROOT } from './scaffold.js'
import {
  isSidebarHeadId,
  sidebarItemIds,
  sidebarLayoutPlan,
  sidebarPlanItemIds
} from './sidebarItems.js'

let memoizedMeasurer
/** The same measurer render.js builds (pinned Lato TTFs in src/fonts — lib/fonts is a copy of it). Memoized: opening the TTFs is pure but not free, and every fixture wants the same one. */
export function harnessMeasurer() {
  if (!memoizedMeasurer) memoizedMeasurer = createMeasurer(path.join(ROOT, 'src', 'fonts'))
  return memoizedMeasurer
}

/**
 * @param {{experience, summary, config, [key: string]: any}} content
 */
export function structuralFactsFor(content) {
  const measure = harnessMeasurer()
  const plan = planTwoColumn({ content, config: content.config, theme: tealTheme, measure })

  const mainPlan = mainPlanFromPackResult(
    {
      page1Experiences: plan.pages[0]?.mainBlocks ?? [],
      continuationChunks: plan.pages.slice(1).map((p) => p.mainBlocks)
    },
    content.summary
  )
  const expectedMain = [
    ...summaryBlockIds(content.summary),
    ...experienceBlockIds(content.experience)
  ]
  const actualMain = flowIds(mainPlan, 'main')

  const actualSidebar = sidebarPlanItemIds(plan, content)
  const expectedSidebar = sidebarItemIds(content)

  return {
    logicalTotalPages: plan.totalPages,
    plan,
    main: {
      invariant0: invariant0(actualMain, expectedMain),
      placedExactlyOnce: placedExactlyOnce(actualMain),
      orderPreserved: orderPreserved(actualMain, expectedMain),
      noOrphanHeading: noOrphanHeading(mainPlan, 'main', (id) => id.endsWith('::head'))
    },
    sidebar: {
      invariant0: invariant0(actualSidebar, expectedSidebar),
      placedExactlyOnce: placedExactlyOnce(actualSidebar),
      orderPreserved: orderPreserved(actualSidebar, expectedSidebar),
      // C3b: a section may now be cut at an item boundary, so "title alone at
      // the foot of a column with its first item overleaf" is finally a state
      // the packer could reach — and must never reach.
      noOrphanHeading: noOrphanHeading(sidebarLayoutPlan(plan, content), 'sidebar', isSidebarHeadId)
    }
  }
}

/** The hard invariants that must never be false — see module docblock. */
export const HARD_INVARIANT_KEYS = [
  'invariant0',
  'placedExactlyOnce',
  'orderPreserved',
  'noOrphanHeading'
]

/** Same, for the sidebar flow. `noOrphanHeading` joined the list in C3b, when item-level splitting first made a separated title possible. */
export const HARD_SIDEBAR_INVARIANT_KEYS = [
  'invariant0',
  'placedExactlyOnce',
  'orderPreserved',
  'noOrphanHeading'
]

/** @returns {string[]} human-readable descriptions of any hard invariant that is false, empty if all hold. */
export function hardInvariantViolations(structural) {
  return [
    ...HARD_INVARIANT_KEYS.filter((key) => structural.main[key].ok !== true).map(
      (key) => `main.${key}: ${JSON.stringify(structural.main[key])}`
    ),
    ...HARD_SIDEBAR_INVARIANT_KEYS.filter((key) => structural.sidebar[key].ok !== true).map(
      (key) => `sidebar.${key}: ${JSON.stringify(structural.sidebar[key])}`
    )
  ]
}
