# Sprint: the design loop — CVX as an instrument, the LLM as the designer

*2026-08-09. Supersedes C6b (“MCP layout levers”), closed as premise-superseded.
Panel: four independent lenses (LLM tool design, product, adversarial,
architecture) plus two UX analysts; then the maintainer redirected the whole
thing twice, and both redirections are the reason this document says what it
says.*

---

## The architecture, in one line

> **CVX is a dumb, stateless, expressive renderer. The LLM is the designer. The
> skill teaches it how. The user gives the brief.**

Everything below follows from that. It is a deliberate inversion of this
document’s first draft, which put defect detection, iteration acceptance, undo
and receipts *inside* CVX. Those belong to the LLM, which already has memory,
judgement, and a conversation with the user. What CVX owes the designer is
**expressiveness and accurate measurement** — nothing more, and nothing smarter.

### The three roles

| Actor | Owns | Explicitly does not own |
|---|---|---|
| **User** | Direction, at any iteration: what to emphasise, what reads too long, exact replacement wording. And final approval | Executing it |
| **LLM** | Design judgement, the edits, memory of what it tried, backtracking, candid reporting | Inventing facts. Overriding direction |
| **CVX** | Faithful rendering, accurate measurement, honest diagnostics | Opinions, memory, state, judgement, “quality” |

**The loop is collaborative, not autonomous.** This document’s first draft had the
assistant iterating in silence and then revealing — which is why the UX review
worried about long silences, one large consent gate, and a loop that could
re-edit a sentence the user had just restored. That is not the shape. Both
parties look at each render, and either can direct the next change:

```
brainstorm the content together
  → LLM writes the YAML → build
  → BOTH look at the PDF
  → either directs the next change
      user: “my current role reads too long — use this wording instead”
      LLM:  “page 3 is thin; I’ll tighten these two bullets and re-run”
  → edit → build → look → …
  → done when both are satisfied
```

The user is *in* the loop, not waiting at the end of it. That is what makes the
consent question mostly evaporate: nothing accumulates unseen, so there is no
pile of unreviewed rewrites to disclose at the end.

CVX never keeps track of previous iterations, and it never scores a layout. It is
only ever the callee: the LLM runs `cvx` the way it runs `ls` over SSH, and gets
an answer back — nothing more. Asked the same question twice it gives the same
answer, and that is a feature: an instrument you cannot trust to be inert is not
an instrument.

---

## What the maintainer actually asked for

The old chunk asked *“which layout levers should an assistant get?”*, and every
answer was bad because the question was wrong. Two corrections, both his:

**First — it was never about a page count.**

> Think about how a human creates a CV. He goes through multiple, continuous
> iterations until the text and each section are placed on the page(s) in a way
> that looks good to another human eye. He might add more text or reduce text,
> add spaces or reduce spaces, change sentences, until a nice outcome is
> achieved. What I want is the LLM to replace the human here. It was never about
> someone creating a 2-page CV — it could be 3 pages, or 1½. **What matters is
> the overall outcome.**

**Second — the session starts with a conversation, not a permission prompt.**

> Before beginning the session the LLM should ask about layout preferences from
> the user in general with examples — the user might want to keep the CV to 1, 2,
> N pages, shorten or highlight education, experience or any other section
> depending on his own taste or the job he is applying for. **Basically it’s a
> conversation between user and the LLM.**

A designer takes a brief. That reframes “may the assistant cut a bullet?” from a
permission question into a scope question already settled at the start — and the
LLM then **reports candidly** as it works.

**Third — the tool stays dumb.**

> LLM can judge. CLI never keeps track of previous iterations. It should act as a
> dumb tool. […] LLMs can anyway keep track of what happened in their
> history/memory. Maybe the skill should ask the LLM to keep track of the changes
> made so it can undo, backtrack based on its own judgement or the user’s
> instructions.

So: **no snapshots, no receipts, no undo, no monotone-acceptance rule inside
CVX.** Those live in the skill as instructions to the LLM.

---

## Why the current design cannot serve this

CVX’s layout system was built to render *one fixed design well*, not to be
designed *with*. Verified against the schema and the themes:

| | State |
|---|---|
| **Expressible per CV** | Which sections go in which column, their order, and `spacer: N` |
| **Fixed and unreachable** | Page geometry (`geometry` is *“Reserved. Currently ignored”*), sidebar width, all 23 spacing tokens, every font size and leading, all padding |

An LLM that looks at page 3 and thinks *“narrow the sidebar”*, *“tighten this
section”*, or *“drop the body size a quarter point”* can do none of it. It can
move a section between columns and insert a spacer. That is the entire design
surface.

And the flow is equally fixed: two columns, sections locked to a column,
front-load top-down. The shipped demo’s page 3 — a full-height sidebar beside a
completely empty main column — is a direct consequence, and no amount of surface
control fixes it.

Hence the maintainer’s verdict: **the algorithm needs redesigning, on both axes —
surface and flow.**

---

## Phases

Sequenced so **every phase ships on its own** and the risky work comes last. This
is the C3-checkpoint pattern that worked: a releasable state partway through.

**Decided after the dialectic pass (2026-08-13): the full plan proceeds.** The
antithesis was that the only real dogfood session never produced a PDF at all —
it failed on orchestration and an npm 503, and every recorded content defect was
fidelity, not layout — so no user has ever reached the layout stage and the
expressiveness program is unvalidated by real demand. The maintainer weighed that
and chose to proceed. Recorded because it is a real objection, not a resolved one:
if P1a’s transcripts do not show an LLM blocked by a missing control, P3’s premise
is wrong and P3 should be reconsidered rather than built.

**P3’s start condition:** a transcript in which an LLM looked at a render and the
missing control was the actual blocker. This is not a delay bolted onto the plan —
P1a produces exactly those transcripts as a byproduct, so the gate is P1a’s
acceptance evidence read forward. The token table is already drafted and waiting
(`design-p3-surface.md`), so satisfying the gate costs nothing in lead time.

**First real transcript exists (2026-08-14), and it does not point at P3.** A
real user's CV was rebuilt as the dogfood gate; the assistant rendered, looked,
named the defect, and probed nine fixes blind. What was missing was never a
layout control — it was (a) per-entry heights (P2: nine build-probe cycles that
one published number would have made one subtraction), (b) a *stall* diagnostic
naming why page 1 ended early and what the lever was, and (c) box-model fidelity
(the engine over-measures entries by 6.7–13.1pt, untested because no fixture has
a progression). Full record: `postmortem-pagination-fidelity.md`; fix design:
`design-layout-fidelity.md`. Consequence for sequencing: the fidelity +
diagnostics work precedes P2's publication (publishing heights that are wrong by
13pt per entry would be worse than publishing nothing), and P3's gate remains
unmet.

**Each phase gets its own design doc before code** — key lists, response shapes,
bounds, signatures — following the C-chunk pattern in `sprint-layout-engine.md`.
This doc and `design-cvx-as-instrument.md` stay the *why* and are meant to
outlive the implementation. Decided 2026-08-13, because superseding
`layout-packing-design.md` §7 removed the only concrete interface design in the
repo and named no successor, leaving P2/P3/P4 with no buildable spec anywhere.
P3’s doc exists: `design-p3-surface.md`. P1a and P2 still need theirs.

### P1 — Sight and the brief *(docs + skill only; ships alone)*

The highest-value phase and the cheapest. No engine change.

**Status 2026-08-13 — four of six items landed, suite green at 658/658:** the ten
contradicting sites, the anti-lever advice, the two-page demo, and the dead
`geometry:` block are all done. Still open: **teach the brief conversation**,
**teach memory**, and the **dogfood gate**, which is the phase's actual acceptance
evidence and cannot be self-certified. One item was deliberately dropped — see the
`geometry:` entry.

- ✅ **Stop forbidding the thing the loop depends on.** Ten shipped sites across
  five files tell the assistant it cannot see the PDF or must not change content
  on its own: `SKILL.md`, `ai-guide.md`, `src/pdf/layoutDiagnostics.js` (twice
  each), `src/mcp/tools.js` (three times) and `src/mcp/server.js`. The full
  inventory, with line numbers and the two claim families, is in the design doc
  §4.1. **This is not a docs-only edit** — two of them are model-facing API
  surface: `plan_layout`’s description, read on every `listTools`, and the
  server’s `instructions` block, read at handshake before any tool call. That
  block also teaches the loop with the sight step missing entirely.
  Keep *“surface the trade-off and let the user decide”* — that is the
  collaborative loop. What goes is the absolute form that forbids the LLM to act
  under direction it was given.
- **Teach the brief conversation**: page-count preference, sections to emphasise
  or compress, the target job, personal taste — asked once, with examples, before
  any drafting.
- **Teach the loop**: build → open the returned `path` → look at every page →
  judge → adjust → repeat → report candidly → user approves.
- **Teach memory**: keep a running list of what changed and why, so the LLM can
  backtrack on its own judgement or on instruction. CVX will not help; it cannot.
- ✅ **Delete the anti-lever advice.** `ai-guide.md` teaches `page1ExperienceCount`
  as page-1 layout control. Measured on the shipped demo: the page count never
  moves and overflow goes 0 → 184 → 420 → 590pt. It is an anti-lever.
- ✅ **Make the demo a genuine two-page CV.** Decided 2026-08-13. It renders three,
  the README calls it two, and page 3 is an empty main column beside a
  half-filled sidebar — the first artifact every user sees is the product’s worst
  example. Measured recipe (design doc §7): the sidebar must shed **235.08pt**,
  which needs **both** dropping `referees` (231.46pt) *and* freeing ≥41.71pt on
  page 2 so `publications` (112pt) stops stranding. Dropping referees alone fails
  by ~42pt. Content-only change; no engine work.
- ✅ **Delete the dead `geometry:` block from both scaffolded layouts.** Every
  `cvx init` ships six authoritative-looking page-geometry keys that CVX ignores
  completely, and the schema accepts any key inside the block without validating
  it — so editing `sidebarFraction` today does nothing, silently. It is the most
  misleading surface in the product and it looks exactly like the lever every doc
  says does not exist. No engine work. **The "make `validate` reject a `geometry:` block" half was
  dropped deliberately:** the template *shipped* that block, so every workspace
  ever scaffolded has one, and rejecting it would fail their builds to protect
  them from a key that does nothing. A notice, not an error, and only when the
  block starts meaning something. Detail: `design-p3-surface.md` §2.1.
- **Gate:** a dogfood transcript in which an assistant takes a brief, renders,
  looks, names a defect, fixes it, re-renders, and reports what it changed.

### P1a — Progressive sight *(new; engine + MCP, small)*

Decided in the 2026-08-13 red-team review, and it changes what P1 is aiming at:
CVX renders **up to a point the caller names** and returns a picture of it when
the host has poppler (`hasPdftoppm()`, already used by the test suite), falling
back to a shorter PDF when it does not. Nothing new is bundled, so the rejection
of a bundled rasteriser stands.

Why it earns a phase of its own: it is the mitigation for the score problem that
a prohibition cannot fix — a global summary invites a global objective, a
sequential prefix invites local repair — and it is *monotone* on this engine,
because the packer is greedy top-down so an edit below a point cannot move what
is above it. Design doc §4.1 has the reasoning and the three consequences
(stateless by construction; the cursor is per-column, not one line; a preview is
not a deliverable and must be impossible to mistake for one).

Needs its own design doc before code: cut-point vocabulary (page? section?),
response shape, preview file naming, and the Invariant 0 carve-out.

### P2 — Measurement *(small, pure)*

The designer must be able to price text before it can trade.

- Publish per-entry and per-bullet `heightPt` and line counts, mirroring what
  `SidebarSlice` already exposes for the sidebar. `experienceBlock` computes them
  and `packExperiences` discards them.
- **Gate:** an assistant can compute *“this bullet costs 43pt over 3 lines”* from
  the response alone. Today `test/planLayout.test.js` must import two `@internal`
  names to reconstruct that — which is the tell that it is not published.

### P3 — Surface: make the design expressible *(medium–large)*

- Make `geometry` real. It is already in the schema and explicitly ignored, which
  makes it the natural entry point.
- Per-CV overrides for sidebar fraction, spacing tokens, and the type scale.
- **Bounds must be structural, not numeric.** The pattern that survives review:
  a resolver that copies typography *by reference* and can only ever scale keys
  from an explicit table — so “this cannot cross the legibility floor” is a fact
  about the object graph, testable by identity, not a promise about arithmetic.
- **Known cost, already measured:** six harness modules hardcode `tealTheme` and
  would silently measure the wrong document the moment a fixture varies the
  theme. No fixture has ever set one. That threading is a prerequisite, not a
  detail.

### P4 — Flow: rethink content placement *(large, risky, last)*

The engine change. Sections locked to a column and filled top-down is what
produces an empty main column beside a full sidebar.

Candidates — to be designed, not assumed: letting a section move between columns
when one flow is binding; deliberate balancing as an *instructed* choice rather
than an optimiser’s; per-section flow control.

**C4’s lesson applies here and must be carried in:** an optimiser chasing a
metric produced measurably worse CVs. The difference now is that the LLM looks at
the render each pass and holds the brief — the metric never decides alone. But
nothing in P4 may reintroduce an aggregate score.

---

## What must survive, unchanged

Non-negotiable across every phase:

- **Invariant 0** — nothing dropped, clipped or hidden by the *renderer* to make
  content fit. (The *assistant* editing text under a brief is a different act,
  disclosed to the user. Restate the invariant so it says which actor it binds.)
- **Byte-reproducibility** — same content, same OS, same Node major. The
  cross-architecture CI leg is still *“tracked, not attempted”* (c0-baseline),
  so it is open work to protect, not a result to preserve. Design doc §5.
- **The 0.00pt measure-vs-render agreement** on the sidebar, and the main column’s
  bounded looseness — both re-derived per phase, since P3 rescales what they
  measure.
- **Facts are inviolable.** The assistant may tighten prose; it may never invent,
  alter or drop a fact, number, date or achievement.
- **Layout instructions are never read from CV body text.** Existing guard,
  tested.
- **No aggregate score, ever.** C4’s finding; C6a’s discipline.

---

## Explicitly not building

| Dropped | Reason |
|---|---|
| MCP layout levers | The channel is `config.yaml` and `layouts/*.yaml` — reviewable, diffable, the user’s. An MCP argument is an invisible one-way door |
| `targetPages` | Creates a goal the engine cannot satisfy; the model’s remaining actuator becomes the YAML. All four panellists |
| `fill: balance` as an optimiser | C4 measured: 5× better metric, visibly worse renders |
| Aggregate quality score | A scalar is a gradient, and models climb gradients even when told not to |
| Undo, snapshots, receipts in CVX | The LLM has memory; CVX is stateless by decision |
| A bundled rasteriser | 13–33 MB against a 372 kB package. The clients that matter already open PDFs |

---

## Verified defects to fix in P1

All measured today, all currently shipped:

1. **Ten sites contradict the loop**, two of them model-facing API surface.
2. **`page1ExperienceCount` is an anti-lever**, taught as page-1 layout control:

   | value | sheets | overflow |
   |---|---|---|
   | auto / 1 | 3 | 0 |
   | 2 | 3 | 184pt |
   | 3 | 3 | 420pt |
   | 4 | 3 | 590pt |

3. **The README promises a two-page demo CV; it renders three** — and two pages
   is arithmetically unreachable: 2298pt of content against a 2166pt budget.
4. **The demo CV is the product’s own worst example** — page 3 is a near-empty
   main column beside a full sidebar, on the first artifact every user sees.
5. **Nothing bounds a build-driven loop.** The only existing cap counts unchanged
   `plan_layout` calls, and `buildPdf` deletes that counter on every build.
   Bounding is the LLM’s job — but the skill must say so, because today nothing
   does.
6. **CVX is not actually stateless, and `plan_layout` is not a pure function.**
   `planIterations` (`src/mcp/tools.js`) is a process-scoped `Map`: every
   response carries an `iteration` block, and the fifth identical call appends a
   notice accusing the model of looping. A callee does not count its caller’s
   calls. This contradicts both the “asked the same question twice it gives the
   same answer” claim above and the rejection of state in CVX — deleting it
   belongs in P1, together with the tests in `test/planLayout.test.js` that pin
   it.

---

## Settled questions

Recorded so they are not reopened:

- **The brief is not an artifact.** No `preferences:` block, no brief file, no
  schema. The LLM has a memory, and the brief is simply the conversation that
  produced the content — the user brainstorms the sections with the assistant,
  which then writes the YAML and invokes CVX. Anything durable across sessions
  is the client’s memory feature, not CVX’s problem. *(An earlier draft proposed
  storing it; that was inventing a problem.)*
- **Text changes are collaborative and bidirectional.** Either party may add,
  remove or change text between iterations — the user supplying exact wording
  for a section that reads too long, or the LLM tightening a section to serve a
  length the user asked for. Facts stay inviolable; that constraint binds the
  words, not who edits them.
- **The ATS variant is looked at once before delivery**, not iterated. It has no
  layout plan by construction, and an edit that improves a two-column page has
  no reason to improve a single-column flow. One look would have caught both
  corrupted ATS PDFs that reached real users.
- **A client that cannot open a PDF does not run the loop.** It falls back to a
  single build. Iterating on measurements alone is the blind-optimiser shape C4
  measured as harmful — better no loop than a loop that cannot see. This is also
  what keeps the rasteriser deferred.
