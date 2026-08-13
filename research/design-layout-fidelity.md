# Design: main-column layout fidelity, and diagnostics that name a stall

*2026-08-14. The fix design for the defects recorded in `postmortem-pagination-fidelity.md`
(§1 T1–T8) and referenced from `design-cvx-as-instrument.md` §5 and
`sprint-design-loop.md` (phase sequencing). Written by the second of two
independent expert passes, from the code and from fresh measurement; the first
pass's proposal was deliberately not shown to the author, so agreement between
the two documents is evidence and disagreement is a question to settle.*

*Everything numeric below was measured on this tree, twice: once by re-deriving
the reported facts with the shipped engine, and once end-to-end against a
**working patch of the whole design** built in a scratch copy of the repo
(`scripts/build-lib.js` + the real CLI + `pdftotext -bbox`). No file in the repo
was modified to produce it. Reproduction steps are in §9.*

---

## Review outcome — maintainer rulings, 2026-08-14

The maintainer reviewed this design against the first expert pass. Four rulings,
two of which amend it:

1. **§3.10 amended: `page1ExperienceCount` / `page1SplitBullets` are REMOVED,
   not deprecated.** Maintainer's call, taken knowing the cost: a config.yaml
   that sets them will fail validation after the change. Both experts proposed
   softer options; the maintainer chose removal outright. Implementation note:
   the validation finding must say the keys were removed and that automatic
   packing replaces them (it never overflows), not merely "unknown key" — and
   the scaffold never emitted them, so only hand-edited configs are affected.
   `README.md`'s pagination section and `docs/cv-schema.md`'s config table go
   with them.
2. **§3.11 ratified: no packing change.** Head-internal splits stay a documented
   future option with their Invariant-0 hazard recorded; nothing is designed
   until a real document demands it.
3. **§5 extended: adopt the first pass's offline optimality oracle.** A test
   (never product code) that exhaustively enumerates every legal packing per
   corpus fixture and asserts the greedy packer's answer is in the optimal set —
   fewest pages, then fullest first page, lexicographic over integers. This
   answers "could a better packing have existed?" for every fixture on every
   run; it is the question this whole incident turned on. No score ships.
4. **Everything else stands as written.**

## Implementation review outcome — architecture pass, 2026-08-14

The implementation (S1–S5 + the test slice) was reviewed by an independent
architecture pass, which re-measured every load-bearing claim (including
reproducing S1's byte-identity from the pre-S1 tree, and proving the §3.5
glue-shrink mirror exact at the knife edge: 4.630/4.632pt → 1 line both sides,
4.639/4.632 → 2 both sides). Verdict: faithful; four gates before complete.
All four were closed the same day:

- **D1** — S5 left five unused `config` bindings; `npm run lint` was red.
  Fixed; `renderCV` also stopped returning the now-unconsumed `config`.
- **D2 (product defect)** — §3.8's message template, written from the roomy
  regime, emitted impossible advice on near-full pages: "only −30.73pt
  remain", and "shorten the summary by 128.56pt" against a 114.30pt total
  lever. The message now has two regimes: *actionable* (shortfall within the
  lever) names the price and both edits; *not actionable* says plainly that no
  edit above the roles can free enough and the break is the correct outcome.
- **D3/D4** — the MCP tool descriptions and server handshake still taught v1
  fill, omitted `page1-ends-early`, and called the array "defects" (D3), and
  the handshake claimed a page ending early "shows up in no diagnostic field"
  (D4) — the guard §3.9 ordered could not see either file because it iterated
  only markdown. Both surfaces rewritten; `docsSync`'s MODEL_FACING list now
  includes `src/mcp/tools.js` and `src/mcp/server.js` (it caught a fourth
  stale sentence on its first run).
- **D5/D6** — §3.7's token-perturbation test and ruling #3's optimality oracle
  landed in the test slice (both mutation-verified: seeded bugs fail them).

**Ruling on review question 4a (is `page1-ends-early` a "warning"?):**
option A adopted — it stays in `warnings`, and every warning now carries
`kind: 'defect' | 'fact'` (`overflow`/`page1-no-experience` = defect;
`page1-ends-early` = fact). Additive on the unreleased v2 shape; CVX
classifying its own message, not the CV; defects are ordered before facts in
the array. **Ruling on 4b (the injection-test carve-out):** sound and
load-bearing — the two measured fields move because the directive lives in the
blocked entry's own head; the carve-out was replaced by one-sided assertions
(the fields must GROW), plus a warnings code/kind comparison and a cap on the
quoted role (single-line, 80 chars — review R-c: the first CVX message to
interpolate CV body text into its own prose).

**Fixed from the review's risk list:** R-b (a rule-1b decline of a carried
split tail recorded the wrong flow index — unreachable today with two-valued
budget functions, live the moment P3 adds a third; fixed with an explicit
carryIndex), R-c (role quote capped), R-d (CHANGELOG now warns that
`validate --strict` CI gates fail on the removed keys until deleted).

**Tracked follow-ups, deliberately not closed here:**

- **R-a** — §3.5's near-boundary corpus in `measureDiff.js` at *every* width
  the engine uses. The review built it ad hoc and it passes everywhere,
  including exact edges — the property holds; what is missing is the
  standing instrument against a font/textkit/theme change. One near-boundary
  probe (the summary width, with a glyph-derived window assertion) shipped in
  S2/S3; the full per-width corpus should land with P3's theme threading,
  which rebuilds these fixtures anyway.
- **R-e** — §3.4's dash-column unit assertion as literally specified. The
  property is pinned indirectly (the review's edge probes bound
  `bulletWidth()` to ≪1pt; the near-boundary window assertion fails if it
  drifts), but the named one-line assertion should accompany R-a.

---

## 0. Scope, in one paragraph

The engine measures the main column with a hand-written mirror of `ExpItem.jsx`
that has never been checked against a render. Five distinct classes of error live
in that mirror; together they cost **46.70pt of phantom height on the CV that
prompted this work** — enough to be the difference between "needs a third page"
and "2.40pt short of two". Separately, the diagnostics cannot express *why* a
page ended where it did, publish a page-1 fill that is not comparable to any
other page's, and report a page count the renderer contradicts when one config
lever is set. This document designs the fixes, the instrument that proves them,
the order they land in, and what must not be built. **No packing-algorithm change
is proposed, and §3.11 argues why.**

---

## 1. Problem statement and root cause

### 1.1 What the user saw

A real 4-role CV, laid out in 2 pages by the predecessor tool, came back as 3.
Page 1's main column reported `fill: 0.595` — 40% empty by the tool's own number
— and `warnings: []`. Nothing in the response said the page had stopped early,
why, or what would change it.

Three facts have to be held at once, and the post-mortem establishes all three:

1. **3 pages is the correct output for this content at this length.** Exhaustive
   enumeration finds no 2-page packing; greedy front-load is optimal here. The
   packer did not fail.
2. **The predecessor's 2 pages were not a better layout.** They were an
   over-constrained page silently flex-shrunk to 0.7–2.4pt inter-block gaps.
   Today's `minHeight` exists precisely to stop that.
3. **Neither tool told the user anything.** The old one hid infeasibility by
   compressing; the new one exposes it by adding a page and then says nothing
   about it.

So the defect is not the packing. It is **fidelity** (the model does not describe
the render) and **silence** (the response does not describe the decision).

### 1.2 Root cause A — the main column has a mirror, but no mirror test

The sidebar has both halves of the pattern: measurement primitives that model a
component honestly (`rowH()`, which counts wrapped lines and asks the *font* for
its natural line height when the component sets no `lineHeight`), and an
instrument that proves the result against a rasterised render at 0.01pt
(`sidebarMeasureDiff.js`, title-to-title differencing).

The main column got neither. `entryH()` predates both, composes literals and
`lh(size, leading)` calls by hand, and is verified by nothing. Every one of the
five error classes in §2 is an instance of the same absence:

| Class | What the mirror does | What the component does |
|---|---|---|
| A fudge | charges `entryMb * (15/11)` | renders `marginBottom: entryMb` |
| Assumed leading | charges the theme's `leading` on rows that set none | renders the font's natural 1.2 |
| Assumed one line | charges `lh(size, leading)` for role/company/location/progression | wraps them |
| Assumed indent | wraps bullets at `innerW − bulletIndent` (9pt) | indents by dash advance + 5 = 10.1165pt |
| Assumed greedy wrap | breaks a line the moment natural width exceeds the column | shrinks inter-word glue by up to ⅓ of a space before breaking |

The first two over-measure (safe direction). The last three **under-measure**,
which is the direction that overflows a page — and the file header of
`test/planLayout.test.js` currently asserts the opposite ("It is in the SAFE
direction — the packer reserves more room than the render needs, so a page can
never silently overflow because of it"). That claim is false as written; §2.3
disproves it by measurement. It has been true in practice only because the
over-measure was larger than the under-measure on the corpus.

### 1.3 Root cause B — the diagnostics describe arithmetic, not decisions

`plan_layout` publishes what the packer *computed* (`used`, `budget`, `fill`) and
not what it *decided*. The one decision that matters to a person editing a CV —
"this page ended here because the next role's smallest legal piece needs 191.95pt
and only 105.01pt were left" — is computed inside `packBlocks` and discarded. The
consequences are exactly T6/T7: page 1's fill is measured against a denominator
that changes meaning per page, six of eight plausible shortening edits *lower* it,
and no field names the stall.

---

## 2. What I measured

### 2.1 Instrument

The prototype of the harness this document proposes (§5.1): build a CV through
the real CLI, read every row's bounding box with `pdftotext -bbox`, keep the
main-column band, difference **consecutive role-line tops** and subtract
`calcDividerH()` (33.75pt). That yields one independent measurement of one
entry's rendered height per interior entry. A purpose-built probe CV isolates one
term per entry.

### 2.2 The four reported terms — confirmed exactly

Independent re-derivation (probe CV, real CLI, real fonts). `predicted` is
`entryH()`; `observed` is role-top differencing against the render:

| Entry shape | predicted | observed | delta |
|---|---|---|---|
| plain (role, company/period, 1 bullet) | 59.50 | 52.80 | **+6.70** |
| + `description` | 82.33 | 75.62 | +6.71 (description itself exact) |
| + `location` | 74.50 | 65.40 | **+9.10** |
| + 2 progression rows | 101.40 | 91.50 | +9.90 (= 6.70 + 2 × 1.60) |
| + 4 progression rows (the real CV's entry) | 358.45 | 345.35 | **+13.10** |
| continuation slice, 15 bullets | 499.00 | 495.00 | **+4.00** (the margin term only) |

The reported per-term decomposition — +4.00 margin, +2.70 meta row, +2.40
location, +1.60 per progression row, description exact — reproduces term for term.
On the motivating CV the entry total is **33.20pt**, as reported.

### 2.3 Three defects the brief does not list, all under-measuring

Same instrument, same run:

| Shape | predicted | observed | delta | cause |
|---|---|---|---|---|
| role wrapping to 2 lines | 59.50 | 65.80 | **−6.30** | model charges one role line (`lh(10, 1.3)` = 13.00) |
| company wrapping to 2 lines | 59.50 | 63.60 | **−4.10** | model charges one meta row (10.80 rendered per line) |
| location wrapping to 2 lines | 74.50 | 75.00 | **−0.50** | model charges one location line (9.60 per line) |

Each is the *entry's* net delta: the phantom cushion (+6.70 / +9.10) absorbs part
of the wrap and the remainder goes negative. Remove the cushion (which is what
§3.1–3.2 do) and each extra wrapped line is a full 13.00 / 10.80 / 9.60pt of
under-measure. A progression step title has the same exposure and, additionally,
the model has no width for it at all (`spacing.progPl` is not in `deriveMetrics`).

**The bullet column is 1.1165pt too wide.** Measured directly by rendering
`BulletList`'s row structure and reading the text's x-offset from the container:
the rendered dash column is **10.1165pt** (advance of `–` at 9pt semibold =
5.1165, plus `BulletList.jsx`'s literal `marginRight: 5`). The model wraps bullets
at `innerW − spacing.bulletIndent` = `innerW − 9`. A wider modelled column can
only ever produce ≤ the rendered line count, i.e. under-measure by 13.5pt
whenever it bites. Measured frequency on two real documents: 0 occurrences in 44
bullets / 106 rendered lines — rare, structurally unsound, and today masked by
the cushion §3.1 removes.

**The line breaker shrinks glue, and the model does not.** `@react-pdf/textkit`'s
Knuth–Plass breaker builds whitespace glue with
`shrink = width * opts.width / opts.shrink` where `opts = { width: 3, stretch: 6,
shrink: 9 }` (`node_modules/@react-pdf/textkit/lib/textkit.js`) — i.e. **each
inter-word space may shrink to ⅔ of its width**, so a line whose natural width
exceeds the column by up to `spaces × spaceWidth / 3` still fits.
`measure.js`'s `lineCount` is pure greedy with no shrink, so it breaks lines the
renderer keeps. Observed on the motivating CV: three rendered summary lines have
ink width **exactly 301.91pt** (the true column width) against natural widths up
to 303.95 — compressed to fit. One summary bullet is therefore modelled at 4
lines and rendered at 3.

Cost of that one line: **13.50pt**, and because the summary is fixed page-1
content subtracted from the experience budget, it is 13.50pt taken directly off
page 1's capacity.

Verified end-to-end: `summaryH + spacer` predicts the Summary-title→
Experience-title distance to **0.00pt** on a 1-bullet summary and **+13.50pt** on
the motivating CV; with the shrink rule mirrored, all five of that CV's summary
bullets match the rendered line counts exactly, and 34 experience bullets across
two real documents are unchanged.

### 2.4 Where this corrects the brief

- **"Corrected for F1, the deficit is still 15.90pt."** That counts the entry
  terms only. Adding the summary's over-counted line (13.50pt of budget), the
  total phantom height on this CV is **46.70pt** and the corrected two-page
  deficit is **2.40pt** — measured on a patched engine, not argued:
  content 1018.48pt against a two-page capacity of 1016.08pt. "Infeasible, but
  within one bullet" is really *within one word*. This matters for the product
  story: after the fix, the honest message to the user is "your CV is ~2pt of
  text away from two pages", which is a sentence a person can act on.
- **The looseness is not one-directional.** Three shapes under-measure today
  (§2.3). The comment in `planLayout.test.js:25-39` and the type doc in
  `types.d.ts` ("runs a few pt per entry above what renders") must be corrected
  along with the code.
- **F2 is three tokens, not two.** `spacing.bulletGap` and
  `spacing.summaryBulletGap` are write-only as reported; so is
  **`chrome.dividerMargin`** — `ExperienceSection.jsx:13` hardcodes
  `marginVertical: 16.5` while `calcDividerH()` reads `m.dividerMargin` (16.5).
  Same class, same fix, currently the same number.
- **A rendering defect found in passing, out of scope here but worth recording.**
  In the meta row, a long company wraps at the full container width and the
  period is pushed *outside* the content box: measured **24.19pt into the 33pt
  right padding**. A longer pair would run off the sheet. This is the same family
  as the sidebar contact-value clipping in `design-cvx-as-instrument.md` §7, and
  the harness in §5.1 should assert "no main-column ink past the content box"
  (excluding the page badge, which is a deliberate flex sibling outside the padded
  view) so the class is caught rather than rediscovered.

### 2.5 F3–F6 reproduced without change

| Fact | Reproduced |
|---|---|
| F3 infeasibility | entries 203.83 / 358.45 / 265.65 / 122.50 + 3 × 33.75 = 1051.68 vs 342.59 + 659.99 = 1002.58; short 49.10 |
| Split penalty | head + tail − whole = **+26.50pt** at every cut point (= role line 13.00 + `descMt` 3 + `entryMb`-as-charged 15 − one bullet gap 4.5) |
| F4 page-1 fill | reported 0.595; column occupancy (fixed + used) / capacity = 543.13 / 681.89 = **0.797** |
| F5 silence | `warnings: []`, `overflowPt: 0`, `emptyColumn: null` |
| F6 config lie | `page1ExperienceCount: 2, page1SplitBullets: 2` → `totalPages: 2`, `overflowPt: 131.94`, **3 physical sheets** |

---

## 3. The fixes

Standing rule applied throughout, stated once so each fix can refer to it:

> **The model mirrors the render; the render is not adjusted to suit the model** —
> unless the render itself is the defect. Every render change moves every existing
> user's output; every model change moves only what the packer believed. Of the
> eight fixes below, seven are model-side. The one render-side fix (§3.7) is
> chosen because there the *render* is what fails to read the theme, and it is
> provably byte-neutral.

### 3.1 A — the entry-margin fudge (`+4.00pt/entry`)

**Change.** `src/pdf/layout.js`, `entryH()` lines 406 and 433:
`h += m.entryMb * (15 / 11)` → `h += m.entryMb`. Both branches (whole entry and
continuation). Delete the two `// 11.25pt` comments, which describe a third
number that appears nowhere.

**Why model-side.** `ExpItem.jsx:8` renders `marginBottom: t.spacing.entryMb`. The
token is 11; the model scales it by a ratio with no referent. Making the render
15 would add 4pt of white below every entry for every user and make `entryMb`
mean "⅔ of the gap".

**Acceptance.** `grep -n '15 / 11' src/pdf/layout.js` returns nothing; the §5.1
harness reports 0.00pt on a plain entry and on a continuation slice (measured on
the patch: 52.80 predicted vs 52.80 observed; 369.00 vs 369.00).

### 3.2 B — rows the component leaves unstyled (`+2.70`, `+2.40`, `+1.60/row`)

**Change.** Replace every `lh(size, leading)` in `entryH()` that models a row
whose component sets no `lineHeight` with the sidebar's own `rowH()`, which reads
the font's natural line height through `measure.naturalLineHeight()` and falls
back to `NATURAL_LINE_HEIGHT` in the browser:

| Term | today | corrected |
|---|---|---|
| company/period row | `m.entryMetaMt + lh(m.bodySize, m.bodyLeading)` | `m.entryMetaMt + max(rowH(company, bodySize, innerW), rowH(period, metaSize, innerW))` |
| location | `m.locationMb + lh(m.metaSize, m.metaLeading)` | `m.locationMb + rowH(location, metaSize, innerW)` |
| progression row | `m.progPy*2 + lh(m.metaSize, 1.4)` | `m.progPy*2 + max(rowH(title, metaSize, w), rowH(period, captionSize, w))`, `w = innerW − progPl − sectionBorderWidth` |

`deriveMetrics` gains `roleWeight`, `captionSize`, `progPl` (the last is in the
theme and read by `ExpItem` but has never been in the metrics object at all).

**Why `max` over the row's children.** The row is a flex row with
`alignItems: 'baseline'`. For a single-family theme, `lineBox = ascent + |descent|`
(Lato: 1974 + 426 over 2000 = exactly 1.2em), so max-of-line-boxes and
baseline composition give the same answer, and the measured render agrees (10.80
= 9 × 1.2 for the shipped sizes). **Recorded assumption:** with two font
*families* in one row the two formulas can differ; nothing in CVX does that today,
and P3's type-scale work must re-derive this (see §5.4).

**Why the hardcoded `1.4`.** The progression term's leading matches neither the
theme's `meta.leading` (1.5) nor the natural 1.2, and the row's second child
(`caption`, 7.5pt) is not modelled at all. Both disappear with `rowH`.

**Why model-side.** Adding `lineHeight` to those components would grow every
existing CV by 2.70–13.10pt per entry and change the design's vertical rhythm.
The render is the design as shipped and reviewed.

**Acceptance.** Harness reports 0.00pt on: located entry (65.40/65.40),
progression entry at 2 rows and at 4 rows (the real CV's: 345.35/345.35).

### 3.3 C — single-line assumptions (new; up to −13.00pt per wrapped line)

**Change.** The same `rowH()` swap fixes this, because `rowH` counts wrapped
lines. Two extra points:

- **Role.** `lh(m.roleSize, m.roleLeading)` → `rowH(role, roleSize, innerW,
  { weight: roleWeight, leading: roleLeading })`. The leading is already correct
  (the component sets it); what is missing is the line count.
- **Continuation role.** The renderer draws `role` + `(cont'd)`; the model must
  count lines for the composed string. Measuring the suffix at the role's size
  (rather than the meta size the component uses for it) over-estimates the suffix
  by ~20% of its width — deliberately, because that is the safe side of a wrap
  boundary. Record it as a decision, not an oversight.

**Acceptance.** Harness at 0.00pt on a wrapping role (65.80/65.80), a wrapping
company (63.60/63.60) and a wrapping location (75.00/75.00) — all three currently
negative-delta.

### 3.4 D — the bullet column width (new; −13.50pt per unmodelled line)

**Change.** Model the dash column as what the component draws, mirroring a
component literal exactly as `BODY_STYLE`/`DESC_STYLE` already do:

```js
const BULLET_DASH = '–'                       // BulletList.jsx
const BULLET_DASH_STYLE = { weight: 600, italic: false }
const BULLET_DASH_MR = 5                           // BulletList.jsx literal marginRight
function bulletWidth(m, measure) {
  const dash = measure?.widthOf
    ? measure.widthOf(BULLET_DASH, m.bodySize, BULLET_DASH_STYLE)
    : BULLET_DASH.length * m.bodySize * m.cw       // isomorphic fallback
  return m.innerW - dash - BULLET_DASH_MR
}
```

used by `entryH` and `summaryH` in place of `m.bulletW` (312.03 − 10.1165 =
301.91 vs today's 303.03).

**Why not the render.** Pinning the dash box to `bulletIndent − 5 = 4pt` would
also close the gap and would make `spacing.bulletIndent` a real token — but it
widens every user's bullet column by 1.12pt, which can re-wrap text and move page
breaks, for no design gain. Model-side costs nothing visible.

**Consequence for `spacing.bulletIndent`.** It becomes the browser-preview
fallback only. It must therefore **not** appear in P3's scalable-token table
(`design-p3-surface.md` §3.1 — it does not today; keep it that way), and
`m.bulletW` should be deleted from `deriveMetrics` rather than left as a
misleading second answer.

**Acceptance.** A unit assertion that `bulletWidth(m, measure)` equals the
rendered indent measured by the harness's dash-column probe, at 0.01pt.

### 3.5 E — the line breaker's glue shrink (new; −13.50pt observed)

**Change.** `src/pdf/measure.js`, `lineCount()`: a word joins the current line
when

```
naturalWidth <= maxWidth + spacesOnLine * spaceWidth * (1/3)
```

with the ⅓ taken from textkit's own glue construction (`opts.width / opts.shrink`
= 3/9). Reset the space counter on each break. Isomorphic fallback
(`layout.js`'s char-width `lineCount`) is left alone — it is advisory and already
loose in the safe direction.

**Honesty about what this does and does not prove.** Greedy-with-shrink mirrors
textkit's *feasibility* rule (adjustment ratio ≥ −1), not its *choice*. Textkit
runs Knuth–Plass and may break earlier than maximal fill to reduce badness, so
the corrected model is a lower bound on its line count, and a divergence would be
in the unsafe direction. Two mitigations, both cheap: (a) hyphenation is disabled
(`fonts.js:83`) and no penalties exist, which removes the main source of
non-greedy behaviour; (b) `measureDiff.js` — which already compares line counts
against real renders — gets a **near-boundary corpus**: strings padded so their
natural width lands within one space-shrink of the column, at each width the
engine uses. If the harness ever shows a divergence, the escalation is to port
textkit's breaker (it is ~200 lines of pure JS and would stay isomorphic), not to
loosen the tolerance.

**Acceptance.** The motivating CV's summary measures 273.90pt (from 287.40) and
`summaryH + spacer` predicts the Summary→Experience title distance at 0.00pt;
`measureDiff` corpus shows `measured == rendered` on every near-boundary row.

### 3.6 The corrected `entryH`, in full

Written out because it is the contract the harness pins (verified: every shape in
§2.2–2.3 lands at 0.00pt against the render with this exact composition):

```
whole entry:
  rowH(role,     roleSize, innerW, {weight: roleWeight, leading: roleLeading})
+ entryMetaMt + max(rowH(company, bodySize, innerW), rowH(period, metaSize, innerW))
+ [location]      locationMb + rowH(location, metaSize, innerW)
+ [description]   descMt + rowH(description, descSize, innerW, {italic, leading: descLeading}) + descMb
+ [progression]   progMt + progMb + Σ_steps ( progPy*2
                    + max(rowH(title, metaSize, pw), rowH(period, captionSize, pw)) )
                  where pw = innerW − progPl − sectionBorderWidth
+ [bullets]       descMt + Σ_bullets lines(bullet, bodySize, bulletWidth) * lh(bodySize, bodyLeading)
                    + (n−1) * bulletGap
+ entryMb

continuation slice:
  rowH(role + " (cont'd)", roleSize, innerW, {weight: roleWeight, leading: roleLeading})
+ [bullets]  as above
+ entryMb
```

### 3.7 F — the write-only tokens: wire them, do not delete them

**Change (render-side, the one exception to the standing rule).**

| File | today | corrected |
|---|---|---|
| `ExpItem.jsx:82,110` | `<BulletList gap={4.5} />` | `gap={t.spacing.bulletGap}` |
| `SummarySection.jsx:13` | `<BulletList gap={7.5} />` | `gap={t.spacing.summaryBulletGap}` (adds `useStyles`/theme access to a component that has none today) |
| `BulletList.jsx:26` | `gap = 4.5` default | required prop, or defaulted from the theme — no literal |
| `ExperienceSection.jsx:13` | `marginVertical: 16.5` | `marginVertical: t.chrome.dividerMargin` |

**Why wire, not delete.** Three reasons, in order of weight:

1. **It is provably free.** All three tokens hold exactly the values the
   components hardcode (4.5 / 7.5 / 16.5), so the rendered PDF is byte-identical.
   That is an acceptance criterion, not a hope (§5.3).
2. **Deleting moves the literals to the side nobody can see.** The model would
   then hardcode 4.5/7.5/16.5 in `entryH`/`summaryH`/`calcDividerH` — the same
   number of magic numbers, now in the file that is supposed to be the mirror.
3. **P3 is blocked on it.** `design-p3-surface.md` §3.1 lists `bulletGap` and
   `summaryBulletGap` as scalable tokens and explicitly blocks their exposure
   until this lands. Deleting them would delete two rows of the P3 surface —
   inter-bullet spacing is the second most obvious "tighten this" lever after
   `entryMb`. That is a product decision and the wrong one.

**Make the class un-recurrable.** Add a structural test (`layout.mirror.test.js`
is the natural home — it already renders components through
`react-dom/server`): for each token the model reads, render the component under a
theme where that token is perturbed and assert the rendered geometry moves.
Concretely, a **token-perturbation** test: with `bulletGap: 9` (from 4.5),
`entryH` must grow by `(n−1) × 4.5` **and** the rendered role-top difference must
grow by the same amount. One test, three tokens, and the next hardcoded literal
fails it.

**Acceptance.** (1) `SOURCE_DATE_EPOCH` build of the scaffold before and after is
byte-identical; (2) the perturbation test passes; (3) `baseline.json` unchanged.

### 3.8 G — the stall diagnostic (the missing sentence)

The gap: `packBlocks` knows exactly why a page ended, and throws it away. Rule 1b
("nothing of this block fits here; a fresh page would take it, so end early") and
the rule-4 decline (`cut === null`) are the two decision points.

**Plan-shape change.** `PackedPage` gains one field, set at the moment of the
decline:

```ts
blockedBy: {
  index: number          // flow index of the block that could not start here
  smallestPiecePt: number // its smallest legal piece: head + 1 item, or the whole block
  residualPt: number      // budget − used, before the gap
  gapBeforePt: number     // the divider the block would have charged
} | null
```

`smallestPiecePt` is `split(0, /* forceMinimum */ true)`'s head height (or the
block height when it has no legal cut) — one extra binary search per page
boundary, deterministic, negligible.

`packExperiences`/`packSidebar` project it into `pageMetrics`; `planTwoColumn`
puts it on `LayoutPlanPage.mainBlockedBy` / `sidebarBlockedBy`.

**Published shape** (`layoutDiagnostics.js`, inside each column):

```ts
blockedBy: {
  role: string | null      // main column; `key` for the sidebar
  entryIndex: number
  residualPt: number
  gapBeforePt: number
  smallestPiecePt: number
  shortByPt: number        // smallestPiecePt − (residualPt − gapBeforePt)
} | null
```

`null` on the last page of a flow, and on any page where the next block did start.
This is **data, not a warning**: it is the price of a page break, true at nearly
every break, and it carries no judgement.

**The warning.** One new code, main column, page 1 only, because page 1 is the
only page with a *lever* (fixed content the user can shorten):

```
code:  'page1-ends-early'
page:  1
fields: shortByPt, residualPt, smallestPiecePt, gapBeforePt, fixedPt, nextRole
forcedByConfig: false
```

*Trigger predicate*, stated exactly: page 1's main column has `blockedBy !== null`
**and** at least one entry on it (the zero-entry case is the existing
`page1-no-experience`, which stays and keeps its code — the two are mutually
exclusive by construction and `page1-no-experience` is the degenerate case of the
same phenomenon).

*Wording* (numbers from the motivating CV, post-fix):

> page 1's experience list ends 158.96pt before the foot of the column: the next
> role ("Head of People") cannot start here because its smallest legal piece —
> the role heading plus one bullet — needs 178.85pt, and after the 33.75pt entry
> divider only 125.21pt remain. Short by 53.64pt. The only lever on page 1 is the
> fixed content above the roles (325.80pt: summary 273.90, spacer 27.00, section
> title 24.90); shortening the summary by 53.64pt, or shortening that role's
> first bullet by the same, starts it on page 1. This is a content decision —
> raise it with the user.

Same shape today (pre-fix) reads: residual 138.76, smallest piece 191.95, short by
86.94, summary 287.40. Both are exactly T7's missing sentence.

**Why this is not a score, and why it survives the C4 test.** `shortByPt` is
per-decision, attached to one named block on one page, and there is **no
document-level aggregate of it anywhere in the payload** — that is the line this
design will not cross (§7.1). It is also the only number in the response that
moves *monotonically* with the edit an author would make: shorten the summary by
S and `shortByPt` falls by S until it reaches 0 and the role moves up. Fill does
not have that property under any definition (§3.9), which is precisely why fill
must not be sold as a progress signal.

**Where it attaches.** `layoutDiagnostics.js`, a new `page1EndsEarly(pages)`
beside `page1WithoutExperience(pages)`, appended to `warnings` in the same array.
Diagnostics-only, like `page1-no-experience`: the CLI's stderr `notices` stay
overflow-only, so a human building a 3-page CV is not shouted at about a normal
page break.

### 3.9 H — comparable fill, and versioning the shape

**The defect.** `fill = used / budget`, where `budget` on page 1 is the residual
after the summary, spacer and section title. Page 1 reports 0.595 while the column
is 79.7% occupied; page 2 reports 0.997 for a column that is 99.7% occupied. The
two numbers are not the same measurement, and the docs invite readers to compare
them ("how full each column is").

**Change.** Publish the whole decomposition and redefine the headline ratio:

```ts
capacityPt   // NEW: the entire column on this page
             //   = bodyH − cornerH − pad.top − pad.bottom − safety
fixedPt      // NEW: capacityPt − budgetPt (summary + spacer + section title on page 1;
             //   the section title alone on continuation pages)
budgetPt     // unchanged: what the packer may fill
usedPt       // unchanged: what it packed
fill         // REDEFINED: (fixedPt + usedPt) / capacityPt
```

Motivating CV, post-fix: page 1 `fill 0.767` (was 0.554 under the old definition
with the corrected model, 0.595 as shipped), page 2 `0.967`, page 3 `0.175`. The
thin page is now the one that is thin.

**The documented invariant survives the redefinition**, which is the argument for
redefining rather than adding a second ratio:
`fill > 1 ⟺ fixed + used > capacity ⟺ used > budget ⟺ over budget` — exactly the
property `types.d.ts`, `SKILL.md`, `ai-guide.md` and `llms.txt` all teach today.
Any consumer thresholding at 1 is unaffected; only the *magnitude* changes, and
today's magnitude is the misleading part.

**One deliberate semantic change beyond that.** Today `fill` is `null` when
`budget <= 0` (the over-tall-summary shape). Under the new definition an honest
ratio exists — the content genuinely exceeds the column — so it becomes a number
above 1. `null` is kept for the one meaning it should always have had: *this flow
ended on an earlier page, there is nothing here*. `test/planLayout.test.js:327`
asserts the old `null` and must change with the doc.

**Versioning.** Add `LayoutDiagnostics.version: 2` (a new integer field inside the
diagnostics object). The envelope's `schemaVersion: 1` stays: it describes the
tool envelope, whose fields are unchanged and only added to. The `version` field
is what a consumer keys on to know that `fill`'s denominator changed. The change
lands with: `types.d.ts` prose, `docs/ai-guide.md:257,263`, `skills/cvx/SKILL.md:81`,
`llms.txt:11`, `CHANGELOG.md`, and a `docsSync` assertion so a doc cannot describe
v1 semantics next to a v2 payload.

**Alternative considered and rejected:** keep `fill` and add `occupancy`. Rejected
because every shipped doc and the skill point at `fill`; adding a better number
beside a misleading one guarantees the misleading one keeps being read. Recorded
because it is the lower-risk option and a maintainer may prefer it.

**What fill is not.** State it in the type doc: *fill is a description of a page,
not a progress signal.* Shortening content lowers it until a block moves up, then
it jumps. The number that moves monotonically with an edit is
`blockedBy.shortByPt`.

### 3.10 I — the config bypass: deprecate it

**The defect.** With `page1ExperienceCount` set, `packExperiences` packs page 1
against `Number.POSITIVE_INFINITY` and reports `totalPages = 1 + packed.length`.
Reproduced: `totalPages: 2`, `overflowPt: 131.94`, **3 sheets on paper**. The
plan is not merely optimistic; it is arithmetically incapable of counting the
sheets it causes, because react-pdf's flow makes them and the badge numbering
cannot reach them.

**Change: ignore both keys, with a notice.**

- `resolveDocument.js` stops forwarding `page1ExperienceCount` /
  `page1SplitBullets` to `planTwoColumn`.
- `packExperiences` loses its config branch entirely (~55 lines) and becomes
  single-path. `overflowWarnings` loses its `forcedByConfig` computation; the
  **field stays** on the warning shape (always `false`) so no consumer breaks,
  documented as deprecated.
- The keys stay in `schema/v1` (`additionalProperties: false` means removing them
  would fail every existing workspace's validation), and
  `diagnostics.leversUsed` keeps reporting them — now meaning "declared,
  ignored".
- New diagnostic warning `config-lever-ignored` + one CLI notice, naming the keys
  and the automatic result: *"`page1ExperienceCount: 2` is no longer applied
  (measured anti-lever: it never changed the page count and pushed 131.94pt onto
  an unnumbered sheet). This CV paginates automatically to 3 pages. Remove the
  keys from config.yaml to silence this."*

**Why deprecation rather than repair.** Two repairs exist and both are worse.
Making `totalPages` count the flowed sheets produces a number that disagrees with
the badge printed on the page — a different lie. Capping the forced set to the
budget makes the lever a no-op in exactly the cases anyone sets it, with more
code than deleting it. And the evidence against the lever is already recorded and
measured: `design-cvx-as-instrument.md` §7 ("measured anti-lever": page count
never moves; overflow 0 → 184 → 420 → 590pt), and P1 already deleted the advice
that taught it.

**Cost, stated plainly.** A workspace that sets these keys gets a different
(better, honestly-counted) layout on upgrade. That is a minor-version behaviour
change with a notice, a CHANGELOG entry, and a fixture.

### 3.11 Packing: no change, and why

**No algorithm change is warranted.** The motivating document has no better
packing: exhaustive enumeration over every boundary and every bullet-level split
finds no 2-page solution, and `layout.minimality.test.js` already proves the
general claim (front-load first-fit is page-count-minimal at fixed block heights,
including splittable flows — 15,363 generated flows, zero counterexamples). The
defect was never the packer.

**Head-internal splits** (cutting an entry *inside* its head — role on one page,
company/description/bullets on the next) are the only mechanism that could put
something of the next role into a 105pt residual. They are rejected on three
independent grounds:

1. **They do not help this document.** Every split *adds* height (+26.50pt today,
   +22.50pt after §3.1) because the continuation repeats the role line. Splitting
   to fill page 1 makes the document longer, not shorter.
2. **Component contract.** `ExpItem` would need to render a partial head
   (`startRow`/`endRow` props or an explicit head-slice model), the continuation
   would need to render the *remaining head rows* rather than "(cont'd) +
   bullets", `experienceBlock`'s `SplitFn` would need a second cut axis,
   `bulletsOn()` and the diagnostics' bullet ranges would need a head analogue,
   and `layout.mirror.test.js` would need to prove the new slicing. That is a
   C3a-sized change to the plan/render contract.
3. **Invariant-0 hazard, and a G3 violation for certain.** Nothing is dropped, so
   Invariant 0 survives in the letter — but a role heading alone at the foot of a
   column with its employer overleaf is exactly the orphaned heading that
   `largestFittingPrefix`'s `[1, n−1]` range exists to prevent, and
   `noOrphanHeading` is a *hard* invariant in the harness (`generateBaseline.js`
   refuses to record a violation). Shipping head splits means weakening a hard
   invariant to buy a layout nobody asked for.

If a future phase revisits this (P4's flow work is the plausible place), it must
arrive with a rule for which head rows may be orphaned and a fixture that proves
the render, before any packer change.

---

## 4. Sequencing

Five slices. Each is independently releasable; the dependency edges are about
*evidence*, not compilation.

| # | Slice | Depends on | Baseline effect |
|---|---|---|---|
| S1 | Token wiring (§3.7) | — | none (byte-identical PDFs, asserted) |
| S2 | Main-column render-diff harness + shape fixtures (§5.1–5.2) | — | additive only (new fixture keys) |
| S3 | Box-model fidelity (§3.1–3.6) | S2 | **measured: none** — see below |
| S4 | Diagnostics: `blockedBy`, `page1-ends-early`, `fill` v2 (§3.8–3.9) | S3 | none (observer only, C6a precedent) |
| S5 | Config-lever deprecation (§3.10) | S4 | one fixture |

**Why S2 before S3.** C0's rule, and it earned itself here: build the ruler
before cutting. If the model changes first, the harness's expectation table is
written against the new engine and cannot demonstrate that anything was fixed.
S2 lands with today's deltas recorded as expectations (+6.70 plain, +9.10 located,
−6.30 wrapping role, …); S3 replaces that table with a flat `0.01pt` tolerance.
The diff of that table across the two commits *is* the evidence.

**Why S3 before S4 — and before P2.** Publishing `blockedBy.shortByPt` computed
from a model that is 13.10pt per entry wrong would give an assistant a number that
looks actionable and is not; the sprint doc already names this ("publishing
heights that are wrong by 13pt per entry would be worse than publishing
nothing"). The same argument governs P2 (per-entry/per-bullet heights): **P2
lands after S3.**

**Why S1 first.** It is provably inert (byte-identical output). Landing it first
means that if S3's baseline diff shows movement, S1 is not a suspect.

**The "entries measure smaller, so packing gets tighter" question, answered with
a measurement.** Planning all 32 curated fixtures under both engines
(`buildFixturePlan` → `buildContent` → `planTwoColumn`, old vs patched):
**32 unchanged, 0 changed** — same `totalPages`, same `mainPageCount`. The
shipped scaffold: 2 pages before and after, 2 sheets before and after, with fills
falling 0.863 → 0.833 and 0.922 → 0.892 as the phantom height leaves. So the
corpus-wide page-count risk of S3 is not "bounded"; it is *zero on the corpus we
have* — which also means **the corpus cannot detect S3 at all**, and is exactly
why the render-diff harness, not `baseline.json`, is S3's acceptance instrument.

Three further reasons the direction of change is not the safety argument:

- The fixes move heights **both ways** (A/B/E shrink; C/D grow) and they partly
  cancel; what is being asserted is *agreement*, per shape, at 0.01pt.
- `spacing.safety` (15pt per page) is untouched — G-a's backstop stays.
- The render oracle's existing gate (`physical == logical` sheet count per
  fixture, plus the hard invariants `generateBaseline.js` refuses to record)
  remains the release condition.

---

## 5. Verification plan

### 5.1 The main-column render-diff harness

New: `test/layout-harness/mainMeasureDiff.js` + `test/layoutMainMeasureDiff.test.js`,
deliberately shaped like the sidebar pair so a reader learns one pattern.
**This design's numbers were produced by a working prototype of it**, so the
following is a description of something that ran, not a sketch.

**What it differences — three independent families from one render:**

1. **`entryRows` (interior entries).** Consecutive role-line tops within a page,
   minus `calcDividerH()`, gives one entry's rendered height. Validates the whole
   composition of §3.6. This is the main-column analogue of the sidebar's
   title-to-title differencing.
2. **`headRows` (every entry, including page-last and split heads).** Role top →
   the entry's **first bullet row** top gives the head's rendered height
   (role + meta + location + description + progression + `descMt`). This closes
   the structural gap the sidebar harness records and cannot close: a split head
   is always its page's last block, so family (1) can never reach one. Family (2)
   reaches every entry on every page.
3. **`fixedRows` (page 1).** "Summary" title top → "Experience" title top must
   equal `summaryH + spacer`. One measurement validates `summaryH`, `calcTitleH`
   and the spacer at once. (Measured: 0.00pt on a 1-bullet summary, +13.50pt on
   the motivating CV — this is the probe that found §3.5.)

**Tolerance: 0.01pt**, the same bar and the same justification as the sidebar
(pdftotext prints to 6dp; the box model is exact arithmetic over quarter-points
and real glyph advances). If it ever needs loosening, the formula is wrong.

**Four mechanics that are not obvious and cost a debugging session each:**

- **Locate role rows by text *and* x-position *and* document order.** A
  progression step can repeat the role string verbatim (the motivating CV has a
  "Head of People" progression step inside the "Head of People" entry); matching
  on text alone silently measures the wrong row and reports a 286pt delta.
  Progression rows are indented by `progPl + border` = 9pt, so the content-left-edge
  test disambiguates them.
- **Decode XML entities before comparing.** `&amp;` and `&apos;` are common in
  real role and company strings ("Human Resources Executive & Project
  Coordinator"). The sidebar harness already has `decodeXml`; reuse it.
- **Do not merge the bullet dash into its text row.** The dash carries
  `marginTop: iconMt` (1pt), so it lands on its own `yMin` — group rows by exact
  `yMin` (as the sidebar harness does) and match the text words, never the dash.
- **Coverage is asserted, not assumed.** Copy the sidebar test's discipline
  verbatim: log what was measured and what was skipped, assert a floor on
  `entriesMeasured`, and assert that the skip reason "role not on its planned
  page" never occurs.

**Fourth check, cheap and new:** no main-column ink may extend past the content
box (`sidebarWidth + mainWidth − mainPad.right`), excluding the page badge, which
is a flex sibling outside the padded view by design. This catches §2.4's
period-overflow class — the same defect family as the sidebar contact clipping —
which no current test can see.

### 5.2 Fixtures: the corpus cannot reach the code today

`grep -rn progression test/` finds nothing, and no fixture sets `location`. Two
additions, staged so their baseline diffs stay attributable:

**S2a — four named edge fixtures** (`fixtures.js`, additive; `baseline.json` gains
four keys and no existing key moves):

| id | shape | reaches |
|---|---|---|
| `edge-progression-entries` | every entry carries a 4-step progression | §3.2's progression term, the +13.10 shape |
| `edge-located-entries` | every entry carries a short `location` | §3.2's location term |
| `edge-wrapping-heads` | a role and a company that each wrap to 2 lines | §3.3, both currently negative-delta |
| `edge-wrapping-location` | a location that wraps | §3.3 |

**S2b — three new pairwise factors** (`PAIRWISE_FACTORS` in `fixtures.js`,
`buildExperienceEntry` in `contentSpecs.js`):

```
location:   ['absent', 'short', 'wrapping']
progression:['absent', 'one', 'four']
headLength: ['short', 'wrapping']
```

**Measured cost: the greedy cover grows from 18 rows to 19** (pairs required
188 → 377), i.e. one extra fixture — computed by running the repo's own
`greedyPairwiseCover` with the extended factor set. The real cost is not runtime:
adding a factor changes *every* pairwise fixture's content, so every
`baseline.json` row is rewritten. **That regeneration must be its own commit,
with no engine change in it**, or S3's baseline diff becomes uninterpretable.
S2b may be deferred without blocking S3 (S2a plus the harness's own shape corpus
already reach every term); if it is deferred, say so in the fixture plan's meta
rather than leaving the axes silently absent.

**The harness's own shape corpus.** One purpose-built CV whose entries isolate one
term each — plain / long role / long company / located / long location /
progression×2 / progression×4 / description / many-bullets-forcing-a-split — is
the cheapest complete instrument (one render covers all of §3.6). Build it through
`contentSpecs.js` so it stays deterministic and reviewable.

### 5.3 Acceptance criteria, per slice

| Slice | Gate |
|---|---|
| S1 | Scaffold PDFs byte-identical under `SOURCE_DATE_EPOCH`; `baseline.json` unchanged; token-perturbation test green |
| S2 | Harness reports the recorded delta table exactly; coverage floor met; `title-not-on-planned-page` empty; no ink past the content box except the badge |
| S3 | Every family in §5.1 within **0.01pt** on every fixture and on the shape corpus; `15 / 11` gone; existing suites green; `baseline.json` diff **empty** (measured expectation — investigate, do not regenerate over, any movement) |
| S4 | `blockedBy` arithmetic identity `shortByPt === smallestPiecePt − (residualPt − gapBeforePt)` asserted; `fill > 1 ⟺ overflowPt > 0` still holds on every fixture; `version: 2` present; `docsSync` green |
| S5 | `edge-forced-split-config` reports `physical == logical`; `config-lever-ignored` fires; `leversUsed` still reports the declared values |

**Already measured against the patched engine** (evidence that S3's gate is
reachable, not aspirational): all six shape families at 0.00pt; the real CV's
progression entry 345.35 predicted vs 345.35 observed; `src/pdf/layout*.test.js`,
`measure.test.js`, `layoutSidebarMeasureDiff.test.js` and `planLayout.test.js`
— 85 tests — pass **unchanged**. That last fact is itself a finding: **no existing
test pins any of the terms this design corrects.**

### 5.4 Baseline migration policy

`baseline.json` records what the engine does, so a fix regenerates it. The
question is which diffs are acceptable. Rules, in order:

**Acceptable**
- A fixture whose `pageCount` and `logicalTotalPages` change **together**, in the
  same direction, by the same amount — the plan and the paper still agree.
- Consequential `emptyColumns` movement on such a fixture.
- New keys (added fixtures).

**Regression — stop, do not regenerate**
- Any fixture where `pageCount > logicalTotalPages` after and not before: the plan
  is under-counting the paper. This is the shape C3b closed and the one
  `page1ExperienceCount` reintroduces (§3.10).
- Any new `blankPages`.
- Any hard-invariant or content-completeness violation (`generateBaseline.js`
  already refuses to write these — do not "fix" it by relaxing the refusal).
- A page-count change on a fixture whose §5.1 delta table is **not** 0.00: the
  change was caused by a new error, not by exactness.

**Required evidence for every changed row.** The regenerating commit's message
names the fixture, the direction, and the term that explains it ("`pw-07` 3 → 2:
five located entries × 2.40pt of phantom location height"). A regeneration whose
diff cannot be explained term by term is a stop-work signal, not paperwork.

### 5.5 The F3 regression fixture — and what it should assert

**Fixture.** `edge-page1-blocked` (synthetic, via `contentSpecs.js` — no personal
content): four entries where the first fills roughly half of page 1, the second
carries a 4-step progression and a smallest-legal-piece taller than the residual,
and a summary in the 270–290pt range.

**Assert the diagnostic, not the page count.** Reasons, and they are the
post-mortem's own: 3 pages *is* the correct output for that content, so a
`totalPages === 3` assertion pins a content fact that any legitimate future
fidelity improvement may change — and it would have passed on the shipped engine
too, which is precisely the test that would not have caught anything.

What it asserts:

1. `warnings.map(w => w.code)` contains `page1-ends-early` **exactly once**, on
   page 1, and does **not** contain `overflow` or `page1-no-experience`.
2. The payload's arithmetic identity holds:
   `shortByPt === smallestPiecePt − (residualPt − gapBeforePt)`, and
   `smallestPiecePt` equals `entryH` of the next entry sliced to one bullet
   (recomputed in the test from the plan, not copied from the payload).
3. `pages[0].main.fill` to 3dp — a *measured* fact after S3, re-derivable from
   the render, and the number that was 0.595-and-misleading before S3/S4.
4. `sheets === totalPages` (via `pdftotext`, poppler-gated like its neighbours):
   the honesty property, which is what actually regressed in F6.
5. A **bounded** page-count canary, with its reasoning in the comment:
   `totalPages <= 3`. It cannot fail on a better model; it fails if the phantom
   height comes back.

---

## 6. Risks

**R1 — C4-shape reintroduction: an agent climbs `shortByPt`.** The new number is a
gradient, and models climb gradients. Mitigations: (a) it is per-decision and per
page; **no document-level aggregate of slack, shortfall or fill is published, and
this design forbids adding one** — no `totals.slackPt`, no `totals.shortByPt`;
(b) the warning names an owner and an action ("raise it with the user"), matching
`page1-no-experience`'s established phrasing; (c) the type doc states that fill
describes a page and is not a progress signal; (d) the real defence is unchanged
and stated in `design-cvx-as-instrument.md` §5 — the LLM looks at the render each
pass. Note honestly that (a) cannot bind the caller's arithmetic; it only declines
to do the arithmetic for it.

**R2 — 0.01pt agreement is a fact about one theme.** Every number here is Lato at
the shipped sizes: the `max`-over-row-children composition is exact because one
family scales ascent and descent together (§3.2), and the dash advance is a Lato
number. P3 makes the type scale variable, and six harness modules still hardcode
`tealTheme`. **The theme threading is a prerequisite for P3, not for this work** —
but S3's harness must take a theme parameter from day one, or the re-derivation
P3 owes will pass while measuring the wrong document (the precedent is real: three
harness sites planned against `defaultLayouts.js` while rendering the fixture's own
layout).

**R3 — the glue-shrink rule is a mirror of a feasibility test, not of Knuth–Plass.**
Textkit may break earlier than maximal fill; that divergence is in the unsafe
direction. Mitigations: the near-boundary corpus in `measureDiff.js` (§3.5),
`spacing.safety` untouched, and a named escalation (port the breaker) rather than
a tolerance increase. Bound on the damage if it does bite: one body line, 13.5pt,
against a 15pt per-page backstop — which is uncomfortably close, and is the reason
the corpus is required rather than optional.

**R4 — published-shape consumers.** `fill`'s denominator changes. Mitigations:
`version: 2`; the `> 1 ⟺ overflow` invariant preserved so boolean logic is
unaffected; all four doc sites and the skill updated in the same commit with a
`docsSync` assertion; CHANGELOG. Residual risk: a consumer that stored historical
fills compares across the boundary — unavoidable, and the reason for the version
field.

**R5 — Invariant 0 under a new split.** No new split is designed (§3.11). The
hazard is recorded for whoever proposes one: head-internal splitting orphans a
heading, which `noOrphanHeading` forbids as a *hard* invariant, and the baseline
generator refuses to record a violation — so such a change cannot be landed
quietly; it must first change the invariant, in the open.

**R6 — the deprecation breaks someone's layout (§3.10).** A workspace setting
`page1ExperienceCount` gets a different pagination on upgrade. Mitigated by a
notice that names the keys and the automatic result, a CHANGELOG entry, and the
measured evidence that every effective setting made the CV worse. Not mitigated
away: it is a behaviour change, and should ship as one.

**R7 — five fixes in one slice (S3).** Deliberate: they interact (A and B shrink,
C and D grow, E shrinks), and landing them separately means several
half-corrected states in which the harness cannot be green and the baseline
churns more than once. The mitigation is that the harness is per-shape, so a
failure names the term.

---

## 7. Decisions this design declines to make

### 7.1 No bounded exception to "no aggregate score" is requested

The brief invites one under its own heading if justified. **None is.** Everything
this design publishes is either a measured height, a named block, or a difference
between two of them, attached to a single page-break decision. The one number
that behaves like a progress signal (`shortByPt`) is deliberately *not* summed,
averaged or normalised anywhere — a document-level version of it would be
`Σ residualSlack` under a friendlier name, which is the objective C4 measured and
deleted. If a future phase wants a whole-document quality signal, the literature
note in `design-cvx-as-instrument.md` §8 applies: it would have to be
veto-shaped, not additive, and it would still be the wrong actor's job.

### 7.2 No new levers

Nothing here adds a config key. §3.10 removes two. The channel for expressiveness
is P3's `config.yaml`/`layouts/*.yaml` surface, and §3.7 is a prerequisite for two
of its rows.

---

## 8. Rejected alternatives

| Rejected | Reason |
|---|---|
| **Full DP over page breaks (Knuth–Plass on pages)** | It cannot reduce the page count — that is already minimal at fixed heights (`layout.minimality.test.js`, proven for atomic *and* splittable flows). It re-ranks breaks within a fixed count, and there is no defect for it to fix: no orphaned heading exists (a hard invariant forbids them) and no visibly wrong break point appears in the corpus. It also needs an objective, and C4 measured this document shape's objective as wrong (the literal `Σ residualSlack²` crowns a pagination that leaves page 1's main column empty). |
| **Lookahead / backtracking in the packer** | Same first argument, plus: on the motivating document exhaustive enumeration finds nothing better to back into. It would add a second decision path to a packer whose termination proof is currently one paragraph (`assertCarryShrinks` + `maxPagesFor`). |
| **Best-fit, or any reordering** | Section order in a column is designer intent (`layout-packing-design.md` §2.3/§2.5) and experience order is chronology — content, not layout. Within a fixed order, best-fit can only choose a different subset for a page, which for a front-loaded résumé is worse and still cannot reduce the page count. |
| **Silent compression (the predecessor's behaviour)** | Measured on the original PDF: page 1's inter-block gaps squeezed to 0.7–2.4pt while page 2 kept 16.5pt. It renders below theme spacing, which the template's `minHeight` exists to prevent, and it hides infeasibility from the user — the product defect this whole document exists to remove. |
| **Auto-shortening content to fit** | Invariant 0 at full strength: CVX renders text, it does not edit text. Editing is the user's and the assistant's act, in the open, in the YAML. |
| **Head-internal splits** | §3.11: does not help the motivating document (splits add height), forces a component-contract change, and orphans a heading that a hard invariant forbids. |
| **Deleting the write-only tokens instead of wiring them** | §3.7: same literal count, moved into the file that is supposed to mirror the render, and it deletes two rows of P3's designed surface. |
| **Changing the render to match the model** (add `lineHeight` to the meta/location/progression rows; charge a 15pt entry margin; widen the dash column) | Moves every existing user's output and changes the design's vertical rhythm, to fix a mirror that is wrong. Per-term justification is in §3.1–3.4. |
| **Adding `occupancy` beside the existing `fill`** | §3.9: every doc and the skill point at `fill`; a better number beside a misleading one leaves the misleading one being read. Recorded as the lower-risk alternative if a maintainer prefers it. |
| **Repairing `page1ExperienceCount` instead of deprecating it** | §3.10: counting the flowed sheets produces a `totalPages` that contradicts the printed badge; capping it to budget makes it a no-op precisely when it is set. |
| **Raising `MAIN_SLACK_PER_ENTRY_PT` to cover the progression case** | It is the bound that hid the defect. It goes to zero (a 0.01pt tolerance), not up. |

---

## 9. Reproduction

Everything above was produced from this tree. The scratch work lives in
`…/scratchpad/` (nothing in the repo was modified):

- **Re-derive the reported terms:** build the workspace at
  `…/scratchpad/dogfood/ws` with `node bin/cvx.js build --json`; the numbers in
  §2.5 come straight out of `diagnostics`.
- **The render diff:** a ~60-line script — plan with `planTwoColumn`, run
  `pdftotext -bbox`, group main-column words by exact `yMin`, difference role
  tops, subtract 33.75. This is the §5.1 prototype and produced every delta in
  §2.2–2.3.
- **The dash column:** render `BulletList`'s row structure and a bare `<Text>`
  at the same container width; the x-offset between the two first words is the
  indent (10.1165pt).
- **The end-to-end validation:** the repo copied to `…/scratchpad/cvxfix`,
  `layout.js` and `measure.js` patched per §3.1–3.6, `node scripts/build-lib.js`,
  then the real CLI over the motivating CV, the shipped scaffold and the shape
  corpus. Results: every shape 0.00pt, 32/32 fixtures unchanged in page count,
  85 existing tests green, and the motivating CV's two-page deficit 49.10pt →
  **2.40pt**.

The patch used for that validation is not a proposed diff — it omits the
diagnostics work, the token wiring and the doc updates, and its comments are
throwaway. It exists to prove the arithmetic in §3.6 against paper.
