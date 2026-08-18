# CVX Architecture — the source of truth

**Status: authoritative.** This document is the single source of truth for CVX's
design and architecture. It consolidates and supersedes every design document
that previously lived in `research/` and `docs/hostile-baseline.md`; those files
are retained under `research/archive/` as historical records only — where this
document and an archived one disagree, this one wins. It does **not** govern the
product surfaces (`README.md`, `docs/ai-guide.md`, `docs/cv-schema.md`,
`skills/cvx/SKILL.md`, `CHANGELOG.md`), which are runtime artifacts kept honest
against the code by `test/docsSync.test.js`.

**How to use it:** §2–§5 are the formal model — the contracts an implementation
must satisfy. §6 maps every invariant to the instrument that measures it, so
"is the implementation correct?" is a checklist, not a judgement call. §7 is
the decision record (live rulings, overturned decisions, standing rejections
with their measured reasons). §8 is the roadmap and backlog. §9 is product
boundaries. §10 is the document lineage.

*Last consolidated: 2026-08-14.*

---

## 1. What CVX is

CVX renders a folder of plain YAML (`cv-content/`) into a professional CV PDF,
fully locally. The architecture rests on one division of labour, ruled and
re-ruled by the maintainer:

> **CVX is a dumb instrument.** It is a stateless renderer with no opinions, no
> memory, and no network. It measures exactly, renders exactly what it is told,
> and reports honestly what happened. All judgement — what to write, where to
> place it, whether it looks right — belongs to the LLM driving it (taught by
> `skills/cvx/SKILL.md`) and ultimately to the user.

The pipeline (maintainer's model, ruled 2026-08-14):

```
content            template + theme                     engine
(sections of       (geometry + placement slots          (generic: measure →
 pure text)      +  typography/colors/spacing)           pack → paginate → draw)

   text  ×  visual design  ───────────────────────────►  CV + honest diagnostics
```

### 1.1 The layers

| Layer | Owns | Must never |
|---|---|---|
| **Content** (`cv-content/*.yaml`) | The user's text, as sections of pure data | Carry layout knowledge |
| **Template** | Geometry: columns, widths, margins, page furniture; the slot structure | Dictate which sections live in its slots |
| **Layout preset** (`layouts/*.yaml`) | Placement: section → column, order, repetition. User/LLM-editable | Be an engine dependency — presets are conventions |
| **Theme** | Typography, palette, spacing tokens | Vary per-CV geometry it doesn't own |
| **Section vocabulary** | Per section, one co-located plugin: renderer + measurer + split semantics | Leak names into the engine |
| **Engine** | Generic packing/pagination over anonymous measurable blocks; honest diagnostics | Know a section's identity; hold judgement, memory, or scores |

**The one-line law (ruling R-I): the engine knows shapes, never identities.**
Its contract with a block is height-at-width, legal split boundaries, and
required gaps. The word "education" must not exist in the packing core.
**Today this is an aspiration, not a test**: the guard §6 specifies lands at
I6/I9 and does not exist yet (corrected 2026-08-18 — this line previously
claimed the opposite, while §6 said "lands at I6/I9"; a document that
contradicts itself about whether an invariant is measured is exactly what §6's
own opening sentence rules out). §6 also re-specifies the guard's *shape* after
RV6 showed the original scope could not catch a real violation: the contract is
a positive one over what the packer may read, not a denylist of section names.

And the actor table the whole document rests on:

| Actor | Owns | Must never |
|---|---|---|
| **User** | Direction at any iteration; the facts; final approval | — (nothing) |
| **LLM** | Design judgement; the edits; memory of what it tried; backtracking; candid reporting | Invent, alter, or drop a fact; override direction it was given |
| **CVX** | Faithful rendering; accurate measurement; honest diagnostics | Hold opinions, memory, or state; score a layout |

The ruling's accepted cost, deliberate: a weaker model gets a worse CV,
because nothing in the tool compensates for it. The alternative — CVX encoding
what "good" means — is what C4 measured and rejected.

### 1.2 The driver layer

The LLM driving CVX is part of the architecture, taught by two product
surfaces (`docs/ai-guide.md` for any assistant, `skills/cvx/SKILL.md` for
skill-capable clients). Its contracts, each maintainer-ruled:

**The three-role contract.** The **user** owns direction at any iteration —
what to emphasise, what reads too long, exact replacement wording — and final
approval; never execution. The **LLM** owns design judgement, the edits,
memory of what it tried, backtracking, and candid reporting; never inventing
facts, never overriding direction. **CVX** owns faithful rendering, accurate
measurement, honest diagnostics; never opinions, memory, state, judgement, or
"quality". Text changes are collaborative and bidirectional: either party may
add, remove, or change text between iterations.

**The collaborative loop.** The loop is collaborative, not autonomous:
brainstorm content together → LLM writes the YAML → build → **both** parties
look at the PDF → either directs the next change → edit → build → look → …,
done when both are satisfied. The user is *in* the loop, not waiting at the
end of it — nothing accumulates unseen. The sight step is non-negotiable:
build → open the returned path → look at every page → judge → adjust →
report candidly.

**The brief.** A designer takes a brief — the session starts with a
conversation, not a permission prompt: page-count preference (1, 2, N — the
objective is the overall outcome, never a fixed count), sections to emphasise
or compress, the target job, taste. Asked once, with examples. The brief turns
"may the assistant cut a bullet?" from a permission question into a scope
question settled at the start. **The brief is the conversation, not a file**:
no `preferences:` block, no brief artifact, no schema — anything durable
across sessions is the client's memory feature, not CVX's problem (settled;
an earlier storage proposal "was inventing a problem").

**The editing licence and its bound.** Under the brief the assistant may
tighten prose, disclosed to the user; it may never invent, **alter, or drop**
a fact, number, date, or achievement — the constraint binds the words, not
who edits them. This is INV-0's actor complement: INV-0 binds the renderer;
this wall binds the editor.

**Loop safety.** A client that cannot open a PDF does not run the loop — it
falls back to a single build, because iterating on measurements alone is the
blind-optimiser shape C4 measured as harmful; better no loop than a loop that
cannot see. **INV-6 is not the safety argument here**: it binds CVX's
arithmetic, not the caller's — `Σ(1−fill)²` is a few lines away from the
published per-page fields, and it is exactly the objective C4 measured as
harmful, reachable through a fully compliant CVX. The defence is that the LLM
looks at the render every pass. Nothing in CVX bounds a build-driven loop;
bounding and terminating it is the LLM's job, and the skill must state the
stopping discipline explicitly — no other component will. A **restored
sentence is direction** and is never overridden (a skill rule, not a schema
flag). The **ATS variant is looked at once before delivery, never iterated**
— it has no layout plan by construction, and an edit that improves a
two-column page has no reason to improve a single-column flow (one look would
have caught both corrupted ATS PDFs that reached real users).

**The stage machine** (earned by dogfooding; the named failure modes are
design facts): acquire source → **bounded runtime probe** (single command,
30s timeout, one retry) → generate → validate → build → verify outputs →
deliver. Failure modes it exists to prevent: *research sink* (context
gathering after the execution path is known), *late runtime probe* /
*unsupported confidence* (claiming "nothing is blocking" before a probe has
run), *connector bias* (a tool's availability steering the agent), *missing
fallback trigger* (the source-only fallback — complete `cv-content/` + exact
error + tested handoff command — fires on the FIRST package-access failure).
*Blocker-layer honesty*: an npm proxy 503 is an environment failure, not "CVX
failed".

**The fabrication walls** (driver-layer invariants): never fabricate from an
inaccessible source; never invent a metric; no scaffold content (the Bruce
Wayne persona, the placeholder photo) survives into a delivery; source
ambiguities (conflicting titles, duplicate awards) are surfaced, never
silently resolved; failure reports carry the command, exit code, and error
text; a YAML syntax parse is never presented as CVX schema validation.

---

## 2. The formal model

### 2.1 Objects

- **Content** `C`: a set of sections; each section `s` is an ordered list of
  items (entries, bullets, tags, rows) whose fields are opaque text.
- **Theme** `Θ`: a token set (typography sizes/weights/leadings, palette,
  spacing constants, geometry constants).
- **Template** `T`: column geometry `G = {columns, widths, pads, page size,
  furniture}` and the slot structure layouts may fill.
- **Layout** `L`: a placement map. For each column, an ordered list of slot
  entries (section keys, spacers, repetition markers). Per ruling R-H the map
  is total: any vocabulary section may appear in any column, any order.
- **Vocabulary** `V`: for each section key `s`, a triple
  `V(s) = (render_s, measure_s, split_s)` where `measure_s(items, w, Θ) →
  block shapes at column width w`, and `split_s` defines the legal cut points
  (item boundaries; never inside an item; a title is never left alone —
  anti-orphan). Renderer and measurer are co-located and change together (the
  mirror discipline, §4).
- **Engine** `E`: a pure function.

### 2.2 The rendering function

```
E(C, T, L, Θ) → (PDF, Plan, Diagnostics)
```

with these properties (each is an invariant in §5, each measured by §6):

1. **Deterministic & stateless** — same inputs, same outputs; byte-identical
   under a pinned `SOURCE_DATE_EPOCH`; no memory between calls; ask twice, get
   the same answer.
2. **Total on content** — 100% of `C` reaches the PDF: nothing dropped,
   clipped, compressed, stretched, or reworded to fit. Pagination absorbs all
   pressure.
3. **Plan-faithful** — the Plan describes the PDF that was actually produced:
   measured heights match rendered ink to tolerance (INV-2), and the physical
   sheet count matches the planned page count or a defect warning names both
   numbers (INV-4).
4. **Judgement-free** — `E` never chooses placement, never optimizes an
   aesthetic objective, never emits a score or recommendation. Diagnostics
   describe and price; they never decide.

### 2.3 The two-flow packing model

Each column's declared sections form one ordered **flow** of blocks. The engine
packs each flow independently against per-page budgets and the document's page
count is:

```
P = max(P_main, P_sidebar)
```

- **Problem class**: order-preserving pagination (the Knuth–Plass /
  Mittelbach family), NOT bin-packing — entries are chronological, so no
  reordering and no first-fit-decreasing. It stays polynomial exactly because
  sections are column-bound; free 2-D float placement is NP-complete (Plass
  1981) and is permanently out of scope.
- **Blocks**: `b = {height, gapBefore, split}` — anonymous shapes from `V`.
- **Budgets**: per page kind, derived from `T`'s geometry and `Θ`'s constants,
  minus that page's fixed content (repeated/pinned blocks declared by `L`) and
  minus page furniture (the page-number badge's `cornerHeight` — omitting it
  once over-budgeted the main column by 19pt and pushed near-blank sheets; the
  single box both columns budget against is `bodyHeight()`).
- **The `P = max` residual is correct and intended**: when one flow genuinely
  exceeds the other by a page or more, the shorter column's tail pages are
  legitimately light — you can't invent experience. Front-loading spreads what
  exists; nothing manufactures filler.

### 2.4 Diagnostics contract

`Diagnostics` is a **pure function of the Plan** (never of the render — the
one render-derived fact, the physical sheet count, is appended by the build
envelope, not by the diagnostics module; a dry-run plan can therefore never
carry it). The dry run (`plan_layout` / `planCV`) must be incapable of
perturbing a build: it registers no fonts and installs no reproducibility
patches, and build → plan → plan → build in one process is byte-identical.

- `version`: bumped whenever a published field's *meaning* changes (ruled: the
  student-CV fixes ship as version 3 — two meanings never share a version).
- Per page, per column: `fill` = occupancy `(fixedPt + usedPt) / capacityPt`,
  comparable across pages, `> 1 ⟺` that page is over budget. `fill: null`
  carries exactly one meaning — this flow ended on an earlier page; nothing is
  here. A page whose fixed content exceeds its capacity reports its honest
  ratio above 1, never null. Decomposition, stated precisely: `capacityPt` is
  the whole column net of pads, page furniture, and the safety margin;
  `fixedPt = capacityPt − budgetPt` is the page's fixed content only.
- `blockedBy` = why the next block could not start here. Published fields:
  `role` (main; `key` for the sidebar), `entryIndex`, `residualPt`,
  `gapBeforePt`, `smallestPiecePt`, `shortByPt` — bound by the asserted
  identity `shortByPt = smallestPiecePt − (residualPt − gapBeforePt)`; null on
  a flow's last page and wherever the next block did start. `shortByPt` is
  **the only monotonic progress number** (it falls as you shorten what is
  above it; `fill` is a description, not a gradient). The identity-named
  fields generalize at I9 — a field-semantics change that bumps the version
  per R-E.
- Sidebar slices carry `height` and `gapBefore` (the gap actually charged — 0
  for a page's first slice) so `used === Σ(height + gapBefore)` holds exactly
  and a consumer can decompose a page from the plan alone; `itemCount` is kept
  as the one field not derivable from the plan. Ranges are 0-based,
  end-exclusive.
- `emptyColumn` means "no ink in the column" — a column whose only content is
  fixed (e.g. a summary) is not empty. It is a diagnostic, never a target:
  packing to remove it measurably produces worse CVs (§7.3).
- **Warnings**: named conditions with `code` + `kind`, defects ordered before
  facts. `kind: 'defect'` = the artifact is wrong (overflow;
  physical-pages-exceed-plan). `kind: 'fact'` = a priced property of the
  content's shape (page1-ends-early; experience-empty; main-column-empty).
  Trigger predicates are exact: `page1-ends-early` fires iff page 1's main
  column has `blockedBy ≠ null` AND at least one placed entry. Its zero-entry
  counterpart is `page1-no-experience` (a **defect**: roles exist but none fit
  on page 1) — the degenerate case of the same phenomenon, mutually exclusive
  by construction. A CV with no roles at all is neither: that is the
  `experience-empty` **fact**, which requires zero entries on every page.
  Facts never reach stderr;
  defects do (R-D) — a normal page break is not shouted at. Never aggregated;
  no whole-document score exists. Exactly one overflow predicate exists in
  the codebase (`overflowWarnings`), shared by build and validate.
- **Message policy (ruling R-F): facts name conditions only.** Messages carry
  the condition and its prices, never imperative edit advice; the advice lives
  in the skill. **Scope, so this is not relitigated per increment:** R-F
  governs diagnostics warnings about CONTENT SHAPE — `layoutDiagnostics`,
  `overflowWarnings`, `physicalPageWarnings`, and the validate findings that
  restate them. It does not govern file-structure or tool-use advice, which
  stays imperative on purpose: validate's schema suggestions ("delete the
  key", "rename to X.yaml" — R-B requires one), font notices, CLI stderr, and
  the teaching surfaces (tool descriptions, handshake, skill). A quoted user string in any message is single-line and
  length-capped (injection surface, INV-12).
- **Statelessness, restored (sprint 1's `planIterations` deletion):** the MCP layer once kept a process-scoped
  map counting consecutive identical dry runs per workspace and changed the
  fifth answer. A verified design-loop finding ruled it a violation — a callee
  does not count its caller's calls — and it is now deleted, along with the
  tests that pinned it. `plan_layout` is a pure function of the content
  directory again, asserted directly: repeated calls are deep-equal, and a
  build in between changes nothing. Bounding a loop is the LLM's job (§1.2).

### 2.5 What correctness means

An implementation is correct iff every invariant in §5 holds under every input
in the fixture corpus (§6) — and the corpus is itself governed: every input
shape that has ever produced a defect is represented, degenerate inputs (empty
flows, empty sections, single items) are fixtures by rule, and a shape the
corpus cannot reach is treated as an untested claim, not a passing one.

### 2.6 External contract surfaces

The engine's promises as seen from outside (product docs restate these; this
is the normative list):

- **CLI**: `init | validate | build | list | mcp`, all non-interactive;
  `--json` emits exactly one JSON object on stdout with logs on stderr;
  semantic exit codes `0` ok / `2` validation failed / `3` render failed /
  `64` usage. `validate` reports **all** errors at once with file + field
  paths and suggested fixes; unknown keys are warnings by default and errors
  under `--strict` (agents run strict; humans aren't broken). `build --all`
  renders both variants **in isolated processes** (INV-13).
- **MCP**: stdio server, five tools — `get_schema`, `init_cv`, `validate_cv`,
  `build_pdf`, `plan_layout` — thin wrappers over the CLI contract; no keys,
  fully offline. Dry run and build share one load → measure → resolve → pack
  chain (`planCV` factored from `renderCV`), never two copies.
- **Schema**: `schemaVersion: 1`; the compatibility promise is "content files
  never break within a major." The JSON Schema is the single source of truth;
  docs derive from it and docsSync fails on drift. Visual output identity
  across package versions is explicitly NOT promised — pin the version when
  bytes matter.
- **Byte promise**: "same content + same node build → same bytes", not "same
  CPU". The measured cross-platform divergence was zlib (a Homebrew arm64
  node linking zlib 1.2.12 emitted a 53,508-byte-different deflate stream
  while every decompressed object was identical); the CI compare job
  distinguishes layout divergence from compression divergence rather than
  just going red.
- **Measurement parity across surfaces**: build and validate resolve the same
  fonts directory and measure identically, so the two can never disagree
  about the same content. (RV7 made this true again in the theme axis: it was
  false while `render.js` defaulted the theme itself and `validateContent.js`
  reached `LAYOUT_DEFAULT_THEME`, and the two resolved teal and mono for one
  workspace. One resolution path now, in `resolveDocument`.) `render.js` defaults `config.theme ?? 'teal'` while
  `validateContent.js` passes `THEMES[config.theme]`, so a workspace with no
  explicit `theme:` key and `layout: single-column` resolves teal on build and
  mono on validate. It is inert on *measurement* only because the three shipped
  themes are geometrically identical — the precondition §6's theme-threading
  gate exists to protect and the roadmap plans to remove. RV7 collapses the two
  to one resolution path; this marker comes out when it lands. A caller that
  supplies no fonts directory skips the
  real-measurement checks entirely rather than approximating them —
  measurement is never approximated where its honesty can't be backed (the
  same principle that keeps the preview estimator advisory-only).

---

## 3. The packing algorithm, precisely

### 3.1 Flows from layouts

`flow(column) =` the ordered, measured, splittable blocks named by `L`'s slots
for that column. Slot lists across page kinds concatenate into one flow —
**the user expresses order; the packer decides pages from measurement** (the
C3a reinterpretation, extended to the main column at I6). The engine never
reorders a flow (INV-1).

*Transitional state:* today the main flow is still hard-wired to
summary + experience, identity blocks are engine-injected per page, and only
the sidebar flow is layout-declared. Rulings R-H/R-I schedule the removal of
all three special cases (I4/I6/I9). §2–§3 describe the target; §8 tracks
what is live.

### 3.2 Budgets

`capacity(page kind) = bodyHeight() − pads(page kind)`; `budget = capacity −
fixed`, where `fixed` is the measured height of that page's declared
repeated/pinned content plus page furniture. Budgets are two-valued (first
page, continuation pages); wrap widths are page-kind-invariant (pads differ
only vertically). A safety margin (`spacing.safety`, 15pt — shrunk from the
pre-measurement 220pt fudge, deliberately kept, never deleted) backstops the
measurement — and it must be **unreachable**, not merely bounded: no per-CV or
override surface may ever expose it, because lowering it is precisely how a
caller would talk the packer into overflowing.

### 3.3 Measurement

All heights come from `V`'s measurers evaluated with real font metrics
(fontkit — the exact library react-pdf renders through, pinned via `overrides`
so the measurer can never fork from the renderer's copy), quantized (0.01pt)
before comparison so cross-arch float noise cannot flip a page decision. The
browser preview may fall back to a char-width estimate that overshoots
~20–34% — documented as advisory, never used where a plan is promised.

Box-model rules the measurers mirror:

- **NFC normalization** before measurement (NFD input once false-fired the
  glyph warning and miscounted combining marks).
- **Glue shrink**: spaces compress up to width/3 per space before a break.
  This mirrors textkit's *feasibility test* (adjustment ratio ≥ −1), not its
  Knuth–Plass choice, so the model lower-bounds line count and any divergence
  under-measures — the unsafe direction. Standing mitigations: hyphenation
  stays disabled (the main source of non-greedy breaking), the near-boundary
  corpus (R-a), and the 15pt safety margin (one missed break costs 13.5pt
  against it — the corpus is required, not optional). Escalation on any
  measured divergence: port textkit's breaker (~200 lines, isomorphic),
  **never loosen the 0.01pt tolerance** — slack bounds go to zero, not up;
  if the tolerance ever needs loosening, the formula is wrong.
- **Bullet hang-indent** from the real dash advance plus margin
  (`spacing.bulletIndent` survives only as the browser-preview fallback for
  the dash column and is never exposed as a theme lever; the misleading
  second answer was deleted rather than kept).
- **Natural line height**: a row whose component sets no `lineHeight` is
  measured at the font's natural line height (Lato: exactly 1.2em), never at
  a theme leading it doesn't use; every text row's line count is measured at
  its true wrap width — nothing is assumed single-line.
- **Flex rows**: a baseline-aligned flex row measures as the max of its
  children's line boxes — exact only while one font family scales ascent and
  descent together (recorded assumption: a two-family row breaks the
  equivalence and must be re-derived before any type-scale work).

A measurement canary pins a known string's line count and width so a
fontkit/font bump fails loudly.

### 3.4 Splitting

Legal cuts are item boundaries in `[1, n−1]` (an item never splits internally;
a heading is never orphaned — the smallest legal piece of an entry is its head
plus one bullet). Every candidate prefix is re-measured with its continuation
title (`largestFittingPrefix` binary-searches over re-measured prefixes,
because a continuation retitles and the halves of a cut do not sum to the
whole). Split functions must shrink (asserted: a piece is never taller than
its block). A split's continuation repeats the section title with the
continuation suffix, composed identically on the plan side and the render
side; the suffix is measured at the role's size rather than the meta size the
component uses — a deliberate ~20%-of-width over-estimate on the safe side of
the wrap boundary, recorded as a decision, not an oversight.

### 3.5 The greedy front-load packer (`packBlocks`)

- **Rule 1 (force-place)**: a block that fits no page alone is placed anyway
  and the overflow is priced (`overflowPt`) — never dropped, never clipped
  (react-pdf *flows* overflow onto extra sheets; it does not clip — a
  three-agent "clipping" misdiagnosis was refuted by direct render and is
  dead).
- **Rule 1b (end early)**: if nothing of the leading block fits but a fresh
  page would take it, the page is emitted with room to spare and the block
  starts on the next page. Force-placement happens only when a full empty
  page could not take the block either — and that always sets `overflowPt`.
  (Added under adversarial review after splitting alone was shown not to fix
  the "sheet containing only a page badge" defect; six sibling shapes — giant
  bullet, description, progression, summary, one-item oversized section, tall
  identity — were closed or warned by the same rule.)
- **Rule 4 (split into room)**: a block whose legal prefix fits is cut per
  §3.4.
- **Front-load property**: maximality form — no earlier page could have taken
  the next placed piece — not fill-monotonicity, which is unachievable with
  atomic blocks.
- **Termination**: guarded structurally (`assertShrinks` on every split) plus
  a page cap that **throws** — it never truncates.

### 3.6 Optimality (a test, not an argument)

The pack is lexicographically optimal on `[pages, page1Used]` among legal
packings — fewest pages, then fullest first page. No third component: any
further tiebreak would smuggle in an aesthetic aggregate (§7.3). This is
enforced two ways: `layout.minimality.test.js` (atomic flows against
exhaustive assignment search; splittable flows against a cut-point-aware
search; the real packer against a brute force using its own measurement —
zero counterexamples in 15,363 generated flows, and three seeded packer
faults fail it) and the exhaustive optimality oracle over the fixture corpus.
Corollary, measured in C4: **no lever that only rearranges can remove a
sheet** — at fixed heights and order the page count is already minimal;
only re-measuring (density) can change it.

---

## 4. The section vocabulary contract

Each section is one plugin: `render_s` (a React-PDF component, column-aware
typography), `measure_s` (the exact box model of what `render_s` draws, at any
column width), `split_s` (legal cuts + continuation form). The renderer and
measurer are one unit — a change to either without the other is the defect
class behind both 2026-08 incidents — and the mirror is *enforced*, not
trusted: a component's item list must be consumed from the same source the
measurer reads (a hand-mirrored copy once let a pure reorder pass a 455-test
suite), `layout.mirror.test.js` proves the item drawn at index i is the item
the engine holds at index i, and slice-height monotonicity (what makes the
split binary search exact) is swept as a test.

**The standing rule for fidelity fixes: the model mirrors the render; the
render is never adjusted to suit the model — unless the render itself is the
defect.** A render change moves every existing user's output; a model change
moves only what the packer believed. (This is why adding `lineHeight` to
unstyled rows, charging an unrendered margin, or widening the dash column
were all rejected: they change shipped design to fix a wrong mirror.)

**The write-only-token defect class, named:** a theme token the measurer
reads but the renderer does not (`bulletGap`, `summaryBulletGap`,
`chrome.dividerMargin` were write-only until S1 wired them) moves the packing
model and not one rendered pixel — a lever that desynchronises measurement
from render, strictly worse than no lever. Standing rule: no spacing token is
exposed to any surface unless the mirror sweep proves it moves render and
model together.

The experience box model, as the render-diff pins it (vocabulary-owned per
R-I): wrapped role line(s) + meta row (`entryMetaMt` + max of company/period
line boxes) + optional location (`locationMb` + row) + optional description
(`descMt` + row + `descMb`) + progression (`progMt` + `progMb` + per-step
`2·progPy` + max(title, period) rows at width `innerW − progPl −
sectionBorderWidth`) + bullets (`descMt` + measured lines × line height +
`(n−1)·bulletGap`, at the dash-hang width) + `entryMb` at token value. A
continuation = the retitled role head (composed string, wrapped) + bullets +
`entryMb`.

Adding a section = adding a plugin + fixtures; the engine does not change.

---

## 5. Invariants

Each invariant has an ID, a statement, and (in §6) an instrument. "Lands at"
marks the ones scheduled by §8 rather than live today.

- **INV-0 Content fidelity.** Every character of `C` reaches the PDF text
  layer, unaltered — no dropping, truncation, case-transform of user strings,
  substitution, or reordering. CVX may not change a single character of
  supplied text, ever, for any reason. (Original form, verbatim: "CVX renders
  100% of the YAML text, always. No lever, weight, or target may drop, hide,
  or clip content — not to save a page, not because it's 'ugly.' When content
  doesn't fit, the engine adds pages and splits sections at item boundaries;
  it never truncates. CVX is a faithful formatter, not a content gatekeeper."
  The one irreducible residual — a single item taller than a whole page —
  wraps and flows, never truncates. The sole exception surface, scoped
  precisely: `keywords.yaml` is embedded in PDF metadata, never printed on the
  page, and it is the one place CVX alters supplied strings —
  `sanitizeKeyword` collapses internal commas and whitespace runs (the field
  is comma-joined; an internal comma would produce spurious fragments), and
  `atsKeywords.max` caps the list, defaulting to full length, so only the
  user's own config truncates. INV-0 governs rendered text; this is metadata,
  and the distinction is stated rather than left as a quiet counter-example.)
- **INV-1 Placement soundness.** Every declared block is placed exactly once;
  flow order is preserved; no heading is orphaned from its first item; a
  section key appears at most once across a layout's slots (validation
  rejects duplicates — lands at I6).
- **INV-2 Measurement fidelity.** For every block type, at every column width
  it may render at, the harness asserts `|measured − rendered| ≤ 0.01pt` per
  row; the recorded diff tables sit at zeros. (0.01pt is the comparison
  tolerance — pdftotext prints 6 decimal places; the zeros are the measured
  result, not the bar.)
- **INV-3 Measurement coverage.** Everything the renderer will draw is
  measured by the planner — no unpriced ink. (Found violated for
  non-experience main slots, 2026-08-14; lands fully at I4/I6.)
- **INV-4 Plan–physical equality.** The PDF's physical sheet count equals
  `Plan.totalPages`, or the build emits a `kind: 'defect'` warning naming both
  numbers (lands at I1). Physical < planned is structurally impossible and
  asserted as a harness invariant. The bookkeeping identity `physical ==
  planned + unplanned` is tracked per corpus sweep (C0: 98 = 68 + 30 → C3b:
  85 = 84 + 1).
- **INV-5 Honest silence.** Every defect state has a named warning code; a
  clean report means a clean artifact. Diagnostics are a pure function of the
  plan; the physical count is the one envelope-level exception, and dry runs
  never carry it.
- **INV-6 No judgement.** No placement choice, no aesthetic objective, no
  aggregate score, no recommendation string anywhere in engine output.
  `shortByPt` is the only monotone number published. Arrange-only is designed
  in, not policed: no include/exclude capability exists anywhere in the
  engine surface.
- **INV-7 Nothing altered to fit.** No compression, stretching, dropping, or
  rewording under pressure; pagination is the only pressure valve. (The
  measured cautionary tale: `wrap={false}` once collapsed a page count by
  compressing a tall sidebar into overlapping glyph soup — rejected as an
  Invariant-0 violation in spirit.)
- **INV-8 Engine genericity.** The packing/coordination core contains no
  section-name literals and imports nothing from the vocabulary (guard lands
  at I6 for the packer, I9 for the coordinator).
- **INV-9 Pack optimality.** Lexicographic `[pages, page1Used]` optimality
  among legal packings, exhaustively verified (§3.6).
- **INV-10 Isomorphism.** The engine core runs in the browser (no fontkit, no
  node:fs at module level — enforced by an import-graph walk); measurement is
  injected; the fallback estimator errs only in the safe direction for packed
  flows and its preview status is documented.
- **INV-11 Determinism & reproducibility.** Same inputs → byte-identical PDF
  under pinned `SOURCE_DATE_EPOCH`, per the §2.6 byte promise; heights
  quantized before comparisons; no RNG; the reproducibility patches verify
  their own patch points and warn loudly if the pdfkit dependency drifts out
  of the tested range.
- **INV-12 Injection containment.** Layout instructions are never read from
  body text — CV content is data, not commands. Proven both ways, with
  one-sided assertions: a directive planted in `keywords.yaml` (rendered
  nowhere) leaves diagnostics byte-identical; a directive planted in a
  *measured* entry may only GROW the affected height fields (text is text)
  while everything else stays deep-equal and the warning code/kind set is
  compared. Any user string quoted into a message is whitespace-collapsed,
  single-line, and length-capped (80 chars).
- **INV-13 Variant isolation.** Each build variant renders in an isolated
  process — react-pdf leaks font-subset state across renders in one process,
  which silently corrupted the second variant's text layer (glyphs fine,
  ATS-extracted text garbled: "First Place" → "ir t Place").
- **INV-14 Script honesty.** Unsupported scripts (non-Latin) are detected and
  warned loudly at validate and build — never rendered as invisible tofu in
  silence. (Scope ruling R-A: Latin-only rendering is intentional; the warning
  is the complete answer until real demand arrives.)
- **INV-15 Plan–render surjectivity.** Everything the planner prices is actually
  drawn: every block the plan places reaches the page, and every slot key the
  plan measures resolves to a component that renders it. **This is INV-3's
  converse and it was missing** — INV-3 forbids ink the planner never priced;
  nothing forbade a price the renderer never spends. Added 2026-08-18 after the
  R-block found three independent instances (RV1, RV3, RV4), each of which passed
  `validate --strict`, passed `build --strict`, published the dropped content in
  the plan's own `--json`, and left a 98.9%-covered suite green. The asymmetry
  was structural, not accidental: `main-slot-unmeasured` and
  `physical-pages-exceed-plan` both watch for *more* ink than planned, and the
  corpus reaches neither direction of *less*. Instruments in §6; the load-bearing
  one is the render-level content oracle, whose reach RV2 widened.

Driver-layer invariants (held by the LLM, taught by the product surfaces,
verified by dogfood transcript review): the fabrication walls and editing
bound of §1.2.

---

## 6. The verification apparatus (how correctness is measured)

*Instrument → what it proves → where it lives. Every INV maps here; an
invariant without an instrument is a claim, not a property.*

| Instrument | Proves | Lives at |
|---|---|---|
| Render-diff harness, main + sidebar (pdftotext -bbox role/title-top differencing through the real CLI; tables pinned at zeros, tolerance 0.01pt; sidebar verified across all 8 section kinds + identity). Also asserts **no main-column ink past the content box** (badge excluded) — the standing detector for the meta-row overflow class (§8). Theme-parameterized: the zeros are a fact about one theme (Lato at shipped sizes — the flex-row max and dash advance are single-family facts), so re-derivation under a new type scale measures the document actually rendered. Asserts its own coverage: a floor on entries measured, zero tolerated skips. | INV-2, INV-3's closure | `test/layoutMainMeasureDiff.test.js`, `test/layout-harness/mainMeasureDiff.js`, sidebar twin |
| Optimality oracle (exhaustive enumeration, quantized, state-space tripwire) + minimality test (three seeded packer faults must fail it) | INV-9 | `test/layoutOptimality.test.js`, `src/pdf/layout.minimality.test.js` |
| Structural invariants — verbatim: "every block placed exactly once, order preserved, no page over budget, no empty column (except the deliberate huge-flow residual), no orphan heading, front-load property". Block identity embeds the entry's canonical index (`exp:${index}:${role}::${company}`) — identity without position collides for two same-role same-company stints and silently defeats placed-exactly-once; regression-tested with exactly that shape. | INV-1 | `test/layoutHarnessInvariants.test.js`, `test/layout-harness/invariants.js` |
| Content oracle: render-level text presence for **every** experience bullet and every item of every present sidebar section, both variants, hard-asserted per fixture. Sentinels are each item's trailing ~6 words (clipping eats a wrapped block's later words while its first line still renders — a head sentinel passes on a clipped item; roles-only/last-item coverage was exactly the blind spot behind a refuted clipping misread). Reading-order extraction — never `-layout`, which interleaves columns and manufactures false misses. Non-vacuousness is proven, not assumed: a committed self-test seeds a missing sentinel and must go red, and a constructed worst-case overflow probe (fifteen unique long bullets forced past page 1) proved "complete" reports non-vacuously. Fixture text is RNG-free (fixed pools; same spec → byte-identical YAML); known residual: the overflowing bucket's pool is smaller than its bullet count, so two identical bullets could mask a clip there — real prose doesn't share the property. **Visibility caveat**: the oracle reads the `pdftotext` layer, so it enforces "present in the text stream" for an invariant written as "visible on the page" — a glyph-clipped value passes with the full string extractable (live instance: a long unbreakable contact value clips mid-token at the sidebar edge while `validate --strict` reports ok; the wrap-not-clip ruling in §7.1 is the fix, unimplemented). | INV-0 | `test/layout-harness/contentOracle.js`, `textPool.js` |
| Render oracle (pdftoppm/pdftotext physical facts). Blank-page detection is a whole-page ink *ratio* (`BLANK_PAGE_MAX_INK_RATIO` = 1%, calibrated: badge-only spill ≈0.37%, sidebar-overflow page with real content ≈1.75% — must never read blank, ordinary pages 13–25%; the margin either side is the anti-flakiness budget for poppler jitter). Empty-column detection is ink-band *presence* (zero bands — no threshold to mis-tune; a 3%-area threshold once flagged a genuinely-rendered sparse CV as empty). The corner badge always contributes exactly one band to the main region, so an out-of-content main column carrying the badge is deliberately not flagged — accepted because the shape stays visible two other ways (physical-vs-planned gap; content completeness). Ratios over byte sizes because PNG encoding is version-dependent. ATS variant: structurally cannot exhibit two-column defect shapes; `emptyColumns` is designed-variant-only, and a near-blank ATS last page is a benign content tail. | INV-4's ruler, physical page count | `test/layout-harness/renderOracle.js` |
| Canonical environment: ubuntu-latest + Node 22 is the one CI leg with poppler and the environment every ink/pixel threshold is calibrated against; every other leg omits poppler on purpose, and without poppler the rendering suites **skip cleanly** (verified against a simulated poppler-free PATH) — a skip, never an error — while pure invariants, corpus identity, and reproducibility still run everywhere. | threshold validity | `ci.yml`, harness gating |
| Byte-repro double build + two-architecture CI legs (`repro-arch` on ubuntu x86_64 + macos arm64; compare job distinguishes layout vs compression divergence) + patch-point self-verification | INV-11 | `test/layoutRepro.test.js`, `ci.yml` |
| Isomorphic suite (import-graph walk; measurer-less run) | INV-10 | `src/pdf` isomorphic tests |
| Injection tests (hostile directives in keywords and body; byte-identical / one-sided-growth assertions per INV-12; seeded real attacks must fail them) | INV-12 | `test/planLayout.test.js` (injection block) |
| Render isolation test | INV-13 | `test/renderIsolation.test.js` |
| Mirror test (rendered index i ≡ engine index i for every section, via react-dom/server; `sliceItems` throws on short lists; slice-height monotonicity swept). Token-perturbation: for every theme token the model reads, render under a perturbed theme and assert the rendered geometry moves with the model's prediction (e.g. `bulletGap` 4.5 → 9 grows both `entryH` and the rendered role-top delta by `(n−1)·4.5`) — the next hardcoded component literal fails it; mutation-verified. | §4's mirror | `src/pdf/layout.mirror.test.js` |
| Stale-build guard (`lib/.build-manifest.json` content hash re-derived before the first CLI spawn; mutation-verified) | harness runs the engine it thinks it runs | `test/layout-harness/scaffold.js` |
| Public/harness API partition (nine public names; `@internal` tag roll-call kept in sync; shipped modules may not import internal names) | API discipline | `layout.api.test.js` |
| docsSync (model-facing docs derive from source-of-truth exports; warning codes, occupancy wording, kind lists, emptyColumn caveat, file lists all guarded). The model-facing list includes the MCP tool descriptions and server handshake (`src/mcp/tools.js`, `src/mcp/server.js`) — a doc guard that iterates only markdown misses the surfaces agents actually read; it caught a stale sentence on its first extended run. Prose-drift outside its tripwires is a known limitation. | INV-5's doc half | `test/docsSync.test.js` |
| Genericity guard. **Re-specified 2026-08-18 (RV6): a positive contract on the block type, not a denylist over names.** `packBlocks`, `largestFittingPrefix`, `declineOf`, `canPlaceOn`, `maxPagesFor`, `assertCarryShrinks` and `describeBlock` may read only `{height, gapBefore, split, itemCount, id}` — mechanically checkable by packing a flow of `Proxy`-wrapped blocks that throw on any other property read. The original scope ("no section-name literals / vocabulary imports in core") was measured against a real violation and **would not have caught it**: `maxPagesFor`'s `b.entry?.bullets?.length` is structural knowledge of the experience vocabulary with the identity spelled nowhere, and a string denylist passes it green. The literal denylist is still worth having for the coordinator at I9, but it is the weaker half and must not be mistaken for the guard. | INV-8 | `src/pdf/layout.genericity.test.js` (positive contract, RV6); literal denylist still at I9 |
| Theme-threading gate: six harness modules hardcode `tealTheme` (`structuralFacts`, `measureDiff`, `mainMeasureDiff`, `sidebarBudget`, `sidebarPlan`, `renderOracle`), `themeFor(spec)` does not exist, and no fixture has ever varied a theme — while a second theme (`coral`) ships. Any increment that makes theme or geometry vary per CV threads the fixture's real theme through the harness FIRST, or INV-2 is re-derived against the wrong document and still passes (the layout twin already happened: three harness sites planned against the default layout while rendering the scaffold's own, invisible exactly as long as the two agreed). | INV-2's subject validity | precondition for I5/I9 and any theme/geometry surface |
| Mutation discipline: every new guard must fail when its defect is seeded — a test that can't fail is vacuous. A deferred assertion is never an empty skip — `it.todo` with an `expect.fail` body, so un-deferring without real assertions fails loudly. | test honesty | per-fix, recorded in test comments |
| Fixture corpus governance. Two-tier fact taxonomy: **Tier 1** — hard invariants (INV-0 at bullet granularity, placed-exactly-once, order, anti-orphan) and content completeness — asserted fresh every run, never recorded; `generateBaseline.js` refuses to write on any violation (a regenerate can never "record" one as false). **Tier 2** — descriptive facts (physical/logical page counts, blank pages, empty columns) — baseline-locked: allowed to record known bugs, red on any change, regenerated only alongside a real fix, so `baseline.json`'s diff across commits is the changelog of what got fixed; byte sizes and raw ink ratios recorded for debugging only, never compared. The lock is mutation-verified. **Migration taxonomy** — acceptable diffs: `pageCount` and `logicalTotalPages` moving together; consequential `emptyColumns` movement; added keys. Stop and investigate, never regenerate over: `pageCount > logicalTotalPages` appearing; any new `blankPages`; any Tier-1 violation; a page-count change on a fixture whose render-diff table is not at zeros. The regenerating commit names each changed fixture, direction, and the explaining term — an unexplainable diff is a stop-work signal. A regeneration must be an improvement axis by axis; fewer pages must mean less wasted space, never less content. Corpus construction: deterministic greedy pairwise cover over the factor axes + named risk/edge fixtures + the shipped scaffold as the one real-world fixture; fixtures generate into temp dirs at test time, only `baseline.json` is committed; degenerate inputs and every defect shape join as named fixtures (the S2a additive pattern). | §2.5 | `test/layout-harness/fixtures.js`, `generateBaseline.js`, `baseline.json` |
| The two-prompt gauntlet (monthly + after any front-door doc change; fixture identity, never a real person; 4 binary stages — fetch/LinkedIn-wall/valid-files/PDF-reached; instant fail on any invented fact or substituting another renderer; north star = S4 pass rate) | the front door works | protocol + log archived (`research/archive/gauntlet.md`) |
| Coverage/lint/type gates (per-file 90/85/90/90 on shipped runtime code, zero exceptions — `perFile: true`, because a glob threshold without it is an aggregate wearing a per-file name, a real found defect; `tsc --strict checkJs` at 0 errors; adjudicated lint table with the rule "a global disable is only honest when the rule is a false-positive for the whole codebase uniformly"; vitest `no-focused-tests` because a stray `.only` guts the suite under green CI) | code-quality floor | `vitest.config.js`, `.oxlintrc.json`, biome config |

**Verification doctrine** (lessons promoted to rules, each learned the hard
way; sources in §10):

1. **Agreement is not verification.** A claim repeated by multiple agents can
   share one upstream misread; only a direct render-and-look settles a
   content-loss claim. `pdftotext` presence ≠ visible (it extracts glyphs
   drawn off-page too); plan-level "placed" ≠ rendered.
2. **Never suppress stderr on a verification build**; assert exit code and
   non-empty output before concluding anything.
3. **Extract in reading order** for content checks; `-layout` mode is for
   reading a source document's structure, never for verifying output.
4. **Ruler before cut**: land the measurement/guard that would catch a defect
   before the change that could introduce it (C0 before the engine; S2 before
   S3; I1 before I4).
5. **Degenerate inputs are fixtures**: the empty flow is the smallest element
   of the domain and the one nobody tests. `experience: []` taught this; so
   did 28 fixtures whose summary height was a constant 29.6pt below a cliff.
6. **The corpus must contain the shape** — a green suite over a corpus that
   cannot reach the error is a claim about the corpus, not the code. (Proven
   three times: the lever-axis gap — a seeded Invariant-0 bug in an
   unexercised mode kept the whole suite green; the incident corpus — a model
   bounded at 8pt/entry in a test comment while no fixture had a progression
   or location, 658 tests green as real content breached it; and the
   student-CV shape.)
7. **A lever needs four things in one commit** — the schema key, the
   `resolveDocument` whitelist entry, the tool input schema, and a fixture
   axis — or it ships as dead code that looks tested.
8. **Record refuted claims by name.** The repo's own postmortems list their
   authors' wrong claims with the refutation; a correction that hides the
   error teaches nothing.
9. **Assert the diagnostic, not the content fact.** A `totalPages === N`
   assertion pins a fact a legitimate fidelity improvement may change — and
   would have passed on the broken engine too. Regression fixtures assert
   warning codes (exactly once, right page, absent siblings) and arithmetic
   identities recomputed from the plan, never copied from the payload under
   test; any page-count assertion is a bounded canary (`totalPages ≤ N`) that
   cannot fail on a better model.
10. **Direction is not a safety argument.** The mirror's errors once ran both
    ways and cancelled — "the model over-measures, the safe direction" was
    false as written while every test stayed green; harnesses assert
    per-shape agreement at tolerance, never a net direction claim.
11. **Publish no number off an unverified model** — a shortfall computed from
    a model wrong by 13pt/entry is worse than silence; fidelity lands before
    any surface that publishes heights, and provably-inert changes land first
    so later diffs have fewer suspects.
12. **A number is produced at least twice by different instruments before it
    is written down.** Every figure in the pagination postmortem was measured
    twice, independently re-derived, then verified line-by-line — and round
    one, wrong in its central claim, is why the discipline exists.
13. **A threshold calibrated around a loose measurement hides real defects.**
    The 220pt overflow threshold sat between the estimator's overshoot and
    the mildest real defect and silently suppressed a real warning for the
    product's whole life; when measurement tightens, thresholds shrink to an
    honest backstop (15pt).
14. **Defect response is: independent expert design → document → review →
    implement.** No shortcuts. Doctrine 8 records refuted claims; this is the
    mechanism that caught them, both times it was used.

### 6.1 The development process (roles and gates)

Every increment moves through eight gates; each gate has an owning expert.
The maintainer sits above the table (per §1's actor table): rulings before
design, contested choices presented as questions with options and costs,
final approval at ship. The orchestrator coordinates, implements most
slices, and **verifies every expert claim first-hand** before acting on it
(doctrine 1: agreement between agents is not verification).

| Gate | What happens | Owner |
|---|---|---|
| 1. Pre-flight | Acceptance criteria re-read (§8); binding rulings confirmed (R-D/R-E/R-F…); corpus reachability checked (doctrine 6) | Orchestrator |
| 2. Ruler first | The tests that would catch the defect land red, before the change; mutation-verified (doctrine 4, 9) | **QA expert** |
| 3. The slice | Small, independently shippable; the system strictly more honest after than before | Implementer |
| 4. Mirror | A render change moves its measurer in the same commit (§4); render-diff stays at zeros | Implementer, checked by architect |
| 5. Full battery | All tests, lint, tsc, byte-repro; baseline regeneration in its own reviewed commit under the migration taxonomy | Orchestrator + QA |
| 6. Doc sweep | SKILL, ai-guide, llms.txt, MCP tool descriptions + handshake move with the change; docsSync enforces | Implementer |
| 7. Independent review | Architect (implementation accuracy, seams, invariants) + QA (test adequacy); the-fool adversarial pass when the change touches honesty surfaces or packing | **Architect, QA, the-fool** |
| 8. Ship | CHANGELOG at ship time; item deleted from SPRINT.md in the same commit; version bump iff semantics changed (R-E); release version assigned at cut, never before | Maintainer approves |

Ceremony scales with the increment: small slices (I1–I3-sized) run gates
1–8 with three experts; large slices (I6, I9 — anything changing packing or
plan shape) additionally require an **algorithm-designer design note first**,
reviewed by architect + the-fool, with maintainer rulings on any forks,
before gate 2 begins — doctrine 14 applied to scheduled work, and the same
ceremony the sidebar rework received. Product manager and business analyst
enter at sprint composition and findings-to-requirements conversion, not
per commit. Binding on all roles: doctrine 8 (refuted by name) and doctrine
12 (a number is measured twice by different instruments before it is
written down).

---

## 7. Decision record

### 7.1 Live rulings (maintainer, dated)

| # | Date | Ruling |
|---|---|---|
| R-A | 2026-08-01 | Script support: Latin-only rendering, detect-and-warn for the rest; fallback fonts would blow the <500 kB tarball budget; revisit on real issue demand. The multilingual landing page is deliberately independent of renderer script support. |
| R-J | 2026-08-13 | `sidebarFraction` stays exposed in any shipped per-CV surface, bounds 0.28–0.45 as *legibility* limits (the lower bound evidenced by the 0.25 render), never presented as a page-count control. Measured: 0.37 is the demo's only two-page value and a knife edge (±0.05 costs a page); the lever trades which flow binds — narrower wraps more and gets taller; at ≥0.45 the main column binds instead. The narrow-the-sidebar instinct is measured-false; spacing tokens are where predictable leverage lives. |
| R-K | 2026-08-13 | One type-scale legibility floor: **6.5pt**, applied to every resolved size. Derivation: the theme ships 7pt text, so a floor above 7 invalidates the shipped design and a floor at 7 permits no downward scaling; 6.5 leaves one step of headroom. Rejected: per-role floors (a second table) and refusing to scale sidebar text (removes the lever where the pressure sits). Accepted cost: 6.5pt body prose is permissible in principle. |
| R-L | 2026-08-13 | Wrap rather than clip: long unbreakable contact values (emails, URLs) break across lines so every glyph is visible — what INV-0, which names clipping, requires. Known cost: sidebar heights change, so INV-2's agreement must be re-derived. Engine work, verified unimplemented 2026-08-14; tracked in §8. |
| R-M | 2026-08-14 | **Out-of-range values on any future per-CV surface are REJECTED by validation** (all errors at once, field path, suggested fix) — clamp-and-notice is not ratified. Accepted cost: a taste preference just past a bound fails an otherwise valid build. Distinct from and consistent with the dead-key rule: *ignored* keys (the legacy `geometry:` block) get a notice, never an error — back-compat for keys that do nothing; *live but out-of-range* values on a working surface are errors, because a silently-adjusted control is the dead-geometry-block cautionary tale in a new shape. |
| R-B | 2026-08-13 | Config levers `page1ExperienceCount`/`page1SplitBullets`: **removed outright**, not deprecated — they never reduced the page count and forcing them produced unnumbered extra sheets. Validation names the removal AND the replacement (automatic packing, which never overflows) — never a bare "unknown key". |
| R-C | 2026-08-13 | No packing-policy change in the fidelity sprint; adopt the optimality oracle. |
| R-D | 2026-08-14 | Exit codes: physical≠plan is exit 0 + defect warning; non-zero under `--strict`. Defects reach stderr in all modes; facts never do. |
| R-E | 2026-08-14 | Diagnostics version discipline: semantic change to a published field ⇒ version bump (student-CV fixes ship as v3). |
| R-F | 2026-08-14 | Message policy: **facts name conditions only** — prices yes, instructions never; advice lives in the skill. |
| R-G | 2026-08-14 | Vocabulary features wait for the engine work (I7 after I6) so every new section is born measured. |
| R-H | 2026-08-14 | **Full placement generality**: the engine never assumes any section's column or order; templates carry geometry + conventions only; summary/identity/experience special cases are scheduled removals (I9). |
| R-I | 2026-08-14 | **Engine knows shapes, never identities**: no section-name literals in the core; the vocabulary layer owns names; enforced by guard. |

### 7.2 Decisions overturned by later rulings (do not follow archived docs on these)

| Was | Where recorded | Overturned by |
|---|---|---|
| Main flow deliberately homogeneous (summary+experience only), "revisit if heterogeneous" | layout.js decision note; C3b/C4 deferral; fidelity design | R-H: heterogeneity is the target (I4/I6); the deferral's own trigger condition arrived (the student CV). |
| Summary-as-packed-block "not worth it now" (deferred twice, with measured thresholds: defect begins at 14 summary bullets / ~630pt on the shipped scaffold) | C4 note; fidelity + plan reviews | R-H: un-deferred; ships in I9 on I6's plumbing; the thresholds stay true until then. |
| Identity blocks engine-injected per page; identity term hard-coded in budget functions | C3 design | R-H: becomes declared, repeatable placement (I9). |
| Sidebar sections semantically pinned to the sidebar; experience pinned to main ("the engine may not move a section across the divide") | packing design §2.3 | R-H: pinning becomes layout-declared intent; the engine itself assumes nothing. |
| Per-section measurement formulas and identity-flavored names (`SIDEBAR_SECTIONS`, `contactRows`, `identityH`) living in the packing layer | C3a implementation | R-I: migrate to the vocabulary layer (I6/I9). |
| Warnings may carry imperative edit advice ("shorten the summary…") | diagnostics v2 messages | R-F: prices stay, advice moves to the skill (I3 sweep). |
| `emptyColumn` = "no packed blocks" | diagnostics v2 | I2: means "no ink"; a summary-bearing page is not empty. |
| Per-page-kind `main` slot semantics ("first.main renders on page 1") | schema description | I6: main lists become ORDER — completing the C3a reinterpretation. |
| The lever surface as designed (`fill`/`weights`/`order`/`buckets`/`targetPages`) and the C6b levers chunk | packing design §7.1; sprint C6b | C4 measured the central objective as wrong; C6b closed 2026-08-09 as premise-superseded ("the objective was never a page count, it is an assistant that iterates like a designer"); R-H replaces per-column overrides with layout-declared flows. `density` remains the one lever class that could ever remove sheets (it re-measures) — unbuilt, unscheduled. |
| `planIterations` iteration cap as a designed MCP behavior | C6a | Verified design-loop finding: a statelessness violation. Deleted in sprint 1 (see §2.4). |
| P1/P2/P3 phase roadmap (design-loop / p3-surface drafts) | sprint-design-loop, design-p3-surface | §8's I1–I9 plan; landed P1 outcomes are history; P1a and P2 carried as open backlog (§7.4). |
| Vertical glue / `applyVerticalGlue` (G4 "fills the page") | packing design §3–§4 | Never shipped; C4 measured only 6.7% of corpus slack reachable (19 of 200 page-columns), and filling it spends the safety backstop. Dropped. |

### 7.3 Standing rejections (alternatives priced and refused — with the numbers)

- **Whole-document quality scores / aggregate fills.** Every measured
  aesthetic objective crowned a pathology. The balancer driven to its metric
  (planned-empty-column pages 42 → 8) produced a `(cont'd)` heading with one
  bullet over ~90% white (fills 0.15/0.07/0.12/0.07) and a section fragmented
  across five pages — **the approach fails because it succeeds at the
  metric**: on this corpus the proxy is anti-correlated with quality over the
  range a balancer can move it. The design objective `Σ residualSlack²`
  ranked an EMPTY page-1 main column the best pagination of the shipped
  scaffold (D=238.1k vs the shipped answer 5th of 6 at D=440.9k); fill-ratio
  normalization only promoted a different lumpy layout (86%/31%/56%). A
  usable objective needs a résumé front-load asymmetry nobody has specified.
  Facts stay per-page; no aggregates; no third objective component. Any
  future whole-document quality signal would have to be **veto-shaped, not
  additive** — one catastrophic feature must be able to sink the whole
  (C4's `Σ residualSlack²` crowned the empty-page-1 pagination precisely
  because a smooth sum averages catastrophe away; Harrington-style aesthetic
  measures combine nonlinearly for this reason) — and it would still be the
  wrong actor's job. The layout literature enters as vocabulary for the
  skill — what to look for — never as an objective in the engine.
- **Engine-chosen placement.** Placement objectives are aesthetic objectives
  (above); the layout YAML is designer intent, and an engine that overrides
  it turns the YAML into a suggestion.
- **Even-balancing as default or agent-visible lever.** Front-load is the
  résumé norm and the default; `balance` measurably fragments (above) and an
  agent optimizing the visible number would land exactly there with the
  metric green.
- **Smarter packers** — page-break DP (Knuth–Plass over pages), lookahead,
  backtracking: cannot reduce the page count (§3.6 — already minimal at fixed
  heights); they only re-rank breaks within a fixed count, which requires
  exactly the aesthetic objective C4 refuted, and they add a second decision
  path to a packer whose termination proof is one paragraph.
- **Head-internal splits** (a role heading on one page, its body overleaf):
  rejected three ways — every split *adds* height (the continuation repeats
  the title; +26.50pt per cut on the motivating CV), it forces a C3a-sized
  plan/render contract change, and it orphans a heading, which
  `noOrphanHeading` forbids as a hard invariant the baseline generator
  refuses to record. Revisit condition: change the invariant in the open
  first — a rule for which head rows may be orphaned and a fixture proving
  the render — before any packer change.
- **Statefulness inside CVX in any form** — undo, snapshots, receipts,
  iteration-acceptance rules, or a stored brief (`preferences:` block or
  brief file): rejected. The LLM already holds the conversation, the memory
  of what it tried, and instructable backtracking; building those into CVX
  rebuilds them in the wrong place, worse, permanently. CVX never keeps
  track of previous iterations.
- **MCP arguments as layout levers** — rejected by all four review lenses,
  stated as the channel rule: every per-CV design control travels through
  `config.yaml` and `layouts/*.yaml` — reviewable, diffable, the user's —
  never through an MCP argument, which is invisible and a one-way door. An
  `order` MCP lever adds zero marginal capability over a layout file the
  user can read and diff. This governs any future MCP surface: it kills the
  channel, distinct from the row above that kills the levers' objective.
- **`targetPages` in any form** — unanimous across the four review lenses:
  it creates a goal the engine cannot satisfy (§3.6: the page count is
  already minimal), so the model's remaining actuator becomes the YAML —
  layout pressure converted into content edits, the exact pressure INV-0's
  regime exists to keep out of the pipeline.
- **Bundled rasteriser** — rejected at 13–33 MB against a 372 kB package; the
  clients that matter already open PDFs. Any preview capability rides the
  host's existing poppler (`hasPdftoppm()`), never a bundled dependency —
  which is also what keeps the blind-client fallback (single build, no loop)
  in force.
- **Markdown parsing inside content strings.** An asterisk must reach the
  page as an asterisk (INV-0); markup-in-strings is also an
  injection-adjacent surface. Structured spans (like the existing
  `{text, link}` form) are the acceptable shape if inline emphasis is ever
  built.
- **"Fixing" `totalPages` to count spill sheets.** A totalPages that
  contradicts the printed page badges is a different lie; the plan counts
  what the badges print, and INV-4's warning names the mismatch instead.
- **A better number beside a misleading one** (shipping `occupancy` next to
  the v1 `fill`): rejected — every shipped doc and the skill point at `fill`,
  so the misleading number keeps being read; redefine and bump the version
  instead. (Recorded as the lower-risk alternative if a maintainer ever
  prefers coexistence.)
- **Deleting write-only theme tokens instead of wiring them**: rejected — the
  same literals would move into the file that is supposed to mirror the
  render, and designed theme surface would be deleted. Wiring is the accepted
  render-side class because it is provably free: byte-identical output under
  `SOURCE_DATE_EPOCH` is the acceptance criterion, not a hope.
- **Do-nothing geometry keys, and geometry-as-page-count-control.** What
  stands rejected is precisely this pair: keys that do nothing ("removed
  rather than left in place looking like a control" — the shipped-but-dead
  `geometry:` block is cleaned up with a notice, never a validate error,
  because every scaffolded workspace has one and rejection would fail their
  builds to protect them from a no-op), and presenting any geometry knob as a
  page-count lever (the knife-edge measurements under R-J). The knob itself
  is NOT rejected — R-J rules `sidebarFraction` stays exposed with legibility
  bounds when the per-CV surface ships. Riders on that surface: the revisit
  gate is a real transcript in which a missing geometry control was the
  actual blocker — the first real transcript (2026-08-14) did not point at
  it, so the gate stands unmet; the theme-threading gate (§6) and the
  write-only-token rule (§4) are measured preconditions.
- **Free 2-D float placement** (sections leaving their column to balance):
  NP-complete (Plass 1981) and out of scope permanently — column-bound flows
  are what keep the model polynomial and the semantics pinned.
- **A drop/exclude lever of any kind** (`weight`-based dropping, `include`
  lists, buckets that omit): designed out, not policed — dropping content is
  a YAML edit by the user, never a layout capability (G-c).
- **`wrap={false}` / compression tricks** to force page counts: produce
  overlapping glyph soup; Invariant-0 violations in spirit (measured, C1).
- **Full non-Latin rendering** (for now): R-A above.
- **Container image / standalone executables / Ollama recipe / hosted
  anything / telemetry / paid tiers / CVX calling LLMs / embellishment
  features / GPT Actions / registries we control / further llms.txt
  investment**: the standing cut list — solo-maintainer economics and the
  dumb-instrument thesis. (The awesome-mcp-servers PR died on this: its only
  merge path required the Glama container gate.)
  - **GPT Actions — tried and re-cut, 2026-08-18.** The ruling was overridden
    to get a ChatGPT UX working: a Custom GPT with an Action that delivered the
    standalone bundle as an `openaiFileResponse`, backed by static endpoints on
    the Pages site. It worked. It was removed the same day, and the entry stands
    — because the sandbox turned out to be able to download the bundle itself,
    which makes the Action redundant for the one job it existed to do, and
    because OpenAI restricts who may create or publish GPTs at all. What
    replaced it costs nothing to maintain: the landing page carries the
    instructions, and the assistant fetches the release asset. Nothing shipped.
  - **The single-file JS bundle (1.9.0) is NOT a breach of "standalone
    executables"**, and the distinction is deliberate rather than eroded: it
    requires Node, so it is a distribution format for a runtime that already
    exists, not a runtime we ship. Native executables stayed cut on the
    measurement — +110 MB, and a per-platform build matrix to solve "no Node",
    a problem no measured target environment has. Container images stayed cut
    because the sandboxes this is for have no container runtime at all.
    **Why this shape survives vendor churn, which is the real argument for it:**
    three OpenAI surfaces moved under this work in a single day (2026-08-18) —
    the container's npm reachability, `container.download`'s reliability, and
    who may create or share a Custom GPT. The bundle was unaffected by all
    three, because it is a file that runs on Node and depends on no vendor
    product decision. Two corollaries: do not build on `container.download`
    (it refused `application/json` on a content-type allowlist, then failed
    outright retrying the same host — plain fetching works and is what every
    surface now documents), and treat any vendor-specific front door as one
    door rather than the strategy.
- **Positioning claim discipline**: never "the only local MCP PDF renderer"
  (falsified by mcp-z/mcp-pdf, Reactive Resume MCP, cf-rendercv); the honest
  claim is "the only complete, validated CV workflow an AI agent can drive
  locally — schema in, designed PDF out — zero dependencies beyond Node."

### 7.4 Backlog items reconciled against reality

Landed since proposed (July dogfood): `certifications.yaml` /
`publications.yaml` / `languages.yaml` / `personal.links` (v1.5);
`build --all` (with INV-13 isolation); `$schema` headers in generated files;
review→brainstorm→pre-build preview + conflict flagging in the skill;
version-pinned scaffolds. Rejected: container image, standalone executables
(§7.3 cut list). Still open, unscheduled:

- **D1–D9 — defects found in the 2026-08-16 skill-driven dogfood** (two real
  CVs converted end to end through SKILL.md + CLI; every item reproduced on the
  untouched `cvx init` scaffold before being written down). **D1–D7 all shipped
  in 1.8.0 and are marked `LANDED` inline; D8/D9 were answered by the SKILL.md
  rewrite. The block is kept for its refutations, not as a work list.** It stood
  headed "still open" for two releases after it was fixed — the 2026-08-18
  review (R-block below) caught that, and the lesson is recorded there as RV5:
  nothing binds this document to the code the way `docsSync` binds the product
  surfaces. **This block was
  corrected the same day after two independent reviews — an adversarial
  evidence audit and an algorithm review that re-derived the planner exactly
  (its `entryH`/`packBlocks` mirrors match the shipped functions to 0.001pt and
  byte-for-byte respectively).** Three first-draft claims were refuted; the
  refutations are kept inline rather than deleted, because two of them are
  mistakes the next reader would repeat. Severity is P0–P3 as marked.
  - **NOT DOING — replacing the greedy packer.** Recorded here so it is not
    re-opened. `test/layoutOptimality.test.js`'s exhaustive DP oracle asserts
    the shipped packer is in the optimal set and passes; the review replicated
    it independently over two seeded corpora (400 and 500 generated CVs, 40%
    and 55% carrying progression tables) and found **0 cases** where an
    exhaustive DP beats greedy at the same atom granularity. Bounded lookahead
    buys nothing (greedy's choice is already the maximal prefix and feasibility
    is monotone in `k`); best-fit is meaningless (block order is fixed by
    chronology, so there is no fit choice, only a break point); a break-point
    optimiser buys nothing at this granularity and would re-litigate the C4
    finding that aggregate objectives rank a fragmented five-page layout
    highest. The page-count defect is **atom granularity** (D7), not search.
  - **CORRECTION 1 (first draft, refuted).** "Bundling the progression table
    into the indivisible head is *the root cause* of the wasted page-1 space"
    was over-attributed — both reviews caught it independently. It is the
    largest removable *term* on that one CV, not the cause. On the pristine
    scaffold the bare floor (no description, no progression, one bullet) is
    66.30pt against a 30.09pt opening, so deleting the table there changes
    nothing. The causal structure is rule 1b × an indivisible head with no
    upper bound (D7). Further: re-modelling the same four promotions as
    separate entries — which `docs/ai-guide.md:74` already advises — fills
    page 1 to 0.985 and removes `page1-ends-early` entirely while still
    rendering 3 pages. Page-1 emptiness and the 3-page total are two different
    problems; the first draft merged them, and credited a content *deletion*
    with a structural insight.
  - **CORRECTION 2 (first draft, refuted).** "`summary` in `continuation.main`
    is silently deleted" was wrong, and the measurement behind it was a broken
    probe (a shell glob against an already-deleted PDF). On a genuine 3-page CV
    the summary renders there correctly, on sheet 2, and trips
    `physical-pages-exceed-plan` as designed (planned 3, physical 4). The real
    bug is D3 and is not summary-specific.
  - **CORRECTION 3 (first draft, refuted).** "Per-page sidebar slots not
    pinning sections to pages is undocumented" is false: ARCHITECTURE.md:334
    already states slot lists across page kinds concatenate into one flow. It
    is undocumented only in SKILL.md and the scaffolded layout comment (D9).
  - **D1 (P1) — LANDED 1.8.0. `referees: []` renders nothing, in any layout.** Three shipped texts
    promise it prints "References available upon request." wherever a layout
    carries the `referees` slot: SKILL.md's content-files list, the scaffolded
    `referees.yaml` header comment, and `layouts/two-column.yaml`'s note that
    "the ATS layout still includes it". Repro: `cvx init && cvx build --ats` →
    no "refer" anywhere in the PDF. Non-empty referees render correctly, so it
    is the empty-list path alone. Either the fallback line ships, or all three
    texts stop promising it.
  - **D2 (P0) — LANDED 1.8.0. `summary` in a sidebar slot is silently deleted.** The whole
    section vanishes from the PDF; `validate --strict` returns `ok: true` with
    no errors, warnings or notices; `build --strict` exits 0; and page 1's main
    column still reserves the summary's height as `fixedPt` (298.8pt scaffold,
    325.8pt dogfood CV) for content never drawn. Mechanism: `packSidebar` drops
    any key `sidebarSectionH` returns `null` for, and `summary` is not a
    sidebar section. Note SKILL.md:130 licenses "any section key" in a **main**
    slot only, and §7.2 records sections as semantically pinned to their
    column — so this is arguably out-of-contract input; that is an argument for
    a validation error, never for silence. The only finding in the set where a
    user ships a CV missing a required section with every diagnostic green.
    Fix: reject the key at validation with a field path, **and** stop charging
    `summaryH` to `mainFirstBudget` when `summary` is not in `first.main`.
  - **D3 (P0) — LANDED 1.8.0 for the 2-page case; the 1-page case was still
    open and is RV3 below. `continuation.main` is dead on every 2-page CV, for any key.**
    `mainSlotKeys` (`src/pdf/CVDocument.jsx:79-87`) returns `layout.last.main`
    when `index === totalPages - 1`, so on a 2-page document the continuation
    slot is never consulted and anything placed there renders nowhere. Verified
    directly: `achievements` in `continuation.main` on a 2-page CV → 0
    occurrences of three distinct probe strings, `validate --strict ok: true`.
    Same silent-loss class as D2, broader blast radius, independent fix. Merge
    `last.main` over `continuation.main` rather than replacing it, or fail
    validation when they differ on a document with no non-final continuation
    page. Replaces the refuted half of the first draft's D2 (Correction 2).
  - **D4 (P1) — LANDED 1.8.0. The engine's messages make a false *exclusivity* claim, not
    merely an incomplete one.** `page1-ends-early` says the smallest legal
    piece is "the role heading plus one bullet" — it also carries `location`,
    `description` and the entire `progression` table, which reach 52–60% of the
    figure on scaffold roles (measured deltas: description 35.15pt, a 4-row
    progression 51.30–63.90pt, bare heading+meta+1 bullet 66.30pt; the dogfood
    CV's 178.85 → 143.70 on removing the description is the identical 35.15pt,
    so the first draft's numbers are sound). Worse is the second clause —
    "N pt freed **anywhere above this role** is what separates it from starting
    on page 1" — and its siblings in `page1-no-experience` ("the summary is the
    only thing whose length changes this — no pagination can") and the
    non-actionable branch ("page 1 is as full as this content allows"). All
    three are false, and the review refuted them twice by measurement: deleting
    only the **blocked role's own** description, and separately its own
    progression table — content strictly *below* the break — moved the break
    both times (one case 3 pages → 2, page 1 from 0 roles to a full role).
    SKILL.md repeats the falsehood at lines 84 and 99 and in the
    `page1-no-experience` bullet; line 99 is the worst because it is the line
    that ranks levers. Fix engine and skill in one change or they drift.
  - **D5 (P2) — LANDED 1.8.0. The planner charges a phantom constant spacer.** Not merely
    "the layout's spacer is unmeasured": `mainFirstBudget` subtracts
    `theme.spacing.spacer` (27pt), **not** the layout's value, so `spacer: 0`,
    `spacer: 20`, `spacer: 200`, two spacers, and the key deleted entirely all
    yield byte-identical plans (`fixedPt` 298.8, `budgetPt` 383.09). The
    renderer honours the declared value, so `spacer: 200` produced a 3-sheet
    PDF against a 2-page plan. Consequences: 27pt of page 1 is unusable even
    with no spacer slot present, and deleting the spacer does not return it —
    demonstrated on a knife-edge CV where `shortByPt` 23.36 < 27 and removing
    the spacer changed nothing. `mainContBudget` has no spacer term at all, so
    continuation-page spacers are 100% unmeasured (`spacer: 200` there → 4
    physical sheets against a 3-page plan). `unmeasuredMainKeys` skips `spacer`
    with the comment "charged by the budget arithmetic", which is false. The
    loud direction is netted by `physical-pages-exceed-plan` (`--strict` exits
    2); the quiet 27pt loss is caught by nothing.
  - **D6 (P2) — LANDED 1.8.0. `main-slot-unmeasured` is not slot-aware, and its wording is
    false when it fires.** `MEASURED_MAIN_KEYS` is a flat key list with no
    notion of which slot measures a key, so (a) `summary` in `continuation.main`
    is genuinely unmeasured there — `mainContBudget` has no summary term, and
    it produced a 4th sheet — yet the warning does **not** fire, while
    `achievements` in the same slot does; and (b) when it does fire it says the
    section "is rendered but not measured", which on a 2-page CV is untrue —
    per D3 it is not rendered at all. Make the key list slot-aware and make the
    message stop asserting a render it has not verified.
  - **D7 (P2) — LANDED 2026-08-16. The indivisible entry head had no upper
    bound; `prog-split` adopted.** `experienceBlock().split` parameterises a cut by bullet
    index only, so the page-leading piece always carries role + meta +
    `location` + `description` + **every** progression row + ≥1 bullet. A
    12-row progression makes the head arbitrarily tall, and once it exceeds a
    page it is force-placed with overflow. The anti-orphan rule itself
    (`largestFittingPrefix` searching `[1, n-1]`) is textbook and should stay;
    the unbounded floor is the defect. Also unnamed: a **single-bullet role is
    completely atomic** at any height, because `largestFittingPrefix` returns 0
    for `n < 2` and `split()` returns `null` (measured on a 165.35pt entry).
    Four policies priced over 500 generated CVs: shipped (baseline);
    defer-all-bullets saves 4.6% but orphans 71 bare headings; **`prog-split`
    (table breaks at a row boundary, ≥1 atom each side) saves 11.2% and orphans
    none**, because its `[1, n-1]` range keeps ≥1 row under the heading;
    prog-defer saves 13.4% but orphans 78. Adopt `prog-split` — the only option
    that inherits the existing anti-orphan invariant. Its extra cost over the
    cheapest option is in the **renderer**, not the planner: a continuation
    piece today drops company/period/description/progression entirely, so
    `ExpItem.jsx` must draw a partial table under a `(cont'd)` heading, and
    `test/layoutOptimality.test.js`'s legality mirror must move in lockstep.
    The principled rule, now implemented: *an entry's page-leading piece must
    carry the heading plus at least one unit of substantive content (one
    progression row, or one bullet); every other component is a splittable atom
    in document order; nothing is welded to the heading merely because it
    precedes the bullets.* The cut axis is the entry's atoms in document order —
    progression rows, then bullets — and `largestFittingPrefix`'s `[1, n-1]`
    range is unchanged, which is what keeps the anti-orphan guarantee for free.
    `smallestPiecePt` follows automatically (`declineOf` asks the splitter for
    its forced minimum), so the engine message and SKILL.md were re-worded again
    in the same change: the piece is the heading block plus the first ATOM, no
    longer the heading block plus the whole table.

    Measured on the calibrated sweep, the degradation is monotone: as page 1
    fills, the head takes 6 rows, then 6 with no bullet, then 4, then 1 — and
    when even one row will not fit, the role defers to the next page whole
    rather than leaving a bare heading. Verified on the dogfood CV: page 1's
    fill went 0.767 -> 0.996 and `page1-ends-early` stopped firing.

    **Three tests are knowingly RED and are a test-model debt, not a defect —
    scheduled for their own sprint by maintainer ruling 2026-08-16:**
      · `test/layoutOptimality.test.js` — the exhaustive DP oracle enumerates
        bullet-level cuts only, so its legality mirror now covers a smaller
        space than the real packer. It needs a progression-row dimension.
      · `test/layoutRenderOracle.test.js` (`edge-page1-blocked`) — the harness's
        structural `noOrphanHeading` has no id for a progression row, so a head
        carrying three rows and no bullets reads to it as a bare heading. The
        real invariant is asserted instead in `src/pdf/layout.progSplit.test.js`
        ("no piece is a bare heading — each carries a row or a bullet"), swept
        over eight page-1 fill levels, and the render was inspected by eye.
      · `test/planLayout.test.js` (`edge-page1-blocked`) — that fixture no
        longer ends page 1 early, because `prog-split` fixed exactly the shape
        it was built to demonstrate. The fixture needs replacing, not the code.

    New proofs added with the change: `src/pdf/layout.progSplit.test.js` (split
    correctness, exactly-once placement of every row and bullet in document
    order, the monotone degradation above, and the anti-orphan property) and a
    render-level case in `test/layoutPermutation.test.js` asserting a split
    table appears in the PDF exactly once, in order, across the page seam. The
    model-vs-render oracles (`layoutMainMeasureDiff`, `layout.mirror`) pass
    unchanged, which is what proves the new measurement matches what is drawn.
  - **D8 — LANDED (SKILL.md rewrite; no CHANGELOG line names it, so this was
    verified against the file on 2026-08-18 rather than from the release
    record): (a) and (d) are gone, (b)'s duplication check is present, and (c)
    is answered by the worked `shortByPt`-against-cost-terms example that now
    sits in the diagnostics section. SKILL.md gaps that made D4 expensive to
    work around.** Each checked
    against the file, same dogfood. (a) Line 84 repeats the engine's wrong
    composition — "shortening the summary (or that role's first bullet)" — so
    D4's fix must land in both places or they drift. (b) §"Review, then
    brainstorm" has no cross-section duplication check: `grep -niE
    "duplicat|repeat|redundan"` returns nothing, and the free 48pt on the
    dogfood CV was a summary bullet restating the ACHIEVEMENTS sidebar beside
    it. Grammar, gaps and conflicts are covered; "is this text already on the
    page?" is not. (c) No rule for ranking levers by cost — page 1 was
    reachable for 53.64pt and page 2 for 78.11pt, and nothing tells the reader
    to compare `blockedBy.shortByPt` across pages and take the cheapest one
    above the earliest block. (d) Line 109's "There are no layout levers"
    contradicts line 142's "swapping which column carries which section is the
    strongest one-page lever you have"; the reconciliation — column swaps bite
    only when the experience list is empty or short, because with a full one
    the main flow is fixed and `summary` is pinned to `first.main` (D2) — is
    stated nowhere. (e) The prefix-repair rule, "greedy top-down packing makes
    prefix repair monotone (an edit below a point cannot move what is above
    it)" (§7.4 P1a), never made it into the skill; line 113's two worked
    examples of cuts that fail to move the page count are both edits *below*
    the block, and the converse case is never given. **It must not ship into
    SKILL.md without its carve-out**, which the review supplied: an edit below
    the break cannot move content already placed above it, *but the blocked
    block's own head is an input to the break, and editing it does move the
    break* — measured twice (D4). Shipping the rule bare would harden exactly
    the false inference D4 is about. (f) Nothing tells the converter that
    recording promotions as a `progression` table rather than separate entries
    is a **layout-affecting** choice: `docs/ai-guide.md:74` frames it purely as
    ATS keyword derivation, yet on the dogfood CV the two modellings differ by
    a full page-1 column (fill 0.767 vs 0.985) and by whether
    `page1-ends-early` fires at all.
  - **D9 (P3) — LANDED (SKILL.md now states the bucket semantics explicitly;
    verified against the file 2026-08-18, not from the release record). The
    layout's `first`/`continuation`/`last` keys do not mean
    what they say.** `layout.js` states the intent plainly — the buckets are
    "read as ONE ordered flow… not 'referees renders on the final page'" — but
    neither SKILL.md nor the scaffolded layout comment says so, and the key
    names actively suggest the opposite. Measured on a 3-page CV with
    `first.sidebar=[contact]`, `continuation.sidebar=[education]`,
    `last.sidebar=[referees]`: all three render on **page 1**, and pages 2 and 3
    report `emptyColumn: sidebar` with no notice or warning. A section named
    `last.sidebar` landing on page 1 of a 3-page document is not a defect in
    the engine — it is a defect in the naming and the docs. Either document it
    loudly in both places or rename the buckets to `order:` groups.

- **RV1–RV12 — the 2026-08-18 five-lens review** (architecture, JavaScript,
  react-pdf, QA, refactoring, plus a dogfood pass; every finding re-verified
  first-hand by the orchestrator before it was written down, per gate 7 and
  doctrine 1 — which corrected three of them, listed at the end). Baseline at
  the time: 857 tests, 98.91% lines, 100% functions, knip clean, all green.
  **The unifying result: most findings are one class — a string crossing a seam
  with no closed vocabulary binding producer to consumer.** D2 patched the
  sidebar instance in 1.8.0; nobody asked whether main slots had the same hole.
  They did. INV-15 is the model-level half of the same lesson.
  - **RV0 (P0) — LANDED. `personal.name` steers the output path.**
    `deriveFilename` never stripped separators or `..`, so
    `name: "../Documents/Resume"` overwrote that file with PDF bytes under a
    clean `validate --strict` and a `✅` build. Absolute paths are re-rooted by
    `join`, and a missing directory fails ENOENT — what works is relative
    traversal into any existing directory. INV-12's claim ("content is data, not
    commands") on a surface with worse consequences than the layout numbers the
    injection suite already guards. Reachable because an assistant writes
    `personal.yaml` from a user-supplied CV.
  - **RV1 (P0) — LANDED. An unrenderable key in a `main` slot deletes content
    silently.** `slot-not-renderable` (D2) validated sidebar slots only.
    `- experience` → `- experiance` on the shipped scaffold: 5 of 16 bullets
    gone, `notices: []`, exit 0, and the plan still publishing
    `bulletRange: [0,5]`. `section-has-no-slot` stays satisfied because the
    section has a slot *elsewhere*. Fixed with the main-slot arm plus a
    build-time coded defect — validation alone was not enough because plain
    `build` never validates, and the registry's only signal was a `console.warn`
    with no code, which `--strict`'s gate cannot see BY CONSTRUCTION.
    **Second half: `:continued` was a bypass for every key.** The sidebar arm
    tests `key.split(':')[0]` — correct there, where `education:continued`
    legitimately names a sidebar section. In a main slot only
    `experience:continued` is implemented, so every other `<x>:continued` drew
    nothing, and `frobnicate:continued` walked past a check that catches bare
    `frobnicate`. Main slots now match the whole key.
  - **RV2 (P0) — LANDED. INV-0's render-level instrument checked ~8 of ~30 drawn
    fields.** Seeding `e.company?.toUpperCase()` — a case-transform INV-0 names
    explicitly — left the suite at **857/857 green** while the shipped ATS PDF
    printed `WAYNE ENTERPRISES`. Two structural causes, both measured: 90% of
    the suite is plan-level (poppler-free: 773 passed / 84 skipped, and those 84
    *are* the render tier), and the render tier's generator emits one document
    family. **This is the finding that explains RV1/RV3/RV4** — doctrine 6 again,
    at the level of the instrument rather than the corpus.
  - **RV3 (P0) — LANDED. On a 1-page CV every `continuation.main` and `last.main`
    key renders nowhere.** The unclosed remainder of D3, whose fix stopped at
    `totalPages === 2`. §8's own success criterion is a 1-page student CV, so
    this was dead in the roadmap's target shape. `main-slot-unmeasured` fired
    and said the section "is rendered but not measured" — it was not rendered.
  - **RV4 (P0) — LANDED. `{text, link, suffix}` bullets measured by `.text`
    alone, rendered concatenated.** 27.00pt under-measure against a 15pt safety
    margin; three rendered line boxes priced as one. Unpriced ink (INV-3), and
    invisible because the render-diff harness's own `bulletText` helper stripped
    `link`/`suffix` identically — **the instrument agreed with the bug.**
  - **RV5 (P1) — LANDED. This document listed six shipped defects as open.**
    D1–D6 all shipped in 1.8.0 while §7.4 was headed "still open, unscheduled".
    `docsSync` binds the product surfaces and reads none of ARCHITECTURE.md,
    CHANGELOG.md or SPRINT.md — the structural cause. A tripwire binding `D<n>`
    /`R<n>` source comments to a `LANDED` marker here ships with RV5.
  - **RV6 (P1) — LANDED. The packing core reads experience-vocabulary internals,
    and the guard that should catch it neither exists nor would work.**
    `maxPagesFor`'s `b.entry?.bullets?.length`, stale since D7 made progression
    rows split atoms, lets `packBlocks` throw on schema-valid content. Measured
    reachability curve (title length → rows needed to throw): 3 words → 120,
    8 → 120, 20 → 80, 60 → 30, 400 → 3. No real CV reaches it; recorded for the
    cause, not the crash. See §6's re-specified guard.
  - **RV7 (P1) — LANDED. `build` and `validate` resolved different themes.** See
    the §2.6 marker. The fix collapses the two to one resolution path, with `build`
    honouring `LAYOUT_DEFAULT_THEME` so `layout: single-column` renders **mono**
    where it renders teal today — a deliberate, user-visible change that needs a
    CHANGELOG entry and a version bump when it lands.
  - **RV8 (P1) — LANDED. `build --all` on `layout: single-column` destroyed one
    of its own outputs.** The `-ats` filename suffix keyed on the layout name
    while the variant came from the `--ats` flag, so both variants claimed one
    filename; the envelope reported two artifacts and one no longer existed.
  - **RV9 (P1) — LANDED. `validate` ran the two-column packer against
    single-column content**, publishing a `page-overflow` warning about a page
    budget that variant does not have. The agent-facing docs teach that
    warning's remediation, so a driving LLM would shorten a summary that has no
    overflow.
  - **RV10 (P1) — LANDED. `--json` truncated at the 64 KiB pipe buffer**,
    delivering unparseable JSON to an agent with no indication. Measured
    context: scaffold `validate --json` 472 B, scaffold `build --json` 8.5 KB, a
    12-role CV `build --json` 19.7 KB — the ceiling is ~3× a large real CV, and
    `validate`'s findings are unbounded under `allErrors: true`.
  - **RV11 (P2) — LANDED (tripwire, not de-duplication). The spacing bound `0.6–1.5` is copy-pasted in seven places**
    with nothing binding them, including three literals in the JSON Schema that
    `get_schema` serves the driving LLM as the authoritative contract.
    `validateContent.js` already calls it "belt and braces" in its own comment.
    Closed with a docsSync-style tripwire (`test/spacingBoundsSync.test.js`)
    that reads the canonical constant and asserts the schema's three min/max
    pairs and all four prose copies agree. The copies remain — JSON Schema
    cannot import a JS module — but they can no longer drift silently.
  - **RV12 — PARKED, and why.** Two independently-coded "ATS" renderers
    (`--ats` → `ATSDocument.jsx`; `layout: single-column` → the sidebar-styled
    registry components at full width). Same content: 2 dense pages vs 3 with a
    near-blank third. Drift has started — `HeaderATS.jsx` reads theme tokens for
    the photo size, `ATSDocument.jsx` hardcodes the same current values. Every
    product surface calls this one concept; it is two. Convergence touches every
    file in `sections/` and earns §6.1's large-slice ceremony — an
    algorithm/architecture design note first, reviewed, before gate 2. Only the
    misleading scaffold comment was fixed now.
  - **RV13 (P2) — LANDED. A malformed slot crashed `validate` instead of being
    reported.** `- spacer:` — the value simply left off — parses to
    `{ spacer: null }`, and `normalizeItem` read `val.continued` off it
    (`typeof null === 'object'`). The raw TypeError escaped `normalizeLayout`,
    escaped `validateContent`, and reached the CLI as **exit 64 — a USAGE
    error**, telling the user their command was wrong when their content was,
    with "Cannot read properties of null" and no file or field path. Found by
    RV1's own test fixture rather than by review: writing the spacer cases made
    the crash reproduce. A malformed slot is a finding, not a crash.
  - **RV14 (P0) — LANDED. The ATS variant drew only `bullet.text`.** Found by
    RV2's widened oracle on its FIRST run, not by review. `ATSDocument.jsx`
    rendered `typeof b === 'string' ? b : b.text` while the designed variant
    draws `text` + `link.label` + `suffix`, so a hyperlinked bullet lost two of
    its three parts in one of the two shipped deliverables. Verified by direct
    render: designed 1/1/1, ATS 0/0/0. `bulletText` is now one exported
    function that the measurer, both renderers and the harness all share.
  - **RV15 (P0) — LANDED. The ATS variant drew no `experience[].location` at
    all.** Same run, same instrument. `personal.location` was rendered;
    the per-entry one was drawn nowhere in that variant, so a CV whose roles
    carry locations shipped two deliverables that differ in content. INV-0 does
    not distinguish between variants.
  - **Also parked, one line each:** inverted `emptyColumn` side on the student
    layout; `list layouts`/`get_schema` reporting `source: "built-in"` over the
    user's own file; `PAGE1_OVERFLOW_WARN_THRESHOLD` unbound from the theme's
    `safety` (doctrine 13's shape, not yet its bug); the built-in layout
    inventory hardcoded in four places while themes correctly share
    `discoverThemes()` — I8 adds a layout, so this bites then; React keys on
    non-unique content fields (verified harmless on `renderToBuffer`);
    `CVX_ASSET_ROOT` throwing outside `main()`'s try/catch; `schemaVersion`
    hand-typed in three envelope sites; the thrice-copied progression-height
    loop (extract only with the float-association caveat).
  - **CORRECTIONS (doctrine 8 — refuted by name).** *(a)* The orchestrator's
    first read of RV1 claimed the whole experience section was lost; the render
    showed it present. The real loss is 5 of 16 bullets — page 1's block only.
    Inference replaced by a per-bullet sentinel check. *(b)* RV6's reachability
    was overstated in both directions by two reviewers independently — 92 rows
    and 4 rows — and neither is representative; the measured curve is above.
    *(c)* "`--strict` should gate `section-has-no-slot`" was raised and refuted:
    the warning/defect asymmetry is deliberate and reasoned in-line at
    `validateContent.js`. The help text was the wrong half, and was fixed
    instead. *(d)* "CLI, MCP and standalone are three parallel pipeline
    implementations" — the review's own starting hypothesis — is false. One
    chain, three adapters; the standalone bundle is `bin/cvx.js` plus an asset
    prelude with the MCP server deliberately stubbed.

- `cvx doctor --json`; renderer version + per-output sha256 in build
  JSON/PDF metadata; machine-readable conflict report; per-item provenance
  metadata; `import-report.md`; `init --project`; dependency-failure
  messaging taxonomy in docs (npx 4xx/5xx before CVX starts); `cvx watch`;
  user-space themes; DOCX for the ATS variant; `cvx import resume.json`;
  `cvx tailor`.
- **P2 — per-entry measurement publication** (decided small and pure, then
  dropped silently when I1–I9 replaced the P-roadmap; carried here as open):
  publish per-entry and per-bullet `heightPt` and line counts, mirroring what
  `SidebarSlice` exposes — `experienceBlock` computes them and
  `packExperiences` discards them. Gate: an assistant computes "this bullet
  costs 43pt over 3 lines" from the response alone — the tell it fails today
  is `test/planLayout.test.js` importing two `@internal` names to reconstruct
  it. Priced by the postmortem at nine build-probe cycles that one published
  number would have made one subtraction. Sequence after I2 (v3 bump) or with
  I6's shape change.
- **P1a — progressive sight** (ruled 2026-08-13, unscheduled): render up to a
  caller-named cut-point — a page or a section, per column, since the flows
  are independent; the cut-point is passed on every call (a parameter, never
  memory). Return a picture when the host has a rasteriser, else a shorter
  PDF; nothing bundled. Rationale: a global summary invites a global
  objective, a sequential prefix invites local repair — and greedy top-down
  packing makes prefix repair monotone (an edit below a point cannot move
  what is above it). Requires an explicit INV-0 carve-out (a preview is not a
  deliverable) plus a naming/location rule so a preview cannot be mistaken
  for the finished CV; needs its own design doc before any build. Does not
  close the blind-client hole.
- **The per-CV design surface — FIRST SLICE LANDED 2026-08-16 (D11).** The
  template now carries a `spacing:` block: `entryGap`, `bulletGap`, `sectionGap`,
  each a multiplier on the theme's vertical whitespace, bounds 0.6-1.5, closed
  key list, out-of-range and unknown keys are validation errors with field paths
  (ruling R-M — never clamped). Maintainer direction 2026-08-16: authors and
  LLMs should be able to adjust spacing as they see fit, with the objective of
  tastefully packaging the text, and it belongs in the template because that is
  what they already edit.

  Design decisions, each with its reason recorded in
  `src/pdf/themes/layoutSpacing.js`: **multipliers, not points** (the named
  styles' ratios ARE the design — the `typeScale` argument); **groups, not one
  density** (measured: a density needs 0.90 to reach 2 pages and tightens
  spacing *inside* a job that did not need it, while `entryGap` alone reaches
  the same page count and leaves the reading rhythm untouched); **vertical
  only** (horizontal offsets change wrap widths, hence line counts, hence every
  measurement — standing design law, not a scope call).

  The load-bearing structural choice: the scale is applied to the THEME inside
  `resolveDocument`, which is already the single chain the planner and the
  renderer both go through. There is one scaled theme object and both read it,
  so model and render cannot disagree about spacing — the failure mode D2-D6
  were all instances of. Identity returns the SAME object reference, so a
  template declaring no spacing is byte-identical to the pre-feature build.

  Remaining, still unbuilt: `typeScale`, `sidebarFraction` (R-J bounds), and
  everything else in the archived p3-surface draft. The rest of this entry is
  the evidence that justified the first slice.

  **MEASURED JUSTIFICATION, 2026-08-16 dogfood.** The narrowest useful first
  slice is the INTER-ENTRY vertical gap — `spacing.entryMb` (11) plus
  `chrome.dividerMargin` (16.5) twice plus `chrome.dividerHeight` (0.75),
  ≈44.75pt between experience entries. On the dogfood CV, swept by patching the
  theme and rebuilding at each setting:

  | `entryMb` / `dividerMargin` | gap | pages | main fills |
  |---|---|---|---|
  | 11 / 16.5 (shipped) | 44.75pt | 3 | 0.996 · 0.99 · 0.141 |
  | 9 / 13 | 35.75pt | **2** | 0.999 · 0.995 |
  | 8 / 11 | 30.75pt | **2** | 0.99 · 0.978 |
  | 6 / 9 | 24.75pt | **2** | 0.978 · 0.958 |
  | 4 / 6 | 16.75pt | **2** | 0.964 · 0.932 |

  A ~20% reduction in one vertical token takes that CV from 3 pages to 2 with
  ZERO content change, and it is not a knife edge — every tighter setting also
  holds at 2. This is R-J's "spacing tokens are where predictable leverage
  lives" confirmed with numbers, and it is the only lever left for a CV whose
  author will not alter the text: the three shipped themes are **geometrically
  identical** (verified — they differ in palette only), the layout's `geometry:`
  block was deleted as inert, and user-space themes are unbuilt. So an author
  who wants a tighter CV has, today, no control that does anything.

  Two riders the sweep also establishes. (a) The minimum that works (9/13) fills
  the pages to 0.999/0.995 — a surface that lets an author sit there ships a CV
  that reflows the next time they add a sentence, so the bounds want a comfort
  floor, not just a legibility floor. (b) The tokens are GLOBAL today: tightening
  teal.js to fix one CV silently reflows every CV the tool has ever produced,
  which is the whole argument for per-CV exposure over a maintainer edit.

  Surviving
  design law: geometry behind a **closed key list** (a typo fails loudly the
  moment geometry starts working); whitelisted spacing tokens — vertical
  whitespace scalable, horizontal offsets never (they change wrap widths,
  hence line counts, hence every INV-2 result); one `typeScale` multiplier,
  never per-token sizes (the named styles' ratios ARE the design; a
  multiplier preserves them). Bounds are structural, not numeric: the
  resolver copies typography by reference and scales only keys in one
  explicit table — and the table is the load-bearing half (a mechanism with
  no floors populated passes every identity assertion and merely looks
  defended). Resolver obligations: identity when nothing is overridden;
  unreachability by identity; one bounds assertion per scalable token. Chrome
  stays unexposed (decorative; a bad value looks broken rather than tight);
  `singleColumnMargin` stays unexposed (the ATS variant cannot be previewed
  by `plan_layout`). A width bound is necessary but never sufficient — an
  unbreakable token can exceed any width, so the surface needs a measured
  longest-unbreakable-token precondition or warning.
- **Clamp-and-notice — RESOLVED by ruling R-M (2026-08-14): rejected.**
  Out-of-range surface values are validation errors with field paths, not
  clamped. The author's clamp-and-notice proposal is recorded in the archived
  p3-surface draft; the ruling and its accepted cost live in §7.1.

---

## 8. Roadmap (increments I1–I9)

*Adopted 2026-08-14 from the four-role review of the student-CV dogfood; full
acceptance criteria in the archived plan. Each increment ships alone; the
system is strictly more honest after each. Chain: I1 → I2 → I3 → I4 → I5 →
I6, then I7 ∥ I9, then I8.*

| # | Ships | Closes |
|---|---|---|
| I1 | Physical sheet-count defect warning (buffer page count cross-checked against poppler in the harness, null-on-unparseable; envelope-level attach; `main-slot-unmeasured` interim fact; schema caveat) | INV-4, INV-3 disclosure |
| I2 | Page-1 metrics row when summary renders with empty experience; `experience-empty` fact; `emptyColumn` = "no ink"; diagnostics v3 | INV-5 blind spots |
| I3 | `main-column-empty` fact (a multi-page CV whose main column renders nothing on ANY page — *not* per-page: one flow ending before the other is the C4 residual, and flagging it would re-create the metric §7.3 records as anti-correlated with quality; suppressed where a layout's main slots are unmeasured, since the plan cannot see that column's ink) + R-F message-policy sweep | INV-5, R-F |
| I4 | Main-slot fixed-content pricing (`deriveColumnMetrics`; width-parameterized vocabulary measurement; empty-section-in-slot prices as exactly 0) | INV-3 (first half) |
| I5 | Column-aware section-title variants (render + mirror in one commit; ATS parity decided explicitly) | INV-2 across columns |
| I6 | Heterogeneous packed main flow (`packMain` written against anonymous blocks; layout main lists become ORDER; duplicate-section validation; genericity guard on the packer; per-section formulas migrate to the vocabulary) | INV-3 (full), INV-8 (packer), INV-1 duplicate rule |
| I7 | Vocabulary: projects → custom headings → education details → grouped skills → paragraph summary (each deletes its disclosure from the skill; custom headings must resolve the uppercase-transform interaction with INV-0) | student-segment gaps |
| I8 | Education-first template layout; skill post-build checklist; dogfood-shapes-become-fixtures process rule; dual-column pricing reconsidered (facts only, if at all) | process closure |
| I9 | Full generality: summary as a block; identity as declared repeatable sections; width-parameterized experience; genericity guard on the coordinator | R-H, R-I, INV-8 (full) |

Also tracked (small, from earlier reviews and this consolidation):

- **R-a** — the per-width near-boundary corpus (glue-shrink divergence
  detector; §3.3 names it required, not optional). Rides I4/I5 harness work.
- **R-e** — the owed dash-column unit assertion: `bulletWidth(m, measure)`
  must equal the harness's rendered-indent probe at 0.01pt (today pinned only
  indirectly: edge probes bound it to ≪1pt and the near-boundary window fails
  on drift). Rides with R-a.
- **Sidebar split-heads gap** — split heads are structurally never
  render-differenced in the *sidebar* harness (a head is always its page's
  last block; tails are verified). The main harness's head-row family closes
  this for the main column; the sidebar's gap is its own item.
- **`validate` bypasses `resolveDocument`** — validate and build can describe
  different documents under a custom layout; fix no later than I4, where
  main-slot pricing makes the divergence observable.
- **Meta-row period overflow** (open render defect, unowned): a long company
  wraps at full container width and pushes the period outside the content box
  (measured 24.19pt into the 33pt right padding; a longer pair runs off the
  sheet; same family as sidebar contact-value clipping). The render-diff's
  ink-past-content-box check detects the class; the render fix is scheduled
  nowhere.
- **Wrap-not-clip for unbreakable contact values** (R-L, ruled, verified
  unimplemented): the engine work plus the INV-2 re-derivation its height
  changes force; closes the content-oracle visibility caveat's live instance
  (§6).

Success criteria (abridged): the student fixture builds to 1 physical page
with plan == physical and zero defects; both silent-failure reproductions
assert their exact `{planned, physical}` payloads in CI; after I6 the
backstop codes fire zero times corpus-wide; the next dogfood reaches a
correct build in ≤ 1 layout iteration.

---

## 9. Product boundaries (standing, not roadmap)

- Tarball < 500 kB; pure Node ≥ 20; no network at runtime; no accounts.
- The logo never appears on user output — no watermark, footer, or metadata
  branding in generated CVs.
- Every release: CI matrix green, packaged E2E green, reproducibility gate
  green, no tarball-size regression.
- Solo-maintainer pacing: publicly commit only to near-term work; success
  floor is a sustainable niche tool relied on by developers and local-LLM
  users — fizzle is quietly stalling, not smallness.
- Zero telemetry; honest adoption signals only (referrers, issue diversity,
  external contributors) — npm downloads are guarded vanity.
- The effective external-LLM interface of the repo is six files — README,
  docs/ai-guide.md, docs/cv-schema.md, schema/v1/cvx.schema.json,
  package.json, ci.yml — **plus the MCP server's `instructions` handshake and
  the tool descriptions in every `listTools` response**, the highest-leverage
  teaching sites in the product. Changing any of these is a product change,
  gauntlet-class, not a prose edit.
- Privacy discipline for incident and dogfood records: no personal content
  beyond block heights is reproduced in repo documents; personal data stays
  outside the repository; gauntlet runs use fixture identities.
- **Releases are cut from an annotated tag, and assets are attached to a
  DRAFT.** `publish.yml` builds the GitHub Release from the tag's own message
  (subject → title, body → notes), so a lightweight tag fails the job by
  design. This repo has immutable releases enabled, which is unforgiving:
  publishing freezes a release's assets *and* reserves its tag name
  permanently, even after the release is deleted. Assets must therefore be
  uploaded while the release is still a draft; create-then-upload returns
  `422 Cannot upload assets to an immutable release` and strands a published
  release with no assets. **Never delete a published release to retry** — that
  is how v1.9.0 ended up on npm with no GitHub release it can ever have. The
  job now declines to touch an already-published release rather than repairing
  one. `publish.yml` must also dispatch `pages.yml` after a release, or the
  documented download URL silently serves the previous version.
- **A hostname is a tool-routing signal, and it decides before any
  instruction is weighed.** Measured 2026-08-18 on a real run: an assistant
  given a `github.com` download URL reached for its GitHub connector — which
  reads repository and release metadata but does not follow the binary
  release-asset redirect — and from that true failure concluded the *sandbox*
  could not download, then asked the user to upload the file by hand. Prose
  telling it not to use the connector was the wrong shape of fix; the signal
  was removed instead, and the documented execution URL now points at the
  Pages origin with no repository connotation. Any future move of that URL
  inherits the requirement: the host must not name a system the model has a
  connector for. Releases remain the source of truth and keep serving humans.

---

## 10. Document lineage (what folded from where)

Every document below is superseded by this file and retained at
`research/archive/` as a historical record. Point-in-time numbers (baselines,
fixture counts, coverage snapshots, sprint status boards) live only there, by
design.

| Archived doc | What it was | What survives here |
|---|---|---|
| layout-packing-research.md | The 2026-07-27 problem statement + literature/comparables survey (paracol as the model; the two-bugs diagnosis; the 34%-overshoot measurement) | §2.3 problem class, §3 model, §7.3 rejections |
| layout-packing-design.md | The unified-engine design (blocks/glue/objective D; G-a..G-d guardrails; §11 plan-shape invariants; Invariant 0 verbatim) | §2.3, §3, §5 INV-0/1/11, §6 instruments; the objective/glue/lever halves are §7.2/§7.3 history |
| sprint-layout-engine.md | The C-sprint (C0–C7): chunk gates, outcomes, corrections (C1 disproven premise; C3a/C3b findings F1–F3; C4 NO-GO with five measured findings; C6a diagnostics) | §3.5 rules, §3.6 minimality, §6 doctrine 6–7, §7.2/§7.3 evidence |
| sprint-plan.md | The consolidated product plan (S0–S2 history, v1.5 record, standing tracks, cut list, unbuilt backlog) | §2.6 contracts, §7.3 cut list, §7.4/§8 backlog, §9 boundaries |
| c0-baseline.md | C0 harness calibration + baseline (2026-07-28) | §6 render/content-oracle calibrations and corpus governance; numbers stay archived |
| c0-retro.md / c2-retro.md | Sprint retros | §6 doctrine 1–3, INV-13, §3.3 NFC/fontkit facts, R-A |
| design-cvx-as-instrument.md | The instrument philosophy + responsibility table + measured §7 tables | §1, INV-0/6/7, §7 rulings |
| sprint-design-loop.md | The design-loop sprint (the collaborative loop, the brief, the three roles; P1 gates; verified defects) | §1.2 wholesale, §2.4's ruled violation, §7.3 statefulness/lever-channel/rasteriser rejections |
| design-p3-surface.md | P3 surface draft (spacing tokens, sidebarFraction sweep, 6.5pt floor, clamp-and-notice) | §7.3 geometry rejection + riders; P1a/P2 dispositions in §7.4 |
| design-layout-fidelity.md | The fidelity fix design (S1–S5) + review outcomes | INV-2/INV-12, §3.3–§3.4 box-model rules, §4 contract, §6 doctrine 9–11 + migration taxonomy, R-B/R-C, §8's R-a/R-e |
| postmortem-pagination-fidelity.md | The 2-page→3-page incident record (T1–T8; refuted claims §2) | §6 doctrine 1/8/12, doctrine 6's second proof; also remains the incident record |
| dogfood-student-cv.md | Findings F1–F8 (student CV) | §8's motivation; INV-3/INV-4's discovery |
| plan-main-flow-coverage.md | The four-role improvement plan + rulings | §7.1 R-D..R-I, §8 wholesale |
| cvx-dogfooding-report.md | July external-assistant dogfood (state machine, failure modes, handoff routes, 19-case matrix, 15 acceptance criteria) | §1.2 stage machine + walls, §7.4 reconciliation |
| gauntlet.md | Monthly front-door eval protocol + run log | §6 instrument row; log continues in archive |
| docs/hostile-baseline.md | Quality-gate baseline (2026-08-01) + lint adjudications | §6 last row; numbers stay archived |

**Not folded (product surfaces, not design):** README.md, CHANGELOG.md,
docs/ai-guide.md, docs/cv-schema.md, skills/cvx/SKILL.md, template/* — these
are runtime artifacts governed by docsSync and releases. **Not folded
(pre-existing archive):** the strategy documents already in
`research/archive/` (roadmaps, branding, use-cases) — historical inputs,
superseded before this consolidation.
