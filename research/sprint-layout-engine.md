# Sprint: Layout Engine — faithful two-column packing

*2026-07-27. Implements `layout-packing-design.md` (the state-of-the-art unified packer) under the constraints hardened by the-fool (pre-mortem + red-team). Companion evidence: `layout-packing-research.md`. This is a **standalone sprint** — its own track, gated behind v1.5 shipping.*

**Priority stance: accuracy > speed.** No time estimates. Each chunk is "done when green," not "done when the clock runs out." The one exception is the optimizer (C4), which is deliberately time-boxed *with a shippable fallback* so accuracy-seeking can't turn into an open-ended tar pit.

---

## Status board *(updated 2026-08-02)*

| Chunk | State | Evidence |
|---|---|---|
| C0 harness | ✅ **DONE** | `30c8caf`; retro `c0-retro.md`; baseline `test/layout-harness/baseline.json` |
| C1 badge | ⛔ **REJECTED — premise disproven, folded into C3** | see C1's outcome note below; **no code change** |
| C2 measurement | ✅ **DONE** | `19a9671`; retro `c2-retro.md`; 0% measure error on all Latin corpus rows |
| **C3a packer** (measure + pack the sidebar, `P = max`) | ✅ **DONE** | `779b9ab`; regenerated `baseline.json`; 0.00pt sidebar measure-diff |
| **C3b packer** (item-level splitting + early page end) | ✅ **DONE** | `8273d6e`, released in v1.6.0; regenerated `baseline.json`; suite 434→492; both remaining `it.todo`s implemented |
| **C4 optimizer** | ⛔ **NO-GO — deferred with evidence; C3 is the shipped answer** | see C4's outcome note below. Prototype measured and discarded; four maintainer-requested items landed instead |
| C5 DP | ⏸ **closed as not-needed unless C4 is revived** | it can only re-rank breaks *inside* a page count C3 already minimises — see C4's finding 1 |
| **C6a MCP diagnostics** (see the layout, no levers) | ✅ **DONE** | `plan_layout` (5th tool) + `diagnostics` in `build_pdf` / `build --json`; `baseline.json` unchanged, PDFs byte-identical to `e3bf572` |
| C6b MCP levers | ⛔ **PREMISE SUPERSEDED — closed 2026-08-09** | scoped against design-doc §7, whose central specification C4 measured as wrong. An expert panel (4 independent lenses) reached the same verdict from 4 directions. Replaced by `sprint-design-loop.md`: the objective was never a page count, it is an assistant that iterates like a designer — see that doc's reframe |
| C7 docs/close | ⏸ blocked on whatever ships | |

**Preconditions all met:** v1.5.0 shipped (npm `latest`, `build --all` blocker fixed); the hostile-build quality track (per-file 90% coverage gate, `tsc --strict` = 0, lint/knip/publint/attw + security CI) merged via PR #1 and is now a standing gate every C3 commit must clear. Suite was **345 passed / 4 todo** entering C3a.

**Three records corrected 2026-08-01, worth knowing before touching the packer:**
1. **Overflow FLOWS, it does not clip.** Re-verified by direct render: a config forced ~541pt past page-1 budget yields 3 pages with all 20 bullets present and no overprinting. Nothing in `src/pdf` sets `wrap={false}`, so react-pdf's default `wrap: true` continues content onto extra physical pages. **C3's job is wasted space, not content rescue** — Invariant 0 is currently *holding*, and C3 must keep it holding while it removes the unplanned pages. The old "the scaffold clips a bullet" claim was a misdiagnosis that propagated through three agents; it is dead, and the comments that carried it have been fixed.
2. **Non-Latin is out of scope, decided.** CV rendering is English/Western-European Latin only; detect-and-warn is the shipped, final answer (see `c2-retro.md` decision 1). C3 does **not** owe non-Latin anything beyond keeping the existing warning working.
3. **The blank sliver was the un-budgeted page-number badge, not float rounding — C1 finding (b) is corrected (2026-08-01, C3a).** See the corrected C1 note below.

---

## C3a — what landed, and what it cost *(2026-08-01)*

**Landed.** `packBlocks(flow, budgetFn, 'frontload')` factored out of the greedy branch; sidebar measurement for all 8 sections + both identity variants; `packSidebar()` at whole-section granularity; `planTwoColumn()` taking `P = max(P_main, P_sidebar)`; per-page sidebar slices threaded through `CVDocument.buildSidebar` with identity injected per page; the main-column budget corrected to account for the badge; `bodyHeight()` as the single box both columns are budgeted against; the plan computed in `renderCV` (outside the React tree) and passed in as a prop, with theme/layout resolution unified in `resolveDocument.js`.

**Measurement is verified against reality, not against itself.** `test/layoutSidebarMeasureDiff.js` renders through the real CLI and reads the true vertical offset of every sidebar section title out of the PDF with `pdftotext -bbox`; predicted vs observed is **0.00pt** for all 8 section kinds (including the 8-entry, ~580pt referees block) and for the identity block, across the scaffold + 7 fixtures. Skipped/undifferenceable pages are logged, not swallowed.

**Artifact-free wins:**
- **Total sheets across the 29-fixture matrix: 95 → 87.**
- **Sidebar duplication: 100 of 329 items rendered more than once → 0.** (The pre-C3 engine repeated whole sections on every continuation page.)
- **Page numbering is now consistent with the page count** on every fixture except F3 below.

**Costs and open defects, recorded rather than buried:**

- ~~**F1 — whole-section granularity costs sheets on two fixtures.**~~ **WITHDRAWN 2026-08-02 (C3b): these were never regressions, and the record was wrong.** The claim was that `pw-12` went 2 → 3 and `risk-tall-sidebar-short-main` 3 → 4 physical sheets. `git show 30c8caf:test/layout-harness/baseline.json` records the pre-C3 truth: `pw-12` was **physical 2, logicalTotalPages 1**, and `risk-tall-sidebar-short-main` **physical 3, logical 1**. The old output was one planned page plus one or two *unnumbered overflow sheets carrying duplicated sections* — the same paper, finally counted. C3b's splitting does now pour `referees` into earlier slack (`pw-12` places `referees[0,6)` then `[6,8)`; `risk-tall` splits both `languages` and `referees`) and packs those pages to 687/694, 688/690 and 669/690, 663/690 — but the page count does not move, because it cannot: with 7 sections summing 1451.61pt, two pages hold at most 1384.38pt of budget (`k=2` is short by 138.48pt; `risk-tall`'s `k=3` short by 182.54pt, and deleting `spacing.safety` entirely would recover only 30–45pt). **Three pages is the floor for pw-12 and four for risk-tall. Nothing was lost and nothing was owed.**
- **F2 — planned empty columns are new, and part of the empty-column "improvement" is a measurement artifact.** *(C3b verified the accounting: `physical == planned + unplanned` holds exactly at C0 98=68+30, C3a 87=78+9, C3b 85=84+1 — no new waste was introduced, only unnumbered sheets becoming numbered pages. See the C3b note below.)* Re-measured over all 29 fixtures (the 28 curated + `scaffold-default`): **16/29** fixtures now have at least one *planned* page with a structurally empty column — **9 fixtures / 17 pages** with no sidebar sections, **7 fixtures / 10 pages** with no main content. (Over the 28 curated fixtures alone it is 15 / 9-and-17 / 6-and-9; the extra fixture and page are the shipped scaffold's own page 3.) Pre-slice the count was **0 planned pages**, because the pre-C3 engine never planned a page it did not fill — it overflowed instead. This is the honest cost of `P = max` with front-load fill: the shorter flow's tail is now a real, numbered page with one column blank, where before it was an unplanned sheet. Separately, the recorded empty-column count moving 8/29 → 6/29 is **not** a clean win: the render oracle detects an empty column by ink-band presence, and C3a puts an identity block and a page-number badge on every planned page, so a genuinely empty column can now read as "has ink". Treat 8→6 as unreliable. The artifact-free numbers are the three bullets above.
- **F3 — duplicate page numbers where an over-budget first block flows.** *(C3b: the reducible half is fixed by rule 1b + splitting; see the C3b note below for the three residual shapes, which now warn.)* When `packBlocks` rule 1 forces a block taller than its page (Invariant 0: never drop), react-pdf carries it onto an extra physical sheet that the plan never numbered: `pw-09` physical page 2 reads **"1 of 5" in a 6-sheet PDF**, with no top bar and no identity block. Overruns, from `plan.pages[].overflowPt` (a field this slice adds): **+438.21pt** on page 1 of `pw-03`, `pw-08`, `pw-09`, `pw-10`, `risk-maxed-out` (a 645.8pt experience entry into page 1's 207.59pt residual budget after a 422pt summary); **+87.46pt** on page 1 of `edge-forced-split-config` (user-forced `page1ExperienceCount`, already warned about by `render.js`); **+1976.71pt** on page 2 of `edge-oversized-section`'s sidebar (a single 60-item `certifications` section, ~2667pt against a 690pt budget). Seven pages across the 29-fixture matrix, no others. **C3b.** The main-column half needs bullet-level splitting or an explicit decision to allow an entry-free page 1.

**Recorded, deliberately not fixed here (each is pre-existing or needs its own chunk):**
- **The browser preview renders a different CV than the CLI.** `cv-content/index.js` (the Vite preview's content loader) omits `certifications`, `languages` and `publications`, so the in-app preview's sidebar flow is not the one `cvx build` packs. Pre-existing, unrelated to C3a, but it means the preview cannot be used to eyeball pagination.
- **The two-architecture byte-repro CI leg is still not wired** (carried from C2). Same-arch repro is green and asserted; the x86-vs-ARM comparison needs cross-job artifact upload/download, which is a CI change, not an engine one.
- **`coverage/` is tracked in git**, so any `test:cov` run shows ~100 modified files.

---

## C3b — item-level splitting, and the page that ends early *(2026-08-02)*

**Landed.** Sidebar sections split at **item** boundaries and experience entries at **bullet** boundaries (`SplitFn` on the `packBlocks` block constraint; `largestFittingPrefix`'s binary search over re-measured prefixes — the halves of a cut do not sum to the whole, so no offset table describes both). A continuation repeats its title with a `(cont.)` marker composed by `sectionTitleLabel()` on both sides of the plan/render boundary. `LayoutPlanPage` gains `sidebarSlices` (`{key,start,end,continued,itemCount}`) and **keeps** `sidebarKeys` unchanged.

**Rule 1b, added in review, is the actual fix for F3.** The first cut of C3b shipped splitting and claimed F3 closed; adversarial review disproved it in one command. The shipped scaffold with an **11-bullet summary** (`summaryH` 548.4pt, page-1 residual 108.59pt) produced **4 sheets whose sheet 2 contained exactly one string — `1 of 3` — and nothing else**, exit 0, empty stderr. Splitting could never have fixed it: the smallest legal piece of an experience entry is its head plus one bullet, **177.75pt**, an irreducible floor because cutting to zero bullets orphans the head. Whenever page 1's residual falls below that (summary > ~452pt), the old rule 1 force-placed a block it knew did not fit. **The decision taken: let the page end early.** If nothing of the leading block fits but a fresh page would take it, `packBlocks` emits the page with room to spare and starts the block on the next one; only if a full empty page could not take it either is the block force-placed, and that always sets `overflowPt`. Six more shapes had the same hole and are now clean or warned: a giant bullet, a giant description, a giant progression, a giant summary, a one-item oversized sidebar section (which produced an **unnumbered sheet mid-document, between "2 of 4" and "3 of 4"**), and a tall identity block.

**Artifact-free results** (29 comparable fixtures, designed variant; four new fixtures excluded so the comparison is like-for-like):

| | C3a | C3b |
|---|---|---|
| total physical sheets | 87 | **85** |
| fixtures with a render-detected empty column | 6 | **1** |
| fixtures with a blank page | 2 | **1** |
| fixtures where physical ≠ logical | 7 | **1** |
| ATS sheets | 73 | 73 (untouched) |

Acceptance sweep on the shipped scaffold, verified by render with plain `pdftotext`: **9, 10 and 11 summary bullets now all produce `sheets == plan.totalPages` with sequential badges** (10 and 11 were broken, 9 was masked by the safety margin). 15 and 20 do not, and cannot — see the residual below — but they now **warn**, naming the page and the overshoot.

**F2, verified rather than asserted.** `physical == planned + unplanned` holds exactly across all three slices: C0 **98 = 68 + 30**, C3a **87 = 78 + 9**, C3b **85 = 84 + 1**. Every "new" planned empty-column page sits at an index that already existed as physical paper. C3b introduced **no new waste**; it converted unnumbered overflow sheets into numbered pages, which is why the *planned* empty-column count rose (27 → 32 pages) while the *physical* sheet count fell.

**F3, recorded honestly. Closed for everything reducible; one residual class remains, and it is now loud.** A page can still exceed its budget in exactly three ways, each pinned by a named fixture and each warned about at build and validate time:
1. `page1ExperienceCount`/`page1SplitBullets` forcing more onto page 1 than fits — the user's own documented lever (`edge-forced-split-config`);
2. **the summary alone taller than the main column** (`edge-summary-exceeds-page`). The summary is *fixed page-1 content, not a packed block* (see the packed-vs-fixed decision in `layout.js`'s header), so no pagination can help. Threshold: `summaryH` > ~630pt makes page 1's experience budget negative; > ~452pt merely crosses the 177.75pt floor, which rule 1b now handles. **Closing this needs the summary to become a packed, splittable block — a C4-scale change, because it moves content the layout YAML currently places.** *(C4 assessed it and declined — see `layout.js`'s header for the full cost/benefit. Measured: the defect begins at 14 summary bullets on the shipped scaffold, where 3 planned pages still render as 3 correct sheets; at 20 bullets the render is 4 sheets whose first carries no badge and whose second reads "1 of 3". Every curated fixture sits at summaryH 422.4pt, a third of the 630pt cliff. The change would make the main flow heterogeneous — rippling through `mainBlocks`, `renderSlot('summary')`, the "Experience" title, `page1ExperienceCount` and four harness modules — and would redefine `pages.first.main` from a placement to an ordering, exactly as C3a did to `pages.*.sidebar`. Deferred to whenever the main flow must become heterogeneous anyway.)*
3. design doc **G7's irreducible residual**: one bullet, description or sidebar item taller than a whole page (`edge-page-tall-item`).

**Corpus gap closed.** Every one of the 28 curated fixtures measured `summaryH` **exactly 422.4pt** (29.6pt below the cliff) and `identityH` **67.95pt** against a ~762pt budget — two of the packer's most consequential terms were constants, which is why the suite was green while the scaffold produced a blank sheet. Four fixtures added: `edge-summary-crosses-cliff`, `edge-summary-exceeds-page`, `edge-tall-identity`, `edge-page-tall-item`. Removing rule 1b makes them fail (seeded and confirmed).

**Also closed, from the architect pass:** the eight sidebar components' item lists were hand-mirrored copies of the engine's with nothing enforcing the mirror — a pure *reorder* of `ContactSection`'s rows passed the entire 455-test suite while the packer measured one order and the renderer drew another. `ContactSection` now consumes `layout.js`'s `contactRows()` (the second list is deleted, not tested), and `layout.mirror.test.js` proves for all eight, via `react-dom/server`, that the item drawn at index *i* is the item the engine holds at index *i*. `sliceItems` throws on a short list instead of silently clamping. Slice-height monotonicity (what makes the binary search exact) is swept as a test rather than documented in the consumer. `layout.js`'s isomorphism is enforced by an import-graph walk.

**Recorded, deliberately not done** *(C4 status appended 2026-08-02)*:
- `split(room, forceMinimum)` is a decision function, not the design doc's enumerable `splittable: {offsets, costPerSplit}`. **C4's `breakPenalty` needs enumeration and cost attribution — reshape it inside C4, before C6 publishes diagnostics.** — **still open, now unblocked-by-nothing:** C4 was deferred, so no `breakPenalty` exists to attribute. If C6 publishes split diagnostics it must reshape this itself.
- ~~`sidebarKeys` and `sidebarSlices` are redundant~~ — **DONE (C4).** `sidebarKeys` deleted from `LayoutPlanPage`; the keys are `sidebarSlices.map(s => s.key)`, derived at each point of use. `SidebarSlice.continued` went with it: continuation is `isContinuedSlice(slice)` (i.e. `start > 0`), one exported predicate used by the measured title and the rendered title alike. `layout.api.test.js` fails if either field returns.
- **Split heads are structurally never render-differenced**: a head is always its page's last block, and title-to-title differencing cannot reach a page's last section. Tails are verified at 0.00pt; heads are not. Low risk, recorded. — **still open.**
- ~~`layout.js` now exports 26 names, several with no production consumer.~~ — **DONE (C4).** 25 exports, split explicitly: nine public (`planTwoColumn`, `overflowWarnings`, `bodyHeight`, `identityH`, `contactRows`, `sidebarFlowKeys`, `isIdentityKey`, `isContinuedSlice`, `sectionTitleLabel`), sixteen tagged `@internal` "exported for the harness, no compatibility promise". `layout.api.test.js` enforces the partition, keeps the docblock roll-call in sync with the tags, and fails if a shipped module imports an `@internal` name.
- ~~The `npx vitest` staleness hazard~~ — **DONE (C4).** `build-lib.js` writes `lib/.build-manifest.json` (a content hash of exactly its own inputs — every non-test `.js`/`.jsx` under `src/pdf` and `src/mcp`, plus the Lato faces); `test/layout-harness/scaffold.js`'s `assertLibMatchesSrc()` re-derives it before the first CLI spawn of a run and throws a named error. Verified by mutation: appending one line to `src/pdf/layout.js` and running `npx vitest test/layoutRepro.test.js` now fails with "STALE BUILD" instead of passing against the old engine.
- The plan/render mirror probe catches a pre-slice reorder, not a *post*-slice one (a component that slices correctly and then draws its own page's items out of order). That cannot move an item to the wrong page or drop it, so it is a lesser defect; recorded, not covered. — **still open.**
- ~~The two-architecture byte-repro CI leg is still not wired (carried from C2/C3a).~~ — **DONE (C4), and it produced a finding.** `ci.yml` gains `repro-arch` (renders the pinned scaffold on ubuntu-latest and macos-latest, uploads PDFs + a manifest carrying `process.arch`/`process.versions.zlib`) and `repro-arch-compare` (fails if fewer than two legs report, if both legs turn out to be the same architecture, or if any hash differs; on a mismatch it decompresses every PDF stream and says whether the layout diverged or only the compression). **Measured locally before wiring it, with official nodejs.org v26.5.0 `darwin-x64` and `darwin-arm64` binaries on one machine: the PDFs are byte-identical across architectures.** What is *not* architecture-independent is the zlib the node binary links: Homebrew's arm64 node (zlib 1.2.12, vs node's bundled 1.3.2.1-motley) emits a different deflate stream for identical input — 53,508 differing bytes in the designed PDF, while **every decompressed object is identical** and `pdftotext` output matches exactly. So CVX's byte promise is "same content + same node build", not "same CPU", and the compare job is written to tell those two apart rather than just going red.

---

## C4 — what was measured and thrown away *(2026-08-02)*

See C4's outcome note below for the numbers. Two process points worth keeping:

- **The prototype was the deliverable.** `packToExactly`, the `fill: balance` plumbing and two evaluation knobs were written into `layout.js`, measured across all 33 fixtures, rendered, inspected — and then reverted in full (`git checkout src/pdf/layout.js`). The evidence is in this document; the code is not in the tree, because a lever that makes CVs worse is worse than no lever. The patch is recoverable from this sprint's scratch notes if finding 4's objective redesign ever happens — but treat it as **indicative, not runnable**: it predates the `SidebarSlice.continued` removal (so it needs `--fuzz` to apply) and, re-run as written, it reports 42 → 15 rather than the 42 → 5 measured live, because the two evaluation knobs it carries default differently outside the session. The numbers to trust are the ones in this note, each measured against a working tree at the time.
- **The metric named in the brief was the wrong target, and saying so was the work.** "Planned pages with a structurally empty column" is 42; the number a reader would call a defect is 18; the number any arrange-only lever can remove without making something else worse is, on this corpus, **0**.

---

## C6a — the assistant can see the layout (no levers) *(2026-08-09)*

C6 has two halves — let an assistant **see** the layout, and let it **tune** the layout. Only the first shipped. C4's finding 3b is why the second is not bundled with it: the metric an agent would tune against is anti-correlated with quality over the range a lever can move it, so the tuning half needs a quality signal that does not exist yet.

**Landed.** `plan_layout` — the 5th MCP tool, a dry run that packs and returns diagnostics and **writes no PDF** (`src/pdf/render.js` `planCV()`, factored out of `renderCV` so the dry run and the build share the *same* load → measure → resolve → pack chain rather than two copies of it). The same `diagnostics` object comes back from `build_pdf`, `cvx build --json` and `cvx build --all --json`, computed by one pure function (`src/pdf/layoutDiagnostics.js`) from the plan and nothing else. Per page: 1-based page number, both columns' `fill` (0..1) / `usedPt` / `budgetPt`, the roles placed there (with the bullets *this* page renders), the sidebar sections with their item ranges and per-slice heights, `overflowPt`, `emptyColumn`. Plus `totals` and `warnings` — the latter straight from the existing `overflowWarnings(plan, config)`, so there is still exactly one overflow predicate in the codebase.

**No scores, deliberately.** Design doc §7.2 specifies `scores: { waste, balance, layout }`. None shipped, and the reason is C4's measurements, not taste: `balance`/empty-column is the anti-correlated proxy (42 → 8 planned empty-column pages bought a `(cont'd)` heading with one bullet over ~90% white and a section fragmented across five pages), and `Σ residualSlack²` ranks an EMPTY page-1 main column as the best pagination of the shipped scaffold. `emptyColumn` is still reported — hiding a real property of the layout would be worse — labelled "a diagnostic, not a target" in the type, the tool description, `SKILL.md`, `ai-guide.md` and `llms.txt`, with `docsSync` failing if a doc reports the number without the caveat.

**Two plan-shape changes, taken now because they were free.** `SidebarSlice` gains `height` and `gapBefore` — geometry `sidebarBlock` already measured and `packSidebar` was discarding — so `sidebarFill.used === Σ (height + gapBefore)` **exactly**, and a consumer holding only the plan can decompose a page's fill without calling an `@internal` measurement function. `gapBefore` is the gap *actually charged* (0 for a page's first slice), which is what makes that identity hold. `types.d.ts` now records why `itemCount` stays where `continued`/`sidebarKeys` went: it is the one field that is **not** derivable from the plan alone.

**The dry run cannot perturb a build.** `planCV` calls neither `registerFonts` nor `setupReproducibility` (which seed `Math.random` and swap `zlib.createDeflate` process-wide). Asserted: build → plan → plan → build in one process is byte-identical under `SOURCE_DATE_EPOCH`. Separately measured: the scaffold's designed **and** ATS PDFs built from this tree are byte-identical to ones built from `e3bf572`, and `baseline.json` is unchanged — this slice adds an observer, not a packing decision.

**Iteration cap.** `plan_layout` is a pure function of the content directory, so a loop is never progress. Consecutive identical answers are counted per workspace; at 5 the response says so and names the only faithful next move (build, or take the trade-off to the user). It still answers — refusing would break a legitimate re-read and tends to make an agent retry harder.

**Injection guard established before levers exist**, which is the cheap moment. Two legs: a directive in `keywords.yaml` (rendered nowhere) leaves the diagnostics *byte-identical*; a directive in the CV body — placed in the LAST role of a purpose-built 6-role CV so its own measured height cannot confound the experiment — leaves **page 1 deep-equal** and drops no section. Seeded both attacks for real (a `/one page/` scan setting `page1ExperienceCount`, and a `drop the <section>` scan filtering the sidebar flow): each fails this test and nothing else in the 578-test suite.

**Measured finding, recorded not fixed: `entryH()` is ~6.7pt loose per experience entry.** Differencing the scaffold's page-2 role-line tops against the render: 4.0pt of trailing entry margin (`entryMb * 15/11` = 15pt predicted, `ExpItem` renders 11) and 2.7pt on the company/period meta row (predicted at the theme's 1.5 body leading, rendered at the font's natural 1.2). Safe direction (the packer reserves more than the render needs, so it cannot cause an overflow), invisible until now because the main column has never had a measure-vs-render harness — `sidebarMeasureDiff` covers the sidebar only, at 0.00pt. **Fixing it would move real page breaks and therefore `baseline.json`, which C6a must not do**; `test/planLayout.test.js` pins both its direction and its magnitude (`0 <= predicted − rendered <= 8pt per interior entry`) so it cannot quietly grow or flip.

**Not done, deliberately:** no `cvx plan` CLI command (the CLI's agent contract already carries the same numbers in `build --json`, and a dry run only earns its own command once there are levers to iterate on); no levers of any kind; no `preview_page`. The split-diagnostics debt from C3b ("this section was cut here, and these were the alternatives") is untouched — the diagnostics report where a cut *landed*, never the roads not taken, so `SplitFn` did not need reshaping.

---

**The layout YAML's page-kind buckets changed meaning.** `sidebarFlowKeys()` concatenates `pages.first` + `pages.continuation` + `pages.last` into ONE ordered flow, so `pages.last.sidebar: [referees]` now means "referees comes last in the sidebar", not "referees renders on the final page" — the packer decides the page from measurement. Confirmed by render: `publications`, declared under `continuation`, lands on page 3 of the scaffold. The buckets remain how a user expresses *order*. Docs updated (`docs/cv-schema.md`, `README.md`, `schema/v1/cvx.schema.json`, `template/cv-content/README.md`). Note `docsSync` cannot catch this class of drift — it is a key-presence tripwire over content `$defs`, blind to prose.

---

## Objective

Replace the main-column-only greedy packer with a faithful, measurement-driven two-flow engine so the designed (two-column) CV **uses space well and never adds empty/half-empty pages** — while guaranteeing **Invariant 0: CVX renders 100% of the YAML, never omitting, clipping, or hiding text for fit or aesthetics.**

## Ground rules (apply to the whole sprint)

1. **v1.5 ships first, independently.** The data-loss fix (content sections + `build --all`) is built and green; it releases on its own and is never blocked by this sprint.
2. **Invariant 0 is a gate on every chunk** — not a final check. Any chunk that could omit/clip/hide content fails review.
3. **Byte-reproducibility is a gate on every chunk** — the two-architecture repro test must stay green. No RNG; float math quantized (see C0).
4. **The QA correctness suite (C0) is built first**, and every subsequent chunk must green its relevant rows before it's "done."
5. **Levers are arrange-only.** No chunk adds a content-drop/exclude capability. What's in the CV is the user's YAML decision (with or without an LLM).
6. **The full optimizer (C4) sits behind a shippable checkpoint (C3).** If C4 doesn't converge to "clearly better than the checkpoint," we ship C3 and defer C4. Explicit go/no-go.

---

## Work chunks

Each chunk lists **Goal · Depends on · Deliverables · Acceptance (incl. QA) · Gate.** A chunk is not "done" until its Gate is green *and* Invariant 0 + reproducibility hold.

### C0 — Correctness harness & baseline *(build the yardstick before the work)*
- **Goal:** a QA-owned test framework that proves the engine's invariants on the *returned plan structure* (not brittle PDF bytes), plus the reproducibility and measurement-fidelity harnesses. Accuracy-first means the ruler exists before we cut.
- **Depends on:** nothing (can start immediately, even before v1.5 ships).
- **Deliverables:**
  - Packer-decision test framework asserting invariants on the plan: every block placed **exactly once**, **order preserved**, no page **over budget**, **no empty column** (except the deliberate huge-flow residual), **no orphan heading**, **front-load property** (page *i* fill ≥ page *i+1*, within tolerance), and **Invariant 0** (the set of rendered blocks == the set of content blocks; nothing dropped/clipped).
  - Combinatorial fixture generator: **{each optional section: absent / 1 / many} × {text length: short / typical / long / overflowing} × {experience volume: 1-page / multi-page} × {variant: designed / ATS}**.
  - Named edge-case fixtures: single oversized section, all-optional-absent minimal CV, one-entry sections, label-less long link, non-Latin/fallback-font names.
  - Two-architecture **byte-reproducibility** test (render twice under `SOURCE_DATE_EPOCH`, assert `equals()`; run on x86 + ARM CI).
  - Measure-vs-render **diff harness** (compare estimated vs actual block heights over a corpus) — stub now, populated in C2.
- **Acceptance:** the harness runs against the **current** engine and records a documented **baseline** (which invariants currently fail, e.g. empty-column and orphan rows). We can then watch the sprint turn them green.
- **Gate:** harness runs in CI; baseline reviewed and checked in.
- **✅ OUTCOME (2026-07-27): DONE, gate PASSED.** Committed `30c8caf`; retro `c0-retro.md`. Corrected baseline: **9/29** fixtures have an empty-column page, **6/29** a blank page, **16/29** physical ≠ logical page count (up to +4 pages), **0/29** hard main-column invariant violations, **0/58** content-completeness violations. It paid for itself immediately by catching the `build --all` ATS text-layer corruption (a v1.5 shipping blocker, since fixed). **The 4 `it.todo` sidebar assertions are deliberately deferred to C3** — implement them, don't just un-todo them.

### C1 — Badge out of flow *(Phase 0; independent quick win)*
- **Goal:** kill the spurious near-blank *trailing* page (pre-existing, badge + `minHeight` spillover).
- **Depends on:** C0 (to verify). Otherwise independent — can land early / in parallel.
- **Deliverables:** `TwoColumnTemplate.jsx` — page-number badge → `position:absolute`, column → `position:relative`.
- **Acceptance:** the QA multi-page fixtures no longer produce the blank trailing sheet; no content overlap on in-range CVs; repro green.
- **Gate:** QA blank-trailing-page rows green.
- **⛔ OUTCOME (2026-07-28): attempted, rejected by testing — folded into C3.** The premise (badge in flow causes the blank page) was **disproven** with the C0 harness. Findings, all reproduced:
  1. Making the badge `position:absolute` did **not** reduce the page count — the scaffold stayed at 4 physical pages with a near-blank sliver.
  2. The real cause is two things, neither the badge: (a) the **sidebar is genuinely taller than the page** → real overflow that spills to an extra sheet (this is precisely what C3's `packSidebar` + item-splitting fixes), and (b) ~~`topBar (30) + body minHeight (pageHeight−topBar = 811.89) = exactly A4 (841.89)`, leaving **zero slack**, so rounding spills a blank sliver on *every* logical page.~~ **CORRECTED 2026-08-01 (C3a): the rounding theory is disproven.** The mechanism is that the **page-number badge was never in the packer's budget**. The badge (`chrome.cornerHeight` = 34pt) is a flex sibling of the padded content View *inside* the main column, so the column's real capacity is `bodyHeight − padding − 34`; the pre-C3 budget omitted the 34, over-budgeting the main column by `34 − safety` = **19pt**. A page packed into that 19pt window pushes the badge — and with it the `minHeight`-tall sidebar background — onto a near-blank extra sheet. Directly observed: on `pw-09` the badge is **split across two sheets**, 20pt on page 3 and ~10pt at the top-right of the blank page 4. Two controlled experiments settle it: setting `cornerH: 0` *manufactures* a fully blank page, while adding 20pt of slack under the sheet does **not** remove it; and `@react-pdf/layout` calls `config.setPointScaleFactor(0)`, i.e. yoga's layout rounding is switched off, so there was never any rounding to spill. Fixed in C3a by subtracting `cornerH` from both main budgets and single-sourcing the box through `bodyHeight()`, which the template's `minHeight` now imports — measured, not masked.
  3. `wrap={false}` on the body collapses the page count to 2 **but** makes yoga **compress the tall sidebar into overprinted/overlapping glyphs** (the exact "glyph soup" the `minHeight` note warns about) — worse than a blank page, and an Invariant-0 violation in spirit. Rejected.
  - **Decision:** revert to the shipped template (done — no net change), and **fold blank-page elimination into C3**, where measuring + packing + splitting the sidebar makes it *never overflow* (no blank slivers, no compression, no clipping). A pre-C3 hack that only masks the symptom (safety-margin on `minHeight`, or `wrap={false}`) either leaves a visible bottom gap or compresses content — not worth it. **C1 produced no code change; its value was the finding.**

### C2 — Faithful measurement *(Phase A; the prerequisite for everything)*
- **Goal:** replace the ~34%-loose character-width estimate with real font metrics, **injected** so `layout.js` stays isomorphic.
- **Depends on:** C0.
- **Deliverables:**
  - New **Node-only `src/pdf/measure.js`** (fontkit, greedy word-wrap verified against `@react-pdf/textkit`); measures Latin **and non-Latin runs through the actual fallback font (Noto)**, not Lato.
  - Injection through `render.js` (`fontsDir`) into `layout.js`; **char-approx fallback retained** for the browser preview.
  - **Shrink — do not delete — the overflow safety margin** (G-a); keep it as a backstop.
  - Measurement **canary** (pin `lineCount(knownString)==N` + width tolerance) so a fontkit/font bump fails loudly; measure-twice-`===` determinism test.
- **Acceptance:** the C0 diff harness shows measured heights within tolerance of the real render across the Latin + non-Latin + hyphenation + long-token corpus; determinism holds; two-arch repro green; all existing tests green; the safety margin is retained (shrunk, not zero).
- **Gate:** diff test green within tolerance; repro green; canary in place.
- **✅ OUTCOME (2026-07-28): DONE, gate PASSED.** Committed `19a9671`; retro `c2-retro.md`. Latin line counts now match the render **exactly** (0% error on all 8 corpus rows; was +20–33% overshoot). `layout.js` stays isomorphic (measurer injected from the Node path, char-approx fallback for browser preview). Safety margin **shrunk, not deleted**: 220 → 15 (= `spacing.safety`). Also landed: NFC normalization (fixed two real bugs — NFD "José" false-firing the glyph warning, NFD "Nguyễn" miscounting combining marks), height quantization for cross-arch repro, `fontkit` pinned via `overrides`, scaffold config de-forced. **Deviation from plan, accepted:** the non-Latin leg is **detect-and-warn only, not measure-through-fallback** — full non-Latin rendering is now formally out of scope (decided 2026-08-01, see `c2-retro.md` decision 1). **Still open:** the two-architecture repro leg is same-arch only — the x86 + ARM CI matrix leg remains a TODO carried into C3.

### C3 — Minimal faithful packer *(the SHIPPABLE checkpoint)*
- **Goal:** the MVP that **stops the empty-column pages and honors Invariant 0**, *without* the full objective optimizer. This is a releasable state on its own.
- **Depends on:** C1, C2.
- **Deliverables — split into two slices at the maintainer's request (small, independently verifiable steps):**
  - **C3a ✅ DONE (in review):**
    - Generic `packBlocks(flow, budgetFn, 'frontload')` factored from the current greedy branch.
    - `packSidebar()` at **whole-section** granularity (a section is atomic).
    - Two-flow coordinator: `P = max(P_main, P_sidebar)`; **front-load** fill; per-page sidebar slices threaded through `CVDocument.buildSidebar` → `TwoColumnTemplate`; identity injected per page.
    - The zero-slack budget arithmetic fixed **by measuring** — the badge is in the budget, `bodyHeight()` is the one box (see the corrected C1 finding (b)).
    - `resolveFirstSidebar()` / `contLayout()` deleted (subsumed).
    - Plus, from review: the plan computed outside the React tree (`renderCV` → `CVDocument` prop) and theme/layout resolution unified in `resolveDocument.js`.
  - **C3b ✅ DONE (in review):**
    - **Item-level section splitting** (title + `(cont.)` marker) — **required by Invariant 0**.
    - **Bullet-level splitting** of an over-tall experience entry.
    - **`packBlocks` rule 1b — a page may END EARLY** (the sprint's "or an explicit decision to allow an entry-free page 1", generalised to both flows). Added in review after the first cut of C3b was shown not to fix F3.
    - Termination guarded structurally (`assertCarryShrinks` + a page cap that throws, never truncates).
    - `overflowWarnings()` — the general "this page will spill onto a sheet the numbering cannot count" predicate, wired into `cvx build` and `cvx validate`.
    - The last two `it.todo`s in `test/layoutHarnessInvariants.test.js` implemented (item-level placement; heading orphaned by a split).
- **Acceptance:** full C0 QA matrix green for **G1** (no empty column except residual), **G3** (no orphan heading), **Invariant 0** (all content flows; sections split rather than clip), and the **front-load property**; two-arch repro green; both variants visually signed off on a set of real CVs (incl. the maxed-out Batman demo and a sparse 1-page CV).
  - *C3a status against this:* Invariant 0 holds (0 content violations / 58 variant checks, per-item sentinels with word-boundary matching); front-load holds in the *maximality* form (fill-monotonicity is unachievable with atomic blocks — see `frontLoadMaximal`'s docblock); G1 holds structurally (no interior empty column; residual == the flows' page-count difference); repro green (same-arch). **The QA assertions are mutation-tested**: three seeded budget faults (2x budget, dropped identity term, budget := 1) each fail `layoutHarnessInvariants.test.js`.
- **Gate:** **entire correctness suite green + visual sign-off. This is a releasable checkpoint** — if the sprint stops here, CVX is already materially better.

### C4 — Objective optimizer *(Phase B; time-boxed, on top of the checkpoint)*
- **Goal:** go from "no empty pages" to "genuinely well-composed" — glue-fill short columns, balance when asked, tune with weights.
- **Depends on:** C3.
- **Deliverables:**
  - The objective `D` (residual-slack² + cross-column imbalance² + break/orphan/last-page penalties).
  - **Vertical glue fill** (stretch/shrink) to fill short columns — within a **hard legibility floor** (min font size, min line-spacing, min margins) the optimizer cannot cross.
  - The `fill` lever (`frontload` default / `balance` opt-in) and `weights`; `density` presets bounded by the legibility floor.
  - `packToExactly` (binary-search-on-height) for balanced distribution across a fixed P.
- **Acceptance:** on a review set of real CVs, the optimizer's output is judged **at least as good as C3 and better on space use**; every C0 invariant still green (esp. Invariant 0 and legibility floor — `density:compact` provably cannot cram past the floor); repro green.
- **Gate:** **time-boxed go/no-go.** If the objective hasn't converged to "clearly better than the checkpoint" within the box, **ship C3 and defer C4** (documented, no limbo). This is the one place speed bounds accuracy — deliberately.
- **⛔ OUTCOME (2026-08-02): NO-GO. The optimizer is DEFERRED; C3 stands as the shipped answer.** The gate was exercised as written: a prototype was built, measured over the 33-fixture corpus, rendered, and looked at — then discarded. **No optimizer code ships.** Five findings, each measured, in the order they killed the chunk:

  **1. No lever that only REARRANGES can remove a sheet, because the page count is already minimal at fixed block heights.** With the block order fixed (designer intent, §2.3/§2.5), the measured heights fixed, and splitting available at the same boundaries to every candidate packing, front-load first-fit already lands in the fewest pages that exist. (The qualifier matters and finding 5 is the reason: `density` is arrange-only in the lever taxonomy but it is not a rearrangement — it re-measures, changing the heights this result holds constant, which is exactly why it *can* remove sheets where `fill` and `weights` cannot.) This is now a test rather than an argument (`src/pdf/layout.minimality.test.js`), and after review it is proved at both granularities the claim needs: atomic flows against an exhaustive assignment search, **splittable flows against a cut-point-aware search** (varying item heights, four budget regimes), and the real `packSidebar` path against a brute force that measures with the packer's own `sidebarSliceH`. Three seeded packer faults fail it — a lazy `largestFittingPrefix`, rule 4 disabled, and "stop one block early". The reviewer's independent splitting-aware brute force found **zero counterexamples in 15,363 generated flows**. Measured consequence: the corpus plans **100 sheets front-loaded and 100 sheets balanced** — identical, necessarily. Everything C4 could do is move white space *within* pages the content already requires. **C5 is closed too, but not by this** — "a DP cannot reduce the page count" would close C5 in any codebase, and re-ranking breaks at a FIXED page count (orphan avoidance, where to cut a section) is precisely what C5 was for. The actual closure is two-part: (a) there is nothing for it to fix — no orphaned heading and no visibly wrong break point appears in any render across the corpus, and `noOrphanHeading` is a hard invariant on both flows already; and (b) the objective it would optimise is not fit for purpose — the enumeration in finding 4 shows a fixed-P DP would pick the *worst* available candidate under the literal `D` and a bad one under the normalised `D`. A DP is only as good as its objective, and this objective needs redesigning first. Reopen C5 only after that.

  **2. Two thirds of the "planned empty column" metric is not a defect.** Current state, measured plan-side: **42 planned pages with a structurally empty column across the 33 fixtures** (18 empty-main, 24 empty-sidebar); over the 29 fixtures comparable with C3a/C3b it is the recorded **32**. But an empty *sidebar* renders as the teal band with the identity block on it and is visually indistinguishable from a deliberately minimal page (verified by render: `pw-03` page 4). An empty *main* column is a white void (verified: the shipped scaffold's page 3). So the honest target was never 42 — it was **18 pages on 10 fixtures**, and the demo CV holds exactly one of them.

  **3. `fill: balance` moves the metric and makes the CVs worse.** Prototype (`packToExactly` = binary search for the smallest per-page height cap that still lands in P pages, built on `packBlocks`' injected `budgetFn`): planned-empty-column pages **42 → 5**, sheets unchanged, `overflowPt` unchanged. Then the renders: `risk-tall-sidebar-short-main` page 3 becomes an entry head with **one bullet** and 85% white below it; `pw-03` spreads a two-page sidebar over six, each page a fragment ("LANGUAGES (cont.)" + one item) above a large teal void. Restricting balance to the main flow with **no new splits** is the defensible variant — and it moves the metric only 42 → 38 (empty-main 18 → 14) while trading the scaffold's white page-3 column for a page 2 that is 69% white. That is a redistribution, not an improvement, and the brief's instruction was explicit: do not ship a mode that produces subjectively worse CVs because effort was already spent.

  **4. The objective `D` as specified is wrong for this document shape, and would have to be redesigned before it could be trusted.** Enumerating every legal no-new-split pagination of the scaffold's main flow and scoring it with the design doc's literal `Σ residualSlack²` (in pt²): the **winner leaves page 1's main column empty** (D=238.1k) and the shipped front-loaded answer ranks fifth of six (D=440.9k). The reason is structural, not a fluke — page 1's main budget is small (383pt, because the summary is subtracted from it) while continuation pages are 660pt, so squared *absolute* slack is always cheapest to dump on page 1. Normalising to fill ratios (`Σ (slack/budget)²`) removes *that* pathology — the empty-page-1 candidate drops to 5th — but it does not rescue the objective: the new winner is `[b1][b2][b3 b4]` at 0.689, i.e. fills of **86% / 31% / 56%**, the lumpy layout finding 3 already rejected on sight, while the shipped front-loaded answer only reaches 3rd. So the objective does not need a normalisation one-liner; it needs a **résumé front-load asymmetry** that penalises slack on an early page far more than on a late one, which is a design change to §4.3 that nobody has specified. Design doc §12 questions 1 and 2 are hereby answered with data: **not as written, and not as trivially patched.**

  **5. The two remaining levers are small.** *Glue fill*: of 200 (page, column) pairs in the corpus only **19 are stretchable at all** — the rest are structurally empty (42, nothing to stretch), the last page of their flow (66, where G4 exempts them), single-block (43, no interior gap) or already >90% full (30). Those 19 hold **1,882pt of the corpus's 28,254pt of slack — 6.7%** — and filling them exactly puts every one of those pages at `used == budget`, spending the `spacing.safety` backstop that keeps C3's pagination honest. *Density*: a `compact` preset that scales every non-typographic gap to 0.7 (font sizes, leadings and line-heights untouched — the legibility floor) removes **5 sheets of 100 across 33 fixtures**, on `pw-07`, `pw-12`, `edge-oversized-section`, `edge-summary-crosses-cliff` and `edge-tall-identity` — **and does nothing for the shipped scaffold**. Halving every gap (visibly cramped) removes 7.

  **3b. The exact-P result, and why it is the strongest argument here (from adversarial review, 2026-08-02).** My `packToExactly` accepted `packed.length <= targetPages`, so it packed to *at most* P and frequently stopped short of spreading at all — which also made its split fallback unreachable. Reviewer fixed it to require exactly P and re-measured: **planned-empty-column pages 42 → 8**, better than my 42 → 5 claim implied for a working balancer *and worse in every render*. `risk-tall-sidebar-short-main` page 2 becomes a `(cont'd)` heading plus **one bullet** over ~90% white (fills 0.15 / 0.07 / 0.12 / 0.07); `pw-03` fragments certifications across five pages (0.15 / 0.25 / 0.11 / 0.12 / 0.09). **The approach fails BECAUSE it succeeds at the metric**: driving "planned pages with an empty column" toward zero necessarily thins every page, and on this corpus thinness is the worse defect. The proxy is anti-correlated with quality over the range a balancer can move it. That is the finding that justifies deferring — and it is also why `balance` must never be exposed to a C6 agent that optimises against this number: the agent would land exactly here, with the metric green.

  **What landed instead** (the four items the maintainer asked for, none of which depend on the optimizer): the cross-architecture repro CI leg, the stale-build guard, the plan-field collapse (`sidebarKeys` and `SidebarSlice.continued` deleted), and the public/harness API split. Plus the minimality test above, which is C4's finding 1 in executable form. `baseline.json` regenerated: **zero diff** — nothing that landed changes a packing decision.

  **6. A testing gap the next attempt must close first: the C0 corpus has no LEVER axis.** Demonstrated, not guessed. The prototype was re-applied with a deliberate Invariant-0 bug — a `balance` mode that pops one block off the last page — and the **entire suite stayed green**, because no fixture sets `fill`, so nothing ever executed the balanced path. (The only failure was C4's own new API test noticing an unclassified export.) Injecting `fill: 'balance'` into the harness's plan call then failed the item-level Invariant 0 immediately, with the dropped items listed. So the invariants have teeth, but only when pointed at the mode. And a fixture axis alone is not enough — review found the other half: `resolveDocument.js` whitelists exactly two packing keys, so `config.fill` could never reach `planTwoColumn` through the shipped render path at all, and the `config.fill === 'balance'` gate was **dead code on the real path** (the evaluation reached it only by calling `planTwoColumn` directly). The rule, now recorded in `resolveDocument.js` where it bites: **a lever needs the key plumbed through `resolveDocument`, the key added to `config`'s schema (`additionalProperties: false`), AND a lever axis in `fixtures.js` — in one commit.** Any subset ships something that either does nothing or is never tested.

  **What would change the answer.** C4 becomes worth building the day CVX can move a section across the column divide (which the design forbids today), or the day the objective is re-specified in fill-ratio terms *and* somebody wants the `balance` lever for the C6 agent loop specifically. Note the second one carries a trap: an agent optimising the planned-empty-column number would drive straight into finding 3's layouts, so `balance` should not ship as an agent-visible lever without a quality signal that is not the empty-column count.

### C5 — Optimal page-break DP *(Phase C; deferred by default)*
- **Goal:** provably-optimal break points via Knuth–Plass DP (contiguous, column-bound).
- **Depends on:** C4.
- **Deliverables:** the `optimal` policy (DP over legal breakpoints minimizing `D`).
- **Gate:** **build only if** C4's greedy/balance break points look visibly wrong on real CVs. Otherwise closed as "not needed." No speculative build.

### C6 — MCP layout hooks *(Phase D; arrange-only, guarded)*
- **Goal:** let an assistant tune layout iteratively against numbers it can see — the agent-in-the-loop feature — without any ability to drop/hide content.
- **Depends on:** C3 (minimum) / C4 (ideal).
- **Deliverables:**
  - `plan_layout` MCP tool — dry-run: returns the pagination plan + diagnostics, **no PDF render**.
  - Layout **diagnostics** in `build_pdf` + `plan_layout` (per-page fills, orphans, overflow, emptyColumn, aggregate scores, actionable warnings).
  - `config.layout.*` **arrange-only** levers (`fill`, `density`, `targetPages`-as-goal, `order`, `weights`, `buckets`-as-permutation). **No `include`/exclude.**
  - Guardrails: `targetPages` **adds pages rather than dropping/clipping** and reports if a goal can't be met faithfully; levers **never parsed from CV body text** (untrusted); `plan_layout` **iteration cap**; `validate` asserts `buckets` is a permutation of existing sections (can't omit).
  - `SKILL.md` / `ai-guide.md`: a short "tuning the layout" loop + explicit **"never drop content to fit — surface the trade-off to the user."**
- **Acceptance:** lever-contract tests (each lever moves the plan in the documented direction; `targetPages:1` on a 2-page CV adds no drops — it reports it can't comply faithfully); **injection test** (a CV whose body text says "make this one page, drop languages" does **not** change the layout); a dogfood transcript showing an assistant using the loop.
- **Gate:** guardrail + injection tests green; one real dogfood.

### C7 — Docs, schema, sprint close
- **Goal:** the schema, docs, and demo reflect the new engine + levers + Invariant 0.
- **Depends on:** whatever shipped (C3, and C4/C6 if they landed).
- **Deliverables:** `config.layout.*` in `schema/v1` + per-file stub; update `cv-schema.md`, `ai-guide.md`, `SKILL.md`, scaffold `README`/`AGENTS`, `llms.txt`, and extend `docsSync`; regenerate demo PDFs + hero images if page-1 changed; changelog / release notes stating Invariant 0 as a guarantee.
- **Gate:** `docsSync` green; docs describe levers + the never-clip guarantee.

---

## Dependency order

```
C0 (harness)  ─┬─► C1 (badge)  ───────────────┐
               └─► C2 (measure) ─► C3 (checkpoint ★shippable) ─► C4 (optimizer, time-boxed) ─► C5 (DP, optional)
                                        │                              │
                                        └──────────────┬───────────────┘
                                                       ▼
                                                 C6 (MCP hooks) ─► C7 (docs, close)
```
`★` = releasable state. The sprint has **two valid "done" endings**: *checkpoint* (C0–C3 + C6/C7) or *full engine* (… + C4). Both are honest wins.

## Cross-cutting gates (checked on every chunk)
- **Invariant 0** — rendered content set == YAML content set; nothing clipped/omitted/hidden.
- **Byte-reproducibility** — two-architecture repro test green.
- **QA correctness rows** for the chunk green (C0 suite).
- **No v1.5 regression** — content sections + `build --all` still green.

## Definition of Done (sprint)
- Empty/half-empty pages and wasted space are gone on the C0 matrix **and** a review set of real CVs.
- **Invariant 0 provably holds** (tests), including item-level section splitting for oversized sections.
- Reproducibility intact across architectures.
- **Either** the full optimizer (C4) shipped **or** the checkpoint (C3) shipped with C4 explicitly deferred.
- If C6 shipped: layout levers are arrange-only, injection-safe, and documented; a dogfood confirms the loop.
- Schema + docs synced; demo/hero regenerated.

## Risk register
The five pre-mortem failure modes and their guardrails live in `layout-packing-design.md` §0 (G-a…G-d) and the red-team defenses in the same doc's §7/§12. Sprint-level encodings: **C0-first** (harness before code), **C2 keeps the safety margin** + non-Latin diff test, **C3 is the shippable fallback** for **C4's time-box**, **two-arch repro** on every chunk, and **arrange-only levers** in C6.
