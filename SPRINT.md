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
and five documentation corrections. **1.9.0** followed, also unplanned and also
distribution rather than engine: the single-file `cvx.bundle.js`, driven by a
third-party report of CVX being unrunnable in an OpenAI sandbox. What all three
releases did is in [CHANGELOG.md](CHANGELOG.md); why, in ARCHITECTURE.md §7.4
and §8.

**1.9.1** and **1.9.2** followed within hours, both distribution-only: 1.9.1
exists because 1.9.0's GitHub release could not be repaired (see "Release
plumbing" below), and 1.9.2 added the four bundle variants — plain and minified,
each raw and zipped, each under a versioned and an unversioned name — after
5.3 MB proved awkward to move into a sandbox.

**Nothing in the 1.9.x line touched the layout engine** — every variant renders
byte-identical PDFs to the npm entry point, which is the property its tests
assert. §8's chain therefore still resumes at **I4** (main-slot fixed-content
pricing), untouched. Before pulling it, read the first item under "Found,
unscheduled" — it is I4's prerequisite, not a nicety.

### Release plumbing — read this before the next tag

Two things changed, and the second one cost a version number.

1. The GitHub Release is created by `publish.yml` from the **annotated tag's**
   message (subject → title, body → notes). A lightweight tag now fails the job
   by design. 1.8.0 and 1.8.1 were backfilled; they had been published to npm but
   never released on GitHub, so `releases/latest` sat at 1.7.2 while npm served
   1.8.1.
2. **This repo has immutable releases enabled, and that is unforgiving.**
   Publishing freezes a release's assets AND reserves its tag name *permanently,
   even after the release is deleted*. So assets must be attached while the
   release is still a **draft**, and the draft published afterwards —
   create-then-upload returns `422 Cannot upload assets to an immutable release`
   and leaves a published release with no assets. **Never delete a published
   release to retry:** that is what happened to v1.9.0, which is on npm and can
   never have a GitHub release. The job now declines to touch an already-published
   release rather than trying to repair one.

### The ChatGPT route, and the Custom GPT that was built then dropped

**A sandbox can download the bundle itself.** Verified 2026-08-18, and it
supersedes the earlier finding that it could not: `npx` still fails there, but
fetching a release asset works. So the recommended ChatGPT path is now the
[AI guide](docs/ai-guide.md)'s Route D — one pasted prompt, nothing installed,
nothing uploaded — and every agent-facing surface carries the same four-command
setup block verbatim, because an assistant told only what is *possible* will try
npx, fail, and explore until it works it out.

A Custom GPT was built on top of a GPT Action that delivered the bundle as an
`openaiFileResponse`. It worked. It was then **dropped** (maintainer, 2026-08-18):
once the sandbox can download, the Action is redundant for its own use case, and
OpenAI restricts who may create or publish GPTs anyway. `docs/custom-gpt.md` is
deleted. What remains live is listed under "Decisions needed".

GPT Actions were on ARCHITECTURE.md §7.3's cut list and the maintainer overrode
that ruling to try this; the attempt is over, but §7.3 still needs the amendment —
see the same section.

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
- **The bundle needs a real CV driven through it from a sandbox.** The ChatGPT
  route has only ever been exercised on the Bruce Wayne scaffold. Two of the last
  three defects were found by driving a real CV and by nothing else, so this is
  where the next one is.
- **`container.download` is not a dependable transport, but plain fetching is.**
  Measured 2026-08-17: the OpenAI container resolved no hostnames from the shell,
  and its `container.download` tool refused `application/json` on a content-type
  allowlist and then failed outright on a retry against the same host. **Superseded
  2026-08-18** for the case that matters: the sandbox *can* fetch a GitHub release
  asset, which is why every surface now tells assistants to download the bundle. The
  lesson that survives is about the tool, not the network — do not build on
  `container.download`.
- **The bundle emits a `url.parse()` DeprecationWarning the npm path does not.**
  From `@react-pdf/image`'s resolver, on stderr, cosmetic — `--json` stdout is
  unaffected. The network-relevant half is settled (local images take the
  `fs.readFile` branch; `fetch` is the remote-URL branch in both distributions),
  but why only the bundled copy warns was never explained. Noisy stderr matters
  more than usual here because the consumer is an agent.
- **The bundle is not byte-reproducible across platforms, though its PDFs are.**
  Its embedded assets are gzipped with `node:zlib`, whose output varies by zlib
  version, so a macOS build and CI's Linux build differ by ~5 KB. Verified benign:
  the asset digest is identical (it is taken over the RAW bytes) and every line of
  JavaScript matches — only the compressed payload differs. Still a gap in a repo
  that runs a cross-architecture repro matrix for PDFs; fixable by storing the
  payload uncompressed or with a pinned deflate.
- **Five undocumented platform limits cost most of the 2026-08-18 session**, each
  discoverable only by trying it: assets must precede publication on an immutable
  release; Action operation descriptions cap at 300 chars; GPT instructions cap at
  8000; a public Action requires a privacy-policy URL; and the sharing control is
  not on the Create button. Four are now encoded in `test/gptOpenapi.test.js` so
  they fail in CI rather than in a web form. Worth expecting a sixth.
- **The Custom GPT is not a distribution channel, and may not even be a
  buildable one.** OpenAI's current documentation states personal accounts (Free,
  Go, Plus, Pro) cannot create or publish new GPTs; Business/Enterprise/Edu
  workspaces can. Observed directly on 2026-08-18: creation worked, and the only
  visibility offered was "Only me", with *"Sharing GPTs with the public is no
  longer available."* So the durable ChatGPT route is the one that needs no GPT at
  all — upload `cvx.bundle.min.js.zip` into an ordinary conversation and ask it to
  unzip and run. The docs were corrected on 2026-08-18 to stop describing sharing
  as available. **Then the GPT direction was dropped altogether** (maintainer,
  2026-08-18): a sandbox turned out to be able to download the bundle itself, which
  makes the Action redundant for its own use case, so `docs/custom-gpt.md` was
  deleted and Route D became the recommended ChatGPT path. On the same day the rest
  went too: `site/gpt/` (the Action schema and the pasted instructions),
  `scripts/gpt-endpoints.js`, `test/gptOpenapi.test.js`, the endpoint generation in
  `pages.yml` and the `refresh-gpt-endpoints` job in `publish.yml`. `site/privacy.html`
  stays — it is the project's privacy statement and stands on its own.
- **Three OpenAI surfaces moved under this work in one day** — the container's npm
  reachability, `container.download`'s reliability, and GPT creation/sharing. The
  bundle survived all three because it is a file that runs on Node and depends on
  no vendor product decision. That is the argument for keeping the GPT as one front
  door rather than the strategy.

## Decisions needed (pointers, not content)

- Git-history redaction of the pre-consolidation dogfooding report (names
  were redacted in the working tree 2026-08-14; history rewrite is a
  maintainer call).
- **§7.3's cut list is now two steps out of date.** It cuts "container image /
  standalone executables / … / GPT Actions", and §7.4 repeats "Rejected: container
  image, standalone executables". Since then: 1.9.0 shipped a single-file JS
  bundle, and 2026-08-18 shipped a GPT Action by explicit maintainer override. The
  bundle does not contradict the list (it requires Node, so it is not a standalone
  executable) but a reader cannot tell that distinction was deliberate rather than
  eroded, and the GPT Actions entry is now simply false. What genuinely stayed cut,
  on evidence: native executables (+110 MB, and reinstates a platform matrix to
  solve "no Node", a problem no measured target has) and container images (the
  sandbox has no container runtime at all). §7.3 needs the amendment; only the
  maintainer should write it.
- **Where the ChatGPT limitations report lives.** Untracked in the working tree
  as `cvx-chatgpt-environment-limitations.md`; it is the source document for
  1.9.0 and `research/` is deliberately split, so committing it is a maintainer
  call.
