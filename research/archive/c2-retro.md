> **SUPERSEDED (2026-08-14).** This document was folded into the single source
> of truth, [`ARCHITECTURE.md`](../../ARCHITECTURE.md), and is kept verbatim as
> a historical record. Where this file and ARCHITECTURE.md disagree,
> ARCHITECTURE.md wins — several decisions recorded here were later overturned
> (see its §7.2). Do not update this file.

# C2 retro — layout-engine sprint, chunk 2 (faithful measurement)

*2026-07-28. Pipeline: expert implement → fool (adversarial) + architect review → fix pass → independent verification → this retro. Committed `19a9671`, pushed.*

## Outcome: C2 DONE

The packer now sizes content with **real fontkit metrics** instead of a character-width guess. Latin line counts match the rendered output **exactly** (was +20–33% overshoot). `layout.js` stays isomorphic (measurer injected from the Node path; char-approx fallback for the browser). `npm test` green: 18 files, 209 passed, 4 todo (174/35-skipped with poppler shadowed — the publish-runner case).

## The correction that matters most (read this)

A "shipped scaffold clips a bullet" claim propagated through **three** agents — the first C2 report, the architect review, and (built on them) the adversarial review's top finding — and I relayed it to the maintainer as an Invariant-0 violation. **It was a misdiagnosis. There is no text-loss clip.**

I verified directly: rendered the scaffold with the v1.5 forced config and looked at the pages. The at-risk bullet ("…prototype development that underpins critical operational tooling.") renders **complete and visible** at the bottom of page 1. react-pdf's default `wrap:true` **flows** overflow onto extra physical pages — it does not clip. The real symptom is the messy sliver/extra page (the known wasted-space bug → C3). The C0 QA's original conclusion — *"wasted-space bugs, not content-loss bugs"* — was right all along; the later "clip" claims were the aberration.

Consequences recorded: the `TwoColumnTemplate` `minHeight` comment and the overflow **warning message** both say overflow is "clipped," which is **inaccurate** (react-pdf flows) — a misleading-wording follow-up. And the oracle-unblinding fix (below) is still good *defense-in-depth*, but its urgency was overstated: there is no live clip for it to catch (it reports 0 violations across 58 checks, corroborated by the visual).

## Process learning
- **A claim repeated by multiple agents is not verified — they can share one upstream misread.** Only a direct visual render settled it. For any "content is clipped/lost/dropped" claim: render and look; `pdftotext` presence ≠ visible (it extracts glyphs drawn off-page too), and plan-level "placed" ≠ rendered.
- This is the second time this session that a confident agent finding needed first-hand adjudication (the first: my own botched `build --all` repro). The discipline paid off both times.

## Fixes landed (reviews → fix pass)
- **Content oracle unblinded** — now checks every experience bullet + every sidebar item at render level (was roles + last-item only). Good for C3's gate even though no live clip exists.
- **NFC normalization** (`src/pdf/normalizeContent.js`, isomorphic, wired into CLI + browser load) — fixes two *real* bugs: NFD "José" false-fired the unsupported-glyph warning; NFD "Nguyễn" miscounted combining marks.
- **Non-Latin detect + warn** — invisible-text failure is now a loud validate/build warning.
- **Quantize heights** before page-count comparisons (cross-arch repro hardening — design §0 G-b, previously missed).
- **fontkit pinned** via `overrides` so the measurer can't fork from react-pdf's copy.
- **Scaffold config fixed** — dropped `page1ExperienceCount`/`page1SplitBullets` (forced a messy split + the misleading warning on fresh init).
- **Measure-diff corpus broadened** to real sizes/widths/weights (all 8 Latin rows now 0% error); canary re-pinned at the real bullet width.
- Overflow threshold 220 → 15 (= `spacing.safety`; kept as backstop).

## Gate check (sprint doc C2)
- Diff test green within tolerance: **yes** (0% on all Latin corpus rows).
- Determinism + repro green: **yes** (same-arch; 2-arch leg still a CI-matrix TODO).
- Canary in place: **yes** (pinned at real width).
- **C2 gate: PASSED.**

## For the maintainer (decisions)
1. **Non-Latin font provisioning** — ✅ **DECIDED 2026-08-01: hold at detect-and-warn. CV rendering is English/Western-European Latin only, for now.** Full rendering needs fonts that can't be bundled within the <500 kB tarball budget, and the segment doesn't justify the solo-maintainer burden (same logic that dropped the container image and the Ollama recipe). The already-shipped `unsupported-glyphs` warning in `validate`/`build` is the complete answer — the failure is loud, not silent. **The multilingual landing page is not a contradiction:** the website's audience and the renderer's script support are independent, and the maintainer confirmed the split is intentional. Scope is now stated in the README ("Script support") so it's a documented boundary, not a gap. Revisit only if user-supplied-font demand shows up in issues.
2. **Hero PNGs** in `assets/` may be one page shorter now (scaffold no longer forces a messy split) — cosmetic; regenerate when convenient. *(Still open.)*
3. **Overflow warning wording** says "clipped" but react-pdf flows — ✅ **FIXED 2026-08-01.** Reworded in `render.js`, `validateContent.js`, `schema/v1/cvx.schema.json`, `docs/cv-schema.md`, plus the stale misdiagnosis comments in `TwoColumnTemplate.jsx`, `layout.js`, and `contentOracle.js`. Re-verified by direct render first: a config forced ~541pt past page-1 budget yields **3 pages, all 20 bullets present, no overprinting**. Also recorded a re-testing gotcha — extract with plain `pdftotext`, never `-layout` (column interleaving manufactures false "missing content" hits; 4 bogus misses vs 0 on the same PDF).

## Next
C3 — the engine (`packSidebar` + `P = max` + item-level splitting + front-load fill). Now unblocked: measurement is honest, the oracle checks bullet/item granularity, heights are quantized. C3 is the big chunk and absorbs the C1 blank-page work.
