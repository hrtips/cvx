> **SUPERSEDED (2026-08-14).** This document was folded into the single source
> of truth, [`ARCHITECTURE.md`](../../ARCHITECTURE.md), and is kept verbatim as
> a historical record. Where this file and ARCHITECTURE.md disagree,
> ARCHITECTURE.md wins — several decisions recorded here were later overturned
> (see its §7.2). Do not update this file.

# CVX two-column layout packing — research report

*2026-07-27. Consolidates: QA combinatorial render matrix, two subject-matter research passes (algorithms/papers + comparable-tool implementations), and an architecture design pass grounded in the actual CVX code. Prepared for the maintainer to decide the layout-engine work.*

---

## TL;DR

**The symptom:** the two-column CV wastes space and adds near-empty pages — content spills so one column has an empty column beside it, and a spurious blank page sometimes appears.

**The root cause (confirmed in code + by real renders):** the packer measures **only the main column** (experience/summary) and **never measures the sidebar**. When the sidebar is taller than a page, the PDF engine spills it onto extra sheets with an empty main column. Compounding it, height is *estimated* with a character-width guess that overshoots by ~34% (~200pt/page), which is why there's an empirical `PAGE1_OVERFLOW_WARN_THRESHOLD = 220` fudge in the code.

**The good news:** CVX's architecture is **correct and state-of-the-art for its category**. Every PDF tool in CVX's class (react-pdf, pdfmake) has this exact bug natively; the ones that produce good two-column resumes all pre-paginate both columns themselves — which CVX already does, just for one column. The fix is well-scoped, not a rewrite.

**The plan (phased, smallest-shippable-first):**

| Phase | What | Fixes | Risk |
|---|---|---|---|
| **0** | Take the page-number badge out of flow | the spurious near-blank *trailing* page | very low |
| **A** | Measure real text heights with fontkit (the font the renderer actually uses), **injected** into the packer; measure the sidebar too | under-filled pages, ~200pt slop; deletes the 220 fudge | medium |
| **B** | Two independent column flows, `pages = max(main, sidebar)`, balanced across pages (the LaTeX `paracol` model) | **the empty-column extra sheet** (the reported waste) | high |
| **C** | Optimal Knuth–Plass page-break DP with penalties | break aesthetics only (no correctness bug) | defer |

**Recommendation:** ship **Phase 0 + A** next (low-risk, high-leverage, and A is the prerequisite for B). Defer **B** to the following release (it's the real fix for the wasted sheets, but rewrites the page-orchestration and needs new tests first). Defer **C** indefinitely.

**Important:** these are *two different* "empty page" bugs. Phase 0 kills the badge-only blank sheet. The "tall sidebar → blank main column" waste is only fixed by Phase B. Phase A is the bridge (you can't pack a sidebar you can't measure).

---

## 1. The problem, precisely

CVX renders a fixed two-column A4 page — a narrow **sidebar** (identity, contact, education, certifications, competencies, languages, publications, referees) and a wider **main** column (summary + a chronological experience list) — repeated across pages. This is **two independent, order-preserving flows** poured into two fixed columns.

Two structural facts from the code (`src/pdf/layout.js`, `src/pdf/CVDocument.jsx`):

1. **`packExperiences()` only sees the main column.** It takes `(experience, summary, config, theme)` — no sidebar input. The sidebar is assembled downstream in `buildSidebar()` from static key lists, with no height awareness. So the packer literally cannot reason about sidebar fit or balance.
2. **Heights are estimated, not measured.** `lineCount()` divides text length by a monospace `charWidthFraction` and rounds up. Measured empirically: a 107-char bullet at 9pt is really **415.6pt** wide; the char model predicts **558.5pt** — a **34% overestimate**, i.e. 4 estimated lines where 3 render. That accumulated error is exactly the ~200pt slack the `PAGE1_OVERFLOW_WARN_THRESHOLD = 220` constant papers over.

QA confirmed both failure modes on real renders (see the combinatorial matrix in the QA appendix): deleting the three new v1.5 section files makes the empty-main overflow page disappear — proving the sidebar sections drive it — while a *separate* near-blank page (from a trailing page-number badge) persists even with them removed. **Two distinct bugs.**

---

## 2. What the research found (convergent)

### Algorithmic foundation
This is the **order-preserving optimal-pagination** problem (the Knuth–Plass / Mittelbach family), *not* classic bin-packing — entries are chronological, so no reordering / first-fit-decreasing. It stays **polynomial** as long as sidebar sections are kept **column-bound**; modelling them as freely-placeable floats makes it **NP-complete** (Plass 1981; Brüggemann-Klein/Klein/Wohlfeil) — so don't.

- **Knuth–Plass** (boxes/glue/penalties, squared badness, DP shortest-path over breakpoints) generalizes from line-breaking to page-breaking; TeX's page builder is the greedy one-page-at-a-time cousin. Tractable in pure JS (dozens of blocks → microseconds, deterministic).
- **Column balancing** (LaTeX `multicol`): choose a trial column height, split, measure badness, search on height. The `minrows`/`maxbalancingoverflow` philosophy — front-load earlier pages, tolerate a little overflow, never emit a near-empty trailing column — is precisely the "don't strand content on an empty page" logic needed. Implementable as **binary-search-on-height + greedy fill**, ~20 lines.
- **Measure-then-place**: high-quality engines measure real block heights before optimizing breaks. PrinceXML does a two-pass "box tracking." CVX's ±200pt error means *no packing algorithm can help until measurement is fixed* — this is the highest-leverage change.
- **Practical ROI ranking:** font-accurate measurement > two-flow balancing (binary-search-on-height) > full page DP. The first two get ~90% of the benefit; the DP is polish.

### How comparable tools solve it
- **LaTeX `paracol` (used by the AltaCV résumé class) is the gold standard**: two independent vertical lists typeset in parallel, synchronized at page breaks so *each column flows across pages independently*. AltaCV's own history is literally "migrated off a non-flowing sidebar box (CVX's current state) onto paracol." **This is the model to copy.**
- `moderncv`, `twentysecondcv`, `friggeri-cv` have **CVX's exact bug** (fixed sidebar box that won't break); the accepted fix is "switch to paracol."
- **Typst** and **CSS multicol** flow/balance columns but only *sequentially* (newspaper flow) — you lose the pinned "skills-left / experience-right" semantics. The declarative dream (**CSS Regions**, named-flow-into-boxes) is **dead**.
- **@react-pdf/renderer**: its `wrap`/`break`/`fixed`/`minPresenceAhead` are single-flow only — **no cross-column balancing**, and they have known blank-page (#2969) and infinite-loop (#2659) issues. Don't use them for balancing. It *does* render through **fontkit + `@react-pdf/textkit`**, which we can reuse for measurement.
- **pdfmake** has the identical bug (documented) — confirming it's intrinsic to the "renderer doesn't own a two-list page-fill loop" architecture, not a CVX defect per se.
- **Reactive Resume** (a very popular tool) concluded the pragmatic answer is *explicit per-page column buckets* — validating CVX's config-driven approach and suggesting it extend to explicit per-page sidebar buckets as the deterministic override.

**Verdict:** no drop-in library flows a react-pdf sidebar. CVX must implement the `paracol` idea itself — and doing so would put it ahead of RenderCV, pdfmake, and every JSON Resume theme in the no-browser space.

---

## 3. The CVX-grounded design (from the architecture pass)

### The correction the research missed
`layout.js` is **isomorphic** — it's imported by the browser preview (`src/main.jsx` → `CVDocument.jsx` → `layout.js`) and ships in the Vite bundle, with zero Node built-ins today. **You cannot `import fontkit`/`node:fs` into it** without breaking `npm run dev`. So the measurer must live in a **new Node-only `src/pdf/measure.js`** and be **injected** into the packer from the Node render path (`render.js` already has `fontsDir`). The browser preview keeps the char-approx fallback (advisory); the CLI/Node path is authoritative and reproducible. This actually *strengthens* the reproducibility story.

Two more grounding facts:
- **The sidebar isn't symmetric to experience.** Experience already supports mid-entry bullet splitting; sidebar sections have no intra-section split machinery. So "pack the sidebar like experience" holds only at **whole-section granularity** for the MVP. Splitting one oversized section across pages is a later refinement.
- `resolveFirstSidebar()` and `contLayout()` are already hand-rolled single-case "flow the ordered sidebar union across available pages" logic. Phase B **generalizes and subsumes** them, it doesn't invent the concept.

### Phase 0 — badge out of flow *(ship first, independent, ~0.5 day)*
The page-number badge sits in normal flow at the bottom of the main column inside a `minHeight` body; at exact fit it tips onto a near-empty second sheet. Fix: `position:absolute` badge + `position:relative` on the column. ~3 lines, blast radius = `TwoColumnTemplate.jsx` only. (Caveat: on a genuinely overflowing page an absolute badge could overlap — but Phase B eliminates overflow, and clipping is already the documented last-resort.)

### Phase A — font-accurate measurement *(ship with Phase 0, ~2–3 days)*
New Node-only `src/pdf/measure.js` builds a fontkit measurer (`font.layout(text).advanceWidth`, greedy word-wrap — verified to match textkit's line count, and deterministic/`===` across runs). `layout.js` gets an optional injected `measure` param; the four `lineCount(...)` call sites switch to `measure.lineCount ?? charApproxFallback`. Wire the measurer in `render.js` (has `fontsDir`) into `packExperiences` and `estimatePage1Overflow`. Once counting is honest, **drop `PAGE1_OVERFLOW_WARN_THRESHOLD` from 220 to a ~15pt safety** and fix the two message strings.
- **Reproducibility:** pure measurement, no RNG/IO beyond reading pinned TTFs; feeds identical React tree → identical bytes under the existing `SOURCE_DATE_EPOCH` machinery. Add a canary test so a fontkit/font bump that shifts metrics fails loudly.
- **Snapshot risk:** unit fixtures are tiny → stay green. Real CVs near a page boundary *will* repaginate (packing ~200pt more per page — the desired outcome). Regenerate the demo PDFs and eyeball.

### Phase B — two flows, `P = max`, balance *(next-next release, ~1–1.5 weeks)*
Add `packSidebar(orderedContentKeys, data, theme, measure)` mirroring `packExperiences` at whole-section granularity, a generic `packBlocks()` factored out of the existing greedy branch, and a `balanceToPages()` (binary-search-on-height). Rewrite `TwoColumnDocument`: pack main, pack sidebar, `P = max(mainPages, sidebarPages)`, balance both to `P`, render `P` pages each with its own sidebar slice (identity injected per page: `identity-photo` on page 0, `identity-compact` after) + main slice. `resolveFirstSidebar`/`contLayout` are **deleted** — their behavior falls out. `buildSidebar`, `TwoColumnTemplate`, and the registry are essentially unchanged.
- **The `P=max` residual** (huge sidebar, tiny main → some light main pages) is correct and intended — you can't invent experience — and is still far better than today's *fully blank* sheet, because balancing spreads main content across all `P` pages.

### Phase C — Knuth–Plass page DP *(defer indefinitely)*
Per-flow, contiguous, column-bound DP with `cost = Σ slack² + orphanHeadingPenalty + nearEmptyPagePenalty`. O(n²), trivial at CV scale. Improves *where* breaks fall; fixes no correctness bug A+B don't. Build only if greedy break points look ugly on real CVs.

### Effort · risk · blast radius
| Phase | Effort | Risk | Files |
|---|---|---|---|
| 0 badge | ~0.5 day | very low | `TwoColumnTemplate.jsx` |
| A measurement | ~2–3 days | medium (boundary repagination) | new `measure.js`; `layout.js`; `render.js`; `validateContent.js`; `CVDocument.jsx`; `layout.test.js` |
| B two-flow + balance | ~1–1.5 wk | high (rewrites `TwoColumnDocument`) | `CVDocument.jsx` (major); `layout.js`; `measure.js`; `layout.test.js` |
| C page DP | ~3–4 days | low-med, isolated | `layout.js` |

### Testing strategy
- **Measurement canary:** assert `lineCount(knownString, 9, 150) === 3` + a tight width tolerance; a fontkit/textkit/Lato bump goes red loudly (mirrors `verifyPatchPoints()`). Plus a "measure twice, assert `===`" determinism test.
- **Packer-decision tests, not byte snapshots** (there are no byte goldens today — keep it that way): assert the *returned structure* — `totalPages`, which sections/entries land on which page, order preserved, every block placed exactly once, no page over budget, no near-empty trailing page.
- **QA combinatorial matrix as regression:** `{short,medium,long}` experience × `{short,tall}` sidebar × `{photo,no-photo}` × `{auto,config-split}` → assert no page with empty main AND no page with empty sidebar (except the deliberate huge-sidebar residual), full content preservation.
- **Byte-reproducibility integration test:** render a fixture twice with `SOURCE_DATE_EPOCH` and assert buffers `equals()`.

---

## 4. Recommendation

1. **Next release:** Phase 0 + Phase A. Kills the visible blank-sheet symptom, makes every downstream decision honest, deletes the 220pt fudge, and unlocks Phase B. Keep `layout.js` isomorphic via the injected measurer.
2. **Following release:** Phase B (the real fix for wasted sheets), at whole-section granularity, once the packer-decision + QA-matrix tests are in place.
3. **Defer C** unless A+B leave ugly break points.

This is independent of v1.5 (the content-sections/data-loss fix), which is already built and green and can ship on its own schedule.

---

## Sources

**Algorithms/papers:** Knuth & Plass, "Breaking Paragraphs into Lines," *SP&E* 1981 · Plass, "Optimal Pagination Techniques," PhD thesis, Stanford 1981 (NP-completeness with floats) · Mittelbach, "A General Framework for Globally Optimized Pagination," DocEng '16 / *Comp. Intelligence* 2019 · Mittelbach, `multicol` package doc (balancing) · Brüggemann-Klein/Klein/Wohlfeil, "On the Pagination of Complex Documents" · Kingston, "Lout Document Formatting Language," 1993 (galley concept) · Eijkhout, *TeX by Topic*, Ch. 27–28.

**Implementations:** LaTeX `paracol` manual (CTAN) · `liantze/AltaCV` README (paracol migration) · Typst `columns` docs + PR #5017 · MDN `column-fill` + multicol content breaks · WeasyPrint #2032/#489 · PrinceXML two-pass box tracking · W3C CSS Regions L1 (dead) · react-pdf advanced/rendering-process docs + issues #1676/#2969/#2659 · `@react-pdf/layout`, `@react-pdf/yoga`, `@react-pdf/textkit` (npm) · pdfmake #242/#669/#1159 · pdfkit text-metrics docs · RenderCV #382 · Reactive Resume "fitting content" docs.

**Internal:** QA combinatorial render matrix (2026-07-27, six rendered scenarios); architecture pass grounded in `src/pdf/{layout.js,CVDocument.jsx,templates/TwoColumnTemplate.jsx,render.js,reproducible.js}`.
