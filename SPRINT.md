# SPRINT — what is in flight right now

**This file only points, never restates — and shipping deletes.** Engineering
items appear as I-numbers / §8 small-item names from [ARCHITECTURE.md](ARCHITECTURE.md)
(sequence, scope, and acceptance criteria live there; backlog in its §7.4).
What shipped lives in [CHANGELOG.md](CHANGELOG.md) — a shipped item is deleted
from this file in the same commit that adds its CHANGELOG entry. Anything
unshipped at sprint close rolls forward or returns to §7.4 with one line
saying why. Deleting this file must lose nothing except "what we're doing
right now and what's parked." Sprints are divided by amount of work, not
time (maintainer, 2026-08-14); a sprint closes when its work ships as a
release.

## Sprint 1 — "Honest, then loud" (in flight)

Goal: no schema-legal input reachable through the skill's own workflow can
produce a defective PDF silently; the stateless claim becomes true again.

Landed (details in CHANGELOG's Unreleased section, which is the record —
this file never restates them): **I1**, **I2**, **I3**, and the
`planIterations` deletion.

**Reopened then re-landed 2026-08-16.** The skill-driven dogfood found two
silent-content-loss defects that were verbatim instances of this sprint's own
goal — **D2** (`summary` in a sidebar slot deleted, `validate --strict ok:
true`) and **D3** (`continuation.main` dead on every 2-page CV, any key). Both
are fixed, both have regression tests over layout permutations (the dimension
the content oracle never varied, which is why neither was caught before).
**D1, D4–D6, D7 and D11 landed in the same run** — see CHANGELOG's Unreleased
section, which is the record. Scope and reasoning in ARCHITECTURE.md §7.4.

**RELEASE IS BLOCKED ON ONE THING ONLY: three knowingly-red tests.** They are
test-model debt from D7, not defects — see "Found, unscheduled" below for what
each needs. A release cannot be cut with a red suite, so either re-model them
first or take an explicit maintainer decision to ship with them quarantined.
Everything else in the definition of done is green: `npm run lint`,
`npm run typecheck` and `docsSync` all pass, and 816 of 819 tests pass.

Definition of done: ARCHITECTURE.md §8's acceptance criteria for I1–I3; the
standing release gates (§9: CI matrix, packaged E2E, repro gate, tarball
< 500 kB); docsSync green; diagnostics version bumped per R-E (now **v4**);
CHANGELOG entries written at ship time and these lines deleted in the same
commit — the Unreleased entries are already written, so shipping deletes this
section rather than authoring it.

## Parked — ops backlog

Migrated once from the superseded sprint plan so it has a live home; no
committed sprint. Pull an item into a sprint deliberately or not at all.
All launch and distribution items (demo GIF + Show HN, marketplace repo,
Connectors submission, `.mcpb` bundle) were removed per maintainer ruling
2026-08-15 — not launching anytime soon; the archived sprint plan records
them if that ever changes.

- **L2** — hero/demo image regeneration (its stated trigger has FIRED: the
  scaffold now renders the two clean pages the README promises)
- **L6** — co-maintainer conversation; good-first-issue labeling
- **L7** — upstream react-pdf deterministic-rendering issue/PR (so INV-11
  stops depending on monkey-patches)
- **L8** — SchemaStore PR follow-up (submitted; external latency)
- **L9** — SVG logo master (branding 0.1.6; raster-only kit today)
- **L10** — packaged ai-guide sibling links point at `main`; pin-at-pack-time
  decision still unmade

## Found, unscheduled

- **Test-model debt from D7 — the next sprint's work, and the release gate.**
  `prog-split` landed and three tests are knowingly red because their models
  predate a splittable promotion table. Maintainer ruling 2026-08-16: implement
  the change accurately now, re-model the tests in their own sprint. Each needs
  a different thing, and none of them needs the engine touched:
  - `test/layoutOptimality.test.js` — the exhaustive DP oracle enumerates
    bullet-level cuts only, so it now searches a SMALLER space than the real
    packer and reports greedy as sub-optimal against its own narrower model.
    Needs a progression-row dimension in the state `(entry, bullet, pageKind)`.
  - `test/layoutRenderOracle.test.js` (`edge-page1-blocked`) — the harness's
    structural `noOrphanHeading` has no id for a progression row, so a head
    carrying three rows and no bullets reads to it as a bare heading. Needs
    `::prog:N` ids in `test/layout-harness/`. The real invariant is asserted
    meanwhile in `src/pdf/layout.progSplit.test.js` ("no piece is a bare
    heading"), swept over eight page-1 fill levels.
  - `test/planLayout.test.js` (`edge-page1-blocked`) — that fixture no longer
    ends page 1 early, because prog-split fixed exactly the shape it was built
    to demonstrate. Needs a REPLACEMENT fixture that still blocks (a role whose
    heading plus one atom exceeds the residual), not a relaxed assertion.
  - Also worth doing in the same pass: `baseline.json` may want regenerating
    (`node test/layout-harness/generateBaseline.js`) once the above are honest,
    and the C0 fixture set has no layout-spacing axis — D11 is exercised only
    by its own tests.
- §7.4 also records **NOT DOING — replacing the greedy packer**: proven optimal
  in-repo and over 900 generated CVs, 0 counterexamples.

## Decisions needed (pointers, not content)

- Git-history redaction of the pre-consolidation dogfooding report (names
  were redacted in the working tree 2026-08-14; history rewrite is a
  maintainer call).
