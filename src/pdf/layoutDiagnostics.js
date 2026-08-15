// ── Layout diagnostics (C6a — design doc §7.2) ─────────────────────────────
//
// The pagination plan, re-expressed for a reader that is not the renderer: this
// turns `LayoutPlan` into fills, ranges, counts and warnings a caller can reason
// about without rasterizing anything. `plan_layout` returns it from a dry run;
// `build_pdf` returns the same object for the plan it actually rendered, so a
// caller that just built does not need a second call to see the numbers.
//
// This is a COMPLEMENT to looking at the PDF, not a substitute for it. An
// earlier version of this comment asserted that "an assistant driving CVX cannot
// see the PDF" — false for the clients that matter, which open PDFs natively,
// and not something a stateless callee can know about its caller anyway. What
// these numbers give you is the *price* of a layout; whether the page looks
// right is a judgement only a reader of the render can make.
//
// PURE FUNCTION OF THE PLAN. It takes `LayoutPlan` and reads nothing else — in particular it never reads CV
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
 * A column's v2 fill decomposition, or the nulls that mean "this flow ended on
 * an earlier page" — the ONE thing null means since §3.9 (a fixed block taller
 * than the whole column is a fill above 1 now, not a null).
 *
 * @param {import('./types.js').ColumnFill | null} f
 * @returns {Omit<import('./types.js').ColumnDiagnostics, 'blockedBy'>}
 */
function columnFill(f) {
  if (!f) return { fill: null, usedPt: null, budgetPt: null, capacityPt: null, fixedPt: null }
  // v2 (§3.9): fill is COLUMN OCCUPANCY — (fixed + packed) / whole column — so
  // the number means the same thing on every page. v1 divided by the residual
  // budget, which made page 1 (where the summary eats 40% of the column before
  // packing starts) read 0.595 while physically ~0.80 full, and invited every
  // reader to compare it against page 2's differently-based 0.997. The
  // documented invariant survives the redefinition and is asserted by tests:
  // fill > 1  ⟺  fixed + used > capacity  ⟺  used > budget  ⟺  over budget.
  // `null` now means exactly one thing: this flow ended on an earlier page.
  // (v1 also returned null for a fixed block taller than the page — an honest
  // ratio exists there, and it is now a number above 1.)
  const fixed = quantizeFixed(f)
  return {
    fill: f.capacity > 0 ? ratio(fixed + f.used, f.capacity) : null,
    usedPt: pt(f.used),
    budgetPt: pt(f.budget),
    capacityPt: pt(f.capacity),
    fixedPt: pt(fixed)
  }
}

/** The page's fixed content: everything the column holds before packing starts. */
function quantizeFixed(/** @type {{ capacity: number, budget: number }} */ f) {
  return Math.max(0, f.capacity - f.budget)
}

/**
 * The §3.8 decline record, published: why the next block did not start on this
 * page. Data, not a warning — true at nearly every page break. `shortByPt` is
 * the one number that moves MONOTONICALLY with the edit an author would make
 * (shorten the fixed content above by S and it falls by S until the block
 * moves up); `fill` has no such property under any definition, which is why
 * fill must never be sold as a progress signal. Never aggregated across pages
 * — no totals.shortByPt exists, and none may be added (risk R1).
 *
 * @param {{ index: number, smallestPiecePt: number, residualPt: number, gapBeforePt: number, entry?: import('./types.js').ExperienceEntry | null, key?: string | null } | null | undefined} d
 */
function blockedByOf(d) {
  if (!d) return null
  return {
    role: d.entry ? (d.entry.role ?? null) : null,
    ...(d.key !== undefined ? { key: d.key } : {}),
    entryIndex: d.index,
    residualPt: pt(d.residualPt),
    gapBeforePt: pt(d.gapBeforePt),
    smallestPiecePt: pt(d.smallestPiecePt),
    shortByPt: pt(d.smallestPiecePt - (d.residualPt - d.gapBeforePt))
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
 * The planner measures the summary and the experience flow in the main column
 * and nothing else, but a layout may legally place any section there and the
 * renderer will draw it (schema `layoutSlot`). Where that happens, this plan's
 * numbers describe less ink than the pages carry: `totalPages` can sit under
 * the sheets produced, and `overflowPt` cannot price the surplus. Naming it is
 * the whole point — INV-5 says a clean report means a clean artifact, so the
 * blindness must be stated, not inferred from a plan that looks complete.
 *
 * `kind: 'fact'`: nothing is necessarily wrong — a small section in a main
 * slot renders correctly and this still fires. Per R-F it names the condition
 * and what the numbers exclude, and stops there; whether to move the section
 * is the caller's judgement, taught by the skill.
 *
 * Retired by §8's I4/I6: once the planner prices main-slot sections,
 * `unmeasuredMainKeys` is empty by construction and this can never fire.
 *
 * @param {import('./types.js').LayoutPlan} plan
 * @returns {import('./types.js').LayoutDiagnosticWarning[]}
 */
function mainSlotUnmeasured(plan) {
  const keys = plan.unmeasuredMainKeys ?? []
  if (keys.length === 0) return []
  // INV-12: slot keys come from the user's own layouts/*.yaml, and the schema
  // accepts any non-empty string there — so they are UNTRUSTED TEXT in a
  // message, exactly like the role name page1-ends-early quotes below. Same
  // treatment: collapse whitespace to one line, cap each key, and cap how many
  // are named in prose. The untruncated list stays in the structured `keys`
  // field, which is what a caller should read anyway.
  const safe = keys.slice(0, 5).map((k) => String(k).replace(/\s+/g, ' ').slice(0, 40))
  const list =
    safe.join(', ') + (keys.length > safe.length ? `, and ${keys.length - safe.length} more` : '')
  const one = keys.length === 1
  return [
    {
      code: /** @type {const} */ ('main-slot-unmeasured'),
      kind: /** @type {const} */ ('fact'),
      keys: [...keys],
      message:
        `The layout places ${list} in a main slot, where the planner measures only the ` +
        `summary and the experience entries: ${one ? 'it is' : 'they are'} rendered but not ` +
        `measured, so this plan's page count and overflow figures exclude ` +
        `${one ? 'it' : 'them'}.`
    }
  ]
}

/**
 * The main flow carries no experience entries anywhere in the document.
 *
 * The defining shape of a student or first-job CV, and until I2 the
 * diagnostics had no word for it: `page1-no-experience` requires roles to
 * exist and be pushed to page 2 (that is its whole point), so on a CV with
 * zero roles the caller got silence plus a page-1 row whose numbers it had to
 * interpret. Naming the condition is what lets an assistant say "this CV has
 * no work history section" without inferring it from a null.
 *
 * `kind: 'fact'`: nothing is wrong. A CV with no experience is a legitimate
 * document, and per R-F this prices it — how much of page 1 the fixed content
 * already occupies — without suggesting what to do about it.
 *
 * Mutually exclusive with `page1-no-experience` BY CONSTRUCTION, in both
 * directions: that code requires at least one entry somewhere, this one
 * requires none.
 *
 * @param {import('./types.js').LayoutDiagnostics['pages']} pages
 * @returns {import('./types.js').LayoutDiagnosticWarning[]}
 */
function experienceEmpty(pages) {
  if (pages.length === 0) return []
  if (pages.some((p) => p.main.entries.length > 0)) return []
  const page1 = pages[0]
  const fixed = page1.main.fixedPt ?? 0
  // Nothing in the main column at all (no summary either) is a different
  // shape — the column is genuinely blank, which I3's main-column-empty
  // names. This fact is about the ABSENCE OF ROLES, so it needs the column to
  // be carrying something.
  if (fixed <= 0) return []
  return [
    {
      code: /** @type {const} */ ('experience-empty'),
      kind: /** @type {const} */ ('fact'),
      page: 1,
      fixedPt: fixed,
      message:
        `This CV has no experience entries: the main column carries only its fixed content ` +
        `(${fixed}pt of summary on page 1). Page-1 diagnostics describe that content; the ` +
        `experience-related codes cannot fire, because there are no roles to place.`
    }
  ]
}

/**
 * §3.8's warning: page 1's experience list ended early — at least one role IS
 * on page 1, but the next one could not start there, and page 1 is the only
 * page with a LEVER (fixed content the user can shorten). Mutually exclusive
 * with `page1-no-experience` by construction (that code requires zero
 * entries; this one requires at least one) — that warning is the degenerate
 * case of this phenomenon and keeps its own code.
 *
 * Main column and page 1 only, deliberately: a later page ending early is the
 * ordinary price of a page break (the data is still on that page's blockedBy),
 * and the sidebar's fixed content is the identity block, which is not
 * editable content. Like page1-no-experience, this is diagnostics-only — the
 * CLI's stderr notices stay overflow-only, so a human building a 3-page CV is
 * not shouted at about a normal page break.
 *
 * @param {import('./types.js').LayoutDiagnostics['pages']} pages
 * @returns {import('./types.js').LayoutDiagnosticWarning[]}
 */
function page1EndsEarly(pages) {
  const page1 = pages[0]
  if (!page1?.main.blockedBy || page1.main.entries.length === 0) return []
  const d = page1.main.blockedBy
  const fixed = page1.main.fixedPt ?? 0
  // The message has two regimes, and the architecture review is why (its D2):
  // the design's wording template was written from a CV with a roomy residual
  // and a small shortfall, and transcribed faithfully it produced impossible
  // advice on near-full pages — "only -30.73pt remain", and "shorten the
  // summary by 128.56pt" against a 114.30pt total lever. A priced fact whose
  // price is unpayable is not a fact. So:
  //
  //   actionable — the shortfall is within the page-1 lever (and within the
  //     next role's own head+bullet, or trimming that bullet cannot work
  //     either): name the price and both edits.
  //   not actionable — nothing above the roles can free enough: say THAT,
  //     plainly, and point at the numbers instead of prescribing an edit.
  //
  // `room` is clamped at 0 for prose: a residual smaller than the divider the
  // block would charge means "no room at all", never a negative number.
  const room = Math.max(0, pt(d.residualPt - d.gapBeforePt))
  const actionable = d.shortByPt <= fixed && d.shortByPt < d.smallestPiecePt
  // The role is user-authored text quoted inside CVX's own sentence (review
  // R-c): quote a single-line, length-capped form so a hostile or merely long
  // title cannot restructure the message; the untruncated string is in the
  // structured `nextRole` field.
  const roleQuote = d.role ? ` ("${String(d.role).replace(/\s+/g, ' ').slice(0, 80)}")` : ''
  const opening =
    `page 1's experience list ends ${d.residualPt}pt before the foot of the column: the next ` +
    `role${roleQuote} cannot start here because its smallest legal piece — the role heading ` +
    `plus one bullet — needs ${d.smallestPiecePt}pt and ` +
    (room > 0
      ? `only ${room}pt remain after the ${d.gapBeforePt}pt entry divider. `
      : `the ${d.gapBeforePt}pt entry divider alone exceeds the ${d.residualPt}pt left. `) +
    `Short by ${d.shortByPt}pt. `
  return [
    {
      code: /** @type {const} */ ('page1-ends-early'),
      kind: /** @type {const} */ ('fact'),
      page: 1,
      overflowPt: page1.overflowPt,
      forcedByConfig: false,
      shortByPt: d.shortByPt,
      residualPt: d.residualPt,
      smallestPiecePt: d.smallestPiecePt,
      gapBeforePt: d.gapBeforePt,
      fixedPt: fixed,
      nextRole: d.role,
      message: actionable
        ? opening +
          `The only lever on page 1 is the fixed content above the roles (${fixed}pt: the ` +
          `summary, its spacer, and the section title); shortening the summary by ` +
          `${d.shortByPt}pt, or shortening that role's first bullet by the same, starts it on ` +
          `page 1. This is a content decision — raise it with the user.`
        : opening +
          `No edit above the roles can free that much: the fixed content is ${fixed}pt in ` +
          `total, so page 1 is as full as this content allows and the page break is the ` +
          `correct outcome. Nothing to fix; report it only if the user asks why the role ` +
          `starts overleaf.`
    }
  ]
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
 * this: `overflowPt` is 0 (the packer did the right thing), `fill` reports only
 * the fixed content that DID land, and
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
      kind: /** @type {const} */ ('defect'),
      page: 1,
      overflowPt: page1.overflowPt,
      forcedByConfig: false,
      message:
        `page 1 carries no experience entries: its fixed content (the summary, and the identity ` +
        `block) leaves less room than the smallest piece of the first role, so the page ends early ` +
        `and the roles start on page 2. This is not the harmless empty column of a last page — the ` +
        `reader's first page shows no work history. Shortening the summary is the only content ` +
        `change that moves it — raise it with the user, and make the edit they choose.`
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

 * @returns {import('./types.js').LayoutDiagnostics | null}
 */
export function layoutDiagnostics(plan) {
  if (!plan) return null

  const pages = plan.pages.map((p) => ({
    page: p.index + 1,
    main: {
      ...columnFill(p.mainFill),
      blockedBy: blockedByOf(p.mainBlockedBy),
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
      blockedBy: blockedByOf(p.sidebarBlockedBy),
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
  // Defects first, the priced fact last (§3.8 says "appended", and a consumer
  // reading warnings[0] should meet an overflow before a page-break price).
  // `kind` is the discriminator (architecture review 4a, option A): CVX
  // classifying its own MESSAGE — 'defect' = wrong, act; 'fact' = true and
  // priced, act only if the user wants what it prices. It is additive on the
  // unreleased version-2 shape and never aggregated.
  const warnings = [
    ...overflowWarnings(plan).map((w) => ({
      code: /** @type {const} */ ('overflow'),
      kind: /** @type {const} */ ('defect'),
      page: w.page,
      overflowPt: pt(w.overflowPt),
      forcedByConfig: w.forcedByConfig,
      message: w.message
    })),
    ...page1WithoutExperience(pages),
    ...page1EndsEarly(pages),
    ...experienceEmpty(pages),
    ...mainSlotUnmeasured(plan)
  ]

  return {
    // Diagnostics-shape version. 2 = §3.9's comparable fill (occupancy over
    // capacity, not used-over-residual-budget) plus blockedBy and this field
    // itself. Consumers key on it to know fill's denominator changed; the
    // envelope's schemaVersion stays 1 (its fields are only added to).
    //
    // 3 (I2) = three published fields changed MEANING on the empty-experience
    // shape, which is why this is a bump and not an addition (R-E: two
    // meanings never share a version):
    //   · `mainPageCount` reads 1, not 0, for a CV whose page 1 renders a
    //     summary and no roles — the 0 was a lie about a page that exists.
    //   · page-1 `main.*` are numbers there, not nulls; `fill` now has the
    //     one meaning null always had elsewhere ("this flow ended earlier").
    //   · `emptyColumn` means "no ink in the column" rather than "no packed
    //     blocks", so a summary-bearing page 1 is no longer reported empty.
    // Riding the same bump (I1): `page`, `overflowPt` and `forcedByConfig` are
    // optional on a warning, because two codes are not page-scoped.
    version: 3,
    totalPages: plan.totalPages,
    mainPageCount: plan.mainPageCount,
    sidebarPageCount: plan.sidebarPageCount,
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
