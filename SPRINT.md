# SPRINT — what is in flight right now

**This file only points, never restates — and shipping deletes.** Engineering
items appear as I-numbers / §8 small-item names from [ARCHITECTURE.md](ARCHITECTURE.md)
(sequence, scope and acceptance criteria live there; backlog in its §7.4).
What shipped lives in [CHANGELOG.md](CHANGELOG.md) — a shipped item is deleted
from this file in the same commit that adds its CHANGELOG entry. Anything
unshipped at sprint close rolls forward or returns to §7.4 with one line
saying why. Deleting this file must lose nothing except "what we're doing right
now and what's parked." Sprints are divided by amount of work, not time
(maintainer, 2026-08-14); a sprint closes when its work ships as a release.

## No sprint in flight

Sprint 1 — "Honest, then loud" — shipped as **1.8.0**. Everything since
(1.8.1, 1.9.0–1.9.2) was unplanned: one dogfood P0 and then distribution work.
**None of it touched the layout engine**, so §8's chain resumes untouched at
**I4** (main-slot fixed-content pricing). Read the first item under "Found,
unscheduled" before pulling it — it is I4's prerequisite, not a nicety.

## Paused — the ChatGPT route, pending a new domain

Maintainer, 2026-08-19. The route works and is documented (ai-guide Route D),
but every surface points at `hrtips.github.io/cvx/download/…` and there is no
CNAME yet. Nothing here is broken; it is deliberately not being extended until
the domain exists, because the work would be redone against a new URL.

- Driving a **real CV** through the bundle from a sandbox — the route has only
  ever been exercised on the scaffold, and the last three defects were all
  found by driving a real CV.
- Re-pointing the ~18 URL references, the `pages.yml` copy step and
  `site/privacy.html` once the host is chosen.

The constraint that governs the choice is in ARCHITECTURE §9: **a hostname is a
tool-routing signal**, so the host must not name a system the model has a
connector for. That is what the current origin buys, and it cost a real run to
learn.

## Parked — ops backlog

No committed sprint; pull an item deliberately or not at all. Launch and
distribution items (demo GIF, Show HN, marketplace, Connectors, `.mcpb`) were
removed 2026-08-15 — not launching soon; the archived plan records them.

- **L7 — a deadline, not a chore.** The alert-only `upstream-canary` job fails
  on `@react-pdf/renderer@next`: the pdfkit seams `setupReproducibility`
  patches are gone. Byte-reproducibility is fine on the pinned dependency, so
  this blocks no release — but INV-11 breaks when that version ships unless the
  patches are re-found or the determinism lands upstream.
- **L2** — hero/demo image regeneration (its trigger has fired).
- **L6** — co-maintainer conversation; good-first-issue labeling.
- **L8** — SchemaStore PR follow-up (submitted; external latency).
- **L9** — SVG logo master (raster-only kit today).
- **L10** — packaged ai-guide sibling links point at `main`; pin-at-pack-time
  decision unmade.

## Found, unscheduled

- **No corpus fixture reaches the student-CV shape** (`experience: []` with
  sections in a main slot). **This should lead I4**, and the case is three
  incidents deep: two of I2/I3's review blockers hid in this shape and 1.8.1's
  P0 lived in its neighbour, all three sharing one cause — a plan-level claim
  published with no render-level instrument pointed at it. The harness's render
  oracle is that instrument; it exists, and nothing points it here.
- **No dogfood defect has ever been caught by an automated gate.** Each came
  from driving a real CV and running the content-fidelity check after a clean
  `validate --strict` and a clean build. Worth weighing against any plan to
  test more of the same things harder.
- **The C0 fixture set has no layout-spacing axis** — D11's `spacing:` block is
  exercised only by its own unit tests, so no render-diff covers a scaled theme.
- **The bundle emits a `url.parse()` DeprecationWarning the npm path does not**
  (from `@react-pdf/image`, stderr only, `--json` unaffected). Cosmetic, but
  noisy stderr matters when the consumer is an agent, and why only the bundled
  copy warns was never explained.
- **The bundle is not byte-reproducible across platforms, though its PDFs are.**
  Its embedded assets are gzipped with `node:zlib`, whose output varies by
  version: ~5 KB differs between a macOS and a Linux build. Verified benign —
  the asset digest is taken over the raw bytes and is identical, and every line
  of JavaScript matches. Still a gap in a repo that runs a cross-architecture
  repro matrix for PDFs; fixable with an uncompressed or pinned-deflate payload.
- §7.4 records **NOT DOING — replacing the greedy packer**: proven optimal
  in-repo and over 900 generated CVs, zero counterexamples.

## Decisions needed

- Git-history redaction of the pre-consolidation dogfooding report (names were
  redacted in the working tree 2026-08-14; a history rewrite is a maintainer
  call).
