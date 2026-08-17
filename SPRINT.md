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

Sprint 1 — "Honest, then loud" — shipped as **1.8.0** on 2026-08-17 (I1, I2,
I3, and the `planIterations` deletion). **1.8.1** followed the same day with
unplanned work: the P0 a dogfood of 1.8.0 found — a populated section that no
layout slot renders was dropped from the designed PDF in silence — plus the
`validate`-bypasses-`resolveDocument` fix that made it detectable, `spacerPt`,
and five documentation corrections. What both releases did is in
[CHANGELOG.md](CHANGELOG.md); why, in ARCHITECTURE.md §7.4 and §8.

§8's chain resumes at **I4** (main-slot fixed-content pricing). Before pulling
it, read the first item under "Found, unscheduled" — it is I4's prerequisite,
not a nicety.

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
  stops depending on monkey-patches). **Now evidenced, 2026-08-17:** the
  alert-only `upstream-canary` job fails on `@react-pdf/renderer@next` —
  `verifyPatchPoints` reports the pdfkit seams `setupReproducibility` patches
  are no longer there. Byte-reproducibility is fine on the pinned dependency
  (the `repro-arch` matrix is green), so this is not a release blocker; it is
  the deadline. When that version ships, INV-11 breaks unless the patches are
  re-found or the determinism lands upstream.
- **L8** — SchemaStore PR follow-up (submitted; external latency)
- **L9** — SVG logo master (branding 0.1.6; raster-only kit today)
- **L10** — packaged ai-guide sibling links point at `main`; pin-at-pack-time
  decision still unmade

## Found, unscheduled

- **No corpus fixture reaches the student-CV shape** — carried since I2 and
  still true: `experience: []` with sections in a main slot. **This should lead
  I4**, and the case for it is now three incidents deep rather than one. Two of
  I2/I3's review blockers hid in exactly this shape, and 1.8.1's P0 lived in its
  neighbour (a section with no slot at all). All three share one cause: a
  plan-level claim published with no render-level instrument pointed at it — and
  the harness's render oracle, which detects a column's ink directly, is that
  instrument. It is already built; nothing points it at this shape.
- **Neither dogfood defect was caught by an automated gate.** The 1.8.0 P0 was
  found by the skill's content-fidelity check (`pdftotext`, normalize, look for
  distinctive strings) after `validate --strict` and the build both reported
  clean. That is twice now that driving a real CV found what the suite
  structurally could not, which is worth weighing against any plan to test more
  of the same things harder.
- **The C0 fixture set has no layout-spacing axis** — D11's template `spacing:`
  block is exercised only by its own unit tests, so no corpus fixture varies it
  and no render-diff covers a scaled theme. Worth an axis when the per-CV design
  surface grows (ARCHITECTURE §7.4).
- §7.4 also records **NOT DOING — replacing the greedy packer**: proven optimal
  in-repo and over 900 generated CVs, 0 counterexamples.

## Decisions needed (pointers, not content)

- Git-history redaction of the pre-consolidation dogfooding report (names
  were redacted in the working tree 2026-08-14; history rewrite is a
  maintainer call).
