// ── Packer-decision invariants — pure functions over a LayoutPlan ─────────
//
// LayoutPlan shape (research/archive/sprint-layout-engine.md C0 §11 /
// research/archive/layout-packing-design.md §11):
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
 * Front-load property, in the form a block packer can actually satisfy: every
 * page is *maximal* — nothing more could have been added to page i without
 * exceeding its budget.
 *
 * Why not `frontLoadHolds(fills)` (page i fill >= page i+1 fill)? With atomic
 * blocks it is not achievable and its failure would not mean the packer
 * misbehaved. Counter-example from the real fixture set (pw-12, pre-C3b): the
 * sidebar's `referees` section measures 580pt against a 690pt page, so after
 * a 241pt page it cannot join — page 2 lands at 35% fill and page 3 at 84%,
 * violating fill-monotonicity while being the only front-loaded packing that
 * exists. C3b's item-level splitting removes THAT particular counter-example
 * (the tail of a section can now pour into the earlier page's slack), but not
 * the property's underlying problem: a page's fill is still capped by the
 * largest indivisible unit that has to start it, and the two columns' budgets
 * differ page to page. Maximality is the exact statement; fill-monotonicity is
 * a proxy for it that is sometimes wrong in both directions, so this stays the
 * assertion.
 *
 * `pages` is `[{ used, budget, blockCount, firstBlockHeight, gapBefore,
 *               continuesPrevious?, itemIncrement?, indivisible? }]`.
 *
 * **`budget` MUST come from somewhere other than the packer.** Review found
 * the first cut of this check toothless precisely because caller and packer
 * shared one budget source: restating the packer's own break condition against
 * its own numbers can only fail if the packer contradicts itself, never if the
 * budget is wrong (a 2x budget error left it green). Callers pass
 * sidebarBudget.js's independently-derived `expectedSidebarBudget()`, and
 * `itemIncrement` likewise comes from that file's token arithmetic.
 *
 * Three failure directions, all reported:
 *   - `lazy`       — the next page's whole first block would have fit here.
 *   - `under-split`— the next page CONTINUES a block this page started (C3b),
 *                    and one more of its items would still have fit: the split
 *                    was cut short, leaving slack the packer could have used.
 *                    `itemIncrement` is what that one item would have added;
 *                    a page whose caller cannot derive it independently is
 *                    skipped rather than waved through on the packer's word.
 *   - `overfull`   — this page exceeded the independent budget when it had a
 *                    choice. Over budget is legal ONLY for a page holding one
 *                    block that cannot be cut any smaller (Invariant 0's
 *                    irreducible residual: a single item taller than a page).
 *                    `indivisible: false` says the caller knows the lone block
 *                    could have been cut, which makes over-budget a violation.
 */
export function frontLoadMaximal(pages, tolerance = 0.01) {
  const violations = []
  for (let i = 0; i < pages.length; i++) {
    const cur = pages[i]
    const forcedSingle = cur.blockCount <= 1 && cur.indivisible !== false
    if (!forcedSingle && cur.used > cur.budget + tolerance) {
      violations.push({ page: i, kind: 'overfull', used: cur.used, budget: cur.budget })
    }
    const next = pages[i + 1]
    if (!next) continue
    if (next.continuesPrevious) {
      // "Would the whole next block have fit?" is the wrong question here — it
      // provably would not, which is why it was split. The right one is
      // "would ONE MORE ITEM of it have fit?".
      if (next.itemIncrement == null) continue
      const wouldUse = cur.used + next.itemIncrement
      if (wouldUse <= cur.budget + tolerance) {
        violations.push({
          page: i,
          kind: 'under-split',
          used: cur.used,
          budget: cur.budget,
          wouldUse
        })
      }
      continue
    }
    // The unit that could have moved back is the next block's SMALLEST
    // PLACEABLE piece, not the whole block: C3b splits, so "the whole thing did
    // not fit" stopped being the right question. `minUnit` is the section title
    // plus one item (token-derived); `firstBlockHeight` is the fallback for a
    // caller that cannot derive it, and for the synthetic self-tests.
    const unit = next.minUnit ?? next.firstBlockHeight
    if (unit == null) continue
    // A page the packer deliberately ENDED EARLY (rule 1b) holds nothing, so
    // nothing precedes the moved block and no separator would be charged. The
    // check then reads exactly as the deferral condition: the smallest piece
    // must genuinely not have fitted. This is what keeps rule 1b from being a
    // free pass to leave any page blank.
    const gap = cur.blockCount === 0 ? 0 : (next.gapBefore ?? 0)
    const wouldUse = cur.used + gap + unit
    if (wouldUse <= cur.budget + tolerance) {
      violations.push({ page: i, kind: 'lazy', used: cur.used, budget: cur.budget, wouldUse })
    }
  }
  return { ok: violations.length === 0, violations }
}

/**
 * Each flow's non-empty pages must form a PREFIX of the document: content runs
 * out at the tail, never in the middle. The two-flow coordinator zips two
 * independently-packed flows into P pages and an off-by-one there would leave
 * an interior page blank — exactly the class of bug G1 exists to forbid.
 *
 * `allowedEmptyPages` is the one legitimate hole, added in C3b: `packBlocks`
 * rule 1b may END A PAGE EARLY when nothing of the next block fits it, which
 * for the main flow means a page-1 with a summary and no experience entries.
 * Callers pass the pages the packer itself reports as such (an empty flow with
 * a non-null fill record — a page the packer produced, as opposed to one the
 * flow never reached). That an early end was NECESSARY is a separate question,
 * answered by `frontLoadMaximal`'s `minUnit` check; this function only stops
 * treating it as a mis-zipped coordinator.
 */
export function contentFormsPrefix(plan, flow, { allowedEmptyPages = new Set() } = {}) {
  const nonEmpty = plan.pages.map((p) => (p[flow] ?? []).length > 0)
  const lastWithContent = nonEmpty.lastIndexOf(true)
  const holes = nonEmpty
    .slice(0, lastWithContent + 1)
    .map((has, i) => ({ page: i, has }))
    .filter((p) => !p.has && !allowedEmptyPages.has(p.page))
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
