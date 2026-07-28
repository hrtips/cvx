// ── Main-column LayoutPlan construction from packExperiences()'s output ───
//
// LayoutPlan shape under test (research/sprint-layout-engine.md C0 §11 /
// research/layout-packing-design.md §11):
//
//   { pages: [{ index, main: string[], sidebar: string[] }], totalPages }
//
// Block ids are at BULLET granularity (not "one id per entry"), because the
// engine's own splitting machinery (page1SplitBullets / isContinuation) is a
// *legitimate* way for one entry to contribute ids to two different pages —
// modelling that as a violation would be wrong. What must never happen is a
// bullet index missing from every page (dropped) or appearing on more than
// one page (duplicated) — exactly what Invariant 0 + "placed exactly once"
// are for.
//
// This file is deliberately plain-Node-safe (no .jsx imports): it is loaded
// both by vitest test files and by generateBaseline.js, which runs under
// plain `node` (no Vite/JSX transform available). The sidebar's structural
// plan (which does need a .jsx import — src/pdf/CVDocument.jsx's exported
// TWO_COLUMN_LAYOUT) lives in the separate sidebarPlan.js instead, which is
// vitest-only. See that file's docblock for why the split.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Stable id for one experience entry. Takes the entry's position in the
 * CANONICAL `experience` array explicitly — role+company alone is not
 * enough: two entries can legitimately share both (e.g. two separate
 * stints in the same role at the same company), which would otherwise
 * make placedExactlyOnce() blind to a genuine collision (regression test:
 * layoutHarnessInvariants.test.js "does not collide when two entries share
 * the same role+company").
 */
export function expBlockId(index, e) {
  return `exp:${index}:${e.role}::${e.company ?? ''}`
}

export function summaryBlockIds(summary) {
  return (summary ?? []).map((_, i) => `summary:bullet:${i}`)
}

/**
 * The full, unsplit block-id set for one canonical experience array — the
 * "expected" side of Invariant 0 for the main column (nothing held back).
 */
export function experienceBlockIds(entries) {
  return (entries ?? []).flatMap((e, i) => {
    const id = expBlockId(i, e)
    const bulletIds = (e.bullets ?? []).map((_, j) => `${id}::bullet:${j}`)
    return [`${id}::head`, ...bulletIds]
  })
}

/** Block ids one packed entry *fragment* (whole, head-split, or continuation) contributes, at a given canonical index. */
function fragmentBlockIds(e, canonicalIndex) {
  const id = expBlockId(canonicalIndex, e)
  const start = e.startBullet ?? 0
  const end = e.endBullet ?? (e.bullets?.length ?? 0)
  const bulletIds = []
  for (let i = start; i < end; i++) bulletIds.push(`${id}::bullet:${i}`)
  return e.isContinuation ? bulletIds : [`${id}::head`, ...bulletIds]
}

/**
 * Build the LayoutPlan (main column only) that the CURRENT engine actually
 * produces, from packExperiences()'s return value.
 *
 * Fragments don't carry their canonical array index directly (a split
 * entry's continuation is a fresh `{...e, isContinuation, startBullet}`
 * object, not reference-equal to the original), so this walks the emitted
 * fragments in order and reconstructs the index itself: packExperiences()
 * never reorders or interleaves entries, and every canonical entry
 * contributes exactly one non-continuation fragment (the whole entry, or
 * its head-split) followed by zero or more `isContinuation` fragments for
 * that SAME entry before the next canonical entry begins — so "advance the
 * index on every non-continuation fragment, hold it on every continuation
 * fragment" is exact, not a heuristic.
 */
export function mainPlanFromPackResult({ page1Experiences, continuationChunks }, summary) {
  let canonicalIndex = -1
  const nextFragmentIds = (e) => {
    if (!e.isContinuation) canonicalIndex++
    return fragmentBlockIds(e, canonicalIndex)
  }

  const pages = [{
    index: 0,
    main: [...summaryBlockIds(summary), ...page1Experiences.flatMap(nextFragmentIds)],
    sidebar: [],
  }]
  continuationChunks.forEach((chunk, i) => {
    pages.push({ index: i + 1, main: chunk.flatMap(nextFragmentIds), sidebar: [] })
  })
  return { pages, totalPages: pages.length }
}
