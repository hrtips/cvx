# Design: P3 — Surface. Making the design expressible

*2026-08-13. The concrete half of `design-cvx-as-instrument.md` §4.3. That
document holds the reasoning and the invariants; this one holds key lists, bounds,
shapes and signatures — the things an implementer needs and a reviewer can argue
with.*

*Created because the red-team review found §4.3 specified a safety **mechanism**
without the **table** it depends on: a resolver shipped with every token scalable
and no floors populated passes every structural assertion, since the assertions
test identity and not policy. The table below is the policy. **It is a draft for
maintainer review — the three flagged rows are genuine judgement calls, not
derivations.***

---

## 1. What P3 exposes, and through which channel

**Channel: `layouts/*.yaml` and `config.yaml` only. Never an MCP argument.**
Design doc §6 rejects MCP levers because the file channel is reviewable, diffable
and the user's; §4.3 previously proposed capabilities without naming a channel,
which let an implementer land them as `build_pdf` parameters without contradicting
a sentence. This is that gap closed.

Three surfaces, in ascending risk:

| Surface | Where | Shape |
|---|---|---|
| Page geometry | `layouts/*.yaml` → `geometry:` | Closed key list, §2 |
| Spacing | `layouts/*.yaml` → `spacing:` | Per-token, whitelisted, §3 |
| Type scale | `layouts/*.yaml` → `typeScale:` | **One multiplier**, not per-token, §4 |

Chrome (`photoHeight`, `tagPx`, radii, divider widths) is **not exposed in P3**.
It is decorative, it is where a bad value looks broken rather than tight, and
nothing in the measured page-3 defect needs it.

---

## 2. Geometry — and the misrepresentation to fix first

### 2.1 The problem, before the feature

`template/cv-content/layouts/two-column.yaml:9-15` already ships this, and CVX
ignores every line of it:

```yaml
geometry:
  size: A4
  topBar: 30
  sidebarFraction: 0.37
  mainPadding:     [27, 33, 54, 30]     # top, right, bottom, left
  contPadding:     [24, 33, 54, 30]
  sidebarPadding:  [13.5, 16.5, 21, 24]
```

The values mirror `tealTheme.geometry` faithfully, which is what makes it
convincing. `schema/v1/cvx.schema.json:488-492` declares the block
`additionalProperties: true` with no properties, so any key validates and is
discarded — edit `sidebarFraction` to `0.30` and nothing happens, silently.

**Done 2026-08-13:** the block is deleted from both scaffolded layouts
(`two-column.yaml`, `single-column.yaml`), each replaced by a comment stating that
page geometry comes from the theme and is not settable per CV yet, and saying what
used to be there. Deleting beat commenting out — a commented block invites the
same mistake back.

**Deliberately NOT done: making `validate` reject a `geometry:` block.** It was
proposed here and is the wrong move. The template *shipped* that block, so every
user who has ever run `cvx init` has one — rejecting it would fail the build of
every existing scaffolded workspace, to protect them from a key that does nothing.
The schema keeps accepting it (`additionalProperties: true`, "Reserved. Currently
ignored"). If P3 wants a tripwire for typos, the honest form is a **notice** on an
ignored `geometry:` block, not a hard error, and turning the block into a closed
key list at the same moment it starts doing something. Needs a decision at P3
time; recorded so the tempting one-line "just reject it" is not taken by default.

### 2.2 The vocabulary decision

The template and the theme disagree, so turning geometry on is a naming decision:

| Template (public) | Theme (internal) | Decision |
|---|---|---|
| `size: A4` | `pageWidth` / `pageHeight` | **Keep `size`**, an enum. Users think in paper names; two raw point values invite an A4/Letter mismatch that only shows up when printed |
| `sidebarFraction` | `sidebarFraction` | Already agree |
| `topBar` | `topBar` | Already agree |
| `mainPadding: [t,r,b,l]` | `mainPad: {top,…}` | **Keep the array.** CSS-order shorthand, terser to write and diff, and it is what already shipped |
| `contPadding` | `contPad` | Keep the public name |
| `sidebarPadding` | `sidebarPad` | Keep the public name |
| — | `singleColumnMargin` | **Not exposed.** ATS variant is auto-flowed; changing its margin cannot be previewed by `plan_layout` |

### 2.3 Bounds

| Key | Default | Min | Max | Why this bound |
|---|---|---|---|---|
| `size` | `A4` | — | — | Enum: `A4` \| `Letter`. Not numeric |
| `sidebarFraction` | `0.37` | **`0.28`** | **`0.45`** | ⚠️ **Flagged — see §6.1.** Below ~0.28 the photo and contact rows cannot fit their content; above ~0.45 the main column cannot hold a readable bullet line |
| `topBar` | `30` | `0` | `60` | `0` is legitimate (no band) |
| `mainPadding`, `contPadding`, `sidebarPadding` | see above | `12` per edge | `72` per edge | 12pt ≈ 4.2mm; below that consumer printers clip. 72pt = 1in, past which the page is mostly margin |

---

## 3. Spacing — per-token, whitelisted

`spacing` has exactly 23 tokens. **16 are scalable, 7 are not.** Per-token
overrides, each with an explicit min/max, so the assertion is one per token as
§4.3 requires.

### 3.1 Scalable (16)

Pure vertical whitespace. These are the "tighten this section" lever, and none of
them affects text wrapping, so none of them re-derives a line count.

| Token | Default | Min | Max |
|---|---|---|---|
| `sectionGap` | 13.5 | 8 | 24 |
| `sectionTitleMb` | 9 | 4 | 16 |
| `sidebarTitleMb` | 7 | 3 | 14 |
| `sectionTitlePb` | 3 | 1.5 | 6 |
| `bulletGap` | 4.5 | 2 | 9 |
| `summaryBulletGap` | 7.5 | 3 | 13.5 |
| `entryMb` | 11 | 6 | 20 |
| `entryMetaMt` | 1.5 | 0 | 4 |
| `locationMb` | 3 | 0 | 6 |
| `descMt` | 3 | 0 | 6 |
| `descMb` | 7.5 | 3 | 13.5 |
| `progMt` | 6 | 2 | 12 |
| `progMb` | 7.5 | 3 | 13.5 |
| `progPy` | 1.5 | 0.5 | 3 |
| `contactRowMb` | 6.75 | 3 | 12 |
| `spacer` | 27 | 0 | 60 |

`sectionGap` and `entryMb` are the two highest-leverage: the first is the primary
sidebar lever, the second the primary main-column one.

**⚠️ Prerequisite discovered 2026-08-14, and it blocks two rows of this table:
`bulletGap` and `summaryBulletGap` are write-only today.** `BulletList.jsx`
defaults `gap = 4.5` and both call sites hardcode it (`gap={4.5}` in ExpItem,
`gap={7.5}` in SummarySection), while `entryH`/`summaryH` read the theme tokens.
Editing either token therefore moves the *packing model* and not one rendered
pixel — exposing them per CV before wiring them would hand a caller a lever that
desynchronises measurement from render, which is strictly worse than no lever.
The wiring (or the tokens' deletion) is being designed in
`design-layout-fidelity.md`; that lands first. Found during the pagination
post-mortem (`postmortem-pagination-fidelity.md`), where a four-level sweep of
these tokens measured a fiction.

### 3.2 Not reachable (7)

| Token | Default | Why excluded |
|---|---|---|
| `safety` | 15 | **The overflow backstop, not decoration.** Lowering it is precisely how a caller would talk the packer into overflowing. Must be unreachable, not merely bounded |
| `bulletIndent` | 9 | Documented as "dash + gap offset for bullet width calc" — feeds the measurer directly. Changing it re-derives every line count and every §5 measure-vs-render result |
| `progPl` | 7.5 | Horizontal indent → wrap width → line counts |
| `itemPl` | 7.5 | Same |
| `iconWidth` | 8 | Horizontal; affects contact-row wrapping |
| `iconMr` | 6.75 | Same |
| `iconMt` | 1 | A 1pt alignment nudge. No useful range exists |

The split is not arbitrary: **vertical gaps are safe because they move blocks;
horizontal offsets are unsafe because they change what fits on a line**, and a
line count is the input to every measurement §5 pins.

---

## 4. Type scale — one multiplier, deliberately not per-token

```yaml
typeScale: 0.97    # default 1.0
```

| | Value |
|---|---|
| Range | `0.92` – `1.08` |
| Hard floor, any resolved size | **`6.5pt`** ⚠️ flagged, §6.2 |
| Hard ceiling, any resolved size | `14pt` |
| Per-token font-size access | **None** |

**Why one multiplier and not per-token.** Per-token font sizes let a caller
destroy the visual hierarchy one step at a time — 20 named styles from `name` at
11pt down to `sidebarSection` at 7pt encode the hierarchy, and their *ratios* are
the design. A single multiplier moves all of them together, which is what
"drop the body size a quarter point" (design doc §4.3) actually wants: 9 → 8.75
is `0.972`, inside the range.

This is also what makes the bound structural rather than numeric. The resolver
copies `typography` **by reference** and multiplies only `size` and `leading`
keys; every other property is the same object identity as the theme's. `weight`,
`spacing`, `fontFamily` and `charWidthFraction` cannot be reached at all, and
that is assertable by `toBe` rather than by arithmetic.

### Resolver contract

```
themeFor(spec) → theme                      // already needed; see §5
resolveSurface(theme, layout) → theme'      // new in P3
```

`resolveSurface` must satisfy, as tests:

1. **Identity where nothing is overridden.** With no `geometry`/`spacing`/`typeScale`
   in the layout, `resolveSurface(t, l) === t` — the same object, not a deep-equal
   copy. Cheapest possible proof that the default path cannot drift.
2. **Unreachability by identity.** `result.spacing.safety === t.spacing.safety`
   and `result.typography.body.weight === t.typography.body.weight` for every
   input, including hostile ones.
3. **One assertion per scalable token** that its resolved value lies within the
   §3.1 bounds, for inputs above, below and inside the range.
4. **Clamp, don't reject.** An out-of-range value resolves to the nearest bound
   and emits a `notices` entry naming the token and both values. Rejecting would
   fail a build over a spacing preference, which is not proportionate; silently
   accepting is what §2.1 is a cautionary tale about.

---

## 5. Prerequisite, non-negotiable

Six harness modules hardcode `tealTheme`. No fixture has ever varied a theme, so
the moment P3 makes geometry per-CV, those modules measure the wrong document —
and §5's measure-vs-render agreement (sidebar exact to 0.01pt) would be
**re-derived against the wrong document and still pass**. Thread `themeFor(spec)`
through them *before* any of §2–§4 lands. This is the same prerequisite design doc
§4.3 records; it is repeated here because it is the one item that invalidates the
evidence rather than merely breaking a test.

---

## 6. Flagged for maintainer review

Three rows above are judgement calls I could not derive from anything measured.

### 6.1 `sidebarFraction` — **MEASURED 2026-08-13, and it is not what §2.3 assumed**

Rendered the (now two-page) demo at 0.25 / 0.28 / 0.32 / 0.37 / 0.45 / 0.50 and
looked at each:

| value | pages | splits | note |
|---|---|---|---|
| 0.25 | 3 | **2** | sidebar fill 0.95 / 0.99; contact email visually clipped |
| 0.28 | 3 | 0 | |
| 0.32 | 3 | 0 | |
| **0.37** | **2** | 0 | the shipped value |
| 0.45 | 3 | 0 | page 3 now holds **main** at 0.23, sidebar `null` |
| 0.50 | 3 | 0 | page 3 holds main at 0.43 |

Three results worth carrying into P3, none of them anticipated:

1. **0.37 is already optimal, and it is a knife edge.** Every other value tested
   costs a page. ±0.05 in either direction breaks the two-page result.
2. **It is not a monotonic lever — it trades which flow binds.** Below 0.37 the
   sidebar needs the third page; at 0.45 and above the *main column* does. There
   is no direction that is simply “less”.
3. **Narrowing the sidebar makes things worse, which falsifies the motivating
   example in `design-cvx-as-instrument.md` §4.3** — *“an LLM that looks at a page
   and thinks narrow the sidebar … can do none of it.”* A narrower sidebar wraps
   more, so it gets *taller*; at 0.25 it also forces two section splits. The
   control the design doc holds up as the obvious win is, for this document,
   harmful.

**Decision (maintainer, 2026-08-13): keep it exposed, and record what it actually
does.** Bounds stay `0.28 – 0.45` as *legibility* limits, with the lower one now
evidenced rather than guessed (see §6.4). But P3 must not present this as a
page-count control: it is an expert trade between two flows, and the spacing
tokens in §3.1 are where the predictable leverage lives.

### 6.4 Clipping: a numeric lower bound cannot be content-independent

Looking at the 0.25 render surfaced a **defect in the shipped product**, unrelated
to P3. At the *default* 0.37, a realistic long email renders as
`bruce.wayne.field.commander@wayne-enterprises-inter` — clipped mid-token at the
sidebar’s edge. `validate --strict` reports `ok: true` with no warnings, and no
width guard exists anywhere in the engine.

Two consequences:

- **It violates Invariant 0 as stated.** That invariant says the renderer never
  “omits, **clips**, or hides” content. This clips.
- **The content oracle is structurally blind to it.** `checkCompleteness` reads
  the `pdftotext` layer, and the full email *is* in the text layer — only the
  glyphs are cut off. So Invariant 0 is enforced as “present in the text stream”
  when it is written as “visible on the page”. This is a second gap in the same
  guard, independent of the layout-omission conflation fixed on 2026-08-13.
- **Therefore no fixed lower bound is ever sufficient.** An unbreakable token —
  email, URL — can exceed any width. A bound is necessary but not sufficient; P3
  needs a measured precondition (“the longest unbreakable sidebar token fits the
  resolved column width”) or an explicit warning, not just min/max arithmetic.

**Decided fix (maintainer, 2026-08-13): wrap rather than clip** — long unbreakable
contact values break across lines so every glyph is visible, which is what
Invariant 0 requires. Known cost: it changes sidebar heights, so §5’s 0.01pt
measure-vs-render agreement must be re-derived, and a broken email reads slightly
awkwardly. Not yet implemented; this is engine work in no current phase.

### 6.2 The `6.5pt` legibility floor — **DECIDED 2026-08-13**

**One floor, 6.5pt, applied to every resolved size.** The theme already ships 7pt
text (`sidebarSection`, `corner`), so the floor cannot be above 7 without
invalidating the shipped design — which also means a floor *at* 7 would permit no
downward scaling at all. 6.5 leaves roughly one step of headroom.

The maintainer chose the single floor over the two alternatives considered: a
per-role floor (body prose ≥ 8, labels ≥ 6.5), which is more honest about what a
recruiter reads in volume but needs a second table; and refusing to scale sidebar
text at all, which is safest but removes the sidebar as a tightening lever —
exactly where the demo's pressure sits. The accepted cost is that 6.5pt body
prose is permissible in principle. One assertion per token, as §4 requires.

### 6.3 Clamp-and-notice rather than reject

§4 contract item 4. Clamping keeps a build alive at the cost of doing something
other than what the file said. Rejecting is more honest and more annoying. I chose
clamping because the alternative fails a whole build over a spacing preference,
but this is a product-feel call rather than a technical one.
