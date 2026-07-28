// ── Packer-decision invariants — pure functions over a LayoutPlan ─────────
//
// LayoutPlan shape (research/sprint-layout-engine.md C0 §11 /
// research/layout-packing-design.md §11):
//
//   { pages: [{ index, main: string[], sidebar: string[] }], totalPages }
//
// Every function here is a pure predicate: (plan, ...) -> { ok, ...detail }.
// They know nothing about react-pdf, YAML, or the CLI — they only reason
// about arrays of block ids — so they are reusable unchanged by later
// chunks (C1–C3) once the engine returns a real two-flow plan, and by any
// future diagnostics surface (plan_layout, C6) that wants the same checks.
// ─────────────────────────────────────────────────────────────────────────

/** Flatten one flow ('main' | 'sidebar') across every page, in page order. */
export function flowIds(plan, flow) {
  return plan.pages.flatMap((p) => p[flow] ?? [])
}

/**
 * G1-adjacent / structural: every id in `ids` occurs exactly once.
 * (Not "every expected id is present" — that's invariant0 below. This only
 * catches duplicates, e.g. a bullet rendered twice.)
 */
export function placedExactlyOnce(ids) {
  const counts = new Map()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  const duplicates = [...counts.entries()].filter(([, c]) => c > 1).map(([id, c]) => ({ id, count: c }))
  return { ok: duplicates.length === 0, duplicates }
}

/**
 * Order preserved: `ids` (as rendered, across pages) must contain
 * `expectedOrder`'s members in the same relative order — pages/splits may
 * interleave *other* flows but must never reorder within this one.
 */
export function orderPreserved(ids, expectedOrder) {
  const idSet = new Set(ids)
  const expectedFiltered = expectedOrder.filter((id) => idSet.has(id))
  const actualFiltered = ids.filter((id) => expectedOrder.includes(id))
  const ok = expectedFiltered.length === actualFiltered.length
    && expectedFiltered.every((id, i) => id === actualFiltered[i])
  return { ok, expected: expectedFiltered, actual: actualFiltered }
}

/**
 * INVARIANT 0 — CVX renders 100% of the input; nothing omitted, clipped, or
 * duplicated. `ids` is the flattened rendered set for one flow; `expectedIds`
 * is the full block-id set derived directly from the input content.
 */
export function invariant0(ids, expectedIds) {
  const rendered = new Set(ids)
  const expected = new Set(expectedIds)
  const missing = [...expected].filter((id) => !rendered.has(id))
  const unexpected = [...rendered].filter((id) => !expected.has(id))
  return { ok: missing.length === 0 && unexpected.length === 0, missing, unexpected }
}

/**
 * No orphaned section heading: a heading block id must never be the sole
 * occupant of a page's flow array (a title with nothing under it — either
 * its body was pushed to a later page, or it has no body at all and
 * shouldn't have been emitted). `isHeadingId` classifies a block id as a
 * heading; `isBodyIdFor(headingId, otherId)` says whether `otherId` counts
 * as that heading's body content.
 *
 * @param {LayoutPlan} plan
 * @param {'main'|'sidebar'} flow
 * @param {(id: string) => boolean} isHeadingId
 */
export function noOrphanHeading(plan, flow, isHeadingId) {
  const orphans = []
  for (const page of plan.pages) {
    const ids = page[flow] ?? []
    ids.forEach((id, i) => {
      if (!isHeadingId(id)) return
      const nextOnSamePage = ids[i + 1]
      if (nextOnSamePage === undefined || isHeadingId(nextOnSamePage)) {
        orphans.push({ page: page.index, id })
      }
    })
  }
  return { ok: orphans.length === 0, orphans }
}

/**
 * Front-load property: page i's fill ratio should be >= page i+1's, within
 * `tolerance` (fractional, e.g. 0.05 = 5 points of fill). `fills` is caller-
 * supplied (the plan alone doesn't carry heights) — see estimator.js's
 * pageFillRatios() for how C0 derives it from the current engine.
 */
export function frontLoadHolds(fills, tolerance = 0.05) {
  const violations = []
  for (let i = 0; i < fills.length - 1; i++) {
    if (fills[i] < fills[i + 1] - tolerance) {
      violations.push({ page: i, fill: fills[i], nextFill: fills[i + 1] })
    }
  }
  return { ok: violations.length === 0, violations }
}

/**
 * No page over budget: every fill ratio must be <= 1 + tolerance. Kept
 * separate from frontLoadHolds so a "page 3 overflowed" failure reads
 * distinctly from a "page order isn't front-loaded" one.
 */
export function noPageOverBudget(fills, tolerance = 0.01) {
  const violations = []
  fills.forEach((fill, i) => { if (fill > 1 + tolerance) violations.push({ page: i, fill }) })
  return { ok: violations.length === 0, violations }
}

/**
 * No empty column: no page's `flow` array is empty while its sibling flow
 * (same page) is non-empty — except the caller-declared residual pages
 * (the deliberate "one flow ran out" tail, G1). `allowedResidualPages` is a
 * Set of page indices exempted (e.g. because content genuinely ran out).
 */
export function noEmptyColumn(plan, { allowedResidualPages = new Set() } = {}) {
  const violations = []
  for (const page of plan.pages) {
    if (allowedResidualPages.has(page.index)) continue
    const mainEmpty = (page.main ?? []).length === 0
    const sidebarEmpty = (page.sidebar ?? []).length === 0
    if (mainEmpty !== sidebarEmpty) violations.push({ page: page.index, emptyColumn: mainEmpty ? 'main' : 'sidebar' })
  }
  return { ok: violations.length === 0, violations }
}
