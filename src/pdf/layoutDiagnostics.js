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
 * The main column renders nothing ANYWHERE in a multi-page document.
 *
 * The dogfood shape (F4): a two-page CV whose wide column was blank on both
 * pages, reported by nothing. `emptyColumn` held the data all along, but as a
 * per-page field the docs label "a diagnostic, not a target" — which is what a
 * reader learns to skim past, and rightly so for the shape it usually names.
 *
 * THE BOUNDARY IS NOT "the last page", and getting that wrong would re-create
 * the metric C4 measured as anti-correlated with quality. A first cut of this
 * fact fired on every non-last blank page, which flags pages 2..n-1 of any CV
 * whose sidebar simply outlasts a short experience list — the textbook
 * residual, normal, and made measurably worse by packing it away. What
 * separates the dogfood shape from that residual is not WHERE the blank
 * column sits but whether the main flow ever produced anything: a residual is
 * one flow ENDING before the other, and this is one flow never starting. So
 * the condition is "no main content on any page", which a residual can never
 * satisfy (it has content on page 1 by construction).
 *
 * A single-page CV cannot reach it: one blank wide column on a one-page
 * document is visible at a glance, not a surprise buried on a later sheet.
 *
 * `kind: 'fact'` — a CV can legitimately look like this — and per R-F the
 * message names the condition and the pages, while the layout move it implies
 * is the skill's to teach.
 *
 * @param {import('./types.js').LayoutDiagnostics['pages']} pages
 * @param {number} totalPages
 * @param {string[]} unmeasuredMainKeys
 * @returns {import('./types.js').LayoutDiagnosticWarning[]}
 */
function mainColumnEmpty(pages, totalPages, unmeasuredMainKeys = []) {
  if (totalPages < 2) return []
  // The claim below is about INK, and this predicate reads the plan — which
  // measures only summary and experience in the main column (INV-3, known
  // violated; `main-slot-unmeasured` is its disclosure). On a layout that puts
  // sections in a main slot, the column can be full of education and
  // competencies while every page reports `emptyColumn: 'main'`. Publishing
  // "the main column renders nothing" there is a FALSE statement about the
  // render, contradicting the sibling fact in the same array — and it is the
  // exact layout SKILL.md teaches for student CVs. Where the planner is blind,
  // it says nothing rather than something untrue. I4/I6 make the main flow
  // measured, and this guard becomes unnecessary.
  if (unmeasuredMainKeys.length > 0) return []
  // "Blank" is the plan's own emptyColumn, which since I2 means no ink.
  const blank = pages.filter((p) => p.emptyColumn === 'main' || p.emptyColumn === 'both')
  if (blank.length !== pages.length) return []
  return [
    {
      code: /** @type {const} */ ('main-column-empty'),
      kind: /** @type {const} */ ('fact'),
      pages: blank.map((p) => p.page),
      message:
        `The main column renders nothing on any of this CV's ${totalPages} pages: every page ` +
        `carries only its sidebar. This is not the ordinary residual of one column being ` +
        `longer than the other — that shape has content on page 1 and runs out later — but a ` +
        `document whose wide column holds no content at all.`
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
        `(${fixed}pt on page 1 — the summary and its spacer). Page-1 diagnostics describe that ` +
        `content; the experience-related codes cannot fire, because there are no roles to place.`
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
  // Actionable ⟺ the shortfall is payable out of the fixed content above the
  // roles. The `shortByPt < smallestPiecePt` clause this used to carry made
  // the branch fire on ordinary CVs whenever the residual was smaller than the
  // entry divider — regardless of how large the fixed content was — so the
  // not-actionable message then asserted "the fixed content is only 348.3pt,
  // which is less than the 84.76pt this role needs". Freeing shortByPt is
  // exactly what buys the smallest piece its room in that case too, so the
  // clause was excluding cases the advice fits (gate-7 review of I3).
  const actionable = d.shortByPt <= fixed
  // The role is user-authored text quoted inside CVX's own sentence (review
  // R-c): quote a single-line, length-capped form so a hostile or merely long
  // title cannot restructure the message; the untruncated string is in the
  // structured `nextRole` field.
  const roleQuote = d.role ? ` ("${String(d.role).replace(/\s+/g, ' ').slice(0, 80)}")` : ''
  // D4: this used to read "the role heading plus one bullet", which named the
  // two CHEAPEST components and omitted the two expensive ones. The piece is
  // indivisible and carries the whole head: role, company/period, location,
  // description, and EVERY progression row, before the first bullet. Measured
  // on the shipped scaffold, description is 35.15pt and a 4-row progression
  // 51.30-63.90pt against a 66.30pt bare heading+meta+bullet — i.e. 52-60% of
  // the figure came from the two terms the sentence did not mention, which is
  // what sent a reader at the summary when a structural term was the blocker.
  const opening =
    `page 1's experience list ends ${d.residualPt}pt before the foot of the column: the next ` +
    `role${roleQuote} cannot start here because its smallest legal piece — the role heading ` +
    `with its company/period line, any description and every progression row, plus the first ` +
    `bullet — needs ${d.smallestPiecePt}pt and ` +
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
      // D4: both branches used to claim the content ABOVE the roles was the
      // only lever ("freed anywhere above this role" / "page 1 is as full as
      // this content allows"). That is false, and it was refuted twice by
      // measurement: deleting only the blocked role's OWN description, and
      // separately its own progression table — content strictly below the
      // break — moved the break both times, once taking a 3-page CV to 2.
      // Greedy top-down packing does make prefix repair monotone, but the
      // blocked entry's own head is an input to the decision at that boundary.
      message: actionable
        ? opening +
          `Page 1's fixed content above the roles is ${fixed}pt (the summary, its spacer and ` +
          `the section title). Two edits close the gap: free ${d.shortByPt}pt above this role ` +
          `(the summary is the usual place), or take ${d.shortByPt}pt out of the role's own ` +
          `head — its description or its progression rows — which shrinks the piece itself.`
        : opening +
          `The fixed content above the roles is only ${fixed}pt in total, less than the ` +
          `${d.shortByPt}pt this role needs, so no edit above the roles can move it. ` +
          `Shrinking the role's own head — its description or its progression rows — is the ` +
          `lever that remains.`
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
 * `emptyColumn` no longer fires on this shape at all (v3: the page carries a summary), so a named code is the only signal — so the shape
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
      // D4: the closing sentence used to read "The summary is the only content
      // above the roles, so it is the only thing whose length changes this —
      // no pagination can." The first clause is true and the conclusion does
      // not follow: the smallest piece is the first role's whole head, so
      // shortening THAT changes this too. Measured — deleting only the first
      // role's own progression table took page 1 from zero roles (fill 0.788)
      // to a full role, and the CV from 3 pages to 2.
      message:
        `page 1 carries no experience entries: its fixed content (the summary, its spacer and the ` +
        `section title) leaves less room than the smallest piece of the first role, so the page ends early ` +
        `and the roles start on page 2. The reader's first page therefore shows no work history. ` +
        `Two lengths change this and no pagination can: the summary (the only content above the ` +
        `roles), and the first role's own head — its description and progression rows, which are ` +
        `part of the smallest piece that has to fit.`
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
        continued: entry.isContinuation === true,
        // P2/D4 (diagnostics v4): what this piece COSTS. `heightPt` is the
        // packer's own figure; `headPt` is the indivisible part a page-leading
        // piece must carry before its first bullet, broken into its terms; and
        // `bulletsPt` prices each bullet of the slice. Before this the main
        // column published no height at all while the sidebar published
        // `heightPt` per section, so the column that decides the page count was
        // the one you could not price — and `smallestPiecePt` arrived as an
        // opaque total whose two largest terms were unnamed.
        ...(entry.measured ?? {})
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
    ...mainColumnEmpty(pages, plan.totalPages, plan.unmeasuredMainKeys ?? []),
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
    //
    // 4 (P2/D4) = the first ADDITIVE bump — no existing field changed meaning,
    // so a v3 consumer keeps everything it had. Main-column entries gained
    // `heightPt`, `gapBeforePt`, `headPt`, `head.{role,meta,location,
    // description,progression}Pt` and `bulletsPt`: what each placed piece
    // COSTS. The sidebar had published `heightPt` per section since v2 while
    // the main column — the flow that decides the page count — published no
    // height at all, so pricing a candidate edit meant editing the YAML and
    // rebuilding. Bumped rather than slipped in silently because "can I price
    // an edit by subtraction, or must I rebuild to find out?" is exactly the
    // question a version is for.
    version: 4,
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
