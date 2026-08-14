> **SUPERSEDED (2026-08-14).** This document was folded into the single source
> of truth, [`ARCHITECTURE.md`](../../ARCHITECTURE.md), and is kept verbatim as
> a historical record. Where this file and ARCHITECTURE.md disagree,
> ARCHITECTURE.md wins — several decisions recorded here were later overturned
> (see its §7.2). Do not update this file.

# C0 retro — layout-engine sprint, chunk 0 (correctness harness)

*2026-07-27. Pipeline run: expert implement → the-fool (adversarial) + architect review → fix pass → test → this retro.*

## Outcome: C0 DONE

A QA-owned correctness harness is in and green (`npm test` = 182 passed, 4 `todo`, 0 vacuous skips), with a baseline-lock that records where the engine stands today and goes red only on regression. It exercises the real engine for packing decisions and main-column invariants, renders the fixture matrix to detect the wasted-space bugs, and now verifies content completeness at the pixel/text level.

## What the process caught (the value of doing it this way)

1. **Two reviews found three false-confidence holes the green suite was hiding**, all now fixed: sidebar content-loss was untested (vacuous), the "nothing dropped" invariants were regenerable booleans, and the empty-column signal couldn't tell *sparse* from *empty* (it had already frozen false positives into the baseline). The architect separately caught that the harness **wouldn't run in CI** (no poppler on most legs) and that the test-land copies of engine internals were a live drift trap — one of the copied constants was changing in the uncommitted v1.5 edit.
2. **The content oracle caught a real, shipping-blocking bug within minutes of existing** → see below. This alone paid for the whole chunk.

## Corrected baseline (after fixing the sparse-vs-empty signal)
| Signal | Before fix | After fix |
|---|---|---|
| Fixtures with an empty-column page | 20/29 (69%) | **9/29 (31%)** |
| Fixtures with a blank page | 6/29 | 6/29 |
| Clean on both | 9/29 | **19/29 (66%)** |
| Hard invariants violated (main) | (was a resettable bool) | **0/29, hard-asserted** |
| Content-completeness violations | (didn't exist) | **0/58** (29×2 variants) |
| Physical ≠ logical page count | 16/29 | 16/29 (up to +4 pages) |

Invariant 0 (no content dropped) holds for the main column across every fixture; the sidebar equivalent is now checked at the **rendered-text** level (not the old vacuous check).

## Findings that change the sprint

1. **🚑 `build --all` silently corrupts the ATS PDF's text layer — v1.5 BLOCKER.** Rendering both variants in one Node process corrupts the *second* render's ToUnicode/text mapping (a `@react-pdf/renderer` font-subsetting state leak). Glyphs rasterize correctly — invisible to the eye — but text extraction (what an ATS reads) is garbled ("First Place" → "ir t Place"). **Independently reproduced** (orchestrator): standalone `build` / `build --ats` are clean; only `build --all` is affected. `build --all` is new in v1.5, and it hits the ATS variant specifically. **Fix:** render each variant in isolation (separate process, as the harness's `scaffold.js buildAll()` already does — proven clean — or reset the font registry between renders). **Do not ship v1.5's `build --all` until fixed.**
2. **No fallback font is registered for non-Latin scripts — C2 must fix, not just measure.** Lato has no Sinhala/Tamil/Devanagari glyphs and there's no fallback, so those names render as ~1 near-invisible line and the estimator is qualitatively wrong. This is a rendering failure, not a measurement approximation — and it lands on the i18n audience the site courted. Elevate in C2.
3. **Mirror → export (single source of truth) done early.** The drift trap is closed now: `layout.js` exports `deriveMetrics/lineCount/entryH/summaryH`, `CVDocument.jsx` exports `TWO_COLUMN_LAYOUT`, and the harness re-exports them. C2/C3 inherit this cleanly.
4. **Sequencing: C0's baseline is pinned to the uncommitted v1.5 engine.** Commit/ship v1.5 (after the `build --all` fix) **before** finalizing/committing C0, then regenerate `baseline.json` against the final engine. C0 and v1.5 are entangled through the shared engine state.

## Process learnings
- **QA-harness-first (C0 before any engine change) worked exactly as intended** — it turned "the CV looks off sometimes" into 29 reproducible, asserted facts and caught a real shipping bug. Keep this ordering for the sprint.
- **Independently verify agent findings — including the orchestrator's own.** The build-all corruption was first reported by the implementer; the orchestrator's initial "repro" appeared to *contradict* it — but that was a testing error (built in temp dirs without `cvx init`, with stderr suppressed, so builds silently failed with exit 3 and empty PDFs were diffed as "identical"). Re-run with exit codes checked, it confirmed the bug. Lesson: **never suppress stderr on a verification build; always assert exit code and non-empty output before drawing a conclusion.**
- **The adversary + architect pairing is complementary**, not redundant: the adversary found the content/false-confidence holes; the architect found the CI-won't-run and drift-trap structural issues. Run both.

## Action items
- [ ] **Fix `build --all` variant isolation (v1.5 blocker)** — `bin/cvx.js buildAll()`.
- [ ] Commit v1.5 (post-fix), then regenerate C0 `baseline.json` and commit C0.
- [ ] Add poppler to the one canonical CI leg (done in the fix pass; verify on first CI run).
- [ ] C2: register a non-Latin fallback font + measure through it.
- [ ] Carry the 4 `it.todo` sidebar assertions into C3's definition-of-done (implement, don't just un-todo).

## Gate check (from `sprint-layout-engine.md` C0)
- Harness runs in CI: **yes** (guarded; poppler on the canonical leg).
- Baseline reviewed and checked in: **yes** (corrected; pinned-to-v1.5 caveat noted).
- **C0 gate: PASSED.** C1 (badge fix) may proceed — but the higher-priority action is the `build --all` v1.5 blocker.
