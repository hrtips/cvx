# Changelog

What changed in each release, and why. Full detail lives in the
[GitHub releases](https://github.com/hrtips/cvx/releases); this is the short
version you can read in one sitting.

Content files are versioned separately by `schemaVersion` in `config.yaml`
(currently `1`). New keys may appear within a schema major; a key that is
measured to do nothing can also be removed, and the entry that removes it says
what happens to a file that still sets it.

## 1.8.0 — 2026-08-17

**Two ways a CV could lose a whole section, silently, are gone.** Both were
found by driving two real CVs end to end through the skill, and both were
reachable through layout edits the skill itself teaches. `summary` placed in a
sidebar slot vanished from the PDF while `validate --strict` reported ok and
page 1 still reserved ~300pt for it — it is now a `slot-not-renderable` error
with a field path, and the budget stops charging a summary the layout does not
place. Separately, `continuation.main` was dead on every two-page CV for any
key, because the final page took `last.main` and on a two-page document the
final page is the only continuation page; a page that is both now renders both
slot lists. Neither bug was reachable by varying content, which is why the
existing content oracle never saw them — it now runs over layout permutations
too.

**`referees: []` prints the line three shipped texts promise it prints.** The
designed variant always honoured it; the ATS variant gated the whole block on a
non-empty list, so the value `cvx init` scaffolds produced no References
section at all.

**Warnings name both levers, not just the summary.** `page1-ends-early` and
`page1-no-experience` told the reader that content above the roles was the only
thing that could move the break. It is not: shrinking the blocked role's own
description or promotion table moves it too, measured twice — once taking a
three-page CV to two. The messages also described the blocking piece as "the
role heading plus one bullet" when it carried the description and every
promotion row as well, which is 52-60% of the figure on real roles. Both
corrected in the engine and the skill together.

**Diagnostics `version: 4` — every experience entry now says what it costs.**
The sidebar has published `heightPt` per section since v2 while the main
column, the flow that decides the page count, published no height at all — so
pricing a candidate edit meant editing the YAML and rebuilding. Entries now
carry `heightPt`, the indivisible `headPt` broken into its role / meta /
location / description / progression terms, and per-bullet `bulletsPt`. This is
the first purely ADDITIVE version bump: no existing field changed meaning, and
it is a bump rather than a silent addition because "can I price an edit by
subtraction, or must I rebuild to find out?" is exactly what a version answers.

**Spacers are charged at the value the layout declares.** The planner subtracted
a constant 27pt from the theme whether or not a spacer slot existed and whatever
value it carried, so `spacer: 0`, `spacer: 200` and no spacer at all produced
byte-identical plans while the renderer honoured what was written. Continuation
pages charged nothing at all. Both fixed, and `main-slot-unmeasured` is now
slot-aware — `summary` is measured in `first.main` only, and putting it in
`continuation.main` used to be the one case the warning stayed silent on.

**A promotion table can break across a page.** An entry's page-leading piece
used to carry the heading plus the WHOLE table plus a bullet, indivisibly — a
floor with no upper bound, so a role with a long promotion history was far
harder to start on a part-full page than its bullet count suggested. The cut
axis is now the entry's atoms in document order, promotion rows then bullets,
and the existing anti-orphan range is what keeps it safe: both sides keep at
least one atom, so a piece that cuts inside the table still carries the heading
plus a row. Priced over 500 generated CVs, this is the only variant that saves a
page on ~11% of them without introducing a new class of orphaned heading. When
even one row will not fit, the role moves to the next page whole rather than
stranding a bare heading.

**Templates can adjust spacing.** `cv-content/layouts/*.yaml` takes a `spacing:`
block — `entryGap`, `bulletGap`, `sectionGap` — each a multiplier on the theme's
vertical whitespace, bounds 0.6-1.5, with out-of-range values and unknown keys
as validation errors rather than silent clamps. Before this, an author who would
not alter their text had no working control at all: the three themes are
geometrically identical, the old `geometry:` block was deleted because its keys
were ignored, and user-space themes do not exist. Multipliers rather than points
because the named styles' ratios are the design; groups rather than one density
because scaling the between-entries gap alone reaches the same page count while
leaving the reading rhythm inside a job untouched; vertical only because
horizontal offsets change wrap widths and therefore every measurement. The scale
is applied to the theme in `resolveDocument`, the single chain the planner and
the renderer both already go through, so the model and the page cannot disagree
about it. Measured on a real CV: `entryGap: 0.7` turns three pages into two with
no word changed.

**`plan_layout` is stateless again.** The MCP layer kept a process-scoped
counter of consecutive identical dry runs per workspace and changed the fifth
answer to say "you are looping". It was ruled a statelessness violation — a
callee does not count its caller's calls — and it quietly falsified the promise
the docs have always made, that the same question gets the same answer. The
counter, its cap notice and the tests pinning it are gone; bounding a loop is
the assistant's job, which the skill teaches. Nothing else changes: the tool
returned no field a caller could act on beyond the notice.

**Warnings state conditions and prices; they no longer tell you what to edit.**
Maintainer ruling R-F, applied across every message the engine owns. Six of
them prescribed content changes — "Shorten the summary", "raise it with the
user", "the fix is to shorten the offending item" — which is a renderer having
an opinion about someone's career. The numbers are untouched and remain the
point: `shortByPt` still says exactly how much must come out for the next role
to reach page 1; the message now says that rather than what to cut. The moves
those messages used to prescribe are in the skill, where the assistant can
weigh them with the user.

**New fact: `main-column-empty`.** A multi-page CV whose wide column renders
nothing on any page — every page carries only its sidebar. Deliberately NOT
the ordinary case of a sidebar outlasting a short experience list: that shape
has content on page 1 and runs out later, it is normal, and packing it away
measurably produces worse CVs. The distinction is whether the main flow ever
started, not where the blank column sits.

**Diagnostics `version: 3` — a CV with no work history is finally visible.**
The packer produced no page-1 metrics row when `experience.yaml` was empty,
because a flow with no blocks packs to zero pages. That single absence was the
root cause of the incident this work started from: every `main.*` number read
`null`, `overflowPt` had nothing to sum, and the existing "your summary alone
is taller than the column" warning was keyed on a budget that no longer
existed — so a 30-bullet summary with no roles rendered three sheets and
reported nothing at all. Page 1 now gets an honest row (the summary is
charged; the "EXPERIENCE" title is not, because an empty list renders no
title), which makes the existing overflow machinery fire on that shape with no
new code. Three published fields changed meaning as a result, hence the
version bump: `mainPageCount` counts the page a summary renders on, page-1
`main.*` are numbers rather than nulls, and **`emptyColumn` now means "no ink
in the column"** instead of "no packed blocks" — a page 1 carrying a summary is
no longer reported as an empty column, which is what forced every doc to
explain the difference. Warning `page`/`overflowPt`/`forcedByConfig` are now
optional, for the two codes that describe a document or a layout rather than a
page.

**New fact: `experience-empty`.** Names the defining shape of a student or
first-job CV — no experience entries anywhere — and prices what page 1 does
carry (`fixedPt`). It is mutually exclusive with `page1-no-experience` by
construction, since that code requires roles to exist and be pushed off page 1.

**The build now counts the paper.** Every build compares the sheets in the
finished PDF against the pages the plan numbered, and reports
`physical-pages-exceed-plan` (kind `defect`, carrying `planned` and
`physical`) when they disagree. Until now that gap was silent: content the
planner does not measure — anything other than the summary and experience in
a `main` slot — renders fine, spills past the column, and react-pdf flows it
onto extra sheets the page badges never count, so a CV could ship with a blank
trailing page while the report was clean. The check reads the produced bytes,
so it costs nothing and cannot perturb the render; where it cannot establish
the count with two agreeing readings it stays silent rather than guess. It is
a build-only signal by construction: `plan_layout` renders nothing and can
never carry it, so a clean dry run is not proof of a clean PDF. `cvx build`
still exits 0 (the PDF exists and is content-complete) and prints the defect
to stderr; `cvx build --strict` exits non-zero for pipelines that want a hard
gate.

**The plan says when it is measuring less than the page.** A layout that puts
any section other than the summary/experience in a `main` slot now gets the
`main-slot-unmeasured` fact (kind `fact`, carrying `keys`), and the schema's
`main` slot documents the limitation. This is the honest half of a known gap —
those sections render correctly but are not priced, so `totalPages` and
`overflowPt` describe less than the page holds. Both this fact and the defect
above are retired by the coming work that measures main-slot sections.

**Removed: `page1ExperienceCount` and `page1SplitBullets`.** Maintainer
ruling. Measured, they were an anti-lever — the page count never moved, and
every effective setting pushed content onto an extra physical sheet the page
numbering could not count (the plan said "2 pages", the printer said 3). A
config.yaml that still sets them gets a validation message naming the removal
("automatic packing replaced it — delete the key"), builds keep working, and
the keys are ignored — but note for CI: **`cvx validate --strict` treats
unknown keys as errors, so a pipeline that gates on strict validation will
fail until the two lines are deleted from config.yaml.** Automatic packing
never overflows and splits entries at
bullet boundaries by itself; there are no pagination settings left, which is
the point. `forcedByConfig` stays on the overflow warning shape, permanently
false, so consumers that match on it keep working; `leversUsed` is gone from
the diagnostics (part of the `version: 2` shape).


**The diagnostics now say why a page ended, and their fill is honest.**
`plan_layout` / `build_pdf` responses carry `version: 2`: `fill` is now
**column occupancy** — `(fixed + used) / capacity`, the same measurement on
every page — instead of a ratio over the residual budget that made page 1 look
far emptier than it was (a real CV read 0.595 while its column was 80%
occupied, and six of eight shortening edits made the number WORSE). `fill > 1`
still means over budget, exactly as before. Each column also reports
`blockedBy` — why the next role or section could not start on that page — and
a new named condition, `page1-ends-early`, prices the one trade page 1 offers:
*"short by 53.64pt; the summary is the lever."* Its `shortByPt` is the one
number that falls monotonically as you shorten the content above it, which
`fill` never was. It fires on well-packed CVs too — it is a fact with a
price, not a defect; `overflow` remains the defect.

**The main column's measurements are now exact.** The box model over-measured
every experience entry (6.7–13.1pt each: a phantom margin scaled 15/11, rows
modelled at the wrong line height) and under-measured wrapping role/company/
location rows by a full line; the line-breaker mirror ignored the renderer's
ability to shrink inter-word spaces, mis-counting near-boundary lines (13.5pt
per line). All corrected model-side — no rendered pixel moves — and pinned by
a new render-diff harness that verifies every entry height against the real
PDF at 0.01pt, the same bar the sidebar has had since C3a. On the CV that
prompted this work, the phantom height totalled 46.7pt — the difference
between "needs a third page" and "2.4pt short of two".


**The scaffolded example CV is now the two pages the README promised.** It
rendered three, and page 3 was a near-empty main column beside a half-filled
sidebar — the first artifact every new user saw was the product's own worst
example. Two pages needed the sidebar to shed a measured 235pt, so the example
now omits the `referees` section from the designed layout (231pt, and CVX's own
guidance already treats a referees section as filler — the ATS variant still
carries it), lists three degrees instead of four, and one certification instead
of two. **Your own `cv-content/` is untouched**; this changes only what
`cvx init` scaffolds. The ATS variant dropped from three pages to two as well.

**Removed the dead `geometry:` block from the scaffolded layouts.** Both shipped
layout files carried page-geometry keys — `size`, `topBar`, `sidebarFraction`,
three padding arrays — that CVX ignored entirely. Editing `sidebarFraction` did
nothing, silently, with no validation error, while looking exactly like the
page-control lever the docs say does not exist. Page geometry still comes from
the theme; the keys are gone rather than left in place pretending to work. Files
that still contain a `geometry:` block keep validating, so nothing breaks.

**Stopped telling assistants they cannot see the PDF.** Ten places across the
skill, the AI guide, the MCP server's handshake instructions, `plan_layout`'s
tool description and two engine modules stated that an assistant can't see the
render — false for the clients that matter, which open PDFs natively — or
forbade an assistant from ever editing content, even under the user's explicit
direction. Looking at the returned PDF is now part of the documented loop, and
the rule is stated as it should be: never drop content to fit, the user chooses
what goes, and carrying out the edit they chose is the assistant's job.

**Stopped recommending `page1ExperienceCount` as a way to shorten a CV.** It
cannot do that: measured on the example CV, the sheet count never moved and
every setting above automatic only added overflow (0 → 184 → 420 → 590pt). Both
keys still work as explicit page-1 overrides and are documented as such.

**Fixed a test-harness bug that could hide a real regression.** Three harness
sites planned the layout against the built-in default while rendering the
scaffold's own layout file. It stayed invisible while the two happened to agree,
and on divergence the sidebar measure-diff silently measured *nothing* while
still reporting agreement on what remained.

## 1.7.2 — 2026-08-09

**Fixed: `cvx validate` crashed on an ordinary typo.** Deleting a bullet's text
but leaving the dash — a bare `- ` in `summary.yaml` or an entry's `bullets:` —
produced a raw `Cannot read properties of null`, **no findings at all**, and
exit `64` ("you used the CLI wrong") when the problem was in the file. The
page-overflow estimate ran before schema errors were considered, so unvalidated
content reached the layout packer. Errors first, estimate second: you now get
`/0: invalid shape — a bullet line` and exit `2`.

**~7 MB smaller to install.** `react-dom` was a runtime dependency that no
shipped code imports — only the browser dev preview and two test files use it.
Moved to devDependencies.

**The per-file coverage gate became real.** It had never been per-file: without
`perFile: true` a glob threshold is checked against the *aggregate*, so it was a
project-wide average wearing the name of a per-file rule, and one file sat at
75% branches under a declared 85% bar. Now genuinely per file with **zero
exceptions** — the one documented waiver was deleted by earning it
(`validateContent.js` 81.28% → 94.15% branches). Those tests found the crash
above.

## 1.7.1 — 2026-08-09

**Scaffolded files now pin to the version that created them.** `cvx init` wrote
`$schema` headers pointing at the `main` branch, so a CV scaffolded today had
its editor validating against whatever `main` said next year. They now pin to
the release tag, which makes the compatibility promise structural rather than a
matter of discipline. Prereleases and dev checkouts fall back to `main`, since a
pinned link to a tag that does not exist is worse than a mutable one.

Pinning the URLs alone would have been cosmetic: the schema stubs declared `$id`
on a `main` URL and reach their definitions by *relative* `$ref`, which resolves
against `$id` when present — so a pinned stub would have jumped straight back to
`main`. `$id` is removed from all 14 schema files. Local validation never
fetched anything, so `cvx validate` is unchanged.

**The assistant docs ship in the package.** `docs/ai-guide.md` and
`docs/cv-schema.md` are in the tarball, so an assistant reads the guide that came
with your installed version instead of fetching `main`. Because a path inside
`node_modules` is not reliably reachable — `npx` unpacks outside your workspace,
and many clients have no filesystem tool — `get_schema` also returns a guide
inventory and will return a guide inline on request.

## 1.7.0 — 2026-08-09

**Fixed: the ATS variant could lose letters.** An assistant that built the
designed CV and then the ATS variant **in one MCP session** got an ATS PDF with
letters missing from job titles — "Founder & Field Commander" rendering as
"oun er iel Co an er", on the page and not just in the text layer. Both calls
reported success. It fired only on that sequence, so the CLI and `build --all`
were unaffected — but the MCP server is long-lived and the bundled skill tells
assistants to build both variants, so it landed on the recommended flow, in the
variant that exists to be machine-parsed.

The cause: `@react-pdf` keeps one process-global font store, and each render's
subsetting step poisons fontkit's glyph cache with empty code points; the next
render's line-breaking then collapses those glyphs out entirely. Font
registration now replaces the family, so every render starts clean.

**New: `plan_layout`.** An MCP tool that answers "how will this paginate?"
**without rendering a PDF** (~14 ms versus ~184 ms), plus the same `diagnostics`
on `build_pdf` and `build --json`. Per page it reports both columns — fill as a
ratio and in points — which roles and section item-ranges landed there, overflow,
and whether a column's flow had ended. Assistants can now tell you what is on
page 1 instead of guessing.

It reports facts, not scores: an earlier experiment measured that optimising
layout "quality" metrics makes CVs visibly worse, so `emptyColumn` is reported
but explicitly labelled a diagnostic and not a target.

**Breaking (`--json` consumers):** the top-level `warnings` array in
`build --json`, `build --all --json` and MCP `build_pdf` is now `notices`, to
resolve a collision with the new `diagnostics.warnings`. `validate`'s `warnings`
is unchanged.

Also: 9 transitive dependency CVEs patched.

## 1.6.0 — 2026-08-02

**Fixed: your page numbers were lying.** A designed CV could print "1 of 5" on
two different sheets, or carry a sheet with **no page number at all** in the
middle of the document. The engine planned N pages, then the renderer quietly
flowed over-budget content onto extra sheets the planner never counted — so the
extra paper came out unnumbered or reused a number. Silently: exit 0, nothing on
stderr. Across the test corpus, CVs whose sheet count disagreed with their own
numbering went from **7 of 29 to 1 of 29**.

**Sections no longer jump a page to stay whole.** Education, certifications,
publications, languages and referees now continue across pages with a marked
heading, and a long job entry can split at a bullet. Total pages across the
corpus fell 87 → 85; pages with an entirely empty column went 6 → 1.

A long summary that leaves no room for even the smallest piece of a job entry
now gives a summary-only page 1, correctly numbered, rather than an unnumbered
near-blank sheet.

**Heads-up for CI:** `validate` and `build` now warn when a page is over budget.
Because `--strict` promotes warnings to errors, a previously-green pipeline can
newly fail if your summary is very long.

## 1.5.0 — 2026-07-28

**Nothing gets dropped.** On a real senior profile the schema had no home for
certifications, publications, languages, or a personal blog link — they were
silently folded into other sections or lost. Added `certifications.yaml`,
`publications.yaml`, `languages.yaml`, and a generalised `links:` array in
`personal.yaml` (existing `linkedin`/`facebook` keys kept). All additive under
the compatibility promise.

**New: `build --all`** — validate, then render both the designed and ATS PDFs in
one command.

## 1.4.0 — 2026-07-26

**Plug it into your agent.** `npx cvx mcp` runs a local stdio MCP server with
four tools (`get_schema`, `init_cv`, `validate_cv`, `build_pdf`) — no API keys,
fully offline. `cvx mcp init --client claude|claude-desktop|cursor|vscode`
writes the client config for you. A bundled `SKILL.md` carries the knowledge
half.

Also fixed a silent PDF corruption when forced pagination overflowed page 1:
the columns compressed into overlapping glyphs while the build reported success.

## 1.3.0 — 2026-07-25

**It tells you what's wrong.** `cvx validate` reports every problem at once with
file and field paths and suggested fixes. A canonical JSON Schema covers every
content file, `$schema` headers give editors autocomplete, and `--json` plus
semantic exit codes (`0` ok, `2` validation failed, `3` render failed, `64`
usage) make the CLI drivable by an agent.

## 1.2.1 — 2026-07-24

Renamed `makecv` → **CVX** (`@hrtips/cvx`, binary `cvx`).

## 1.2.0 — 2026-07-24

Reproducibility guard, hero images, and an upstream-canary CI job. First stable
publish after the pre-release line.
