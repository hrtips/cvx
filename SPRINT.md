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

**Sprint 1 is NOT complete — reopened 2026-08-16.** The 2026-08-16
skill-driven dogfood found two silent-content-loss defects that are verbatim
instances of this sprint's own goal: **D2** (`summary` in a sidebar slot
deleted, `validate --strict ok: true`, page 1 still reserving its height) and
**D3** (`continuation.main` dead on every 2-page CV, any key). Both are
schema-legal, both are reachable through the layout edit SKILL.md §"Student
and first-job CVs" teaches, both produce a defective PDF silently. Scope and
acceptance criteria in ARCHITECTURE.md §7.4. **These block the release.**

Definition of done: ARCHITECTURE.md §8's acceptance criteria for I1–I3; the
standing release gates (§9: CI matrix, packaged E2E, repro gate, tarball
< 500 kB); docsSync green; diagnostics version bumped per R-E; CHANGELOG
entries written at ship time and these lines deleted in the same commit.

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

- **D1, D4–D9** (§7.4) — the remainder of the 2026-08-16 dogfood, all
  reproduced on the stock scaffold. D2 and D3 are not here: they are release
  blockers in Sprint 1 above. Ordering that matters: **D4** (the engine's false
  exclusivity claim, fixed in engine and skill together) and **P2** (per-entry
  publication) come before **D7** (`prog-split`), because P2 is how a packing
  change gets verified. §7.4 also records **NOT DOING — replacing the greedy
  packer**: proven optimal in-repo and over 900 generated CVs, 0 counterexamples.

## Decisions needed (pointers, not content)

- Git-history redaction of the pre-consolidation dogfooding report (names
  were redacted in the working tree 2026-08-14; history rewrite is a
  maintainer call).
