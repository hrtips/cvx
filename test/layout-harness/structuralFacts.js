// ── Structural (packExperiences-derived) facts for one content bag ─────────
// Shared by generateBaseline.js (writes the recording) and
// layoutRenderOracle.test.js (re-derives the same facts and asserts them
// directly) — kept in one place so the two can never silently drift.
//
// Returns the FULL invariant-function results (not just booleans): callers
// hard-assert `.ok === true` on `main.*` for every fixture (these are true
// invariants of the current main-column packer — placed exactly once,
// nothing dropped, order preserved, no orphaned heading — never allowed to
// be false, so they are NOT part of the baseline-lock; a regenerate must
// not be able to silently "record" one as false — see generateBaseline.js's
// abort-on-violation check) and get the violating ids for a readable
// failure message if one ever does trip.
//
// Only `logicalTotalPages` (packExperiences().totalPages) is a plain
// descriptive fact, kept in the baseline-lock next to the oracle's
// pageCount — the gap between the two IS one of this sprint's headline
// findings, not a pass/fail check.
// ─────────────────────────────────────────────────────────────────────────

import { packExperiences } from '../../src/pdf/layout.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { mainPlanFromPackResult, experienceBlockIds, summaryBlockIds } from './blocks.js'
import { flowIds, invariant0, placedExactlyOnce, orderPreserved, noOrphanHeading } from './invariants.js'

/**
 * @param {{experience, summary, config, [key: string]: any}} content
 */
export function structuralFactsFor(content) {
  const { experience, summary, config } = content
  const packed = packExperiences(experience, summary, config, tealTheme)
  const mainPlan = mainPlanFromPackResult(packed, summary)
  const expectedMain = [...summaryBlockIds(summary), ...experienceBlockIds(experience)]
  const actualMain = flowIds(mainPlan, 'main')

  return {
    logicalTotalPages: packed.totalPages,
    main: {
      invariant0: invariant0(actualMain, expectedMain),
      placedExactlyOnce: placedExactlyOnce(actualMain),
      orderPreserved: orderPreserved(actualMain, expectedMain),
      noOrphanHeading: noOrphanHeading(mainPlan, 'main', (id) => id.endsWith('::head')),
    },
  }
}

/** The four hard main-column invariants that must never be false — see module docblock. */
export const HARD_INVARIANT_KEYS = ['invariant0', 'placedExactlyOnce', 'orderPreserved', 'noOrphanHeading']

/** @returns {string[]} human-readable descriptions of any hard invariant that is false, empty if all hold. */
export function hardInvariantViolations(structural) {
  return HARD_INVARIANT_KEYS
    .filter((key) => structural.main[key].ok !== true)
    .map((key) => `main.${key}: ${JSON.stringify(structural.main[key])}`)
}
