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
  const duplicates = [...counts.entries()]
    .filter(([, c]) => c > 1)
    .map(([id, c]) => ({ id, count: c }))
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
  const ok =
    expectedFiltered.length === actualFiltered.length &&
    expectedFiltered.every((id, i) => id === actualFiltered[i])
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
 * Front-load property, in the form a WHOLE-BLOCK packer can actually satisfy:
 * every page is *maximal* — the first block of page i+1 genuinely could not
 * have been added to page i.
 *
 * Why not `frontLoadHolds(fills)` (page i fill >= page i+1 fill)? Because with
 * atomic blocks that is not achievable and its failure would not mean the
 * packer misbehaved. Counter-example from the real fixture set (pw-12): the
 * sidebar's `referees` section measures 580pt against a 690pt page, so after
 * a 241pt page it cannot join — page 2 lands at 35% fill and page 3 at 84%,
 * violating fill-monotonicity while being the only front-loaded packing that
 * exists. Fill-monotonicity becomes meaningful (and should be turned on here)
 * once sections split at item boundaries, since then the tail of a section can
 * always be poured into the earlier page's remaining slack.
 *
 * `pages` is `[{ used, budget, firstBlockHeight, gapBefore }]`.
 *
 * **`budget` MUST come from somewhere other than the packer.** Review found
 * the first cut of this check toothless precisely because caller and packer
 * shared one budget source: restating the packer's own break condition against
 * its own numbers can only fail if the packer contradicts itself, never if the
 * budget is wrong (a 2x budget error left it green). Callers pass
 * sidebarBudget.js's independently-derived `expectedSidebarBudget()`.
 *
 * Two failure directions, both reported:
 *   - `lazy`     — the next block would have fit; the page was not filled.
 *   - `overfull` — this page exceeded the independent budget while holding more
 *                  than one block, i.e. it was not the forced single-block case
 *                  Invariant 0 allows.
 */
export function frontLoadMaximal(pages, tolerance = 0.01) {
  const violations = []
  for (let i = 0; i < pages.length; i++) {
    const cur = pages[i]
    if (cur.blockCount > 1 && cur.used > cur.budget + tolerance) {
      violations.push({ page: i, kind: 'overfull', used: cur.used, budget: cur.budget })
    }
    const next = pages[i + 1]
    if (!next || next.firstBlockHeight == null) continue
    const wouldUse = cur.used + (next.gapBefore ?? 0) + next.firstBlockHeight
    if (wouldUse <= cur.budget + tolerance) {
      violations.push({ page: i, kind: 'lazy', used: cur.used, budget: cur.budget, wouldUse })
    }
  }
  return { ok: violations.length === 0, violations }
}

/**
 * Each flow's non-empty pages must form a PREFIX of the document: content runs
 * out at the tail, never in the middle. `packBlocks` cannot produce a hole on
 * its own, but the two-flow coordinator zips two independently-packed flows into
 * P pages and an off-by-one there would leave an interior page blank — which is
 * exactly the class of bug G1 exists to forbid, and the part of it that IS
 * falsifiable while sections stay atomic.
 */
export function contentFormsPrefix(plan, flow) {
  const nonEmpty = plan.pages.map((p) => (p[flow] ?? []).length > 0)
  const lastWithContent = nonEmpty.lastIndexOf(true)
  const holes = nonEmpty
    .slice(0, lastWithContent + 1)
    .map((has, i) => ({ page: i, has }))
    .filter((p) => !p.has)
    .map((p) => p.page)
  return { ok: holes.length === 0, holes, lastWithContent }
}

/**
 * No page over budget: every fill ratio must be <= 1 + tolerance. Kept
 * separate from frontLoadHolds so a "page 3 overflowed" failure reads
 * distinctly from a "page order isn't front-loaded" one.
 */
export function noPageOverBudget(fills, tolerance = 0.01) {
  const violations = []
  fills.forEach((fill, i) => {
    if (fill > 1 + tolerance) violations.push({ page: i, fill })
  })
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
    if (mainEmpty !== sidebarEmpty)
      violations.push({ page: page.index, emptyColumn: mainEmpty ? 'main' : 'sidebar' })
  }
  return { ok: violations.length === 0, violations }
}
