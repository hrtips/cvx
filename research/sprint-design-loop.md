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

CVX never keeps track of previous iterations. It never scores a layout. It never
calls an LLM. Asked the same question twice it gives the same answer, and that is
a feature: an instrument you cannot trust to be inert is not an instrument.

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

### P1 — Sight and the brief *(docs + skill only; ships alone)*

The highest-value phase and the cheapest. No engine change.

- **Stop forbidding the thing the loop depends on.** Five shipped sites tell the
  assistant it cannot see the PDF or must not change content on its own —
  including `plan_layout`’s own MCP description, which every model reads on every
  call:
  `SKILL.md` (“You can’t see the PDF”, “never a layout fix you apply on your
  own”), `ai-guide.md` (“An assistant can’t see the PDF”),
  `src/mcp/tools.js` (“never drop content on their behalf”),
  `src/pdf/layoutDiagnostics.js` (“it is the user’s call to make”).
  **This is not a docs-only edit** — one of them is model-facing API surface.
- **Teach the brief conversation**: page-count preference, sections to emphasise
  or compress, the target job, personal taste — asked once, with examples, before
  any drafting.
- **Teach the loop**: build → open the returned `path` → look at every page →
  judge → adjust → repeat → report candidly → user approves.
- **Teach memory**: keep a running list of what changed and why, so the LLM can
  backtrack on its own judgement or on instruction. CVX will not help; it cannot.
- **Delete the anti-lever advice.** `ai-guide.md` teaches `page1ExperienceCount`
  as page-1 layout control. Measured on the shipped demo: the page count never
  moves and overflow goes 0 → 184 → 420 → 590pt. It is an anti-lever.
- **Gate:** a dogfood transcript in which an assistant takes a brief, renders,
  looks, names a defect, fixes it, re-renders, and reports what it changed.

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
- **Byte-reproducibility**, including the cross-architecture CI leg.
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

1. **Five sites contradict the loop**, one of them an MCP tool description.
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
   Under the dumb-tool principle this is correct — bounding is the LLM’s job —
   but the skill must say so, because today nothing does.

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
