# C0 baseline — correctness harness + current-engine snapshot

*2026-07-27, updated 2026-07-28 for Chunk C2, then again 2026-07-28 for C2's
review round 2. Output of Chunk C0 (`sprint-layout-engine.md`), revised
after adversarial + architect review, then updated for C2 (faithful
measurement), then updated again for a second review round (gate-integrity +
correctness fixes). This document is the human-readable companion to the
checked-in `test/layout-harness/baseline.json`; regenerate both together
with `node test/layout-harness/generateBaseline.js` and re-derive the
numbers below from the fresh file before editing this doc.*

## Review round 2 (2026-07-28): gate-integrity + correctness fixes

**IMPORTANT CORRECTION to the "C2 update" section below** — read this first.
That section's "New finding" claims the shipped scaffold's 2nd bullet of
"Chairman & Chief Executive Officer" is "genuinely clipped mid-sentence...
never appears anywhere, including on the following pages". **That specific
claim is wrong.** Investigating why the new, stronger per-bullet content
oracle (built for this round, see below) did not turn the scaffold fixture
red, as expected, led to re-checking that claim directly: a full `pdftotext`
dump of every physical page, and a visual render at 150dpi, both show the
bullet's continuation landing in full on physical page 3 ("EXPERIENCE
(CONTINUED)") — interleaved with sidebar content in `pdftotext`'s reading
order, which is almost certainly what was misread as "missing" the first
time. Root cause, confirmed by grepping `src/pdf` for `wrap` (react-pdf's
page-break-control prop): **nothing anywhere in this codebase ever sets
`wrap={false}`**, so every node defaults to react-pdf's own `wrap: true` —
meaning overflowing content never actually gets dropped; it auto-continues
onto an extra, CVX-unstyled physical page instead. Verified directly with a
constructed worst-case probe (3 whole experience entries with 15 fully
unique, deliberately long bullets forced onto "page 1"): the physical PDF
came out as 2 pages, with the 3rd entry landing cleanly, completely, on an
auto-inserted 2nd page — not clipped. **So the real, confirmed bug was
never text loss — it was the already-documented bug (b) below (a wasted
near-blank/malformed extra page)**, and the fix (removing the scaffold's
forced pagination keys) is justified on that basis instead: per
`template/cv-content/AGENTS.md` rule 5 ("add pagination keys only if page 1
overflows"), forcing was never necessary here, and it was producing exactly
that wasted page. This is left as a visible correction, not silently edited
away, because being wrong about "content is invisibly lost" versus "a page
looks worse than intended" matters — the former would justify a much more
urgent fix.

Also delivered this round (coordinator's MUST/SHOULD list):

- **`test/layout-harness/contentOracle.js`'s `sentinelsFor()` now checks
  EVERY experience bullet (via a new `tailSentinel()` — the trailing ~6
  words of the bullet, greppable, because a physical-page clip drops a
  wrapped block's LATER words while its first line can still render) and
  EVERY sidebar item of every present section (was: only each entry's
  `role`, and only the LAST item per sidebar section — exactly the blind
  spot that let the mis-claim above go unnoticed). Ran across the full
  curated 29-fixture corpus (all pairwise/risk/edge cases + the scaffold,
  both `designed`/`ats` variants = 58 checks): **zero violations found**,
  consistent with the `wrap:true` finding above — there is currently no
  live text-loss bug anywhere in the corpus for this oracle to catch.
  Non-vacuousness is proven at the unit level instead (self-tests in
  `test/layoutRenderOracle.test.js` construct a deliberately-missing
  sentinel and confirm `checkCompleteness` flags it) and via the
  constructed-overflow probe above (proves the underlying mechanism reports
  "complete" correctly, not vacuously — there's genuinely nothing to find).
  Known, documented residual gap: the 'overflowing' text-length bucket's
  bullet pool is smaller than its per-entry bullet count, so two different
  bullets CAN be byte-identical there, which could mask a clip if one copy
  survived and the other didn't — real prose (the scaffold, any real user's
  CV) doesn't share this property.
- **`template/cv-content/config.yaml` and `cv-content/config.yaml`** (the
  root demo): dropped `page1ExperienceCount: 2` / `page1SplitBullets: 2`.
  Verified: `cvx init` in a fresh temp dir → `cvx build` → zero warnings
  (previously warned); the render oracle's `scaffold-default` fixture now
  shows physical pageCount === logical totalPages (3 === 3, was 4 vs 2),
  zero blank pages (was 1), zero empty columns (was 1) — see the updated
  "Baseline diff" section below. Noted for the maintainer: the pre-built
  hero PNGs in `assets/` may now be slightly stale (one fewer page) — a
  separate follow-up, not regenerated here.
- **NFC normalization at load** (`src/pdf/normalizeContent.js`, new,
  isomorphic, shared by `src/pdf/loadContent.js` AND `cv-content/index.js`
  so the CLI and the browser preview never disagree): fixes two concrete,
  verified bugs with NFD-decomposed input (common from macOS) — a false-
  positive "unsupported glyph" warning for perfectly-supported accented
  Latin text (NFD "José" flags the bare combining-acute codepoint, which
  Lato genuinely lacks a glyph for, even though the precomposed 'é' is
  fully supported), and a noisy, imprecise warning for genuinely
  unsupported text (NFD "Nguyễn" reports 2 stray combining-mark artifacts
  instead of the 1 real missing precomposed character, 'ễ'). Both verified
  empirically against the bundled Lato TTF via fontkit before writing the
  fix. Tests: `src/pdf/loadContent.test.js` (new).
- **Broadened measure-vs-render corpus + fixed canary width**
  (`test/layout-harness/measureDiff.js`, `src/pdf/measure.test.js`): the
  corpus's bullet-shaped rows now measure against the REAL `bulletW`
  (`deriveMetrics(tealTheme)`, ≈303pt) instead of an arbitrary 200pt no real
  call site ever passes, and four new rows exercise styles/sizes the old
  4-row Latin corpus never touched — a bold role (10pt/600), an italic
  description at the real inner width (8.5pt/≈312pt), a sidebar-sized row
  (7.5pt/≈180pt), and a bold name (11pt/700). Result: **every one of the 8
  Latin rows now lands at exactly 0% error** (`measured === rendered`),
  including the previously-untested styles — `role-bold` is the most
  dramatic old-estimator miss on this corpus (100% overshoot: estimated 2
  lines, actually 1). The canary in `measure.test.js` is now pinned at the
  real `bulletW` (3 lines, was 4 lines at the old fictional 200pt).
- **Quantized page-budget comparisons** (`layout.js`, design doc §0 G-b): a
  new `quantize()` (round to 0.01pt) applied to `entryH`/`summaryH`'s
  return values AND to both sides of every `used + dh + eh > budget`
  comparison in `packExperiences`/`estimatePage1Overflow` — defensive
  insurance against a few-ULP cross-architecture float difference ever
  flipping a page-break decision (and hence the output bytes), since IEEE-754
  arithmetic order can differ across summation strategies even though it's
  deterministic within one. Confirmed a no-op for every real decision in the
  whole 29-fixture corpus (baseline diff below touches nothing this
  wouldn't already explain) and `layout.test.js` / the reproducibility
  suite stay green, unchanged.
- **`fontkit` pinned via `"overrides": {"fontkit": "$fontkit"}`** in
  `package.json` (npm's documented self-reference syntax for "force every
  transitive resolution of this package to match my own direct
  dependency") — `npm ls fontkit` shows one deduped `2.0.4` both before and
  after; this is forward-insurance against a future fork, not a fix for a
  live one. (Caution for future edits: a plain `npm install` after deleting
  `package-lock.json` pulled in several unrelated transitive bumps —
  `@modelcontextprotocol/sdk`, `@hono/node-server`, etc. — that have nothing
  to do with this change; the committed lockfile diff is the minimal
  1-line addition from an incremental `npm install`, not a from-scratch
  regeneration.)
- **`baseline.json`'s `note` field** was factually wrong ("recorded against
  the CURRENT (pre-C1/C2/C3) engine" — false as of C2) — rewritten in
  `generateBaseline.js` to say POST-C2 + round 2, dated.

## C2 update (2026-07-28): real font measurement

C2's goal: replace the ~20-34%-loose char-width `lineCount` estimate in
`src/pdf/layout.js` with real fontkit metrics against the pinned Lato TTFs,
injected (not imported — `layout.js` ships in the Vite browser bundle and
must stay isomorphic) via a new Node-only `src/pdf/measure.js`.
`research/sprint-layout-engine.md`'s C2 section / `layout-packing-design.md`
§5, §0 G-a. Delivered:

- **`src/pdf/measure.js`** — `createMeasurer(fontsDir)` → `{ lineCount,
  widthOf, unsupportedChars }`, real greedy word-wrap using fontkit glyph
  advances against the exact Lato TTFs `@react-pdf/renderer` embeds, plus
  `findUnsupportedGlyphs()`/`describeUnsupportedGlyphFinding()` for the
  non-Latin detection story below. `fontkit` is now a direct dependency
  (was transitive only).
- **`layout.js` stays isomorphic.** `entryH`/`summaryH`/
  `estimatePage1Overflow`/`packExperiences` all take an optional trailing
  `measure` argument; every call site does `measure?.lineCount ?? <the
  original char-width formula, byte-for-byte unchanged>`. `render.js`
  builds the real measurer (it has `fontsDir`) and injects it into
  `CVDocument` → `packExperiences` and into its own
  `estimatePage1Overflow` call; the browser preview (`src/main.jsx`) never
  passes one and keeps using the char-width fallback, unchanged. Verified:
  `src/pdf/layout.test.js` (which calls these functions with no `measure`
  argument at all) stays green, untouched.
- **`validateContent.js` is also plumbed** (the task left this as a
  judgment call) — it takes an optional `fontsDir`, and `cvx validate` /
  the `validate_cv` MCP tool both always pass one (mirroring `cvx build`'s
  existing `lib/fonts`-or-`src/fonts` resolution — extracted into a shared
  `resolveFontsDir()` in `src/mcp/tools.js`). Chosen because leaving it on
  the char-width estimate while also shrinking the warning threshold (next
  bullet) would make `cvx validate` noisier than `cvx build` for the exact
  same content — the two tools would disagree. Omitting `fontsDir` (e.g. a
  hypothetical embedder without font files) skips both real-measurement
  checks entirely rather than approximating them.
- **`PAGE1_OVERFLOW_WARN_THRESHOLD`: 220 → 15pt** (`spacing.safety`, the
  same per-page margin the packer itself budgets against) — shrunk, not
  deleted (G-a: the margin stays as a backstop). The old 220 was an
  empirical fudge sized to absorb the char-width estimator's own looseness;
  with accurate measurement injected, a small honest backstop is enough.
  The message wording changed from "past the tuned margin" to "past the
  safety margin" to match (render.js and validateContent.js).
- **Non-Latin detection, not font bundling** (explicitly out of scope this
  pass — tarball-size budget, the maintainer's call to make separately):
  `measure.js`'s `unsupportedChars()` uses fontkit's
  `hasGlyphForCodePoint()` to find characters the bundled font can't
  render; `findUnsupportedGlyphs()` walks a whole content bag (every
  string leaf, skipping `config`/`profilePhoto`/`keywords` — settings and
  metadata, never rendered text) and reports `{file, path, text, chars}`.
  Wired into both `cvx build` (via `render.js`'s `warn()`) and `cvx
  validate` (a new `unsupported-glyphs` warning finding) — same detection,
  two surfaces. Exact warning text: *"`<file><path>` contains character(s)
  the bundled font can't render (`<preview>`) — they will be invisible in
  the PDF. CVX bundles Lato only (Western-European Latin coverage) and
  registers no fallback font — provide/replace with a font that covers
  this script if this text must be visible."* Kept a WARNING, never an
  error, matching the task's instruction.
- **`test/layout-harness/measureDiff.js` (C0's stub) is now populated**:
  every corpus row reports `estimated` (old), `measured` (new, C2),
  `rendered` (ground truth) — see "Measure-vs-render accuracy gain" below.

### New finding, surfaced (not caused) by accurate measurement: the shipped scaffold's own default config genuinely overflows page 1

> **CORRECTED by review round 2 (2026-07-28)** — the "clipped mid-sentence,
> never appears anywhere" claim two paragraphs below is **wrong**; see the
> top of this document ("Review round 2") for the full re-investigation.
> The real, confirmed effect was bug (b) (a wasted near-blank page), not
> text loss. Left as-written below for the historical record of how the
> finding was originally (incorrectly) reported.

Turning on accurate measurement made `cvx validate`/`cvx build` warn about
the SHIPPED `template/cv-content`'s own default config
(`page1ExperienceCount: 2, page1SplitBullets: 2`) for the first time:
*"page1ExperienceCount: 2 likely does not fit on page 1 (estimate ≈72pt
past the safety margin)..."*. Rendering it confirms this is real, not a
false alarm: the second bullet of "Chairman & Chief Executive Officer" is
genuinely clipped mid-sentence ("...driving advanced-materials and" — the
rest, "prototype development that underpins critical operational
tooling.", never appears anywhere, including on the following pages —
confirmed by inspecting the actual rendered pages, not just the estimate).

**Confirmed pre-existing, not a C2 regression**: checked out the code
immediately before any C2 change, rebuilt, and rendered the identical
scaffold — pixel-identical clipping at the exact same point in the exact
same sentence. The bug has always been there. The OLD char-width
estimator's own conservative-but-wrong number for this exact config was
+209pt — comfortably under the OLD 220pt threshold (itself calibrated, per
its own historical comment, specifically to sit "between" the shipped
scaffold's estimate and the mildest observed real clip) — so it *never
warned*, silently. C2's accurate measurement puts the true overflow at a
smaller but still real +72pt (confirming the design doc's expected
direction: the old estimator overshoots), which is enough to cross the new,
honest 15pt backstop.

**Root cause**: `packExperiences()`'s config-driven branch
(`page1ExperienceCount`/`page1SplitBullets` set) has no budget check of its
own — unlike the automatic greedy branch, which self-limits by
construction and can never overflow this way. This is a real, pre-existing
engine gap, not a C2 regression, and fixing it (either the demo's config,
or adding a budget check to that branch) is **out of C2's scope**
(measurement + packer input only, no packing-logic changes) — **flagged
for the maintainer**, not silently patched around. `test/validateContent.test.js`
was updated to assert the new, accurate (and more honest) behavior instead
of the stale "stays silent" expectation — this is a corrected assumption,
not a laundered regression (see that file's comments for the full
reasoning, and the "hard invariants" section below for why this is not an
Invariant-0 concern C2 introduced).

### Measure-vs-render accuracy gain

`test/layout-harness/measureDiff.js`'s corpus, `estimated` (old char-width
formula) vs `measured` (new, C2, real fontkit metrics) vs `rendered`
(ground truth — actual react-pdf render, ink-band count):

| Corpus row | Estimated (old) | Measured (C2) | Rendered (truth) | Old error | New error |
|---|---|---|---|---|---|
| short | 1 | 1 | 1 | 0% | **0%** |
| typical bullet | 5 | 4 | 4 | +25% | **0%** |
| long bullet | 6 | 5 | 5 | +20% | **0%** |
| long unbroken token (URL) | 4 | 3 | 3 | +33% | **0%** |
| non-Latin — Sinhala | 2 | 2 | 1 | +100% | +100% (unchanged) |
| non-Latin — Tamil | 2 | 2 | 1 | +100% | +100% (unchanged) |
| non-Latin — Devanagari | 2 | 2 | 1 | +100% | +100% (unchanged) |

**Every Latin row lands exactly on the rendered ground truth (0% error)** —
the 20-33% overshoot the design doc predicted is gone for text the bundled
font can actually render. **Non-Latin rows are unchanged, on purpose**: a
measurer can't accurately predict the wrap of glyphs the font doesn't have
— there is no correct "line count" to compute without real glyph metrics
(that needs a fallback font, explicitly out of scope). What changed for
non-Latin text isn't the number, it's that it's now *detected and warned
about* instead of silently mismeasured (previous section, and
`src/pdf/measure.test.js`'s "unsupported-glyph detection" suite).

Hard-asserted in `test/layoutMeasureDiff.test.js` (not just baseline-locked):
`|measuredErrorPct| <= |estimatedErrorPct|` for every Latin corpus row (C2
is never a per-row regression), and `measured === rendered` on this corpus
specifically (the headline result).

**How the measurer was checked against `@react-pdf/textkit`** ("the
engine's own line-breaker", per the task): a direct invocation of
`@react-pdf/textkit`'s `layoutEngine()` (the exact function `@react-pdf/layout`
calls internally) was attempted first, mirroring `@react-pdf/layout`'s own
engine configuration as closely as possible from its published source.
It hit a reproducible internal crash (`Cannot destructure property
'string' of 'attributedString' as it is undefined`, several frames deep in
its paragraph-processing pipeline — `scriptItemizer`/`preprocessRuns`),
reproducible even for the trivial input `"Hi"`, not resolvable from the
package's public README/API within reasonable effort (textkit's
`layoutEngine` is an internal implementation detail of `@react-pdf/layout`,
not a documented standalone API). Rather than keep fighting an undocumented
internal API, verification instead uses the **full real render**
(`measureDiff.js`'s `renderedLineCount()`: actual `@react-pdf/renderer` +
the pinned Lato font + `pdftoppm` ink-band counting) as the ground truth —
which *is* textkit under the hood (react-pdf's `<Text>` uses it for real
line-breaking), exercised through the exact same font-store/hyphenation
configuration CVX ships with, end to end. This is arguably a **stronger**
check than a hand-assembled standalone `layoutEngine()` call would have
been (no risk of the hand-assembled config subtly not matching production),
at the cost of being slower (a real render + rasterize per sample) — which
is exactly why it's a `describe.skipIf(!hasPdftoppm())`-guarded harness
test, not something layout.js could do inline.

### Baseline diff: an improvement, not a regression

Accurate heights change `packExperiences()`'s decisions, so the render
oracle's recorded facts shifted for **exactly one** of 29 fixtures
(regenerated with `node test/layout-harness/generateBaseline.js`, which
itself refuses to write anything if a hard invariant or content-completeness
check fails — it didn't, on any of the 29):

```
pw-07 (certifications=many, publications=one, referees=many, achievements=one,
       textLength=long, volume=multi-page — a "long bullet text" fixture,
       exactly where the old estimator overshot most):
  oracle.designed.pageCount:    8  ->  6   (2 fewer physical pages)
  oracle.designed.blankPages:   [4, 6]  ->  [4]   (1 fewer blank page)
  oracle.designed.emptyColumns: dropped {page:6, side:"sidebar"}
```

No other fixture's recorded facts changed at all — plausible and expected:
'long' bullet text is precisely where the old estimator's error was
largest (20-25% on this harness's own corpus), so it's the fixture most
likely to cross a page-count boundary once measurement tightens; fixtures
with shorter text, or already comfortably one page count or another, don't
necessarily cross a boundary just because each entry got a little shorter.

**Why this is an improvement, not a regression**, checked explicitly
(the task's own bar — "if any change looks like a regression, stop and
flag it, don't launder it into the baseline"):

- **Hard invariants (`invariant0`/`placedExactlyOnce`/`orderPreserved`/
  `noOrphanHeading`) are hard-asserted on every fixture, every run, never
  baseline-locked** (C0's review round) — they held, for all 29 fixtures,
  both before and after regenerating. Nothing newly dropped, duplicated, or
  reordered.
- **Content-completeness (the `pdftotext` sentinel oracle) held for all 29
  fixtures × 2 variants = 58 checks**, both before and after — every
  present section's content, including `pw-07`'s, is still fully present
  in the tighter 6-page render. Fewer pages here means less *wasted space*,
  not less *content*.
- The change is strictly in the "good" direction on every recorded axis:
  fewer physical pages, fewer blank pages, one fewer empty-column instance,
  zero new ones.
- The one pre-existing bug accurate measurement *did* surface (previous
  section) is in a fixture `generateBaseline.js` doesn't silently paper
  over either — at the time this bullet was first written, `scaffold-default`'s
  recorded facts were unchanged (still 4 pages, still the same blank-page/
  empty-column pattern from bug (b)). **Superseded by review round 2**
  (see the top of this document and the subsection immediately below):
  the "genuinely clipped" framing was wrong, and the actual fix (removing
  the scaffold's unnecessary forced pagination) DOES change
  `scaffold-default`'s recorded facts — for the better.

### Review round 2's baseline diff: `scaffold-default` (2026-07-28)

Regenerating again after removing `template/cv-content/config.yaml` +
`cv-content/config.yaml`'s forced `page1ExperienceCount`/`page1SplitBullets`
(review round 2, MUST #2) changed exactly one more fixture — the same
`scaffold-default` this round's investigation focused on, now for a
CORRECTED reason (a wasted page, not a text clip — see the top of this
document):

```
scaffold-default (the shipped template/cv-content, unmodified):
  logicalTotalPages:            2  ->  3
  oracle.designed.pageCount:    4  ->  3   (physical === logical now — no more gap)
  oracle.designed.blankPages:   [1]  ->  []
  oracle.designed.emptyColumns: [{page:1,side:"sidebar"}]  ->  []
  oracle.ats.*:                 unchanged (3 pages, no blank pages — was never affected)
```

Same improvement checklist as `pw-07` above applies here too: hard
invariants held on all 29 fixtures both before and after (`generateBaseline.js`
would have refused to write otherwise); content-completeness held for all
29 × 2 = 58 checks both before and after (including the NEW, much stronger
per-bullet/per-item sentinels from this same round — see above); and every
recorded axis moved in the "good" direction (fewer physical pages, zero
blank pages, zero empty columns) with zero new ones introduced. Across the
whole sprint so far (C2 + review round 2), exactly 2 of 29 fixtures have
ever had their recorded facts change — `pw-07` (C2's measurement fix) and
`scaffold-default` (round 2's scaffold-config fix) — confirmed by diffing
every fixture's recorded facts between the very first C0 baseline and
today's, not just spot-checking the two known movers.

## Review round: what changed and why

C0 got an adversarial pass + an architect pass. Both were positive on the
skeleton and found real must-fix holes. This section is the changelog;
everything below it describes the *result*.

1. **CI can actually run it.** The harness shells out to `pdftoppm`/
   `pdftotext` (poppler); CI's `npm test` matrix (ubuntu/macOS/Windows ×
   several Node versions) had no poppler installed anywhere and no guard —
   committing C0 as it stood would have broken CI outright. Fixed:
   `scaffold.js` exports `hasPdftoppm()`; every pdftoppm/pdftotext-dependent
   `describe` is `describe.skipIf(!hasPdftoppm())`; `.github/workflows/ci.yml`
   installs `poppler-utils` on exactly one pinned leg (`ubuntu-latest` +
   Node 22), which is now the **canonical environment** the ink/pixel
   thresholds below are calibrated against. Verified by simulating a
   poppler-free `PATH` locally: the guarded suites skip cleanly (not error).
2. **The sidebar "Invariant 0" check was vacuous.** It only proved a
   section's *key* was assigned to some page-kind — never that the
   section's actual *items* survived the render. Replaced with a real
   oracle: `contentOracle.js` extracts all text from the rendered PDF with
   `pdftotext` and asserts a unique, greppable, per-item sentinel from
   every present section is actually findable — main (every experience
   role) and sidebar (the *last* item of every present section — the one
   most likely to go missing if a section overflows/clips), both variants.
   Hard-asserted per fixture, not baseline-locked. Proved non-vacuous two
   ways: (a) a committed unit self-test with a synthetic missing sentinel,
   and (b) a live, one-off manual run (not committed — a validation
   exercise) — rendered a fixture with `referees` deliberately dropped
   before writing to `cv-content/`, ran the real CLI + `pdftotext` against
   it, and confirmed the check reported it RED:
   ```
   completeness check result (expect RED / ok:false): {
     "ok": false,
     "missing": [ { "section": "referees", "text": "Referee 0" } ]
   }
   ```
   every other sentinel (experience, education, certifications,
   publications, languages, achievements, competencies) still matched —
   only the deliberately-dropped section showed up missing. Restoring
   `referees` and re-rendering flipped it back to `{ "ok": true, "missing": [] }`.
3. **The main-column invariants were baseline-locked booleans.** A
   regenerate could, in principle, silently "record" `invariant0: false` as
   the new normal. Fixed: `invariant0`/`placedExactlyOnce`/`orderPreserved`/
   `noOrphanHeading` are now direct `expect(...).toEqual([])` (zero
   violations) assertions on *every* fixture, computed fresh every run,
   never read from `baseline.json`. `generateBaseline.js` itself refuses to
   write the file (exits non-zero, prints every violation) if any of these,
   or content-completeness, comes back false for any fixture.
4. **The empty-column/blank-page signals had a false-positive and a
   robustness problem.** A 3%-ink-*area* threshold flagged `pw-00` (a
   genuinely-rendered, just short, single-page CV) as having an empty main
   column — sparse ≠ empty. And PNG-byte-size-for-blank-page is
   compression-implementation-dependent. Fixed: empty-column is now
   **ink-band presence** (`pgm.js`'s `countInkBands() === 0` — any content
   at all, however sparse, produces ≥1 band and is never flagged); blank-page
   is now a **whole-page ink *ratio*** threshold (still resolution-robust,
   no longer PNG-encoder-dependent). Confirmed the fix: every single-
   physical-page fixture now has `emptyColumns: []`, and no fixture anywhere
   carries a `side:"main"` flag any more (see numbers below).
5. **Mirror drift.** `estimator.js` and `blocks.js` used to hand-copy
   `layout.js`'s private formulas and `CVDocument.jsx`'s un-exported
   `TWO_COLUMN_LAYOUT`. Fixed at the source: `deriveMetrics`, `lineCount`,
   `entryH`, `summaryH` are now genuinely `export`ed from `src/pdf/layout.js`,
   and `TWO_COLUMN_LAYOUT` from `src/pdf/CVDocument.jsx` — purely additive,
   no behavior change (`src/pdf/layout.test.js` and every other pre-existing
   test stays green). `estimator.js` is now a one-line re-export; the
   sidebar-plan mirror moved to a new, vitest-only `sidebarPlan.js` (it needs
   the `.jsx` import, which only resolves under Vite's transform — `blocks.js`
   itself stays plain-Node-safe, because `generateBaseline.js` runs under
   plain `node`, no bundler). Went with the export, not the canary fallback
   — it worked cleanly on the first try (verified: importing a `.jsx` file
   from a vitest test file just works, no special config needed, since
   `vite.config.js` already registers `@vitejs/plugin-react`).
6. **`it.skip` bodies were empty.** Un-skipping one by deleting `.skip`
   would have silently "passed" with zero assertions. Fixed: all four are
   now `it.todo(...)` **with** a body that calls `expect.fail(...)` —
   vitest never executes a `.todo` body, confirmed empirically, so this
   costs nothing today, but un-`.todo`-ing without writing the real
   assertions now fails loudly instead of passing vacuously.
7. **`expBlockId` could collide.** `exp:${role}::${company}` alone means
   two entries that happen to share both (e.g. two separate stints in the
   same role at the same company) get the same id, silently defeating
   `placedExactlyOnce`. Fixed: takes the entry's position in the canonical
   array explicitly (`exp:${index}:${role}::${company}`); regression test
   added (two same-role-same-company entries, ids now differ, invariants
   still pass).
8. **Hygiene.** `generateBaseline.js` now rebuilds `lib/` from current
   `src/` before doing anything else (the render oracle shells out to
   `bin/cvx.js`, which imports `lib/`, not `src/` — comparing fresh
   structural facts against a stale compiled render would be comparing two
   different engines). Every `mkFixtureDir()` call is tracked and cleaned
   up (`cleanupFixtureDirs()`) in an `afterAll` in every test file that
   creates fixtures, and at the end of `generateBaseline.js` — confirmed 0
   leftover temp dirs after a full `npm test` run (previously: hundreds
   accumulated across repeated local runs).

**A new engine finding surfaced while building fix #2**, unrelated to the
layout engine itself — see "New finding: `build --all` can corrupt the
second PDF's extracted text" below. Not fixed here (out of C0's scope —
it's in `render.js`/`fonts.js`/`bin/cvx.js`, none of which C0 is sanctioned
to touch); worked around in the harness (build both variants as two
separate processes, not one `--all` spawn) and reported prominently because
it looks like a real, currently-undetected bug in a shipped, tested command.

## TL;DR (numbers, post-fix)

- **9 of 29** fixtures (31%) show at least one **empty-column page** in the
  designed variant today — down from the pre-fix (false-positive-inflated)
  20/29, now that "empty" means zero ink bands, not "under an area-ratio
  threshold". **6 of 29** (21%) produce a **fully blank page** (unchanged by
  the signal fix — those were already correctly identified). **19 of 29**
  (66%) are clean on both signals (up from 9/29).
- Of the 14 empty-column page-instances recorded, **10 are `side:"sidebar"`
  and 4 are `side:"both"`; zero are `side:"main"`-only** — confirmed
  explicitly, across every fixture, not just the single-page ones the fix
  targeted.
- **16 of 29** fixtures (55%) render a **different physical page count than
  the page-number badge claims** (`packExperiences().totalPages`) — by as
  much as **+4 physical pages** beyond what the badge says
  (`edge-oversized-section`: logical 2, physical 6; `risk-maxed-out`: logical
  5, physical 9; `pw-09`: logical 5, physical 9).
- **Invariant 0 (hard-asserted, not baseline-locked) holds for the main
  column on all 29 fixtures**, and **content-completeness (hard-asserted,
  both variants) holds on all 29 fixtures × 2 variants = 58 checks** —
  nothing dropped, duplicated, or reordered, and every present section's
  content genuinely made it into the rendered PDF, including a ~60-item
  oversized section and the "maxed out" worst case. The bugs found are
  **wasted-space** bugs, not **content-loss** bugs, in everything C0 can
  exercise. The sidebar's item-level pack doesn't exist yet, so that
  specific guarantee isn't testable the same way — see below.
- The char-width estimator overshoots real rendered line counts by
  **20–33%** on ordinary English bullets (matches the design doc's "~34%"
  claim), and is qualitatively wrong on non-Latin text: predicts 2 lines for
  a short Sinhala/Tamil/Devanagari phrase that renders as **1**
  near-invisible line — Lato has no glyphs for these scripts and no
  fallback font is registered.
- Same-architecture byte-reproducibility holds. Two-architecture reproducibility
  is **not exercised** here — it needs a CI matrix (tracked, not attempted).

## How the baseline-lock works (and what it does *not* cover any more)

C0's brief: **do not ship a permanently-red suite**, but also (review's
correction) **do not baseline-lock things that must never be false**. Two
different kinds of fact, two different mechanisms:

- **Hard invariants — always asserted directly, never in `baseline.json`:**
  main-column `invariant0`/`placedExactlyOnce`/`orderPreserved`/
  `noOrphanHeading` (`structuralFacts.js` + `hardInvariantViolations()`), and
  content-completeness (`contentOracle.js`). These must be `true`/`[]` for
  every fixture, every run, full stop. `generateBaseline.js` refuses to
  write a baseline if any of them fail — there is no way for a regenerate to
  quietly make a real bug "the new normal".
- **Descriptive/known-bug facts — baseline-locked:** physical page count,
  which pages are blank, which have an empty column and on which side, and
  the logical (`packExperiences`) page count for comparison. These ARE
  allowed to show the known bugs (that's the point), so this part of the
  suite is green today only because it matches what was *recorded*
  (`baseline.js`'s `diff()`), and goes red only on a regression — a new
  failure, or any of these facts changing. C1/C2/C3 regenerate
  `baseline.json` as they land real fixes; the diff of that file across
  their commits is this sprint's changelog of what got fixed.

Byte sizes / raw ink ratios are recorded in `baseline.json` for human
debugging but are not part of the strictly-compared shape — they can jitter
a little across `poppler` versions without that being a real regression;
page counts and the derived blank/empty-column booleans are, with
calibration margins wide enough (see below) that this shouldn't be a source
of CI flakiness.

Verified the lock actually catches regressions (not trivially passing):
temporarily corrupting one recorded page count in `baseline.json` turns the
corresponding test red with a clear diff message pointing at the
regenerate command; restoring it turns the suite green again.

## New finding: `cvx build --all` can corrupt the second PDF's extracted text

Discovered while building the content-completeness oracle: the very first
run flagged 27 of 29 fixtures as missing content on the ATS variant — every
missing sentinel came from a LATER item in some section (e.g. `pw-00`'s
first experience entry was fine, the second was "missing"; the scaffold's
first education entry was fine, the fourth was "missing"). That pattern —
early items fine, later ones "gone", every time, only on the *second*
document `build --all` renders — pointed away from the layout engine and
toward the render pipeline itself.

Reproduced directly against `renderCV()`, bypassing the CLI and this
harness entirely:

```
designed-then-ats, same process:  designed OK, ats CORRUPTED (pdftotext recovers
                                   garbled text — e.g. "First Place" reads
                                   as "ir t Place", "REFERENCES" as "RE ERENCES";
                                   the PAGE RENDERS FINE VISUALLY — this is
                                   purely in the invisible ToUnicode layer)
ats built alone (fresh process):  OK
designed built alone (fresh):     OK
same variant rendered twice, one process (designed+designed, or ats+ats): OK
```

So: switching *between* the two document/theme shapes (`tealTheme` designed
vs. `monoTheme` ATS — both register the same `'Lato'` family, and
`registerFonts()` is called fresh on every `renderCV()` call) within one
process is implicated; rendering the same shape twice is not. This smells
like a font-subsetting/glyph-cache state leak in `@react-pdf/renderer` (or
its `pdfkit` fork) across multiple `renderCV()` calls in one process — the
glyphs still rasterize correctly (so it's invisible to a human looking at
the PDF, and invisible to `pdftoppm`-based pixel checks), but the embedded
ToUnicode CMap for the second document is wrong for some characters, which
would also break copy-paste and, plausibly, real ATS parsers that read text
rather than pixels.

**This is a real, currently-undetected risk in `cvx build --all`** — a
shipped, already-tested (`test/buildCli.test.js`) command — and existing
tests don't catch it because they check `outputs`/`existsSync`, never the
PDF's actual text content. **Not fixed here**: it lives in `render.js`/
`fonts.js`/`bin/cvx.js`, none of which C0 is sanctioned to touch, and it
deserves its own focused investigation rather than a rushed patch inside a
tests-only chunk. **Worked around in this harness**: `scaffold.js`'s
`buildAll()` now runs `cvx build` and `cvx build --ats` as **two separate
processes** (matching what the sprint brief originally asked for, before
this author optimized it to the batched form) — each starts with a clean,
unregistered font state, which sidesteps the issue entirely. Flagging this
for the coordinator/architect as its own follow-up; it's arguably more
user-facing-urgent than anything in the layout-engine sprint itself, since
it's silent, invisible data corruption in a command people already run.

## The fixture plan

The sprint's full cartesian —
`{certifications,publications,languages,referees,achievements: absent|one|many}`
`× {textLength: short|typical|long|overflowing} × {volume: fits-1-page|multi-page}`
— is **1,944 combinations**. Reduced to a **prioritized set of 28** (unchanged
by the review fixes):

| Source | Count | Method |
|---|---|---|
| Pairwise cover | 18 | `pairwise.js`'s `greedyPairwiseCover()` — deterministic (no RNG), every (factor,level) pair touches every other pair at least once. Covers all 188 required pairs. |
| Named risk scenarios | 3 | `risk-tall-sidebar-short-main`, `risk-maxed-out`, `risk-sparse-1-page` — the specific shapes QA flagged. |
| Named edge cases | 7 | `edge-oversized-section` (~60 items in one section), `edge-minimal`, `edge-one-entry-sections`, `edge-labelless-long-url`, `edge-non-latin-name` (Sinhala), `edge-explicit-empty-referees` (`referees: []` vs absent), `edge-forced-split-config` (the `page1ExperienceCount`/`page1SplitBullets` branch — no budget check of its own). |
| **Total curated** | **28** | Plus the shipped `template/cv-content` scaffold as a 29th, real-world data point. |

Dropped: **1,926 of 1,944** raw combinations (99.1%) — rationale recorded in
`fixtures.js`'s `buildFixturePlan()` and printed by the oracle test's own
log line (pairwise coverage catches the large majority of interaction
defects at a fraction of full-cartesian cost; the specific risk scenarios
are added regardless of whether the greedy cover happened to reproduce them).

The **variant axis** (`designed | ats`) is *not* multiplied into the fixture
count: every fixture is rendered through both `cvx build` and
`cvx build --ats` — as two separate processes (`scaffold.js`'s `buildAll()`
— see the finding above for why not the batched `--all`), so variant
coverage is complete without doubling the fixture list.

## The rendered oracle

`packExperiences()` returns the **main column's** plan only. The sidebar is
a fixed key list per page-kind (`CVDocument.jsx`'s exported
`TWO_COLUMN_LAYOUT`), repeated verbatim onto however many *physical* pages
react-pdf needs once a column's real content overflows one sheet. Neither
bug this sprint exists to fix is visible on the structural plan alone; both
only show up in the rendered pixels. `renderOracle.js` builds each fixture,
runs the real CLI (two processes — see above), rasterizes every page with
ONE `pdftoppm -gray` pass (no PNG needed any more — both signals below come
from the same grayscale raster), and derives:

- **pageCount** — the real physical PDF page count — distinct from, and
  often larger than, `packExperiences().totalPages` (the "logical"/badge
  count).
- **blankPages** — page indices whose **whole-page ink ratio** is under
  `BLANK_PAGE_MAX_INK_RATIO` (1%). Calibrated against the scaffold: the
  badge-only trailing page (bug b) measures ≈0.37% whole-page ink; the
  sidebar-overflow page (bug a — real referees/publications content in the
  sidebar, should NOT read as blank) measures ≈1.75%; ordinary content
  pages measure 13–25%. 1% sits with comfortable margin on both sides.
- **emptyColumns** — page indices where a column has **zero ink bands**
  (`pgm.js`'s `countInkBands()` — presence, not an area-ratio threshold: any
  content at all, however sparse, produces ≥1 band and is never flagged).
  **Documented trade-off** (not hidden): the corner badge itself always
  contributes exactly one ink band to the MAIN region on any page it lands
  on, so a page where main has genuinely run out of content but the badge
  is still present (bug (a)'s classic shape) reads as "1 band", not "0" —
  it is no longer flagged by *this specific signal*. It's still fully
  visible via the physical-vs-logical page-count gap, and via
  content-completeness independently proving the sidebar's tail content
  really rendered wherever it landed.

### Concrete example: the shipped scaffold, unmodified

`template/cv-content`'s own default `config.yaml`
(`page1ExperienceCount: 2, page1SplitBullets: 2`) already exhibits both bugs:

| Physical page | Badge says | Sidebar | Main | Verdict |
|---|---|---|---|---|
| 1 | 1 of 2 | photo + contact + achievements | summary + 2 experience entries | fine |
| 2 | — | *(tinted background, zero ink bands)* | *(badge only — 1 ink band, ≈0.37% whole-page ink)* | **bug (b)**: blank page (0.37% < 1% threshold); sidebar specifically reads empty (0 bands) — the corner badge (glued to page 1's main-column flow, inside a `minHeight`-not-`height` row) spills onto its own near-blank trailing page. |
| 3 | 2 of 2 | education, certifications, competencies, languages, first publication | experience continued | fine |
| 4 | — | second publication + 3 referees (real content, ≈1.75% ink) | *(badge only, 1 ink band)* | **bug (a)**: sidebar content outlives the main column; NOT flagged blank (1.75% > 1%, correctly — there IS real content) and NOT flagged empty-column any more (main's 1 badge-band ≠ 0) — visible instead via the page-count gap (logical 2 vs physical 4) and content-completeness (which confirms the referees/publications text is genuinely there, unclipped). |

Logical page count: **2**. Physical page count: **4**. Asserted verbatim
(this exact table) in `layoutRenderOracle.test.js`'s dedicated scaffold
test, in addition to being baseline-locked.

### Headline numbers across all 29 (28 curated + scaffold), post-fix

| Signal | Count | |
|---|---|---|
| Fixtures with ≥1 empty-column page (designed) | **9 / 29 (31%)** | was 20/29 pre-fix |
| Fixtures with ≥1 fully blank page (designed) | 6 / 29 (21%) | unchanged — `pw-05, pw-07, pw-09, edge-oversized-section, edge-forced-split-config, scaffold-default` |
| Fixtures clean on **both** signals | **19 / 29 (66%)** | was 9/29 pre-fix |
| Empty-column page-instances by side | **sidebar: 10, both: 4, main: 0** | zero `main`-only, confirmed across every fixture |
| Fixtures where physical page count ≠ logical (badge) count | 16 / 29 (55%) | unaffected by the signal fix — worst cases +4 pages (`edge-oversized-section`, `risk-maxed-out`, `pw-09`) |
| Total physical pages rendered (designed, across all 29) | 98 | unaffected — page COUNT itself didn't change |
| Of which flagged empty-column | 14 page-instances | was 38 pre-fix |
| Of which flagged fully blank | 10 page-instances | unchanged |
| Hard invariants (main column) violated | **0 / 29** | never baseline-locked — hard-asserted every run |
| Content-completeness violations (both variants) | **0 / 58 checks** | never baseline-locked — hard-asserted every run |
| ATS fixtures with a near-blank **tail** page | 5 / 29 | different, more benign phenomenon — see note below |

**Regression check requested by review, confirmed:** every single-physical-
page fixture (`pw-00`, `pw-13`, `risk-sparse-1-page`, `edge-minimal`) now has
`emptyColumns: []` — the false positive is gone, and it generalizes: no
fixture, single-page or otherwise, carries a `side:"main"` flag any more.

**Note on the ATS number:** the single-column ATS document has no sidebar,
no corner badge, and no `minHeight` row — it cannot exhibit bugs (a)/(b) at
all. A near-blank ATS *last* page is a legitimate "content ran out a little
into the next sheet" tail (design doc G2), not the two-column-specific
defect this sprint targets. Recorded because the blank-page signal is
variant-agnostic, but it's a distinct, more benign finding.

### A single oversized sidebar section does not clip — it multiplies the empty-column bug

`edge-oversized-section` (certifications: ~60 items) was included because
it wasn't obvious whether a section far taller than a page would ever get
*clipped* (no splitting mechanism exists) rather than just spill. Measured:
**6 physical pages**, of which 3 have an empty main column (0 ink bands —
no badge landed there either) while the sidebar keeps flowing, and the
final page is fully blank. **Not clipped**: content-completeness confirms
every certification item, including the last (`Certification 59`), is
present in the rendered text; `invariant0`/`placedExactlyOnce` hold for the
main column exactly as elsewhere. The wasted-space bug **compounds** though
— one oversized section produces *multiple* empty-column pages, not one.
`risk-maxed-out` is worse still: 9 physical pages against a logical count
of 5.

## What C0 could and could not test

**Hard-asserted on every fixture (never baseline-locked):**

- Invariant 0 (rendered block set == input block set, at *bullet*
  granularity, main column) — **holds on all 29**.
- Placed exactly once, order preserved (main column) — **holds on all 29**.
- No orphan heading (`::head` convention, main column) — **holds on all
  29**, but is currently a **vacuous pass**: `ExperienceSection` gates its
  title on `entries.length > 0`, so nothing in the main column can produce
  a heading without content yet. Becomes a live check once C3 adds sidebar
  item-level splitting.
- Content completeness (`pdftotext`-based, both variants, every present
  section's last-item sentinel + every experience role) — **holds on all
  29 × 2 = 58 checks**. This is the real, non-vacuous replacement for the
  old structural sidebar check (see review round #2 above).

**Descriptive, baseline-locked (allowed to show a known bug):** physical
page count, blank pages, empty columns, logical page count — see the
headline table above.

**Explicitly out of scope this pass** (per the coordinator's own
instruction, not silently dropped): front-load / over-budget assertions
using the char-width estimator's fill ratios. `frontLoadHolds`/
`noPageOverBudget` remain in `invariants.js` as pure, unit-tested utility
functions (reusable later), but nothing currently computes a per-fixture
fill ratio to run them against — that capability (`pageFillRatios`) was
retired along with the estimator mirror it depended on, and not rebuilt,
since "directional counts non-increasing" work was explicitly deferred.

**Not testable today — `.todo`, with a reason in the title and a
`expect.fail()` body (so un-`.todo`-ing without implementing is loud, not
silently green) — pending C3** (`layoutHarnessInvariants.test.js`, "sidebar
plan" describe block):

1. *Every sidebar item placed exactly once* — no item-level sidebar plan;
   sections never split at item boundaries.
2. *No orphaned sidebar heading from an item-level split* — sections can't
   split at all today, so this can't be exercised (the related-but-
   different failure that *can* happen — a whole section overflowing onto
   an empty-main-column page — is bug (a), covered by the render oracle).
3. *Sidebar front-load* — no per-page sidebar budget/fill concept exists.
4. *No empty column beyond the deliberate residual, from the structural
   plan alone* — the structural plan is blind to physical-page overflow;
   only the render oracle can see it (and does, baseline-locked).

One thing IS still testable and green at the structural level: sidebar
**section-presence** (does every section with content appear *somewhere* in
the static per-page key assignment) — holds on all 29, unconditionally, by
construction of `resolveFirstSidebar`'s single-page fold. Narrow, but real:
no section is ever structurally *unreachable*. (Note: this is weaker than,
and now superseded in importance by, the pdftotext content-completeness
oracle above, which proves the section's *items*, not just its key, made it
through — kept anyway since it's cheap and still a correct, if narrower,
fact.)

## The estimator error (measure-vs-render diff harness, stub for C2)

Unchanged by the review round (numbers identical before/after the
mirror-drift fix — confirmed by regenerating and diffing). C2's job is to
replace `layout.js`'s char-width `lineCount` with a real fontkit measurer;
there is no such measurer yet, so this harness renders a small corpus
through the actual react-pdf + pinned Lato pipeline and counts rendered ink
bands (`pgm.js`'s `countInkBands`) as a script-agnostic line-wrap proxy —
not a text-extraction trick (subset-font PDFs carry glyph ids; recovering
readable text needs `pdftotext`'s ToUnicode machinery, which is used
elsewhere in this harness now, but deliberately not for measurement — a
pixel-presence count is more directly "how many lines did this wrap to").

| Corpus row | Estimated | Rendered | Error |
|---|---|---|---|
| short (29 chars) | 1 | 1 | 0% |
| typical bullet (168 chars) | 5 | 4 | **+25%** |
| long bullet (204 chars) | 6 | 5 | **+20%** |
| long unbroken token (URL) | 4 | 3 | **+33%** |
| non-Latin — Sinhala (42 chars) | 2 | 1 | **+100%** |
| non-Latin — Tamil (44 chars) | 2 | 1 | **+100%** |
| non-Latin — Devanagari (37 chars) | 2 | 1 | **+100%** |

1. **Latin text confirms the design doc's own claim**: overshoots ordinary
   English bullets by 20–33% (design doc: "~34%"), always in the *safe*
   direction (more lines predicted than render — a loose safety margin, not
   a risk of clipping). Never under-shoots in this corpus.
2. **Non-Latin is a sharper risk than "loose"**: Lato has no
   Sinhala/Tamil/Devanagari glyphs and no fallback font is registered
   anywhere (`src/pdf/fonts.js` only registers Lato). The render doesn't
   fail loudly — it renders **substantially blank** (1 ink band where 2
   were predicted). A separate manual check with `pdftotext -layout`
   (interactive investigation only, never shipped in the harness) showed
   the underlying PDF text stream splitting into as many as 7 mis-wrapped,
   mis-mapped lines for what should be one short line of a name. **A
   non-Latin `personal.name` today risks rendering invisibly**, not just
   mis-measured — sharper than design doc risk G-a's "kerning/ligatures
   could diverge" framing, and relevant to C2's priority on measuring
   through the real fallback font (there is currently no fallback font to
   measure through at all).

Baseline-locked in `layoutMeasureDiff.test.js`, guarded with
`describe.skipIf(!hasPdftoppm())` for the corpus-rendering tests (the
corpus-identity check needs no rendering and always runs). Regenerating
after C2 lands should show these errors collapse toward 0% — that collapse
is C2's acceptance evidence.

## Reproducibility

`layoutRepro.test.js` renders the shipped scaffold twice, in two independent
temp directories, through the real CLI, with `SOURCE_DATE_EPOCH` pinned, and
asserts the designed and ATS PDF buffers are byte-identical — green today.
Same-architecture leg only; no `hasPdftoppm()` guard needed (no
pdftoppm/pdftotext dependency here at all, just CLI builds + byte compare).

The **two-architecture** leg (x86 + ARM producing identical bytes) is a CI
matrix configuration task — not something a single-architecture sandbox can
exercise. **Tracked, not attempted**: whoever wires CI should add that
matrix leg; the fixture and assertion already exist in `layoutRepro.test.js`
and need no changes to run twice, once per architecture.

## Files

```
test/layout-harness/
  pairwise.js          generic greedy pairwise covering-array generator (no RNG)
  textPool.js           deterministic filler text (short/typical/long/overflowing, non-Latin)
  contentSpecs.js        fixture spec -> cv-content YAML documents
  fixtures.js             the curated 28-fixture plan (pairwise + risk + edge cases) + drop accounting/log
  scaffold.js              temp-dir + CLI (two-process buildAll) + pdftoppm/pdftotext process helpers,
                            hasPdftoppm() CI guard, cleanupFixtureDirs() hygiene
  pgm.js                    pure-Node P5 PGM parser + ink-band presence / whole-page ink-ratio analysis
  blocks.js                  main-column LayoutPlan from packExperiences()'s real output — plain-Node-safe
                              (no .jsx import), used by both vitest and generateBaseline.js
  sidebarPlan.js              sidebar structural plan — imports the now-exported TWO_COLUMN_LAYOUT from
                              src/pdf/CVDocument.jsx (vitest-only: needs the JSX transform)
  invariants.js                pure, reusable invariant predicates over the LayoutPlan shape
  estimator.js                  thin re-export of layout.js's now-exported deriveMetrics/lineCount/
                                 entryH/summaryH — no mirror, no drift risk
  structuralFacts.js             hard main-column invariants (full result objects, not booleans) +
                                  logicalTotalPages; shared by generateBaseline.js and the oracle test
  contentOracle.js                pdftotext-based content-completeness oracle (sentinelsFor / checkCompleteness)
  renderOracle.js                  build (2 processes) + rasterize (1 pdftoppm -gray pass) ->
                                    {pageCount, blankPages, emptyColumns}
  measureDiff.js                    the measure-vs-render diff harness (stub for C2)
  baseline.js                        load/diff/assert helpers for baseline.json
  generateBaseline.js                 standalone script — rebuilds lib/, refuses to write on any hard-
                                      invariant/content-completeness violation, cleans up temp dirs
  baseline.json                        the checked-in recording (~29 fixtures + measure-diff corpus;
                                        schemaVersion 2 — no hard-invariant booleans any more)

test/
  layoutHarnessInvariants.test.js   pure invariants (self-tested) + hard-asserted on the real main-column
                                     plan (scaffold + a maxed-out synthetic CV + an expBlockId collision
                                     regression); 4 sidebar assertions `.todo` with failing bodies — C3
  layoutRenderOracle.test.js         hard invariants + content completeness + baseline-locked descriptive
                                     facts, for the 28-fixture set + scaffold + a dedicated non-Latin test;
                                     guarded with describe.skipIf(!hasPdftoppm())
  layoutMeasureDiff.test.js           the measure-vs-render corpus, baseline-locked; guarded likewise
  layoutRepro.test.js                  same-architecture byte-repro (two-arch: CI matrix, tracked above)
```

Fixtures are generated into `mkdtempSync` temp directories at test time,
cleaned up after every run, and never committed; only `baseline.json` and
this document are checked in.

## Running it

```
npm test                                            # full suite, includes C0 (green, baseline-locked)
npx vitest run test/layoutRenderOracle.test.js      # just the render oracle (~15-20s on the canonical env)
npx vitest run test/layoutHarnessInvariants.test.js test/layoutMeasureDiff.test.js test/layoutRepro.test.js
node test/layout-harness/generateBaseline.js        # regenerate baseline.json (C1/C2/C3, after a real fix) —
                                                     # rebuilds lib/ first, refuses to write on any violation
```

Without poppler on `PATH`, `layoutRenderOracle.test.js` and the rendering
half of `layoutMeasureDiff.test.js` skip cleanly (verified); everything
else (pure invariants, the corpus-identity check, reproducibility) still
runs and stays green.

## Sequencing note

`baseline.json` is pinned to whatever the working tree looked like when it
was generated. At the time of this C0 pass, the repo has **uncommitted work
in progress for v1.5** (the content-sections data-loss fix: `certifications`/
`languages`/`publications` sections, `build --all`, etc. — visible in
`git status`, predates this session, not touched by it). This baseline was
generated against that current working tree, not against a clean, committed
v1.5. **Once v1.5 is committed as final, regenerate `baseline.json` again**
(`node test/layout-harness/generateBaseline.js`) and diff it against this
one — if v1.5 lands with no further engine changes the numbers should be
identical, but that should be *verified*, not assumed. Not attempted here,
per instruction — flagged for whoever closes out v1.5.
