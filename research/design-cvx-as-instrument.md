# Design: CVX as an instrument, the LLM as the designer

*2026-08-09. The architecture behind `sprint-design-loop.md`, which is the
schedule. This is the reasoning: what each actor owns, what CVX must expose, what
must never change, and why each boundary sits where it does.*

*Supersedes `layout-packing-design.md` §7 (levers) and §12 Q1–Q2 (the objective),
both of which C4 measured as wrong. §1–§6 of that document — the packing model,
measurement, and splitting — remain accurate and are what the engine implements.*

---

## 1. The thesis

A human does not design a CV by specifying a layout. They write something, look
at it, and react — *this page is thin*, *that heading is stranded*, *this bullet
runs three lines for no reason* — then change the text or the spacing and look
again. They stop when it looks right, not when a number is satisfied. The page
count is whatever it turns out to be.

CVX’s job is to be the instrument that loop runs on. Not to design, not to judge,
and not to remember: to render faithfully, measure accurately, and expose enough
control that a designer can act on what they see.

> **CVX is a dumb, stateless, expressive renderer.
> The LLM is the designer. The skill teaches it. The user gives direction.**

Everything in this document is downstream of that sentence.

---

## 2. Roles and boundaries

| Actor | Owns | Must never |
|---|---|---|
| **User** | Direction at any iteration; the facts; final approval | — |
| **LLM** | Design judgement; the edits; memory of what it tried; backtracking; candid reporting | Invent, alter or drop a fact. Override direction it was given |
| **CVX** | Faithful rendering; accurate measurement; honest diagnostics | Hold opinions, memory, or state. Score a layout |

The arrow points one way. The LLM calls CVX the way an agent runs `ls` over SSH:
the command answers and exits, and there is no model anywhere inside it. CVX is
always the callee, never the caller — everything below is a consequence of it
sitting on that side of the call.

### Why CVX stays dumb

Three independent reasons, and they converge:

1. **The LLM already has what CVX would be duplicating.** It has conversation
   memory, it knows what it tried two iterations ago, and it can be instructed to
   backtrack. Building snapshots, receipts and an acceptance rule into CVX
   rebuilds all of that in the wrong place, worse, and permanently.
2. **A stateless instrument is trustworthy.** Asked the same question twice, CVX
   gives the same answer. That property is what makes byte-reproducibility
   meaningful and what makes a diagnostic worth reading. An instrument you cannot
   trust to be inert is not an instrument.
3. **Every opinion CVX holds is one it will be wrong about.** C4 is the proof:
   an optimiser holding an opinion about “balanced” produced measurably worse
   CVs. Judgement belongs where it can be corrected by a human in the same
   conversation.

### The one thing this costs

A weaker model gets a worse CV, because nothing in the tool compensates for it.
That is accepted deliberately. The alternative — CVX encoding what “good” means —
is the thing C4 measured and rejected.

---

## 3. The loop

**Collaborative, not autonomous.** Both parties see every render; either can
direct the next change.

```
brainstorm the content together
  → LLM writes the YAML
  → build                          CVX: PDF path + measurements + diagnostics
  → BOTH look at the PDF
  → either directs the next change
        user: “my current role reads too long — use this wording”
        LLM:  “page 3 is thin; I’ll tighten these two bullets and re-run”
  → edit → build → look → …
  → done when both are satisfied
```

Design consequences of the loop being collaborative rather than autonomous:

- **No large consent gate.** Nothing accumulates unseen, so there is no pile of
  unreviewed rewrites to disclose at the end. Candid reporting per change is
  enough.
- **No silence problem.** The measured failure in the real dogfood session was a
  user who broke silence twice to ask what was happening — with no loop at all.
  A loop with the user in it does not extend that silence.
- **No override-the-override risk.** A restored sentence is direction, and the
  LLM does not override direction. That is a rule in the skill, not a `keep:`
  flag in the schema.
- **No undo machinery.** The LLM tracks its own changes and can revert them. CVX
  does not snapshot, version, or restore.

### Termination

The LLM decides. Nothing in CVX bounds the *build* loop, and today nothing can:
the only existing counter (`PLAN_ITERATION_CAP`) counts unchanged `plan_layout`
calls and is deleted by every build. So **the skill must state the stopping
discipline explicitly**, because no other component will.

**But that counter should not exist at all, and the arrow is what makes it
visible.** A callee does not count how many times its caller called it.
`planIterations` is a process-scoped `Map` in `src/mcp/tools.js`; every
`plan_layout` response carries an `iteration` block, and on the fifth identical
call CVX appends a notice telling the model to stop planning and act. Two claims
this document makes are therefore false as shipped:

- **CVX is not stateless.** §6 lists “undo, snapshots, receipts” as rejected
  because “CVX is stateless by decision”. One counter already survived that
  decision, in the MCP layer rather than the engine.
- **CVX does not give the same answer to the same question twice.** §2’s
  trustworthiness argument rests on exactly this, and the second identical
  `plan_layout` call returns `count: 2, unchanged: true`.

It is also the instrument holding an opinion about its caller’s conduct —
accusing it of looping — which is the §2 Must-never in its purest form. The fix
is deletion, and it is not scheduled in any phase. `test/planLayout.test.js`
pins the current behaviour, so the tests come out with it.

### Where the loop does not run

A client that cannot open a PDF does not run this loop; it falls back to a single
build. Iterating on measurements alone is precisely the blind-optimiser shape C4
measured as harmful. Better no loop than a loop that cannot see.

---

## 4. What CVX must expose

Four capabilities. The first is nearly free and is being actively suppressed;
the second is small; the third and fourth are the redesign.

### 4.1 Sight — the render itself, progressively

Already works at the whole-document level. `build_pdf` returns an absolute path,
and Claude-family clients open PDFs natively. Verified by reading the shipped
demo and naming three defects that appear in no diagnostic field.

**Decided (red team, 2026-08-13): sight should be *progressive*, not
whole-document.** CVX renders the CV **up to a point the caller names** — a page,
or a section — and returns a picture of it when the host has a rasteriser
(poppler; the test suite already probes for it via `hasPdftoppm()`), falling back
to a shorter PDF when it does not. Nothing new is bundled, so §6’s rejection of a
bundled rasteriser stands untouched.

This is the mitigation for the score problem in §5, and it is a better one than a
prohibition. **A global summary invites a global objective; a sequential prefix
invites local repair.** The LLM working on the top of the document has no
whole-document metric in front of it to climb.

It fits this engine specifically, for a reason worth stating: the packer is
**greedy top-down**, so an edit below a point cannot move what is above it.
Progressive repair is therefore **monotone** — a fix, once made, stays made. That
is exactly what C4’s global optimiser could not do; it thrashed because every
change moved everything.

Three consequences to design against, not around:

- **It stays stateless.** The caller names the cut-point on every call; CVX
  renders a prefix and forgets. A parameter, not memory.
- **The cursor is per-column, not one line through the document.** Sidebar and
  main are independent flows. A sidebar edit moves no main content, yet can still
  change the page count.
- **A preview omits content by construction, which Invariant 0 forbids.** It
  needs an explicit carve-out — *a preview is not a deliverable* — and a naming
  or location rule that makes a preview impossible to mistake for the finished
  CV. Cheap to state now; expensive to discover after someone sends the wrong
  file.

It does **not** close the blind-client hole: a partial PDF is as unopenable as a
full one, and on hosts with no rasteriser the fallback is still a PDF. §5 records
that hole rather than claiming it fixed.

**The obstacle is documentation, and two pieces of it are API.** Ten shipped
sites across five files contradict the loop, in two distinct claims:

*The caller cannot see* — simply false:

| Site | Text |
|---|---|
| `skills/cvx/SKILL.md:53` | “You can’t see the PDF” |
| `docs/ai-guide.md:237` | “An assistant can’t see the PDF. It doesn’t have to” |
| `src/pdf/layoutDiagnostics.js:4` | “an assistant driving CVX cannot see the PDF” |
| `src/mcp/tools.js:17` | “a PDF the model cannot look at” |

*The caller may not act* — half right, and wrong in its absolute form:

| Site | Text | |
|---|---|---|
| `src/mcp/server.js:73` | “never cut content for them” | **API** — handshake `instructions` |
| `src/mcp/tools.js:405` | “never drop content on their behalf” | **API** — `plan_layout`, every `listTools` |
| `src/mcp/tools.js:274` | “their call, not yours” | runtime notice |
| `src/pdf/layoutDiagnostics.js:149` | “it is the user’s call to make” | inside a warning payload |
| `skills/cvx/SKILL.md:66` | “never a layout fix you apply on your own” | |
| `docs/ai-guide.md:248` | “it is the user’s, not the assistant’s” | |

Two of these are model-facing API surface, not one — the server `instructions`
block is read at handshake, before any tool call, and it was missed. Changing
either is a product change, not a prose edit.

The second family needs care rather than deletion. *Surface the trade-off and let
them decide* is the collaborative loop working as designed — `llms.txt:11` says
exactly that and is fine. What contradicts §2 is the absolute form: an instrument
that forbids its caller to act at all, even under direction it was given. Note
that four of these six sit in the engine and the server, where an instrument is
arbitrating who gets to decide — the shape §2 says it must never take.

The `instructions` block has a second defect the same lens exposes: its stated
loop is `get_schema → init_cv → edit → validate_cv → build_pdf`, with no step
that opens the PDF and looks at it. The highest-leverage site teaches a loop with
the sight step missing.

### 4.2 Measurement — what text costs

A designer trades. To trade it must price. Today the sidebar publishes
`heightPt` per section; the main column publishes nothing — an assistant knows a
bullet exists and has no idea what it costs. `experienceBlock` computes the
height and `packExperiences` discards it before the diagnostics boundary.

Publish per-entry and per-bullet height and line counts. The acceptance test is
behavioural: *an assistant can compute “this bullet costs 43pt over 3 lines”
from the response alone.* Today `test/planLayout.test.js` must import two
`@internal` names to reconstruct that, which is the tell.

### 4.3 Surface — make the design expressible

Today a layout file can express **which column a section sits in, its order, and
`spacer: N`**. Everything else is fixed in the theme and unreachable per CV:
page geometry (`geometry` in the layout schema is explicitly *“Reserved.
Currently ignored”*), sidebar fraction, all 23 spacing tokens, every font size
and leading, all padding.

So an LLM that looks at a page and thinks *narrow the sidebar*, *tighten this
section*, or *drop the body size a quarter point* can do none of it. **The system
was built to render one fixed design well, not to be designed with.**

**One of those three examples is now measured, and it was the wrong instinct.**
Rendering the demo across `sidebarFraction` 0.25 → 0.50 (`design-p3-surface.md`
§6.1): the shipped 0.37 is the *only* value that yields two pages, ±0.05 costs a
page, and **narrowing the sidebar makes things worse** — less width means more
wrapping means a taller sidebar, and at 0.25 it also forces two section splits.
Above 0.37 the binding flow flips to the main column. So it is not a page-count
control at all; it is a trade between which flow overflows. Kept in P3 as an
expert control, but the predictable leverage is in the spacing tokens. Worth
holding onto as a caution: *“an LLM that looks at a page and thinks X”* is a
hypothesis about X, and this one did not survive measurement.

**Design direction** — concrete shapes, key lists and bounds live in
`design-p3-surface.md`; this is the reasoning only.

- **The channel is `config.yaml` and `layouts/*.yaml`. Never an MCP argument.**
  Stated here because §6 rejects MCP levers on exactly this ground and the two
  sections did not previously reference each other — an implementer could add
  these as `build_pdf` parameters without contradicting a sentence, and land the
  invisible one-way door §6 rejected.
- **`geometry` is not the clean entry point this section assumed.** It is worse:
  the scaffolded template *already ships a geometry block* with six
  authoritative-looking keys that CVX ignores completely — see §7. Decided: stop
  that misrepresentation now as a template/docs change that ships on its own, then
  make the keys real in P3 behind a closed key list, so a typo fails loudly
  instead of doing nothing.
- Per-CV overrides for sidebar fraction, spacing tokens, and the type scale.
- **Bounds must be structural, not numeric.** The pattern that survives review is
  a resolver that copies typography *by reference* and can only ever scale keys
  from an explicit table. Then “this cannot cross the legibility floor” is a fact
  about the object graph — assertable by identity — rather than an argument about
  arithmetic. Numeric floors on individual gaps are the judgement-shaped part and
  belong in one explicit table with one assertion per token.
- **The table is the load-bearing half, and it was missing.** A resolver shipped
  with every token scalable and no floors populated passes every structural
  assertion, because the assertions test the *mechanism* (identity) and not the
  *policy* (which keys, what floor). The safety property would be
  architecturally present and semantically empty — the worst state, because it
  then looks defended. The table is now drafted in `design-p3-surface.md` and
  needs maintainer review before P3 starts.
- **One token must be unreachable, not merely bounded:** `spacing.safety` (15pt)
  is the page-packing overflow backstop, not decoration. Exposing it is how a
  caller would talk the packer into overflowing.
- **Known prerequisite, already measured:** six harness modules hardcode
  `tealTheme` and would silently measure the wrong document the moment a fixture
  varies the theme. No fixture has ever set one. Threading `themeFor(spec)`
  through those modules comes first, or the oracles lie — and §5’s measure-vs-render
  agreement would be re-derived against the wrong document.
- **The same class of bug was found live for the *layout*, not hypothetically.**
  Three harness sites planned against the built-in `defaultLayouts.js` while
  rendering the scaffold’s own `layouts/two-column.yaml`:
  `structuralFacts.js` (both the plan *and* the expected-item set),
  `layoutSidebarMeasureDiff.test.js`, and `generateBaseline.js`. It stayed
  invisible for as long as the two layouts happened to agree, and produced three
  different symptoms the moment they diverged — a page-count mismatch, an
  Invariant-0 “missing item” on a section the layout never asked for, and the
  identity-row family silently measuring **nothing** while the suite still
  reported 0.00pt on what remained. Fixed by threading the fixture’s real layout
  through; `sidebarItemIds` already took the parameter and was simply never
  passed one. Treat this as the concrete precedent for the `tealTheme` item
  above: “would silently measure the wrong document” is not a theoretical risk
  in this harness, it is a thing that happened.

### 4.4 Flow — rethink content placement

Sections are locked to a column and fill top-down. The shipped demo’s page 3 — a
full-height sidebar beside a completely empty main column — is a direct
consequence, and no amount of surface control fixes it.

Candidates, to be designed rather than assumed: a section permitted to render in
the other column when one flow is binding; deliberate balancing as an *instructed*
choice rather than an optimiser’s; per-section flow control.

**Carry C4’s lesson in.** An optimiser chasing a metric produced worse CVs. What
is different now is that the LLM looks at the render each pass and holds the
user’s direction — the metric never decides alone. That difference is the whole
safety argument, and it evaporates the moment anything in CVX starts ranking
layouts.

---

## 5. Invariants

Non-negotiable across every phase. Each one binds exactly one actor, and saying
which is half the content — the two text invariants look similar and are not.

| Invariant | Binds | Note |
|---|---|---|
| **Invariant 0** — the renderer reproduces supplied text **verbatim**. Not one character | CVX | Unconditional, not merely “to make it fit”. No case change, no truncation, no ellipsis, no substitution — see below |
| **Facts are inviolable** | LLM (and user) | Prose may be tightened; a fact, number, date or achievement may never be invented, altered or dropped. An authoring rule CVX is not party to — it could not break this if it tried |
| **Measure-vs-render agreement** — what CVX computes equals what react-pdf draws | CVX | Sidebar exact (0.01pt tolerance); main column baseline-locked, *not* proven exact. §4.3 rescales the inputs to both — see below |
| **Byte-reproducibility** — same content, same OS, same Node major → byte-identical PDF | CVX | Scope matters: two known divergence sources, and cross-architecture is **unverified, not established** — see below |
| **Layout instructions are never read from CV body text** | CVX | Guarded and tested. Holds more easily here: edits surface to the user by construction |
| **No aggregate score, ever** | CVX | A scalar is a gradient and models climb gradients. Named conditions are facts; scores are targets. Binds CVX only — it cannot bind the caller’s arithmetic; see below |

### Invariant 0, stated at full strength

The old wording — *never drops, clips or hides content **to make it fit*** —
described a motive, which invited the reading that some other motive might
license a change. The true statement is simpler and stronger, and it is the one
the arrow implies: **CVX renders text. It does not edit text.** Whatever it is
handed reaches the page exactly as written, and there is no reason, layout
pressure included, that makes it otherwise. Dropping to fit is one instance of a
thing that never happens at all.

Verified against the renderer, not assumed:

- **No case transformation of user text.** `textTransform: 'uppercase'` reaches
  only `SectionTitle` and the ATS heading — and every label passed to it is a
  hardcoded CVX literal (`'Summary'`, `'Education'`, `'Experience'`, and CVX’s
  own `(continued)` suffix). No string the user wrote passes through it.
- **No truncation, no ellipsis** anywhere in the body path. `layout.js:589`
  refuses it explicitly: *“Never truncate: dropping the remainder would be a
  silent Invariant-0 [violation]”*, and the packing loop throws rather than cut.
- **No hyphenation.** `fonts.js:83` disables it outright, so a word is not even
  split across two lines. Stricter than the invariant requires.

### What “no aggregate score” does and does not buy

The invariant forbids **CVX computing** a scalar. It cannot forbid the caller
computing one from what CVX publishes — and §4.2 exists precisely to publish a
finer-grained gradient. Given per-page `fill`, `overflowPt`, `emptyColumnPages`
and per-bullet `heightPt`, `Σ(1 − fill)²` is a few lines of arithmetic away. That
is the exact objective C4 measured as producing worse CVs, reachable through a
fully compliant CVX.

So the invariant is not the defence. **The defence is that the LLM looks at the
render every pass**, which is why §4.1 is the highest-value phase and why §4.1’s
progressive prefix is the real mitigation: a caller repairing the top of a
document in reading order has no whole-document metric in front of it to climb.

**The hole this leaves, stated rather than glossed.** A client that cannot open a
PDF gets the numbers and no render. §3 already says such a client falls back to a
single build and does not run the loop — that fallback *is* the guard, and it
holds only as long as nothing tempts that client to iterate on measurements
alone. The invariant is enforced against the actor that was not going to climb
and unenforced against the one that would. Keep it — a scalar in the payload
would be strictly worse — but do not mistake it for the safety argument.

### Why measure-vs-render agreement is an invariant at all

CVX derives the layout twice by two independent routes: `layout.js` + `measure.js`
compute block heights in points with fontkit — which is what decides pagination
and produces every number `plan_layout` publishes — and react-pdf separately
*draws* the document. Nothing structural forces the two to match.

When they drift, the instrument does not fail loudly; it reports confidently
wrong numbers. CVX says a role fits on page 2, the PDF spills onto a third
sheet, and every fill, overflow and diagnostic downstream is false. **The LLM
never inspects the PDF’s internals — it designs against what CVX reports.** So
this invariant is the floor the whole instrument claim stands on, and §4.2 is
only worth building on top of it.

How each half is actually verified:

- **Sidebar — exact.** `layoutSidebarMeasureDiff.test.js` renders a real PDF,
  reads the true position of every sidebar section title with `pdftotext -bbox`,
  differences consecutive titles, and asserts the delta from the computed height
  is within `TOLERANCE_PT = 0.01`.
- **Main column — bounded, and weaker on purpose.** `layoutMeasureDiff.test.js`
  is *baseline-locked*: it rasterizes the render for true line counts and asserts
  the measurer is never worse than the old char-width estimate, that ordinary
  Latin text lands at 0% error, and that the estimate never under-counts. It pins
  today’s numbers against regression rather than proving exactness in general.
  Non-Latin accuracy is explicitly unimproved — `measure.js` detects and warns.

**Why it must be re-derived per phase, and the trap in doing so.** §4.3 hands out
per-CV control of the sidebar fraction, the spacing tokens and the type scale —
precisely the inputs to the box model. The 0.01pt result is therefore a fact
about *one fixed theme and geometry*, not a property that survives making the
design variable. And it composes badly with the prerequisite already recorded in
§4.3: six harness modules hardcode `tealTheme`, so a re-derivation run before
that threading lands would **pass while measuring the wrong document**. Fix the
theme threading first, or the oracle confirms an agreement it never tested.

### What byte-reproducibility actually promises

Build the same CV twice with `SOURCE_DATE_EPOCH` pinned and the two PDFs are
byte-identical. The row above used to read *“including cross-architecture CI —
the divergence measured was zlib, not architecture”*, which was opaque and, on
checking, wrong on the second half. Stated properly:

- **Two things can make two builds differ.** PDF content streams are
  zlib-compressed, and zlib’s output changes between Node majors; separately,
  embedded font subsets are written in a **platform-dependent order**
  (`README.md:507`). The first is a Node-version effect. The second is an
  OS/architecture effect.
- **So the guarantee is scoped to same content + same OS + same Node major.**
  Builds across OSes or Node majors are visually identical but not byte-identical
  — and that is documented behaviour, not a defect.
- **Cross-architecture was never measured.** `layoutRepro.test.js` renders the
  scaffold twice through the real CLI and byte-compares — green, but the
  **same-architecture leg only**. `c0-baseline.md` records the x86+ARM matrix leg
  as *“Tracked, not attempted”*: the fixture needs no changes, nobody has wired
  the CI matrix. Claiming the divergence “was zlib, not architecture” asserted a
  negative about a run that has never happened, while the font-subset ordering
  above says architecture is exactly where a divergence would be expected.

Nothing here is an argument for weakening the invariant — it is an argument for
stating its scope honestly, and for treating the second CI leg as open work
rather than a settled result.

**The one exception to Invariant 0, and it is real:** `keywords.yaml` → PDF
metadata.
`sanitizeKeyword` collapses internal commas and whitespace runs (the field is
comma-joined, so a comma inside a keyword would produce spurious fragments for a
parser), and `atsKeywords.max` can cap the list — defaulting to the full length,
so only the user’s own config truncates. These strings are never printed on the
page. Invariant 0 governs rendered text; this is a metadata field, and the
distinction should be stated rather than left as a quiet counter-example.

---

## 6. Rejected, with reasons

Recorded so they are not re-proposed.

| Rejected | Reason |
|---|---|
| MCP layout levers | The channel is `config.yaml` and `layouts/*.yaml` — reviewable, diffable, the user’s. An MCP argument is invisible and a one-way door |
| `targetPages` | Creates a goal the engine cannot satisfy; the model’s remaining actuator becomes the YAML. Unanimous across four panellists |
| `fill: balance` as an optimiser | C4: 5× better metric, visibly worse renders — fills of 0.15/0.07/0.12/0.07 |
| `weights` | Knobs on an objective measured as wrong for this document shape |
| `order` as an MCP lever | Zero marginal capability; section order is already expressible in a layout file the user can read and diff |
| Aggregate quality score | See invariants |
| Undo, snapshots, receipts in CVX | The LLM has memory; CVX is stateless by decision |
| A stored brief (`preferences:` block or brief file) | Inventing a problem. The LLM has a memory and the brief is the conversation |
| A bundled rasteriser | 13–33 MB against a 372 kB package, breaking “zero dependencies beyond Node”, for a capability the clients that matter already have |
| `page1ExperienceCount` as a fit lever | Measured anti-lever — see below |

---

## 7. Measured facts this design rests on

All verified by direct measurement, not inference.

**`page1ExperienceCount` is an anti-lever.** On the shipped demo:

| value | sheets | overflow | page-1 fill |
|---|---|---|---|
| auto / 1 | 3 | 0 | 0.86 |
| 2 | 3 | 184pt | 1.48 |
| 3 | 3 | 420pt | 2.10 |
| 4 | 3 | 590pt | 2.54 |

The page count never moves; every effective setting makes the CV worse. It is
currently taught in `docs/ai-guide.md` as page-1 layout control.

**Two pages is unreachable for the demo CV *by any lever*.** 2298pt of content
against 2166pt of two-page budget — 131pt over, with the sidebar alone needing to
lose 235pt. No lever, and no engine change short of abolishing the column divide,
gets there.

Re-measured 2026-08-13 with per-section costs, which confirms the 235pt exactly
and shows *where* it sits:

| Page | Main | Sidebar | Sidebar sections |
|---|---|---|---|
| 1 | 330.75 / 383.09 (0.86) | 381.1 / 433.44 (0.88) | contact 101.65 · achievements 265.20 |
| 2 | 608.80 / 659.99 (0.92) | 619.65 / 689.94 (0.90) | education 220.25 · certifications 120.45 · competencies 120.15 · languages 116.05 |
| 3 | **empty** | 357.71 / 689.94 (0.52) | publications 112.00 · referees 231.46 |

Sidebar headroom across pages 1–2 is **122.63pt**; page 3 carries **357.71pt**;
the shortfall is **235.08pt**. The main column is not the problem and cannot help —
it is at 0.92 on page 2 with only ~103pt spare across both pages.

**But it *is* reachable by editing content, and that is now the decided fix.**
Page 3 exists only because page 2’s sidebar has 70.29pt free and `publications`
needs 112. So two pages requires **both**: drop `referees` (231.46pt — the section
CVX’s own skill already tells users is filler), *and* free ≥41.71pt on page 2 so
publications fits. Dropping referees alone does not do it. Recorded because the
arithmetic is not intuitive and the obvious single cut fails.

**The README promises what the product cannot deliver.** It calls the scaffolded
example “a designed two-page CV”; it renders three, and page 3 is the near-empty
main column above. The first artifact every user sees is the product’s own worst
example.

**A long contact value clips at the default sidebar width, and nothing catches
it.** At the shipped `sidebarFraction: 0.37`, the email
`bruce.wayne.field.commander@wayne-enterprises-international.com` renders as
`…@wayne-enterprises-inter` — cut off mid-token at the sidebar edge, with
`validate --strict` reporting `ok: true` and zero warnings. No width guard exists
in the engine.

It violates Invariant 0, which names clipping explicitly. And the guard that is
supposed to catch exactly this cannot: `checkCompleteness` reads the `pdftotext`
layer, where the **full email is present** — only the glyphs are cut. So the
oracle enforces “in the text stream” for an invariant written as “visible on the
page”. That is a second blind spot in the same guard, independent of the
layout-omission conflation found the same day.

Found by rendering a page and looking at it, which is the §4.1 argument in
miniature: no diagnostic field reports this, and no test did either. Decided fix
is to wrap rather than clip (`design-p3-surface.md` §6.4); engine work, in no
current phase.

**Every scaffolded CV ships a `geometry:` block that does nothing.**
`template/cv-content/layouts/two-column.yaml:9-15` emits six keys — `size: A4`,
`topBar: 30`, `sidebarFraction: 0.37`, and three padding arrays — whose values
faithfully mirror `tealTheme.geometry`. CVX ignores all of them. The layout schema
declares the block `additionalProperties: true` with no properties defined, so
**any** key inside it validates and is discarded silently: change
`sidebarFraction` to `0.30` today and nothing happens, with no error.

This is the most misleading surface in the product — it looks exactly like the
lever every doc insists does not exist. It is also worse than a dead block,
because the template’s vocabulary and the theme’s internals disagree: `size: A4`
against `pageWidth`/`pageHeight`, `mainPadding` as an array against `mainPad` as
an object, `contPadding`/`sidebarPadding` against `contPad`/`sidebarPad`. Turning
geometry on is therefore a naming decision, not a switch.

**Nothing bounds a build-driven loop.** `buildPdf` deletes the plan-iteration
counter on every call, so the skill must carry the discipline instead. The
counter itself is a live violation of the stateless claim, not a harmless
leftover — see §3.

---

## 8. Literature

The KPI question — *what makes a document predictably look good* — has an
existing body of work, and the useful part is narrower than expected.

**[Harrington, *Aesthetic Measures for Automated Document Layout*, DocEng
2004](https://dl.acm.org/doi/10.1145/1030397.1030419)** defines computable
measures for alignment, regularity, separation, balance, white-space fraction,
white-space free flow, proportion, uniformity and page security, with roughly 50%
whitespace as a general-document target.

**The load-bearing detail:** Harrington combines the measures **nonlinearly, so
one bad feature harms the whole**. C4 used `Σ residualSlack²` — a smooth sum —
which is exactly why it crowned a pagination that empties page 1’s main column: a
sum lets one catastrophic feature be averaged away by several good ones. Any
future measure must be veto-shaped, not additive.

Also: [Balinsky & Wiley on alignment and
regularity](https://dl.acm.org/doi/10.1145/1600193.1600207) (DocEng 2009);
[*Aesthetic Measures for Document
Layouts*](https://dl.acm.org/doi/10.1145/2960811.2960821) (DocEng 2016); and a
[survey of evaluation metrics for typographic
generation](https://arxiv.org/abs/2402.06945) splitting metrics into legibility,
aesthetics and semantics. Classical defects — widows, orphans, rivers — are well
defined; rivers only afflict justified text, which CVX does not use. Readability
work puts comfortable line length at roughly 40–60 characters.

**How this is used here:** as vocabulary for the skill, not as an objective
function in the engine. The LLM reads measurements and looks at the page; the
literature tells it what to look *for*. Nothing computes a score.

---

## 9. Provenance

This design is the product of four independent panellists (LLM tool design,
product, adversarial, architecture), two UX analysts, and two redirections from
the maintainer that changed it more than any of the reviews:

- *“It was never about a 2-page CV… what matters is the overall outcome.”*
- *“CLI never keeps track of previous iterations. It should act as a dumb tool.”*

The first killed the lever framing. The second inverted the architecture — an
earlier draft of this design put defect detection, iteration acceptance, undo and
receipts inside CVX. Both corrections are why the document says what it says, and
both are recorded here so the reasoning survives the decisions.
