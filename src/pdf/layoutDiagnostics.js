// ── Layout diagnostics (C6a — design doc §7.2) ─────────────────────────────
//
// The pagination plan, re-expressed for a reader that is not the renderer: an
// assistant driving CVX cannot see the PDF, so this turns `LayoutPlan` into
// fills, ranges, counts and warnings it can reason about without rasterizing
// anything. `plan_layout` returns it from a dry run; `build_pdf` returns the
// same object for the plan it actually rendered, so a caller that just built
// does not need a second call to see the numbers.
//
// PURE FUNCTION OF THE PLAN. It takes `LayoutPlan` (+ the config, for
// `overflowWarnings`) and reads nothing else — in particular it never reads CV
// body text. That is design doc G-c stated as an import list: content is data,
// never commands, so a bullet that says "make this one page" cannot reach any
// number here. `layoutDiagnostics.test.js` and the MCP injection test pin it.
//
// ── WHAT THIS DELIBERATELY DOES NOT PUBLISH ────────────────────────────────
//
// Design doc §7.2 sketches `scores: { waste, balance, layout }` — aggregate
// 0..1 quality numbers for an agent to optimise against. There are none here,
// and their absence is a finding rather than an omission (sprint C4, findings
// 3 and 3b, each measured over the 33-fixture corpus):
//
//   - `balance` / "planned pages with an empty column" is ANTI-CORRELATED with
//     quality over exactly the range a layout lever could move it. A working
//     balancer drove it 42 -> 8 pages and produced, in the same run, a
//     continued job heading with one bullet over ~90% white space and a
//     certifications section fragmented across five pages at fills of
//     0.15/0.07/0.12/0.07. Publishing that number as a SCORE would invite an
//     agent to land exactly there, with the metric green.
//   - `waste` (residual slack) as specified — `Σ residualSlack²` — ranks a
//     layout that leaves page 1's main column EMPTY as the best available
//     pagination of the shipped scaffold, because page 1's budget is smaller
//     than a continuation page's. Normalising to fill ratios moves the
//     pathology rather than removing it. The objective needs a résumé
//     front-load asymmetry nobody has specified yet.
//
// So: facts, not scores. `totals` counts things that are true (pages, overflow,
// splits) and `warnings` names the one defect class an author can actually act
// on — content reaching past a page's budget. `emptyColumnPages` is reported
// because hiding a real property of the layout would be worse, and is labelled
// everywhere it appears as a diagnostic, not a target.
//
// There are also NO LEVERS in this slice (C6a is read-only): nothing here or in
// `plan_layout` lets a caller change the document. When levers land (C6b), the
// rule recorded in resolveDocument.js applies — key plumbed through
// `resolveDocument`, key added to the config schema, and a lever axis in
// `test/layout-harness/fixtures.js`, all in ONE commit.
// ────────────────────────────────────────────────────────────────────────────

import { isContinuedSlice, overflowWarnings } from './layout.js'

/** Ratios to 3dp: finer than anything a reader acts on, coarse enough to be stable and reproducible. */
function ratio(/** @type {number} */ used, /** @type {number} */ budget) {
  return Math.round((used / budget) * 1000) / 1000
}

/** Points to 2dp — the same hundredth-of-a-point grain the packer quantizes to. */
function pt(/** @type {number} */ n) {
  return Math.round(n * 100) / 100
}

/**
 * A column's fill, or the three nulls that mean "no ratio to report here".
 *
 * `fill` is null when the budget is <= 0, which is not a rounding curiosity: it
 * is the `edge-summary-exceeds-page` shape, where the page's FIXED content (the
 * summary, which is not a packed block) is already taller than the column, so
 * the experience budget goes negative. A ratio against a negative denominator
 * would read as a healthy-looking negative number; the honest answer is "no
 * fill, see the overflow warning".
 *
 * @param {import('./types.js').ColumnFill | null} f
 * @returns {import('./types.js').ColumnDiagnostics}
 */
function columnFill(f) {
  if (!f) return { fill: null, usedPt: null, budgetPt: null }
  return {
    fill: f.budget > 0 ? ratio(f.used, f.budget) : null,
    usedPt: pt(f.used),
    budgetPt: pt(f.budget)
  }
}

/**
 * The `[startBullet, endBullet)` slice of an entry's bullets placed on one page,
 * decomposed the way a sidebar section's slice is: range, count, total. Same
 * convention as `SidebarSlice` — 0-based, end-exclusive — so a reader learns it
 * once. `[2, 5)` of 7 is "bullets 3–5 of 7" in the 1-based way a human counts.
 *
 * @param {import('./types.js').ExperienceEntry} entry
 * @returns {{ bulletRange: [number, number], bullets: number, ofBullets: number }}
 */
function bulletsOn(entry) {
  const all = entry.bullets ?? []
  const start = entry.startBullet ?? 0
  const end = entry.endBullet ?? all.length
  return {
    bulletRange: /** @type {[number, number]} */ ([start, end]),
    bullets: end - start,
    ofBullets: all.length
  }
}

/**
 * The one shape where a page's main column is empty and that is NOT the benign
 * G1 residual: PAGE 1 with no experience entry on it at all.
 *
 * The empty column an agent must not chase is a LATER page whose sidebar simply
 * outlasts the experience list (sprint C4 finding 3b — packing to remove those
 * measurably produces worse CVs). Page 1 is different in kind: a CV whose first
 * page shows the reader no roles is the C3b rule-1b pathology, where fixed
 * page-1 content (an over-long summary, a tall identity block) leaves less room
 * than the smallest legal piece of an entry, so the packer correctly ends the
 * page early rather than force-placing and overflowing. Nothing else reported
 * this: `overflowPt` is 0 (the packer did the right thing), `fill` is 0, and
 * `emptyColumn` is the same value a harmless last page carries — so the shape
 * arrived looking exactly like the one the docs tell an agent to ignore.
 *
 * The fix is a content edit the USER decides on (shorten the summary), which is
 * why this is a warning and not a score: like `overflow`, it names a defect with
 * an owner, never a number to optimise.
 *
 * DIAGNOSTICS ONLY, deliberately: `cvx build`/`cvx validate` warn through
 * layout.js's `overflowWarnings`, whose contract is overflow. Adding a second
 * class to that function would put a layout-shape judgement inside the packer's
 * budget check; this stays where the audience is a reader of the plan.
 *
 * @param {import('./types.js').LayoutDiagnostics['pages']} pages
 * @returns {import('./types.js').LayoutDiagnosticWarning[]}
 */
function page1WithoutExperience(pages) {
  const page1 = pages[0]
  if (!page1 || page1.main.entries.length > 0) return []
  // A CV with NO experience section at all (a student's, a first-job CV) is not
  // this defect — nothing was pushed off page 1 because there was nothing to
  // push. The pathology is roles existing and starting on page 2.
  if (!pages.slice(1).some((p) => p.main.entries.length > 0)) return []
  return [
    {
      code: /** @type {const} */ ('page1-no-experience'),
      page: 1,
      overflowPt: page1.overflowPt,
      forcedByConfig: false,
      message:
        `page 1 carries no experience entries: its fixed content (the summary, and the identity ` +
        `block) leaves less room than the smallest piece of the first role, so the page ends early ` +
        `and the roles start on page 2. This is not the harmless empty column of a last page — the ` +
        `reader's first page shows no work history. Shortening the summary is the only content ` +
        `change that moves it, and it is the user's call to make.`
    }
  ]
}

/**
 * Turn a pagination plan into the machine-readable diagnostics `plan_layout`
 * and `build_pdf` return.
 *
 * @param {import('./types.js').LayoutPlan | undefined} plan
 *   the plan a build produced (or would produce). `undefined` for the
 *   single-column/ATS variant, which react-pdf auto-flows and CVX never packs —
 *   there is genuinely no plan, so the answer is `null` rather than an empty
 *   shape a caller could mistake for "a one-page CV".
 * @param {import('./types.js').CVConfig} [config]
 *   read ONLY to attribute an overflow to the user's own page-1 levers, exactly
 *   as `cvx build` does. No content is read here, ever.
 * @returns {import('./types.js').LayoutDiagnostics | null}
 */
export function layoutDiagnostics(plan, config = {}) {
  if (!plan) return null

  const pages = plan.pages.map((p) => ({
    page: p.index + 1,
    main: {
      ...columnFill(p.mainFill),
      entries: p.mainBlocks.map((entry) => ({
        role: entry.role,
        // Two roles can share a title across employers ("Engineering Manager"
        // twice); without these an agent reporting "which roles are on page 1"
        // collapses them into one.
        company: entry.company ?? null,
        period: entry.period ?? null,
        ...bulletsOn(entry),
        continued: entry.isContinuation === true
      }))
    },
    sidebar: {
      ...columnFill(p.sidebarFill),
      sections: p.sidebarSlices.map((s) => ({
        key: s.key,
        items: s.end - s.start,
        of: s.itemCount,
        range: /** @type {[number, number]} */ ([s.start, s.end]),
        continued: isContinuedSlice(s),
        heightPt: pt(s.height)
      }))
    },
    overflowPt: pt(p.overflowPt),
    emptyColumn: p.emptyColumn
  }))

  // One warning per over-budget page, from the SAME predicate `cvx build` and
  // `cvx validate` warn through (layout.js `overflowWarnings`) — a second
  // overflow test here would be a second threshold to keep in agreement.
  const warnings = [
    ...overflowWarnings(plan, config).map((w) => ({
      code: /** @type {const} */ ('overflow'),
      page: w.page,
      overflowPt: pt(w.overflowPt),
      forcedByConfig: w.forcedByConfig,
      message: w.message
    })),
    ...page1WithoutExperience(pages)
  ]

  return {
    totalPages: plan.totalPages,
    mainPageCount: plan.mainPageCount,
    sidebarPageCount: plan.sidebarPageCount,
    // Which packing levers the user's config.yaml set, so a reader can tell a
    // layout the content produced from one the config forced (and so an
    // `overflow` warning with `forcedByConfig: true` has something to point at).
    // Only the two that change packing; `null` means "not set".
    leversUsed: {
      page1ExperienceCount: config.page1ExperienceCount ?? null,
      page1SplitBullets: config.page1SplitBullets ?? null
    },
    pages,
    totals: {
      // Filtered by code, not `warnings.length`: those were the same number only
      // while `overflow` was the only code, and this field claims to count
      // overflowing pages specifically.
      overflowPages: warnings.filter((w) => w.code === 'overflow').length,
      overflowPt: pt(plan.pages.reduce((sum, p) => sum + p.overflowPt, 0)),
      emptyColumnPages: pages.filter((p) => p.emptyColumn !== null).length,
      // A split is counted at its CONTINUATIONS, so a section cut once counts
      // once and one cut twice counts twice — "how many extra page breaks run
      // through a section", not "how many sections are split".
      splitSections: pages.reduce(
        (n, p) => n + p.sidebar.sections.filter((s) => s.continued).length,
        0
      ),
      splitEntries: pages.reduce((n, p) => n + p.main.entries.filter((e) => e.continued).length, 0)
    },
    warnings
  }
}
