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

## No sprint in flight

Sprint 1 — "Honest, then loud" — shipped as **1.8.0** on 2026-08-17. What it
did is in [CHANGELOG.md](CHANGELOG.md); why, in ARCHITECTURE.md §7.4 and §8.
The next sprint starts by picking from §8's chain (I4 is next) or from the
backlog below.

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

- **The C0 fixture set has no layout-spacing axis** — D11's template `spacing:`
  block is exercised only by its own unit tests, so no corpus fixture varies it
  and no render-diff covers a scaled theme. Worth an axis when the per-CV design
  surface grows (ARCHITECTURE §7.4).
- **No corpus fixture reaches the student-CV shape** — carried since I2 and
  still true: `experience: []` with sections in a main slot is the shape two
  blockers hid in, and the harness's render oracle is exactly the instrument
  that would adjudicate it. Should lead the I4 work.
- §7.4 also records **NOT DOING — replacing the greedy packer**: proven optimal
  in-repo and over 900 generated CVs, 0 counterexamples.

## Decisions needed (pointers, not content)

- Git-history redaction of the pre-consolidation dogfooding report (names
  were redacted in the working tree 2026-08-14; history rewrite is a
  maintainer call).
