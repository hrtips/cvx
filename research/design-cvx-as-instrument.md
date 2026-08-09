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
| **CVX** | Faithful rendering; accurate measurement; honest diagnostics | Hold opinions, memory, or state. Score a layout. Call an LLM |

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

The LLM decides. Nothing in CVX bounds the loop, and today nothing can: the only
existing counter (`PLAN_ITERATION_CAP`) counts unchanged `plan_layout` calls and
is deleted by every build. Under the dumb-tool principle that is correct — but
**the skill must state the stopping discipline explicitly**, because no other
component will.

### Where the loop does not run

A client that cannot open a PDF does not run this loop; it falls back to a single
build. Iterating on measurements alone is precisely the blind-optimiser shape C4
measured as harmful. Better no loop than a loop that cannot see.

---

## 4. What CVX must expose

Three capabilities. The first is nearly free and is being actively suppressed;
the second is small; the third and fourth are the redesign.

### 4.1 Sight — the render itself

Already works. `build_pdf` returns an absolute path, and Claude-family clients
open PDFs natively. Verified by reading the shipped demo and naming three defects
that appear in no diagnostic field.

**The obstacle is documentation, and one piece of it is API.** Five shipped sites
tell the assistant it cannot see the PDF, or must not change content on its own:

| Site | Text |
|---|---|
| `skills/cvx/SKILL.md` | “You can’t see the PDF” |
| `skills/cvx/SKILL.md` | “never a layout fix you apply on your own” |
| `docs/ai-guide.md` | “An assistant can’t see the PDF” |
| `src/mcp/tools.js` | `plan_layout`’s description — “never drop content on their behalf” |
| `src/pdf/layoutDiagnostics.js` | “it is the user’s call to make” |

The fourth is model-facing API surface, read on every `listTools`. Changing these
is not a prose edit.

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

**Design direction:**

- Make `geometry` real — it is already in the schema and ignored, which makes it
  the natural entry point.
- Per-CV overrides for sidebar fraction, spacing tokens, and the type scale.
- **Bounds must be structural, not numeric.** The pattern that survives review is
  a resolver that copies typography *by reference* and can only ever scale keys
  from an explicit table. Then “this cannot cross the legibility floor” is a fact
  about the object graph — assertable by identity — rather than an argument about
  arithmetic. Numeric floors on individual gaps are the judgement-shaped part and
  belong in one explicit table with one assertion per token.
- **Known prerequisite, already measured:** six harness modules hardcode
  `tealTheme` and would silently measure the wrong document the moment a fixture
  varies the theme. No fixture has ever set one. Threading `themeFor(spec)`
  through those modules comes first, or the oracles lie.

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

Non-negotiable across every phase.

| Invariant | Note |
|---|---|
| **Invariant 0** — the *renderer* never drops, clips or hides content to make it fit | Restate it to name the actor. The assistant editing text under the user’s direction is a different act, disclosed as it happens |
| **Facts are inviolable** | Prose may be tightened; a fact, number, date or achievement may never be invented, altered or dropped. Binds the words, not who edits them |
| **Byte-reproducibility**, including cross-architecture CI | The promise is “same content + same node build”, not “same CPU” — the divergence measured was zlib, not architecture |
| **Measure-vs-render agreement** | Sidebar at 0.00pt; main column bounded. §4.3 rescales what these measure, so both must be re-derived per phase |
| **Layout instructions are never read from CV body text** | Guarded and tested. Holds more easily here: edits surface to the user by construction |
| **No aggregate score, ever** | A scalar is a gradient and models climb gradients. Named conditions are facts; scores are targets |

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

**Two pages is unreachable for the demo CV.** 2298pt of content against 2166pt of
two-page budget — 131pt over, with the sidebar alone needing to lose 235pt. No
lever, and no engine change short of abolishing the column divide, gets there.

**The README promises what the product cannot deliver.** It calls the scaffolded
example “a designed two-page CV”; it renders three, and page 3 is the near-empty
main column above. The first artifact every user sees is the product’s own worst
example.

**Nothing bounds a build-driven loop.** `buildPdf` deletes the plan-iteration
counter on every call. Correct under the dumb-tool principle; the skill must
carry the discipline instead.

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
