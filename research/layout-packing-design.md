# CVX layout engine — detailed design

*2026-07-27. Builds on `layout-packing-research.md` (root cause + phased plan) and the architecture pass. This document specifies the **algorithm**: a single generic packing engine that unifies techniques currently found only in isolation, adapts to variable/optional content, stays byte-reproducible in pure Node, and exposes **layout levers an LLM can drive iteratively over MCP**.*

---

## 0. Decisions locked after the-fool pre-mortem (2026-07-27)

A pre-mortem ("find failure modes") surfaced five failure modes. The maintainer's calls resolve the design forks; the rest become **mandatory guardrails**. These override §12's open questions where they conflict.

**Decided:**
1. **Build the full engine** (§4), not just the minimal fix.
2. **Default fill = front-load** (page 1 dense, later pages trail off — the résumé norm). Even-balancing becomes an **opt-in, LLM-hookable lever** (`layout.fill: 'frontload' | 'balance'`, default `frontload`). Disarms Failure 2 / resolves §12 #2.
3. **The AI layout loop is on the roadmap** (`plan_layout` + levers + diagnostics, §7) — build it *after* the engine exists.
4. **QA owns an algorithm-correctness suite, and it gates every phase.** Combinatorial cases across **{each optional section: absent / 1 / many} × {text length: short / typical / long / overflowing} × {experience volume: 1-page / multi-page} × {variant: designed / ATS}**, asserting the engine invariants (every block placed exactly once, order preserved, no over-budget page, no empty column except the deliberate residual, no orphan heading, the front-load property holds) and hunting edge cases (single oversized section, all-optional-absent minimal CV, one-entry sections, label-less long link, non-Latin/fallback-font wrap). Correctness tests are written **with** each phase, not bolted on after (expands §11).

**Mandatory guardrails (fold into the phases):**
- **G-a (Failure 1 — measurement lies):** do **not** delete the overflow safety margin — shrink it, keep it as a backstop. Add a measure-vs-render diff test over non-Latin (Noto fallback) + hyphenation + long-token samples; measure non-Latin runs through the *actual fallback font*, not Lato.
- **G-b (Failure 5 — determinism):** quantize heights/budgets to integer subunits before comparison; round glue distribution deterministically; add a **two-architecture byte-repro test** to CI.
- **G-c (Failure 4 — lever abuse) → resolved by separation of concerns + Invariant 0 (§7.1):** **CVX renders 100% of the YAML — it never omits, hides, or clips text to save a page or because it's "ugly"; it adds pages / splits sections instead.** Content inclusion is the user's decision in the YAML (with or without an LLM; SKILL.md grounds the LLM to surface trade-offs, never drop-to-fit — true even with no LLM, since a human editing YAML decides content too). So layout levers are **arrange-only**: no `include`/exclude knob exists; `buckets` may only assign existing sections to pages, never omit; `density` never crams past a **legibility floor**. This *designs out* the drop-to-fit and cram-to-fit attacks rather than policing them. Cap the agent's `plan_layout` iterations. Lever values come only from config / the assistant's own reasoning — **never parsed from CV body text** (untrusted; data, not commands).
- **G-d (Failure 3 — the risk we deliberately kept):** the full engine is a tuning tar pit. Gate it: land Phase A **plus** a minimal "measure-sidebar + `P=max` + front-load" **shippable checkpoint first**, then layer objective/glue/DP on top. **Time-box objective tuning to 1 week; if it isn't converging on real CVs, ship the checkpoint and defer the optimizer.** v1.5 ships independently and is never blocked by this work.

---

## 1. Purpose, scope, non-goals

**Purpose.** Replace CVX's main-column-only greedy packer with one engine that lays out **both columns** across pages with no wasted space and no near-empty pages, and that an assistant can *steer* when it's driving CVX through MCP.

**In scope.** The pre-pagination layer (`src/pdf/layout.js` + a new `measure.js`), the two-column orchestration in `CVDocument.jsx`, the MCP `build_pdf`/new `plan_layout` tools, and the config surface.

**Non-goals.** Rewriting the renderer (react-pdf stays); a browser/headless dependency (forbidden); free 2-D float placement (NP-complete — we stay column-bound); changing the ATS single-column path (it auto-flows correctly already).

**Hard constraints.** Pure Node, no network, **byte-reproducible** (`SOURCE_DATE_EPOCH`), and `layout.js` must stay **isomorphic** (it ships in the Vite browser preview) — so the font measurer is *injected*, never imported there.

---

## 2. The reality the algorithm must absorb

1. **Variable text length.** A bullet may be 20 or 200 characters; a summary 2 or 6 lines. Height must be *measured*, not guessed (today's char-width estimate overshoots ~34%).
2. **Optional sections.** Any of certifications / publications / languages / achievements / referees / links may be absent, or present with one item or many. The engine must treat "absent" and "huge" as the same code path — just different block sets.
3. **Two semantically-pinned flows.** Skills/education/etc. live in the sidebar; experience in the main column. We may not move a section across the divide to balance (that would break the design), only distribute it *down* its own column across pages.
4. **Asymmetry.** Experience entries are *splittable* at bullet boundaries (machinery already exists); sidebar sections are treated as *whole units* by default but **split at item boundaries** when one would exceed a page — required by Invariant 0 (never clip), and cheap since a section is just a title + a list of items.
5. **Aesthetic intent.** Section order in each column is designer intent, not arbitrary. Headings must not be orphaned from their bodies.
6. **An agent is often the operator.** When an LLM drives CVX, it can't "eyeball" a PDF cheaply. It needs machine-readable diagnostics and levers to optimize against, in a tight loop.

---

## 3. Design goals (falsifiable — these are what the-fool should attack)

- **G1 No page has an empty column** unless one flow genuinely exceeds the other by ≥ 1 page of content (the unavoidable huge-sidebar/tiny-main residual).
- **G2 No near-empty trailing page** (a page < ~15% full that a rebalance could have absorbed).
- **G3 No orphaned section headings** (a title alone at a column foot).
- **G4 Fills the page**: residual bottom whitespace on a non-final column is minimized (via vertical glue), not left as a gap.
- **G5 Deterministic**: identical inputs → identical pagination → identical PDF bytes.
- **G6 Steerable**: an LLM can change the outcome through documented levers and observe the effect through documented diagnostics, without rendering pixels.
- **G7 Never hide text (Invariant 0)**: content is never omitted, clipped, or shrunk-to-illegible for fit or aesthetics — the engine adds pages and splits sections at item boundaries. The only irreducible residual (a single *item* taller than a whole page) wraps and flows, never truncates.

---

## 4. The unified model — one algorithm, not five

The insight: **paracol** (two parallel lists), **multicol** (column balancing), **Knuth–Plass/Mittelbach** (penalty-optimal breaking), **Lout galleys** (flow-into-targets), and **vertical glue** (\vfil-style fill) are usually implemented as *separate* systems. They are all special cases of **one** parametric optimization over blocks. CVX can implement that one engine and get all five behaviors — this synthesis is the novel contribution (§8).

### 4.1 Block — the atom

```
Block {
  id, flow: 'main' | 'sidebar',
  height,                       // measured natural height (pt), from fontkit (§5)
  glueAbove: { natural, stretch, shrink },   // flexible space before the block (pt)
  breakBefore, breakAfter,      // page-break penalty (−∞ force … +∞ forbid)
  keepWithNext,                 // heading glued to its first child (anti-orphan)
  splittable,                   // null | { offsets: number[], costPerSplit }
  optional, present,            // absent optional sections are simply filtered out
  weight                        // importance, for the (rare) drop-under-overflow policy
}
```

Everything on the page is a `Block`: a section title, an experience entry, a sidebar item group, a spacer, the identity header. `glueAbove` is Knuth–Plass glue applied *vertically* — it is how we both *separate* blocks and, when a column is short, *stretch* to fill (G4).

### 4.2 Flow, budget, page

- **Flow** = an ordered `Block[]` for one column. `main = [summary, exp₁, exp₂, …]`; `sidebar = [education, certifications, competencies, languages, publications, referees]` (identity is injected per page, not packed).
- **Budget(page, col)** = `pageH − topBar − colPad(top+bottom) − (col==sidebar ? identityHeight(page) : 0)`. Identity is taller on page 0 (`identity-photo`) than after (`identity-compact`) — the budget function encodes that.

### 4.3 The objective

A pagination candidate assigns each flow's blocks to pages. Its **demerits**:

```
D =  Σ_page Σ_col   w_waste   · residualSlack(page,col)²        // G4: unused space after glue stretch
  +  Σ_page         w_balance · (fill_main − fill_sidebar)²      // G1: cross-column imbalance
  +  Σ_break        breakPenalty(b)                              // G3: orphan/forbidden/split costs
  +                 w_pages   · pageCount                        // prefer fewer pages…
  +                 w_last    · nearEmptyLastPagePenalty         // G2: …but not a lonely tail page
  +  Σ_overflow     ∞                                            // feasibility: never exceed budget
```

`residualSlack` is computed **after** distributing `glueAbove.stretch` to absorb the gap (up to each block's max stretch) — so a column that's 85% full first stretches its section gaps toward 100%, and only the *irreducible* remainder is penalized. Squared terms (Knuth's badness shape) stop one ugly page from being "averaged away."

The weights `w_*` are the **primary LLM levers** (§7).

### 4.4 One engine, three policies

The same `pack(flow, budgetFn, policy, weights)` runs at three cost levels — the caller (or the LLM's chosen effort) picks:

| Policy | Method | Cost | Use |
|---|---|---|---|
| `greedy` | first-fit + one-step lookahead | O(n) | browser preview (advisory) |
| `balance` | binary-search the per-page height so the flow lands in exactly *P* pages, front-loading (multicol `minrows`/overflow philosophy) | O(n·log H) | **default** for the PDF |
| `optimal` | Knuth–Plass DP: shortest path over legal breakpoints minimizing `D` | O(n²) (trivial at CV scale) | `--optimize` / agent "max effort" |

All three return the same shape (`Page[] of {blocks, slack}`), so they're interchangeable and testable identically.

### 4.5 The two-flow coordinator (the paracol core)

```
function layout(content, theme, measure, levers):
    blocks_main    = buildBlocks('main',    content, theme, measure)
    blocks_sidebar = buildBlocks('sidebar', content, theme, measure)   # absent sections → []

    P_main    = pack(blocks_main,    budgetFn('main'),    levers.policy, levers.weights).length
    P_sidebar = pack(blocks_sidebar, budgetFn('sidebar'), levers.policy, levers.weights).length
    P = max(P_main, P_sidebar, levers.targetPages ?? 1)          # targetPages: LLM hint

    main    = packToExactly(blocks_main,    budgetFn, P, levers)   # rebalance across P pages
    sidebar = packToExactly(blocks_sidebar, budgetFn, P, levers)   # inject identity per page

    applyVerticalGlue(main); applyVerticalGlue(sidebar)            # G4 fill
    return zipPages(main, sidebar, P)                             # P <Page>s, each with both slices
```

`packToExactly` widens/narrows the effective budget by binary search so a flow that *could* fit in fewer pages is instead **spread evenly** across P (avoids "everything on page 1, page 2 half-empty"). This is exactly multicol's balancing, now applied per-column against a shared P.

**This single function subsumes** `resolveFirstSidebar()` (the single-page fold = `P=1`) and `contLayout()` (the cont+last merge = "flow union across P"). They get deleted.

---

## 5. Measurement layer (`src/pdf/measure.js`, Node-only, injected)

Height is the input everything depends on; if it's wrong, no optimizer helps.

- Build once from the pinned Lato TTFs with **fontkit** (the exact library react-pdf renders through): `widthOf(font,text,size) = font.layout(text).advanceWidth / unitsPerEm · size`.
- `lineCount(text,size,maxWidth,{weight,italic})` = greedy word-wrap using real advances (verified to match `@react-pdf/textkit`'s line count, and honoring the theme's explicit `lineHeight`).
- `measureBlock(kind, data, theme)` composes line counts × leadings + margins, exactly as `entryH`/`summaryH` do today — but now correct, and extended with a `measureSidebarBlock` sibling.

**Injection (the isomorphic constraint):** `render.js` (which has `fontsDir`) builds the measurer and passes it into `layout()`. `layout.js` uses `measure ?? charApproxFallback`, so the browser preview still works with the loose estimate (advisory), while the CLI/MCP path is exact and authoritative. **Determinism:** pure reads of pinned fonts, no RNG/IO; `font.layout` is bit-stable. A **canary test** pins `lineCount(knownString) === 3` so a fontkit/font bump that shifts metrics fails loudly. Removing the estimator lets us delete the empirical `PAGE1_OVERFLOW_WARN_THRESHOLD = 220` fudge.

---

## 6. Handling variable & optional content (the adaptivity)

The reality in §2 is handled by *properties of the model*, not special cases:

- **Variable length** → absorbed by measurement (§5). A long bullet is simply a taller block; the packer already reasons in pt.
- **Optional/absent sections** → `buildBlocks` filters `present==false`; the flow is just shorter. No branch. Empty column at page level is prevented by G1's balance term, not by hard-coding which sections exist.
- **Sparse CV (would be 1.1 pages)** → `glueAbove.shrink` lets the objective *compress* section gaps (within a floor) to stay on one page rather than spill three lines; conversely `stretch` fills a genuinely-short page (G4). The choice between "compress to 1 page" and "spill to 2 and balance" is decided by `D` and tunable by `w_pages` (LLM lever).
- **Dense CV** → balance + orphan penalties dominate; the DP (or balanced greedy) distributes evenly and keeps headings with bodies.
- **Density presets** map one lever to a bundle: `compact | comfortable | spacious` → {spacing scale, glue ranges, optional font-size nudge}. This is how an LLM says "make it fit" or "let it breathe" in one move.
- **A single tall section** (a 3-page "competencies" list) → **splits at item boundaries** and flows across pages; Invariant 0 forbids clipping, so this makes intra-section splitting **required, not a nicety** — but it's simple (a section is a title + item list; break between items, repeat the title with a "cont." marker, reusing the generalized experience-split machinery). The only irreducible case is one *item* taller than a page, which wraps.

---

## 7. LLM control hooks over MCP (the agent-in-the-loop)

Today an assistant driving CVX builds a PDF and is blind to the result unless it rasterizes. We give it **levers + diagnostics + a cheap dry-run**, turning layout into a closed loop the model can optimize.

### 7.1 Levers (config keys, also acceptable as MCP tool args)

> **INVARIANT 0 — faithful render (governs every lever below).** CVX renders **100% of the YAML text, always.** No lever, weight, or target may drop, hide, or clip content — **not to save a page, not because it's "ugly."** When content doesn't fit, the engine **adds pages** (and splits sections at item boundaries); it never truncates. What to include, cut, or rephrase is the **user's decision, made by editing the YAML** (with or without an LLM — SKILL.md grounds the LLM to surface trade-offs and collaborate, never to drop-to-fit). CVX is a faithful formatter, not a content gatekeeper. Levers only *arrange*.

```
layout: {
  fill:        'frontload' | 'balance',   # default 'frontload' (page 1 dense); 'balance' is opt-in
  density:     'compact' | 'comfortable' | 'spacious',  # ONLY within a legibility floor — never crams past it
  targetPages: <int>,                 # a GOAL, not a cap — engine ADDS pages rather than drop/clip; reports if a goal can't be met faithfully
  weights:     { waste, balance, pages, orphan, lastPage },   # objective knobs
  order:       { sidebar: [keys…], main: [keys…] },   # reorder existing sections within a column
  buckets:     { sidebar: [[p1 keys],[p2 keys]], … }  # assign EXISTING sections to pages; CANNOT omit a section
}
```
All optional; defaults produce a good layout with zero input. **Removed by design:** any `include`/exclude lever — dropping a section is a content edit in the YAML, never a layout knob (red-team: this designs out the "drop-to-fit" attack rather than defending it). `buckets` is a per-page *assignment* override and is validated to be a permutation of the existing sections (it can reorder/repaginate, never omit).

### 7.2 Diagnostics (returned by `build_pdf` and `plan_layout`)

```
layout: {
  totalPages,
  pages: [ { index,
             mainFill: 0.86, sidebarFill: 0.91,   # 0..1 column fill ratio
             overflowPt: 0, orphanHeadings: [], widows: 0,
             emptyColumn: null | 'main' | 'sidebar' } ],
  scores: { waste, balance, layout },             # aggregate 0..1 (1 = ideal)
  warnings: [ 'p2 main 41% empty — consider density:spacious or targetPages:1' ],
  leversUsed: { …resolved values… }
}
```
Crucially the warnings are **actionable and phrased as lever suggestions**, so a weaker model can follow them mechanically.

### 7.3 `plan_layout` — the dry-run tool (new MCP tool)

Runs measurement + packing and returns **only the plan + diagnostics — no glyph rendering, no PDF**. Milliseconds, deterministic. This is what makes the loop cheap enough to iterate.

### 7.4 The optimization loop the agent runs

```
plan = plan_layout(dir)                       # cheap
while plan.scores.layout < target and iters < N:
    lever = decide(plan.warnings, plan.pages) # e.g. empty main p2 → targetPages-=1 or density:compact
    plan  = plan_layout(dir, { layout: lever })
build_pdf(dir, { layout: plan.leversUsed })   # commit the winning levers (reproducible)
```

The model optimizes against numbers it can *see* (fills, scores, warnings) rather than pixels. `SKILL.md`/`ai-guide.md` get a short "tuning the layout" section teaching this loop, and the pre-build preview step already in the skill reports the plan to the user before committing.

*(Optional future hook: a `preview_page` tool returning a low-res PNG of one page as a data URI, for a model that wants to look. Not required for the loop — the diagnostics are sufficient — so it's out of MVP scope.)*

### 7.5 Reproducibility of the loop

Levers live in `config.yaml` (or are passed and then persisted). `plan_layout` and `build_pdf` are pure functions of (content, levers, pinned fonts). The *iteration* happens at authoring time; the *committed* build is fully deterministic. No RNG is introduced.

---

## 8. Why this is an innovative synthesis (not just "pick one paper")

Each ingredient exists somewhere; **none of these systems combines them, and no JS/no-browser tool has any of it:**

| Capability | Where it exists in isolation | CVX combines it as |
|---|---|---|
| Two pinned columns that both flow across pages | LaTeX `paracol` (TeX-only, no optimization) | the two-flow coordinator (§4.5) |
| Column balancing / no lonely tail | LaTeX `multicol` (single sequential flow) | `packToExactly` per column at shared P |
| Penalty-optimal breaks, glue, badness | Knuth–Plass / Mittelbach (single stream, text) | the objective `D` + `optimal` policy (§4.3–4.4) |
| Flow remainder into next target | Lout galleys (research typesetter) | ordered sidebar flow across P pages |
| Fill short columns instead of gapping | TeX `\vfil` vertical glue | `glueAbove.stretch` + `applyVerticalGlue` |
| Explicit per-page buckets | Reactive Resume (manual, human drag-drop) | `layout.buckets` escape hatch |
| **Agent-tunable objective + dry-run diagnostics loop** | **nobody** | `plan_layout` + levers + scores (§7) |

The last row is the genuinely new thing: a layout engine whose objective is **exposed as knobs to an LLM** with a **cheap render-free feedback signal**, so the agent that's already authoring the CV also *optimizes its layout* in the same loop. Everything below it is "combine known-good ideas into one generic engine that pure-JS resume tooling has never had."

---

## 9. Architecture & data flow in CVX

```
config.yaml(layout levers)
        │
render.js ── builds measurer (fontkit, fontsDir) ─┐
        │                                          ▼
        └────────► layout()  ◄── measure ──── measure.js (Node-only)
                     │  (isomorphic; measure injected, char-approx fallback in browser)
                     ├── buildBlocks(main/sidebar)     [layout.js]
                     ├── pack / packToExactly / glue   [layout.js]  ← policies greedy|balance|optimal
                     └── zipPages → Page[] slices
                                   │
     CVDocument.TwoColumnDocument ─┘  (renders P pages; buildSidebar gets per-page slice + identity)
                                   │
     TwoColumnTemplate  (badge now absolute — Phase 0; minHeight is a defensive backstop that correct operation never triggers — Invariant 0)

MCP:  tools.js ── plan_layout(dir, levers) → { plan, diagnostics }        (no render)
                └ build_pdf(dir, levers)   → { …, layout: diagnostics }   (renders)
```

Files touched: new `measure.js`; `layout.js` (generic engine); `CVDocument.jsx` (coordinator replaces `resolveFirstSidebar`/`contLayout`); `TwoColumnTemplate.jsx` (badge); `render.js` (inject measurer, surface diagnostics); `src/mcp/tools.js` + `server.js` (`plan_layout`, diagnostics in `build_pdf`); `schema/v1` (`config.layout.*`); docs + `docsSync`.

---

## 10. Phasing (maps onto the research plan + the MCP hooks)

- **Phase 0** — badge out of flow. Kills the spurious blank trailing sheet. ~½ day, isolated.
- **Phase A** — `measure.js` + injected measurement; delete the 220 fudge. Prerequisite for everything. ~2–3 days.
- **Phase B** — the generic engine: `Block` model, `pack` (`balance`), two-flow coordinator, vertical glue, `packSidebar` at whole-section granularity. Fixes the empty-column waste (G1–G4). ~1–1.5 wk.
- **Phase C** — `optimal` policy (Knuth–Plass DP) as an opt-in; only if greedy/balance break points look off.
- **Phase D (MCP hooks)** — `plan_layout`, diagnostics in `build_pdf`, `config.layout.*` levers, the SKILL loop. Can land with or just after B (diagnostics are cheap once the engine returns structured pages).
- **Later** — intra-section splitting for a single oversized section; optional `preview_page` PNG tool.

---

## 11. Testing & reproducibility

- **Measurement canary** (`lineCount==3`, width tolerance) + **measure-twice-`===`** determinism.
- **Packer-decision tests, not byte snapshots**: assert returned structure — every block placed once, order preserved, no page over budget, no empty column (except the deliberate residual), no near-empty tail, no orphan heading.
- **QA-owned algorithm-correctness suite (gates every phase — Decision #4)**: combinatorial cases across **{each optional section: absent / 1 / many} × {text length: short / typical / long / overflowing} × {experience volume: 1-page / multi-page} × {variant: designed / ATS}**. Assert the engine invariants on the returned plan: every block placed exactly once, order preserved, no page over budget, no empty column (except the deliberate huge-flow residual), no orphan heading, and the **front-load property** (page *i* fill ≥ page *i+1* fill, within tolerance). Plus a named **edge-case set**: single oversized section (must split at item boundaries and flow — assert it never clips), all-optional-absent minimal CV, one-entry sections, label-less long link, and non-Latin/fallback-font wrap (ties to G-a). Tests are written alongside each phase; a phase isn't "done" until its matrix rows are green.
- **Byte-repro integration test**: render a fixture twice with `SOURCE_DATE_EPOCH`, assert buffers `equals()`.
- **Lever/diagnostic contract tests**: `plan_layout` output shape stable; a given lever changes the plan in the documented direction (e.g. `targetPages:1` reduces `totalPages` or reports why it can't).

---

## 12. Risks & open questions (for the-fool)

1. **Is the objective the right one?** Are squared slack + imbalance the correct badness shapes, or are we over-fitting to Knuth's paragraph model in a domain (résumés) where "fill page 1, let page 2 breathe" might be *preferred*?
2. **Balance vs. intent.** Spreading a flow evenly across P pages may look *worse* than front-loading for a résumé (readers expect page 1 dense). Should `balance` actually mean "fill early pages fully, let the last one be short" — i.e. the opposite of column balancing? (multicol's `minrows` suggests yes.)
3. **Measurement fidelity.** Greedy word-wrap ≈ textkit today — but kerning, fallback fonts (Noto for non-Latin names), and ligatures could diverge. How much drift breaks pagination? Is the canary enough?
4. **`optimal` earns its keep?** Does the DP ever produce a visibly better result than balanced-greedy on real CVs, or is Phase C dead weight?
5. **Agent loop convergence.** Will an LLM actually converge (vs oscillate) on the levers? Are the warning suggestions safe to follow blindly by a weak model? Could it burn many `plan_layout` calls?
6. **Lever surface = footgun?** `buckets`/`order`/`include` let an agent produce a *worse* or dishonest layout (e.g. dropping referees to fit). Where are the guardrails?
7. **Complexity vs. solo maintenance.** Is a penalty-optimal two-flow engine + MCP loop too much surface for one maintainer, when Phase 0 + A + a *simpler* "measure the sidebar and take P=max" (no full objective) might remove 90% of the pain?
8. **Determinism under glue.** Floating-point stretch distribution must be order-stable and identical across platforms — is that guaranteed, or a repro landmine?

---

*Deliverables adjacent to this doc: `layout-packing-research.md` (evidence + citations), the QA combinatorial matrix (rendered scenarios), and `sprint-plan.md` (where this becomes a scheduled track).*
