// Pure-JS page packing — no DOM, no browser.
// All dimensions in typographic points (pt).
//
// TWO FLOWS, ONE ENGINE (C3 / design doc §4.5). The designed layout has two
// semantically-pinned columns: experience flows down the main column, the
// sidebar sections flow down the sidebar. Both are measured, both are packed
// by the same front-load first-fit engine (`packBlocks`) against per-page
// budgets derived from one shared box (`bodyHeight`), and the document takes
// `P = max(P_main, P_sidebar)` pages (`planTwoColumn`). Nothing is dropped to
// make a flow fit: a block that does not fit is SPLIT at an item boundary
// (sidebar section) or a bullet boundary (experience entry) — C3b — and one
// that cannot be split is placed anyway and FLOWS (see packBlocks' contract
// and Invariant 0).
//
// Pre-C3 only the main column was packed; the sidebar was a static
// section->page-kind assignment repeated verbatim onto every continuation
// page — which both duplicated sections across pages and silently overflowed
// whenever the column was taller than the sheet.
//
// WHAT IS PACKED AND WHAT IS NOT — an explicit decision, not an accident
// (recorded in C3b review; design doc §4.1 says "everything on the page is a
// Block", and this engine does not do that).
//
//   PACKED (measured, distributed across pages, splittable):
//     experience entries (at bullet boundaries), sidebar sections (at item
//     boundaries).
//   FIXED (measured, SUBTRACTED from a page's budget, never distributed):
//     the summary, the page-1 spacer, the "Experience" section title, the
//     page-number badge, both columns' padding, `spacing.safety`, and the
//     per-page identity block.
//
// The fixed set is what the layout YAML pins to a page kind — it is designer
// intent about where things go, not a bin-packing question — so a greedy
// front-load packer gains nothing by owning it. The cost is real and is the
// reason a whole class of overflow exists: a summary taller than the main
// column cannot be paginated by anything here, because the summary is not a
// block. `overflowWarnings()` reports exactly that case in words, and
// `edge-summary-exceeds-page` pins it.
//
// C4 REVISITED "make the summary a packed block" AND DECIDED AGAINST IT, with
// the cost measured on both sides (2026-08-02):
//
//   What it would buy. Sweeping the shipped scaffold's summary length: the
//   defect starts at 14 bullets (summaryH 651.9pt), where page 1's experience
//   budget goes negative. At 14 the render still comes out at the planned 3
//   sheets with correct badges (the overshoot is 22pt, absorbed); at 20
//   bullets (296pt over) it is 4 physical sheets whose FIRST sheet carries no
//   badge at all and whose second reads "1 of 3". That numbering defect — not
//   wasted space — is the whole prize. Every one of the 32 curated fixtures
//   measures summaryH 422.4pt, a third of the cliff; only the synthetic
//   `edge-summary-exceeds-page` reaches it.
//
//   What it would cost. The summary would become flow[0] of the main column
//   with a bullet-level splitter, which makes that flow HETEROGENEOUS — and
//   `packExperiences` returns `page1Experiences`/`continuationChunks` typed as
//   ExperienceEntry[]. Changing that shape reaches `LayoutPlanPage.mainBlocks`,
//   `CVDocument.mainSlotKeys` + `registry.renderSlot('summary')` (which today
//   renders every bullet and would need a per-page slice, like the sidebar),
//   the "Experience" title (fixed page-1 content that must move with the
//   summary if the summary spills), `page1ExperienceCount`'s meaning, and four
//   harness modules (blocks.js, structuralFacts.js, contentOracle.js, the
//   mirror test). It also changes the layout YAML's meaning a second time:
//   after C3a made `pages.*.sidebar` mean ORDER rather than PAGE, this would do
//   the same to `pages.first.main` — a user who wrote `first: [summary]` would
//   find the summary continuing overleaf.
//
//   The decision: NOT WORTH IT NOW. It is a C3a-sized change to the plan/render
//   contract, in exchange for correct page numbering on documents whose summary
//   is taller than a full column — a shape no real CV in the corpus has, and
//   one the build already warns about by name. Revisit it if and when the main
//   flow has to become heterogeneous for another reason (per-page main buckets,
//   or a `summary` that the agent loop may repaginate); doing it then costs the
//   plumbing once instead of twice.
//
// The theme argument provides all typography/spacing/geometry values so the
// estimator stays in sync with what components actually render.
//
// ── WHAT IS PUBLIC, AND WHAT IS MERELY EXPORTED (C4) ───────────────────────
//
// This module exports 25 names. Only nine of them are API. The rest are
// exported so the C0 harness can measure the engine with the engine's own
// formulas instead of a hand-copied second implementation (C0's mirror-drift
// finding) — a testing affordance, not a commitment, and C7 must not document
// them as one.
//
//   PUBLIC — imported by shipped code, or part of the plan shape C6's
//   diagnostics and C7's docs are built on. Changing one of these is a
//   breaking change:
//     planTwoColumn, overflowWarnings, bodyHeight, contactRows,
//     sidebarFlowKeys, isIdentityKey, isContinuedSlice, sectionTitleLabel
//
//   A name is only public if the public surface is ENOUGH TO CALL IT. C4's
//   first cut listed `identityH` here and review caught it: its `sm` parameter
//   is `SidebarMetrics`, i.e. `ReturnType<typeof deriveSidebarMetrics>`, and
//   that function is harness-only — a promise no caller could keep without an
//   unpromised one. It is demoted below. C6 does not lose anything: the plan
//   already carries `page.identity` (which slots are injected), and identity
//   HEIGHT is already inside `sidebarFill.budget`. `layout.api.test.js`
//   enforces this rule for every public name, not just that one.
//
//   EXPORTED FOR THE HARNESS, no compatibility promise — every one of these
//   carries `@internal` in its own docblock, and `layout.api.test.js` proves
//   the two lists agree AND that no shipped module imports one of them:
//     deriveMetrics, deriveSidebarMetrics, lineCount, NATURAL_LINE_HEIGHT,
//     summaryH, entryH, packBlocks, packExperiences, packSidebar, identityH,
//     sidebarSliceH, sidebarSectionH, sidebarSectionItems, sidebarItemCount,
//     SIDEBAR_SECTION_KEYS, CONTINUED_SUFFIX, assertShrinks
//
// `packBlocks`/`packExperiences`/`packSidebar` are internal on purpose despite
// being the engine's heart: they are reachable through `planTwoColumn`, and
// pinning their signatures would freeze the packer's shape before the sprint
// has decided what it is (C4's evaluation moved `packSidebar`'s and
// `packExperiences`' argument lists twice in one afternoon).
//
// MEASUREMENT INJECTION (C2 / design doc §5): this file ships in the Vite
// browser bundle (the in-app preview), so it must stay isomorphic — no
// fontkit, no node:fs. `entryH`/`summaryH`/`packExperiences` all take an
// OPTIONAL trailing `measure` argument shaped
// like `src/pdf/measure.js`'s `createMeasurer()` return value
// (`{ lineCount(text, size, maxWidth, opts) }`). render.js (which has
// `fontsDir`) builds that measurer with real fontkit metrics against the
// pinned Lato TTFs and injects it; when `measure` is omitted (the browser
// preview, or any caller that doesn't pass one), every call site falls back
// to the char-width estimate below — unchanged from before C2, still a
// rough (~20-34%-loose) but instant, dependency-free approximation.

import { TWO_COLUMN_LAYOUT } from './defaultLayouts.js'
import { tealTheme } from './themes/teal.js'

/** @typedef {ReturnType<typeof deriveMetrics>} Metrics */

/**
 * Flatten one theme into the numbers every height formula in this file reads.
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function deriveMetrics(/** @type {import('./types.js').Theme | undefined} */ theme) {
  const t = theme ?? tealTheme
  const ty = t.typography
  const sp = t.spacing
  const g = t.geometry
  const ch = t.chrome

  const mainW = g.pageWidth * (1 - g.sidebarFraction)
  const innerW = mainW - g.mainPad.left - g.mainPad.right
  const bulletW = innerW - sp.bulletIndent

  return {
    // Page geometry
    pageH: g.pageHeight,
    topBar: g.topBar,
    /** height of the box both columns live in — the ONE definition, see bodyHeight() */
    bodyH: bodyHeight(t),
    mainPad: g.mainPad,
    contPad: g.contPad,
    // The page-number badge (TwoColumnTemplate's `cornerWrap`/`corner`) is a
    // sibling of the padded content View INSIDE the main column's flex
    // column, so it eats `cornerHeight` pt of the column on every page —
    // main content only ever gets `bodyH - pad - cornerHeight`. See
    // mainColumnBudget().
    cornerH: ch.cornerHeight,
    innerW,
    bulletW,
    // Typography
    sectionTitleSize: ty.sectionTitle.size,
    sectionTitleLeading: ty.sectionTitle.leading,
    roleSize: ty.role.size,
    roleLeading: ty.role.leading,
    bodySize: ty.body.size,
    bodyLeading: ty.body.leading,
    metaSize: ty.meta.size,
    metaLeading: ty.meta.leading,
    descSize: ty.description.size,
    descLeading: ty.description.leading,
    // Spacing
    sectionTitlePb: sp.sectionTitlePb,
    sectionBorderWidth: ch.sectionBorderWidth,
    sectionTitleMb: sp.sectionTitleMb,
    bulletGap: sp.bulletGap,
    summaryBulletGap: sp.summaryBulletGap,
    entryMb: sp.entryMb,
    entryMetaMt: sp.entryMetaMt,
    locationMb: sp.locationMb,
    descMt: sp.descMt,
    descMb: sp.descMb,
    progMt: sp.progMt,
    progMb: sp.progMb,
    progPy: sp.progPy,
    dividerHeight: ch.dividerHeight,
    dividerMargin: ch.dividerMargin,
    spacer: sp.spacer,
    safety: sp.safety,
    cw: ty.charWidthFraction
  }
}

function lh(/** @type {number} */ pt, /** @type {number} */ leading) {
  return pt * leading
}

/**
 * The height of the two-column body row — the box BOTH columns live in, and
 * therefore the single number every page budget in this file is derived from.
 *
 * `TwoColumnTemplate` sets this as the body View's `minHeight` (minHeight,
 * never height — a fixed height authorises yoga to compress overflowing
 * children into overprinted glyphs; see that file). It is exported from here
 * rather than recomputed there so the template and the packer can never
 * drift: if the packer thought a column had more room than the box actually
 * has, the surplus silently overflows onto an extra physical page (C1's
 * finding (b), and the pw-09 sliver pages this slice removes).
 *
 * `pageHeight - topBar` is exact, not slack-shaved: the `<Page>` has no
 * padding, so the top bar and the body tile the sheet completely. The slack
 * that keeps rounding out of a page-break decision lives in `spacing.safety`
 * (subtracted from every budget below) and in `quantize()`, not here —
 * shaving minHeight instead would just trade the sliver for a visible strip
 * of unpainted sidebar at the foot of every page.
 */
export function bodyHeight(/** @type {import('./types.js').Theme | undefined} */ theme) {
  const g = (theme ?? tealTheme).geometry
  return g.pageHeight - g.topBar
}

/**
 * Quantize a computed height/budget to hundredths of a point (design doc §0
 * G-b / review round 2, SHOULD #6) before it takes part in a page-break
 * decision. Real font metrics (measure.js's fontkit glyph advances) are
 * ordinary IEEE-754 float arithmetic — deterministic and bit-identical
 * across conformant architectures for the same operation sequence — but
 * `entryH`/`summaryH` sum many small per-line/per-bullet terms, and this is
 * cheap, defensive insurance against a few-ULP divergence (a different
 * summation order, a future SIMD/native-accelerated font backend, ...) ever
 * flipping a knife-edge `used + eh > budget` comparison — and hence a page
 * count, and hence every byte after it — between two machines building the
 * exact same content. 0.01pt is far finer than anything visually
 * meaningful and far coarser than realistic float noise, so this can only
 * ever affect a hypothetical knife-edge case, never a real packing
 * decision. Applied at both ends: `entryH`/`summaryH`'s own return values
 * (so accumulation starts from already-quantized terms) AND every
 * `used + dh + eh > budget` comparison itself (so the comparison is safe
 * regardless of which term the noise would have entered through).
 */
function quantize(/** @type {number} */ pt) {
  return Math.round(pt * 100) / 100
}

/**
 * Char-width line-count ESTIMATE — the pre-C2 default, kept as the browser-
 * preview fallback (isomorphic: no fontkit). `cw` is the theme's
 * `charWidthFraction`, an average-glyph-width-as-a-fraction-of-point-size
 * fudge factor. Measured against real rendering (C0's measure-vs-render
 * diff harness), this overshoots ordinary English text by roughly 20-34% —
 * safe-direction-loose, never under-shoots on the corpus tested — which is
 * exactly why it's a fallback now rather than the only option.
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function lineCount(
  /** @type {string} */ text,
  /** @type {number} */ pt,
  /** @type {number} */ w,
  /** @type {number} */ cw
) {
  const cpl = Math.max(1, Math.floor(w / (pt * cw)))
  return Math.max(1, Math.ceil(text.length / cpl))
}

/** `measure` (if given) takes priority; the char-width estimate above is always the fallback — see module docblock. */
function countLines(
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string | undefined} */ text,
  /** @type {number} */ pt,
  /** @type {number} */ w,
  /** @type {number} */ cw,
  /** @type {import('./types.js').MeasureOpts | undefined} */ opts
) {
  if (measure?.lineCount) return measure.lineCount(text ?? '', pt, w, opts)
  return lineCount(text ?? '', pt, w, cw)
}

/**
 * The line height react-pdf/textkit gives a `<Text>` with no explicit
 * `lineHeight` style: `(ascent - descent + lineGap) / unitsPerEm`, which for
 * every bundled Lato face is exactly 1.2 (ascent 1974, descent -426, lineGap
 * 0, unitsPerEm 2000). Plenty of sidebar styles omit `lineHeight` (the
 * education institution/period rows, the competency tags, the referee name,
 * ...) so the sidebar measurement below needs this number.
 *
 * This constant is the ISOMORPHIC FALLBACK only: when a measurer is injected
 * (every real CLI/MCP entry point), `rowH` reads the value out of the actual
 * font instead (`measure.naturalLineHeight`), so a font swap changes the
 * measurement rather than silently invalidating it. measure.test.js pins the
 * two together, so a font or fontkit bump that shifts the metrics fails loudly.
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export const NATURAL_LINE_HEIGHT = 1.2

/**
 * Advance width of a single-line string. `measure` (if given) takes priority;
 * the fallback is the same average-glyph-width fudge `lineCount()` uses, so
 * the browser preview stays isomorphic (and equally advisory).
 */
function textW(
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ text,
  /** @type {number} */ size,
  /** @type {number} */ cw,
  /** @type {import('./types.js').MeasureOpts} */ opts = {}
) {
  if (measure?.widthOf) return measure.widthOf(text, size, opts)
  return text.length * size * cw
}

/**
 * Height of one text row: its wrapped line count x its line box.
 * `leading` defaults to NATURAL_LINE_HEIGHT (no explicit `lineHeight` style).
 *
 * Verified exact against `pdftotext -bbox` on a real render — the yMin of a
 * `<Text>`'s first word IS its line-box top, so consecutive rows' observed
 * offsets equal `lines * size * leading + margins`. (With an explicit
 * `lineHeight > 1.2` the extra leading lands BELOW the baseline, which is why
 * the row's *glyph* box reads shorter than its line box.)
 */
function rowH(
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string | undefined} */ text,
  /** @type {number} */ size,
  /** @type {number} */ width,
  /** @type {number} */ cw,
  /** @type {import('./types.js').MeasureOpts & { leading?: number }} */ opts = {}
) {
  const { leading, ...style } = opts
  const lineBox = leading ?? measure?.naturalLineHeight?.(style) ?? NATURAL_LINE_HEIGHT
  return countLines(measure, text, size, width, cw, style) * size * lineBox
}

function calcTitleH(/** @type {Metrics} */ m) {
  return (
    lh(m.sectionTitleSize, m.sectionTitleLeading) +
    m.sectionTitlePb +
    m.sectionBorderWidth +
    m.sectionTitleMb
  )
}

function calcDividerH(/** @type {Metrics} */ m) {
  return m.dividerHeight + m.dividerMargin * 2
}

// Bullet/summary text renders via BulletList.jsx with no explicit
// fontWeight/fontStyle — i.e. the theme's default (400, upright). Not
// theme-configurable today, so it's a literal here rather than a `m` field.
const BODY_STYLE = { weight: 400, italic: false }
// The entry description renders via ExpItem.jsx's hardcoded `fontStyle:
// 'italic'` — independent of the theme object, so this mirrors that
// component fact rather than deriving from theme data that doesn't exist.
const DESC_STYLE = { weight: 400, italic: true }

/**
 * Measured height of the whole summary block (title + bullet list).
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function summaryH(
  /** @type {import('./types.js').Summary} */ summary,
  /** @type {Metrics} */ m,
  /** @type {import('./types.js').Measurer | undefined} */ measure = undefined
) {
  let h = calcTitleH(m) + m.descMt // title + bullet list margin-top
  for (const b of summary) {
    const txt = typeof b === 'string' ? b : b.text
    h +=
      countLines(measure, txt, m.bodySize, m.bulletW, m.cw, BODY_STYLE) *
      lh(m.bodySize, m.bodyLeading)
  }
  h += (summary.length - 1) * m.summaryBulletGap
  return quantize(h)
}

/**
 * Measured height of one experience entry — whole, or the `[startBullet,
 * endBullet)` slice of it a split produced.
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function entryH(
  /** @type {import('./types.js').ExperienceEntry} */ e,
  /** @type {Metrics} */ m,
  /** @type {import('./types.js').Measurer | undefined} */ measure = undefined
) {
  if (e.isContinuation) {
    let h = lh(m.roleSize, m.roleLeading)
    const visible = (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet)
    if (visible.length > 0) {
      h += m.descMt
      for (const b of visible) {
        const txt = typeof b === 'string' ? b : b.text
        h +=
          countLines(measure, txt, m.bodySize, m.bulletW, m.cw, BODY_STYLE) *
          lh(m.bodySize, m.bodyLeading)
      }
      h += (visible.length - 1) * m.bulletGap
    }
    h += m.entryMb * (15 / 11) // 11.25pt scaled from entryMb
    return quantize(h)
  }

  let h = 0
  h += lh(m.roleSize, m.roleLeading)
  h += m.entryMetaMt + lh(m.bodySize, m.bodyLeading)
  if (e.location) h += m.locationMb + lh(m.metaSize, m.metaLeading)
  if (e.description) {
    const dl = countLines(measure, e.description, m.descSize, m.innerW, m.cw, DESC_STYLE)
    h += m.descMt + dl * lh(m.descSize, m.descLeading) + m.descMb
  }
  if (e.progression?.length) {
    h += m.progMt + m.progMb
    h += e.progression.length * (m.progPy * 2 + lh(m.metaSize, 1.4))
  }
  const visibleBullets = (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet)
  if (visibleBullets.length > 0) {
    h += m.descMt
    for (const b of visibleBullets) {
      const txt = typeof b === 'string' ? b : b.text
      h +=
        countLines(measure, txt, m.bodySize, m.bulletW, m.cw, BODY_STYLE) *
        lh(m.bodySize, m.bodyLeading)
    }
    h += (visibleBullets.length - 1) * m.bulletGap
  }
  h += m.entryMb * (15 / 11) // 11.25pt
  return quantize(h)
}

// ── The generic packing engine (C3, design doc §4.4 `greedy`/`frontload`) ───

/**
 * @template {{ height: number, gapBefore?: number }} B
 * @typedef {{ blocks: B[], used: number, budget: number }} PackedPage
 */

/**
 * A block that can be cut at an internal boundary (a sidebar section at an
 * item boundary, an experience entry at a bullet boundary — design doc §2.4 /
 * §6). `split(room, forceMinimum)` returns the largest legal prefix whose
 * measured height fits `room`, paired with the remainder, or `null` when no
 * legal cut exists.
 *
 * Legality is the splitter's business, not the packer's, and it always means
 * at least one item on each side — which is what keeps a section title from
 * being orphaned at the foot of a page with its first item overleaf.
 *
 * `forceMinimum` is set only by rule 1c below (the block is alone on a page,
 * does not fit, and would not fit a fresh empty page either): the splitter then
 * returns the smallest legal prefix even though it overflows, so the
 * irreducible case (design doc G7 — a single ITEM taller than a page)
 * overflows by one item instead of by a whole section.
 *
 * **Obligation on every implementation: `tail` must be STRICTLY SMALLER than
 * the block it came from** — fewer items, and therefore lower measured height.
 * `packBlocks` carries the tail to the next page and would otherwise spin
 * forever on an unchanged remainder. Both splitters in this file assert it
 * (`assertShrinks`), and `packBlocks` bounds its own iteration count as a
 * second line of defence, so a violation surfaces as a named error rather than
 * a hang.
 *
 * KNOWN DEBT, carried out of C3b and still open after C4 (recorded here rather
 * than in a planning doc, because this typedef is the thing that would change):
 * this is a DECISION function — "given this much room, where would you cut?" —
 * where design doc §4.1 specifies an ENUMERABLE `splittable: { offsets,
 * costPerSplit }`. Nothing needs the enumeration today; the objective that
 * would have priced each offset (`breakPenalty`) was C4's, and C4 was deferred.
 * The next consumer is C6's split diagnostics ("this section was cut here, and
 * these were the alternatives") — whoever builds that must reshape this first,
 * because a decision function cannot report the road not taken.
 *
 * @template B
 * @typedef {(room: number, forceMinimum: boolean) => { head: B, tail: B } | null} SplitFn
 */

/**
 * Guard for `SplitFn`'s strict-decrease obligation, applied at the point of
 * production so a dishonest cut is named where it is made rather than
 * diagnosed later from a hang.
 *
 * Exported only so the guard itself can be tested: both real splitters get `k`
 * from `largestFittingPrefix`, which constrains it to `[1, n-1]`, so they
 * cannot reach this throw — which is the point (defence in depth), and also
 * why the test calls it directly rather than contriving a lie.
 *
 * @template {{ height: number }} B
 * @param {string} what          block identity, for the message
 * @param {number} beforeItems   items in the block being cut
 * @param {number} afterItems    items left in the tail
 * @param {B} tail
 * @param {number} beforeHeight
 * @returns {void}
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function assertShrinks(what, beforeItems, afterItems, tail, beforeHeight) {
  if (afterItems >= beforeItems || quantize(tail.height) > quantize(beforeHeight)) {
    throw new Error(
      `layout: split of ${what} did not shrink (${beforeItems} -> ${afterItems} items, ` +
        `${beforeHeight} -> ${tail.height} pt). A split tail must be strictly smaller; ` +
        `packBlocks would otherwise never terminate.`
    )
  }
}

/**
 * Pack an ordered block flow onto pages, front-loaded: fill page *i* with as
 * many leading blocks as fit its budget, then start page *i+1*. This is the
 * exact greedy first-fit loop `packExperiences()` has always used for the
 * main column, lifted out so the sidebar flow can be packed by the same
 * code (design doc §4.4 — the `greedy`/front-load policy; `balance` and
 * `optimal` are later chunks and are deliberately NOT implemented here).
 *
 * Contract, in order of priority:
 *  1. **Every block is placed, exactly once, in order** (Invariant 0), in the
 *     first of these three ways that applies:
 *     - **1a** it fits the page's remaining room (whole, or cut to fit);
 *     - **1b** it fits nothing here but WOULD fit a fresh full page, so this
 *       page **ends early** — with room to spare — and the block leads the
 *       next one;
 *     - **1c** it would not fit even an empty page, so it is force-placed
 *       (cut to its smallest legal unit if it has one) and OVERFLOWS, which
 *       react-pdf FLOWS onto extra physical sheets. This is the only case
 *       that can produce a page the plan under-counts, and it always shows up
 *       in `LayoutPlanPage.overflowPt`.
 *  2. No page is over budget unless 1c forced it.
 *  3. `gapBefore` (the separator a block only gets when something precedes it
 *     on the same page — the main column's entry divider, the sidebar's
 *     section divider) is charged only to non-first blocks on a page, exactly
 *     as the components render it.
 *  4. A block that does not fit the page's REMAINING room is split there too,
 *     when a legal cut exists (C3b). This is the single place a split hooks
 *     in: it is exactly the pre-C3b `break`, tried once before giving up.
 *
 * **Rule 1b is why a page may end early** (C3b review). The case that forced
 * it: the shipped scaffold with an 11-bullet summary leaves 108.59pt of page-1
 * residual, while the smallest legal piece of the first experience entry is its
 * head plus one bullet — 177.75pt, an irreducible floor, because cutting to
 * zero bullets would orphan the entry head. Force-placing it (the pre-review
 * behaviour) produced a 4-sheet PDF whose sheet 2 held nothing but the string
 * "1 of 3". Ending page 1 early instead costs visible white space under the
 * summary and keeps page count, numbering and diagnostics honest. The sprint
 * doc offered "bullet-level splitting OR an explicit decision to allow an
 * entry-free page 1"; this is that decision, taken for every flow rather than
 * special-cased to page 1.
 *
 * **Termination.** Every outer iteration either consumes one whole `flow`
 * entry, or replaces the carried remainder with a strictly smaller one
 * (`SplitFn`'s obligation, asserted by both splitters), or defers — and a block
 * may be deferred at most once, so a deferral cannot cycle. `MAX_PAGES_FOR`
 * bounds the whole loop independently and THROWS rather than truncating: a cap
 * that silently stopped placing blocks would be a silent Invariant-0 violation,
 * which is strictly worse than a crash.
 *
 * Heights are compared through `quantize()` (see its docblock) and `used`
 * accumulates raw, mirroring the pre-C3 loop term for term so this
 * refactor cannot move a knife-edge page break.
 *
 * @template {{ height: number, gapBefore?: number, split?: SplitFn<B> }} B
 * @param {B[]} flow                             ordered blocks for one column
 * @param {(pageIndex: number) => number} budgetFn  usable height of page `i`, pt
 * @param {'frontload'} [policy]
 * @returns {PackedPage<B>[]}
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function packBlocks(flow, budgetFn, policy = 'frontload') {
  if (policy !== 'frontload') {
    throw new Error(`packBlocks: unsupported policy "${policy}" (only 'frontload' exists today)`)
  }
  /** @type {PackedPage<B>[]} */
  const pages = []
  let i = 0
  /** The tail of a block cut by a split — it leads the next page. @type {B | null} */
  let carry = null
  /** Has the block currently leading already had a page ended early for it (rule 1b)? */
  let deferred = false
  const maxPages = maxPagesFor(flow)

  while (carry !== null || i < flow.length) {
    if (pages.length >= maxPages) {
      // Never truncate: dropping the remainder would be a silent Invariant-0
      // violation. Name what is stuck instead.
      const stuck = carry ?? flow[i]
      throw new Error(
        `packBlocks: exceeded ${maxPages} pages with ${flow.length - i} block(s) left; ` +
          `stuck on ${describeBlock(stuck, i)}. A split whose tail does not shrink, or a ` +
          `budget function that never admits a block, will do this.`
      )
    }
    const budget = budgetFn(pages.length)

    // Rule 1, stated where it happens: what to do with the block that will
    // LEAD this page.
    //
    // (Pre-C3 this was written as a `if (page.length === 0) page.push(...)`
    // fallback *after* the fill loop, which the fill loop's own
    // `page.length > 0 &&` guard made unreachable — the same decision, but
    // dead and therefore untestable. Hoisting it makes the rule explicit and
    // exercised, with byte-identical arithmetic: the first block never charges
    // a `gapBefore`, every later one always does.)
    /** @type {B} */
    const lead = carry ?? flow[i]
    const leadFits = quantize(lead.height) <= quantize(budget)
    /** @type {{ head: B, tail: B } | null} */
    let leadCut = leadFits ? null : (lead.split?.(budget, false) ?? null)

    if (!leadFits && leadCut === null) {
      // Rule 1b: nothing of this block fits HERE. If a fresh page would take
      // it, end this one early rather than force an overflow onto a sheet the
      // plan cannot number. `deferred` makes this at most one page per block,
      // which is exact for the two budget functions this engine has (page 0,
      // then a constant) and provably terminating for any other.
      if (!deferred && canPlaceOn(lead, budgetFn(pages.length + 1))) {
        pages.push({ blocks: [], used: 0, budget: quantize(budget) })
        deferred = true
        continue
      }
      // Rule 1c: irreducible. Place the smallest legal unit (or the whole
      // block when it has none) and let it overflow.
      leadCut = lead.split?.(budget, true) ?? null
    }

    // The lead is consumed now, so the next iteration starts a fresh block.
    if (carry !== null) carry = null
    else i++
    deferred = false

    /** @type {B[]} */
    const blocks = [leadCut ? leadCut.head : lead]
    let used = blocks[0].height
    if (leadCut) {
      assertCarryShrinks(lead, leadCut.tail, i - 1)
      carry = leadCut.tail
    }

    while (carry === null && i < flow.length) {
      const b = flow[i]
      const gap = b.gapBefore ?? 0
      if (quantize(used + gap + b.height) <= quantize(budget)) {
        blocks.push(b)
        used += gap + b.height
        i++
        continue
      }
      // Rule 4: the block does not fit whole — pour as much of it as fits into
      // the page's remaining room instead of leaving that room empty.
      const cut = b.split?.(quantize(budget - used - gap), false) ?? null
      if (cut === null) break
      assertCarryShrinks(b, cut.tail, i)
      blocks.push(cut.head)
      used += gap + cut.head.height
      carry = cut.tail
      i++
    }
    pages.push({ blocks, used: quantize(used), budget: quantize(budget) })
  }
  return pages
}

/**
 * Can this block be placed on a page of `budget` without overflowing it —
 * whole, or cut to a legal prefix? The question rule 1b asks about the NEXT
 * page before ending the current one early.
 *
 * @template {{ height: number, split?: SplitFn<B> }} B
 * @param {B} block
 * @param {number} budget
 */
function canPlaceOn(block, budget) {
  if (quantize(block.height) <= quantize(budget)) return true
  return (block.split?.(budget, false) ?? null) !== null
}

/**
 * Allowance for a splittable block that declares no item count. Both real
 * block kinds declare one (`itemCount` on a sidebar slice, `entry.bullets` on
 * an experience block), so this only covers a hypothetical third; it is
 * deliberately generous, because a cap that false-positives on a real document
 * would be far worse than the hang it guards against — the PRECISE guard is
 * `carry must shrink`, checked on every split below, which fires immediately.
 */
const SPLITTABLE_PAGES_UNKNOWN = 512

/**
 * Hard upper bound on the pages one flow may produce: one page per block, plus
 * one per splittable item (the worst legal split is one item per page), plus
 * one for a single rule-1b deferral. Any run past this is a bug in a `SplitFn`
 * or a `budgetFn`, not a document — see packBlocks' throw.
 *
 * @param {readonly unknown[]} flow
 */
function maxPagesFor(flow) {
  let items = 0
  for (const block of flow) {
    const b =
      /** @type {{ itemCount?: number, entry?: { bullets?: unknown[] }, split?: unknown }} */ (
        block
      )
    items += b.itemCount ?? b.entry?.bullets?.length ?? (b.split ? SPLITTABLE_PAGES_UNKNOWN : 0)
  }
  return flow.length + items + 1
}

/**
 * The precise termination guard: the remainder a split hands back must be
 * strictly shorter than what was cut, or `packBlocks` would carry an unchanged
 * block to the next page forever. Checked on EVERY cut the packer accepts —
 * `assertShrinks` covers the two splitters in this file, this covers any
 * splitter at all, including the ones tests hand in.
 *
 * @template {{ height: number }} B
 * @param {B} before
 * @param {B} tail
 * @param {number} index
 */
function assertCarryShrinks(before, tail, index) {
  if (tail === before || quantize(tail.height) >= quantize(before.height)) {
    throw new Error(
      `packBlocks: split of ${describeBlock(before, index)} returned a tail that is not ` +
        `smaller (${before.height} -> ${tail.height} pt). packBlocks would carry it forever; ` +
        `a SplitFn must always shrink.`
    )
  }
}

/** Best-effort identity of a block for an error message — sidebar slices have a key, experience blocks an entry. */
function describeBlock(/** @type {any} */ block, /** @type {number} */ index) {
  const key = block?.key ?? block?.entry?.role ?? block?.id
  return `${key == null ? 'block' : `"${key}"`} at flow index ${index} (height ${block?.height})`
}

/**
 * The largest `k` in `[1, n-1]` whose measured prefix height fits `room`, or
 * `0` when none does (`1` instead, when `forceMinimum`). Shared by both flows'
 * splitters.
 *
 * BINARY SEARCH, and it is exact rather than a heuristic: `heightAt` is
 * non-decreasing in `k` for every splittable block CVX has (each extra item
 * contributes a non-negative height — strictly positive for every list
 * section, exactly zero only when an extra competency pill joins a tag row
 * that was already tall enough), so `heightAt(k) <= room` is a monotone
 * predicate and the search finds its true boundary. A linear scan would
 * re-measure O(n) prefixes of O(n) items each; at 60 items that is ~100k
 * glyph-advance word-wraps per split, which is why this is a search and not a
 * loop. Deterministic: integer index arithmetic, quantized comparison, no
 * floating-point accumulation (G-b).
 *
 * Returns `0` for "no legal cut". Callers MUST treat 0 as `null` rather than as
 * "cut at zero items", and this is load-bearing twice over: a zero-item head is
 * an orphaned heading (a section title alone at the foot of a column with its
 * first item overleaf), AND its tail would be the whole block again, so the
 * packer would carry an unchanged remainder forever. Both were confirmed by
 * seeding the mutation: relaxing the `k === 0` guard in either splitter turns
 * this into an infinite loop on a one-item over-tall section.
 *
 * The search range `[1, n-1]` is what guarantees BOTH sides keep at least one
 * item — the anti-orphan rule, enforced here once rather than at each call site.
 *
 * @param {number} n                          items available to split
 * @param {(k: number) => number} heightAt    measured height of the first `k` items (with the title)
 * @param {number} room                       pt available
 * @param {boolean} forceMinimum              accept a one-item prefix that does NOT fit (rule 1)
 */
function largestFittingPrefix(n, heightAt, room, forceMinimum) {
  if (n < 2) return 0 // nothing to cut: one item cannot be split into two non-empty sides
  let lo = 1
  let hi = n - 1
  let best = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (quantize(heightAt(mid)) <= quantize(room)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best === 0 && forceMinimum ? 1 : best
}

// ── Main-column budgets ────────────────────────────────────────────────────
// Both subtract `cornerH`: the page-number badge is a flex sibling of the
// padded content View inside the main column (TwoColumnTemplate), so it is
// part of the column's height, not decoration floating over it. Pre-C3 these
// budgets omitted it and therefore over-budgeted the main column by
// `cornerHeight - safety` = 19pt, which is how a "full" page could push the
// badge — and, with it, the body's minHeight-tall sidebar background — onto a
// near-blank extra physical page.

/** Usable height for experience entries on page 1 (summary + spacer + section title sit above them). */
function mainFirstBudget(/** @type {Metrics} */ m, /** @type {number} */ sumH) {
  return (
    m.bodyH -
    m.cornerH -
    m.mainPad.top -
    m.mainPad.bottom -
    sumH -
    m.spacer -
    calcTitleH(m) -
    m.safety
  )
}

/** Usable height for experience entries on a continuation page (only the "Experience (continued)" title sits above them). */
function mainContBudget(/** @type {Metrics} */ m) {
  return m.bodyH - m.cornerH - m.contPad.top - m.contPad.bottom - calcTitleH(m) - m.safety
}

/**
 * Warning threshold for `overflowWarnings()`, in points.
 *
 * Pre-C2 this was 220pt — an empirical fudge sized to absorb the char-width
 * estimator's own ~20-34% looseness (calibration note, now historical: the
 * shipped scaffold's tuned config used to estimate +209pt under the loose
 * estimator and render with room to spare; the mildest observed real overflow
 * estimated +257pt; 220 sat between the two).
 *
 * C2 replaced that estimator with real fontkit measurement wherever a `measure`
 * is injected (every real entry point injects one), so the threshold shrank to
 * a small, honest backstop — `spacing.safety` (15pt), the same per-page margin
 * the budgets already subtract. G-a: shrunk, not deleted; a real measurement
 * can still be off by a point or two (kerning-adjacent rounding), so a bare
 * `> 0` would be too twitchy. Concretely: the shipped scaffold at nine summary
 * bullets sits 0.16pt past budget and renders in exactly its planned three
 * sheets — noise, not a page break.
 *
 * Module-private: `overflowWarnings()` is the only consumer, and callers should
 * ask it rather than re-implement the comparison.
 */
const PAGE1_OVERFLOW_WARN_THRESHOLD = 15

/**
 * Every page whose content reaches past its budget, as an actionable warning.
 *
 * This is the GENERAL predicate for "the render will gain a physical sheet the
 * page numbering does not count", and it reads the plan the build actually
 * used. Until C3b it did not exist: `estimatePage1Overflow` covered only the
 * config-forced lever, so an 87pt lever overflow warned while a 474pt summary
 * overflow was silent — same symptom, same consequence, no signal. (Worse,
 * `LayoutPlanPage.overflowPt` was computed and read by nothing at all.)
 *
 * After C3b's rule 1b, a page that merely *cannot start* an over-tall block
 * ends early instead of overflowing, so a non-zero `overflowPt` now means
 * something genuinely irreducible: a single block — one summary, one bullet,
 * one description, one sidebar item — is taller than a whole page, or the
 * user's own `page1ExperienceCount` forces more onto page 1 than fits. Those
 * are the only two shapes this can report, and the message says which.
 *
 * Threshold is `PAGE1_OVERFLOW_WARN_THRESHOLD`, the same honest backstop the
 * lever estimate uses: the budgets already subtract `spacing.safety`, so a
 * sub-point overrun is measurement noise eating the margin, not a page break.
 *
 * @param {import('./types.js').LayoutPlan | undefined} plan
 * @param {import('./types.js').CVConfig} [config]
 * @returns {{ page: number, overflowPt: number, forcedByConfig: boolean, message: string }[]}
 */
export function overflowWarnings(plan, config = {}) {
  const out = []
  for (const page of plan?.pages ?? []) {
    if (page.overflowPt <= PAGE1_OVERFLOW_WARN_THRESHOLD) continue
    const over = Math.round(page.overflowPt)
    const forcedByConfig = page.index === 0 && config.page1ExperienceCount != null
    const lever =
      `page1ExperienceCount: ${config.page1ExperienceCount}` +
      (config.page1SplitBullets != null
        ? ` (+ page1SplitBullets: ${config.page1SplitBullets})`
        : '')
    // Which of the three shapes is it? A negative main budget means the FIXED
    // content the packer subtracts before packing anything (the summary, the
    // spacer, the section title) is already taller than the column — no
    // pagination of the experience list can help, because the experience list
    // is not what overflowed.
    const fixedTooTall = (page.mainFill?.budget ?? 0) < 0
    out.push({
      page: page.index + 1,
      overflowPt: page.overflowPt,
      forcedByConfig,
      message: forcedByConfig
        ? `page 1 is ~${over}pt over budget: ${lever} forces more onto it than fits. ` +
          `The surplus flows onto an extra physical sheet the page numbering does not count. ` +
          `Reduce page1ExperienceCount, set or lower page1SplitBullets, or remove both for ` +
          `automatic pagination.`
        : fixedTooTall
          ? `page ${page.index + 1} is ~${over}pt over budget before a single experience entry ` +
            `is placed: the summary alone is taller than the main column, so it flows onto an ` +
            `extra physical sheet the page numbering does not count. Shorten the summary — the ` +
            `packer cannot paginate it (it is fixed page-1 content, not a packed block).`
          : `page ${page.index + 1} is ~${over}pt over budget — a single block on it is taller ` +
            `than a whole page and cannot be split any further, so it flows onto an extra ` +
            `physical sheet the page numbering does not count. Shorten the longest single item ` +
            `on that page (one bullet, one description, or one sidebar entry).`
    })
  }
  return out
}

/**
 * @typedef {{
 *   entry: import('./types.js').ExperienceEntry,
 *   height: number,
 *   gapBefore: number,
 *   split: SplitFn<ExperienceBlock>,
 * }} ExperienceBlock
 */

/**
 * One experience entry as a `packBlocks` flow block. The entry divider is the
 * `gapBefore` (ExperienceSection renders it between entries only), and `split`
 * cuts the entry at a BULLET boundary (C3b).
 *
 * The split RE-MEASURES each candidate prefix rather than indexing a
 * precomputed prefix-sum table: `entryH`'s continuation form is not a suffix of
 * its whole-entry form (a continuation drops the company/period/location/
 * description/progression rows and gains a "(cont'd)" role line), so the two
 * halves of a cut do not sum to the uncut height and no single offset table
 * describes both. Re-measuring is exact by construction and, behind
 * `largestFittingPrefix`'s binary search, costs O(log n) measurements.
 *
 * @param {import('./types.js').ExperienceEntry} entry
 * @param {Metrics} m
 * @param {import('./types.js').Measurer | undefined} measure
 * @param {number} gapBefore
 * @returns {ExperienceBlock}
 */
function experienceBlock(entry, m, measure, gapBefore) {
  const height = entryH(entry, m, measure)
  return {
    entry,
    height,
    gapBefore,
    split: (room, forceMinimum) => {
      const bullets = entry.bullets ?? []
      const start = entry.startBullet ?? 0
      const end = entry.endBullet ?? bullets.length
      const headAt = (/** @type {number} */ k) =>
        entryH({ ...entry, startBullet: start, endBullet: start + k }, m, measure)
      const k = largestFittingPrefix(end - start, headAt, room, forceMinimum)
      if (k === 0) return null
      // The head keeps the entry's own kind (a continuation stays a
      // continuation), so a long entry can be cut more than once.
      const head = experienceBlock(
        { ...entry, startBullet: start, endBullet: start + k },
        m,
        measure,
        gapBefore
      )
      const tail = experienceBlock(
        { ...entry, isContinuation: true, startBullet: start + k, endBullet: end },
        m,
        measure,
        gapBefore
      )
      assertShrinks(`experience entry "${entry.role}"`, end - start, end - start - k, tail, height)
      return { head, tail }
    }
  }
}

/**
 * Wrap experience entries as `packBlocks` flow blocks.
 *
 * @param {import('./types.js').ExperienceEntry[]} entries
 * @param {Metrics} m
 * @param {import('./types.js').Measurer | undefined} measure
 * @returns {ExperienceBlock[]}
 */
function experienceBlocks(entries, m, measure) {
  const gapBefore = calcDividerH(m)
  return entries.map((entry) => experienceBlock(entry, m, measure, gapBefore))
}

/**
 * @param {import('./types.js').Measurer} [measure]
 *   optional real-font measurer (render.js/validateContent.js inject one when
 *   they have `fontsDir`); omit for the char-width estimate.
 * @returns {{
 *   page1Experiences: import('./types.js').ExperienceEntry[],
 *   continuationChunks: import('./types.js').ExperienceEntry[][],
 *   totalPages: number,
 *   pageMetrics: { used: number, budget: number }[],
 * }}
 *   `pageMetrics[i]` is page `i`'s packed experience height and its budget —
 *   the per-page fill signal the C0 harness's front-load / over-budget
 *   invariants need (and, later, C6's `plan_layout` diagnostics).
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function packExperiences(
  /** @type {import('./types.js').ExperienceEntry[]} */ experience,
  /** @type {import('./types.js').Summary} */ summary,
  /** @type {import('./types.js').CVConfig} */ config = {},
  /** @type {import('./types.js').Theme | undefined} */ theme = undefined,
  /** @type {import('./types.js').Measurer | undefined} */ measure = undefined
) {
  const m = deriveMetrics(theme)
  const { page1ExperienceCount, page1SplitBullets } = config
  const BC = mainContBudget(m)

  // ── Config-driven explicit split ─────────────────────────────────────────
  if (page1ExperienceCount != null) {
    const count = page1ExperienceCount
    const splitAt = page1SplitBullets ?? null

    const fullOnPage1 = experience.slice(0, count - 1)
    const splitEntry = experience[count - 1]
    const afterPage1 = experience.slice(count)

    let page1Experiences
    /** @type {import('./types.js').ExperienceEntry[]} */
    let continuationHead = []

    if (!splitEntry) {
      page1Experiences = fullOnPage1
    } else if (splitAt != null && splitAt < (splitEntry.bullets?.length ?? 0)) {
      page1Experiences = [...fullOnPage1, { ...splitEntry, endBullet: splitAt }]
      continuationHead = [{ ...splitEntry, isContinuation: true, startBullet: splitAt }]
    } else {
      page1Experiences = [...fullOnPage1, splitEntry]
    }

    const packed = packBlocks(
      experienceBlocks([...continuationHead, ...afterPage1], m, measure),
      () => BC
    )
    // The forced page-1 set's height goes through packBlocks too, with an
    // unbounded budget so nothing can break out of the page: same rule-3 gap
    // accounting as every other page, one implementation. (Hand-rolling a
    // `reduce` here duplicated the "gapBefore only for non-first" rule, which
    // is exactly the kind of second copy that drifts.)
    const forcedUsed =
      page1Experiences.length === 0
        ? 0
        : packBlocks(
            experienceBlocks(page1Experiences, m, measure),
            () => Number.POSITIVE_INFINITY
          )[0].used
    return {
      page1Experiences,
      continuationChunks: packed.map((p) => p.blocks.map((b) => b.entry)),
      totalPages: 1 + packed.length,
      pageMetrics: [
        // Page 1 is dictated by the config, not packed, so its budget is
        // reported for reference only — it is legitimately exceeded here (and
        // render.js warns when it is; see overflowWarnings()).
        {
          used: forcedUsed,
          budget: quantize(mainFirstBudget(m, summaryH(summary ?? [], m, measure)))
        },
        ...packed.map(({ used, budget }) => ({ used, budget }))
      ]
    }
  }

  // ── Automatic front-load bin-packing ─────────────────────────────────────
  const B1 = mainFirstBudget(m, summaryH(summary, m, measure))
  const packed = packBlocks(experienceBlocks(experience, m, measure), (i) => (i === 0 ? B1 : BC))
  const pages = packed.map((p) => p.blocks.map((b) => b.entry))

  return {
    page1Experiences: pages[0] ?? [],
    continuationChunks: pages.slice(1),
    totalPages: pages.length,
    pageMetrics: packed.map(({ used, budget }) => ({ used, budget }))
  }
}

// ── Sidebar measurement (C3, design doc §5's `measureSidebarBlock` sibling) ─
//
// These functions mirror the sidebar section components' own box model, the
// same way entryH/summaryH mirror ExpItem/BulletList: for each component,
// every <Text> contributes `lines x size x lineHeight` and every margin /
// padding / border contributes its literal, all read off the theme rather
// than hard-coded. That mirroring is a maintenance obligation, not an
// accident — the pairing is asserted end-to-end against a real render by
// test/layout-harness/sidebarMeasureDiff.js (which reads the true section
// offsets out of the rendered PDF with `pdftotext -bbox`), so a component
// whose spacing changes without its formula changing fails the suite.
//
// Widths matter as much as heights: a section body wraps against the padded
// content container (`innerW`), an indented row against `innerW - itemPl`, a
// contact row against `innerW - iconWidth - iconMr`, and the identity block
// against its OWN paddings (`identityW`), not sidebarPad.

/** @typedef {ReturnType<typeof deriveSidebarMetrics>} SidebarMetrics */

/**
 * Sidebar geometry for one theme. Carries the theme itself so the per-section
 * formulas below can read `t.typography.degree.size` and visibly line up
 * with the component they mirror instead of going through a flattened alias.
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function deriveSidebarMetrics(/** @type {import('./types.js').Theme | undefined} */ theme) {
  const t = theme ?? tealTheme
  const g = t.geometry
  const colW = g.pageWidth * g.sidebarFraction
  return {
    t,
    colW,
    /** wrap width inside CVDocument.buildSidebar's padded content container */
    innerW: colW - g.sidebarPad.left - g.sidebarPad.right,
    /** wrap width inside the identity block, which pads itself (chrome.identityPl/Pr) */
    identityW: colW - t.chrome.identityPl - t.chrome.identityPr,
    /** buildSidebar's divider — rendered above every section but the first ON A PAGE */
    sectionDividerH: t.chrome.dividerHeight + t.spacing.sectionGap,
    padTop: g.sidebarPad.top,
    padBottom: g.sidebarPad.bottom,
    // The sidebar's budget baseline. Read through bodyHeight() — never
    // re-derived — so the packer, the main-column budget and the template's
    // minHeight can only ever disagree by changing one function.
    bodyH: bodyHeight(t),
    safety: t.spacing.safety,
    cw: t.typography.charWidthFraction
  }
}

/** SectionTitle variant="sidebar": uppercase, letter-spaced, bottom-ruled. */
function sidebarTitleH(
  /** @type {string} */ label,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const ty = t.typography.sidebarSection
  return (
    rowH(measure, label.toUpperCase(), ty.size, sm.innerW, sm.cw, {
      weight: ty.weight,
      letterSpacing: ty.spacing
    }) +
    t.spacing.sectionTitlePb +
    t.chrome.sidebarBorderWidth +
    t.spacing.sidebarTitleMb
  )
}

/**
 * One "label + indented detail rows" item, the shape EducationSection,
 * CertificationsSection, PublicationsSection and LanguagesSection all render:
 * a heading row at the section's full width, then zero or more rows indented
 * by `spacing.itemPl`, each with its own margin-top.
 *
 * @param {{ text?: string, size: number, weight?: number, leading?: number, mt: number, indent: boolean }[]} rows
 * @param {SidebarMetrics} sm
 * @param {import('./types.js').Measurer | undefined} measure
 */
function itemRowsH(rows, sm, measure) {
  let h = 0
  for (const r of rows) {
    if (r.text == null) continue
    const width = r.indent ? sm.innerW - sm.t.spacing.itemPl : sm.innerW
    h +=
      r.mt + rowH(measure, r.text, r.size, width, sm.cw, { weight: r.weight, leading: r.leading })
  }
  return h
}

/** ContactSection — icon+text rows; the row is as tall as its taller child. */
function contactH(
  /** @type {string[]} */ values,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  const sp = t.spacing
  const ty = t.typography.sidebarContact
  const iconH = sp.iconWidth + sp.iconMt
  const valueW = sm.innerW - sp.iconWidth - sp.iconMr

  let h = sidebarTitleH(label, sm, measure)
  for (const value of values) {
    h +=
      Math.max(iconH, rowH(measure, value, ty.size, valueW, sm.cw, { leading: ty.leading })) +
      sp.contactRowMb
  }
  return h + sp.sectionGap // ContactSection's own wrap marginBottom
}

/** AchievementsSection — year + indented text, every item margin-bottomed (including the last). */
function achievementsH(
  /** @type {import('./types.js').AchievementEntry[]} */ items,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  let h = sidebarTitleH(label, sm, measure)
  for (const a of items) {
    h +=
      itemRowsH(
        [
          {
            text: a.year,
            size: t.typography.achieveYear.size,
            weight: t.typography.achieveYear.weight,
            leading: 1.3,
            mt: 0,
            indent: false
          },
          {
            text: a.text,
            size: t.typography.achieveText.size,
            leading: t.typography.achieveText.leading,
            mt: 0.75,
            indent: true
          }
        ],
        sm,
        measure
      ) + t.spacing.sectionGap
  }
  return h // no wrap marginBottom — AchievementsSection's root View has none
}

function educationH(
  /** @type {import('./types.js').EducationEntry[]} */ items,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH(label, sm, measure)
  for (const e of items) {
    h +=
      itemRowsH(
        [
          {
            text: e.degree,
            size: ty.degree.size,
            weight: ty.degree.weight,
            leading: 1.3,
            mt: 0,
            indent: false
          },
          {
            text: e.institution,
            size: ty.institution.size,
            mt: t.spacing.entryMetaMt,
            indent: true
          },
          { text: e.period, size: ty.caption.size, mt: 0.75, indent: true }
        ],
        sm,
        measure
      ) + EDUCATION_ITEM_MB
  }
  return h + t.spacing.sectionGap
}

function certificationsH(
  /** @type {import('./types.js').CertificationEntry[]} */ items,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH(label, sm, measure)
  for (const c of items) {
    h +=
      itemRowsH(
        [
          {
            text: c.name,
            size: ty.degree.size,
            weight: ty.degree.weight,
            leading: 1.3,
            mt: 0,
            indent: false
          },
          { text: c.issuer, size: ty.institution.size, mt: t.spacing.entryMetaMt, indent: true },
          { text: c.year, size: ty.caption.size, mt: 0.75, indent: true }
        ],
        sm,
        measure
      ) + LIST_ITEM_MB
  }
  return h + t.spacing.sectionGap
}

function publicationsH(
  /** @type {import('./types.js').PublicationEntry[]} */ items,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH(label, sm, measure)
  for (const p of items) {
    const meta = [p.venue, p.year].filter(Boolean).join('  ·  ')
    h +=
      itemRowsH(
        [
          {
            text: p.title,
            size: ty.degree.size,
            weight: ty.degree.weight,
            leading: 1.3,
            mt: 0,
            indent: false
          },
          {
            text: meta || undefined,
            size: ty.institution.size,
            mt: t.spacing.entryMetaMt,
            indent: true
          }
        ],
        sm,
        measure
      ) + LIST_ITEM_MB
  }
  return h + t.spacing.sectionGap
}

function languagesH(
  /** @type {import('./types.js').LanguageEntry[]} */ items,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH(label, sm, measure)
  for (const l of items) {
    h +=
      itemRowsH(
        [
          {
            text: l.language,
            size: ty.degree.size,
            weight: ty.degree.weight,
            leading: 1.3,
            mt: 0,
            indent: false
          },
          { text: l.proficiency, size: ty.caption.size, mt: 0.75, indent: true }
        ],
        sm,
        measure
      ) + LANGUAGE_ITEM_MB
  }
  return h + t.spacing.sectionGap
}

/**
 * CompetenciesSection — a `flexWrap: 'wrap'` row of fixed-height tag pills.
 * Greedy row packing with the theme's `tagGap` as both row and column gap,
 * exactly as yoga wraps a gapped flex line. A pill wider than the column can
 * only wrap its own text, so it takes a row of its own at whatever height
 * that text needs (never clipped).
 */
function competenciesH(
  /** @type {string[]} */ tags,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  const ch = t.chrome
  const ty = t.typography.tag
  const titleH = sidebarTitleH(label, sm, measure)
  if (tags.length === 0) return titleH

  const pad = ch.tagPx * 2
  /** @type {number[]} */
  const rowHeights = []
  let rowUsed = 0
  for (const tag of tags) {
    const naturalW = pad + textW(measure, tag, ty.size, sm.cw, { weight: ty.weight })
    const tagW = Math.min(naturalW, sm.innerW)
    // Only an over-wide pill wraps its own label; otherwise it is one line.
    const tagH =
      (naturalW > sm.innerW
        ? countLines(measure, tag, ty.size, sm.innerW - pad, sm.cw, { weight: ty.weight })
        : 1) *
        ty.size *
        NATURAL_LINE_HEIGHT +
      ch.tagPy * 2
    const last = rowHeights.length - 1
    // Quantized, like every other packing comparison in this file (G-b): this
    // is a wrap DECISION on measured glyph advances, so a few-ULP difference
    // between machines could otherwise move a pill to another row, change the
    // section's height, and cascade into a different page count and different
    // PDF bytes. It was the one unquantized break condition left.
    if (last < 0 || quantize(rowUsed + ch.tagGap + tagW) > quantize(sm.innerW)) {
      rowHeights.push(tagH)
      rowUsed = tagW
    } else {
      rowUsed += ch.tagGap + tagW
      rowHeights[last] = Math.max(rowHeights[last], tagH)
    }
  }
  return titleH + rowHeights.reduce((a, b) => a + b, 0) + (rowHeights.length - 1) * ch.tagGap
}

/** RefereesSection — real entries separated by a ruled gap, or the "available upon request" line. */
function refereesH(
  /** @type {import('./types.js').RefereeEntry[]} */ referees,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure,
  /** @type {string} */ label
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH(label, sm, measure)
  if (referees.length === 0) {
    // The italic placeholder line RefereesSection renders instead.
    return (
      h +
      rowH(measure, 'References available upon request.', ty.meta.size, sm.innerW, sm.cw, {
        italic: true
      })
    )
  }
  const contactRowW = sm.innerW - REFEREE_LABEL_W
  referees.forEach((r, i) => {
    h += rowH(measure, r.name, ty.refName.size, sm.innerW, sm.cw, { weight: ty.refName.weight })
    if (r.title) {
      h +=
        0.75 +
        rowH(
          measure,
          `${r.title}${r.company ? `, ${r.company}` : ''}`,
          ty.refDetail.size,
          sm.innerW,
          sm.cw
        )
    }
    h += t.spacing.descMt // the contact sub-View's marginTop — present even when empty
    for (const value of [r.email, r.phone].filter(Boolean)) {
      h +=
        t.spacing.entryMetaMt +
        Math.max(
          rowH(measure, '@', REFEREE_LABEL_SIZE, REFEREE_LABEL_W, sm.cw),
          rowH(measure, value, ty.refContact.size, contactRowW, sm.cw)
        )
    }
    if (i < referees.length - 1) h += t.chrome.dividerHeight + t.spacing.sectionGap * 2
  })
  return h
}

// Component-local literals with no theme token behind them today — mirrored
// here rather than invented, so the drift is visible in one place if a theme
// ever grows a token for them.
const EDUCATION_ITEM_MB = 15 // EducationSection.item.marginBottom
const LIST_ITEM_MB = 12 // Certifications/Publications .item.marginBottom
const LANGUAGE_ITEM_MB = 7 // LanguagesSection.item.marginBottom
const REFEREE_LABEL_W = 9 // RefereesSection.label.width
const REFEREE_LABEL_SIZE = 7 // RefereesSection.label.fontSize

/**
 * The contact rows, in render order, already filtered to the ones with a value
 * — the SINGLE definition of that order, consumed by both sides.
 *
 * `ContactSection.jsx` imports this rather than rebuilding the array, because
 * contact is the one section whose item list is not simply `data.<key>`: it is
 * assembled from six different `personal` fields plus the links tail, and while
 * it was assembled twice (here and in the component) a pure REORDER of the two
 * copies was undetectable — membership was identical, so every content-level
 * check passed while the packer measured `contact[0,k)` as one order and the
 * renderer drew another. Found by adversarial review, fixed by deletion of the
 * second copy rather than by a test alone.
 *
 * `field` is the row's identity; the icon and the href it maps to are
 * presentation and stay in the component.
 *
 * @param {import('./types.js').CVContent} data
 * @returns {{ field: 'phone'|'email'|'linkedin'|'facebook'|'location'|'link', value: string, href?: string }[]}
 */
export function contactRows(data) {
  const p = data.personal ?? { name: '' }
  /** @type {{ field: 'phone'|'email'|'linkedin'|'facebook'|'location'|'link', value?: string, href?: string }[]} */
  const rows = [
    { field: 'phone', value: p.phone, href: p.phoneHref },
    { field: 'email', value: p.email, href: p.email ? `mailto:${p.email}` : undefined },
    { field: 'linkedin', value: p.linkedin, href: p.linkedinHref },
    { field: 'facebook', value: p.facebook, href: p.facebookHref },
    { field: 'location', value: p.location },
    ...(p.links ?? []).map((l) => ({
      field: /** @type {const} */ ('link'),
      value: l.label || l.href,
      href: l.href
    }))
  ]
  return /** @type {{ field: 'phone'|'email'|'linkedin'|'facebook'|'location'|'link', value: string, href?: string }[]} */ (
    rows.filter((r) => r.value)
  )
}

/** ContactSection's rows as the packer measures them: one wrapped value per row. */
function contactItems(/** @type {import('./types.js').CVContent} */ data) {
  return contactRows(data).map((r) => r.value)
}

/**
 * Every sidebar section, as (a) the ordered ITEM LIST its component iterates
 * and (b) the height of any contiguous slice of that list under a given title.
 *
 * C3b turns a section from an atom into a list: `packSidebar` may place items
 * `[0, k)` on one page and `[k, n)` on the next, each slice repeating the
 * title (the continuation with a "(cont.)" marker — see `sectionTitleLabel`).
 * Splitting the measurement this way is exact rather than proportional because
 * every one of these components renders a title followed by a uniform per-item
 * sub-tree, so the height of a slice is the height of the same component fed
 * the sliced array — which is literally what the renderer does.
 *
 * `always: true` marks the two sections with no presence guard: ContactSection
 * always renders its title, and RefereesSection always renders either its
 * entries or the "available upon request" line.
 *
 * @type {Record<string, {
 *   label: string,
 *   always?: true,
 *   items: (data: import('./types.js').CVContent) => unknown[],
 *   height: (items: never[], sm: SidebarMetrics, measure: import('./types.js').Measurer | undefined, label: string) => number,
 * }>}
 */
const SIDEBAR_SECTIONS = {
  contact: { label: 'Contact', always: true, items: contactItems, height: contactH },
  achievements: {
    label: 'Achievements',
    items: (d) => d.achievements ?? [],
    height: achievementsH
  },
  education: { label: 'Education', items: (d) => d.education ?? [], height: educationH },
  certifications: {
    label: 'Certifications',
    items: (d) => d.certifications ?? [],
    height: certificationsH
  },
  publications: {
    label: 'Publications',
    items: (d) => d.publications ?? [],
    height: publicationsH
  },
  languages: { label: 'Languages', items: (d) => d.languages ?? [], height: languagesH },
  competencies: {
    label: 'Core Competencies',
    items: (d) => d.competencies ?? [],
    height: competenciesH
  },
  referees: { label: 'Referees', always: true, items: (d) => d.referees ?? [], height: refereesH }
}

/**
 * The marker a split section's repeated title carries so a continuation reads
 * as deliberate rather than as a duplicated heading.
 *
 * Exported so the render side can find it, but note it is not spelled again
 * anywhere: `sections/sectionSlice.js` composes titles through
 * `sectionTitleLabel()` below, and the render-diff harness derives the
 * uppercased form from this constant. The only other consumer of the literal
 * itself is `test/layout-harness/sidebarBudget.js`, which re-states it on
 * purpose (it is the deliberately-independent oracle, see its docblock).
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export const CONTINUED_SUFFIX = '(cont.)'

/**
 * The one line that decides what "continued" means. Module-private: exactly ONE
 * predicate crosses the plan/render boundary — the exported `isContinuedSlice`
 * below — and it delegates its meaning here, so the two call sites inside this
 * file that already hold `start` as a scalar can ask without allocating a
 * `{ start }` wrapper to ask with.
 */
const isContinuedStart = (/** @type {number} */ start) => start > 0

/**
 * Does this slice continue a section an earlier page began? **The one
 * definition**, exported so both sides of the plan/render boundary ask the same
 * question of the same field.
 *
 * C3b carried the answer twice: as a derived `SidebarSlice.continued` boolean
 * AND as `start > 0`, which is what it was computed from. Two predicates for
 * one fact is how a measured title ("Referees (cont.)") and a rendered title
 * ("Referees") come to disagree — the packer charges for one string and the
 * component draws the other, and nothing in the type system notices. C4 deletes
 * the boolean: `start` is the fact, this is the question, `sectionTitleLabel`
 * is the answer.
 *
 * THROWS on a scalar. This function REPLACED one that took `start` as a number,
 * and `isContinuedSlice(2)` under a `slice?.start` implementation would answer
 * `false` — the safe-looking answer, no "(cont.)" marker, which is precisely
 * the measured-vs-rendered title disagreement the collapse exists to prevent.
 * The heaviest consumer is the harness, and `test/` is outside tsconfig's
 * include, so the type annotation alone would not have caught it. `null` and
 * `undefined` stay legal: that is the ATS/browser-preview path, where a section
 * renders whole and has no slice at all.
 *
 * @param {{ start: number } | undefined | null} slice
 * @returns {boolean}
 */
export function isContinuedSlice(slice) {
  if (slice === undefined || slice === null) return false
  const start = /** @type {{ start?: unknown }} */ (slice).start
  if (typeof slice !== 'object' || typeof start !== 'number') {
    throw new TypeError(
      `isContinuedSlice expects a slice object with a numeric \`start\` (or null/undefined for ` +
        `"no slice"), got ${typeof slice} ${JSON.stringify(slice)}. It takes the SLICE, not its ` +
        `start index — C3b's predicate took the number, and passing one here would silently ` +
        `answer "not a continuation" and drop the "${CONTINUED_SUFFIX}" marker.`
    )
  }
  return isContinuedStart(start)
}

/** The title one slice renders: the plain label, or the label plus the continuation marker. */
export function sectionTitleLabel(/** @type {string} */ label, /** @type {boolean} */ continued) {
  return continued ? `${label} ${CONTINUED_SUFFIX}` : label
}

/**
 * The ordered ITEM LIST one sidebar section renders — the engine's own view of
 * it, which is what `SidebarSlice`'s `[start, end)` indexes into. `null` for a
 * key the registry does not know.
 *
 * Exported so the plan/render mirror can be ASSERTED rather than assumed:
 * seven components map `data.<key>` directly and can only diverge by edit,
 * `contact` no longer has a second copy at all (see `contactRows`), and
 * `layout.mirror.test.js` proves for every section that the item the renderer
 * draws at index `i` is the item this list holds at index `i`.
 *
 * @param {string} key
 * @param {import('./types.js').CVContent} data
 * @returns {unknown[] | null}
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function sidebarSectionItems(key, data) {
  return SIDEBAR_SECTIONS[key]?.items(data) ?? null
}

/**
 * How many items a sidebar section holds (0 for an unknown key, or a section with no items).
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function sidebarItemCount(
  /** @type {string} */ key,
  /** @type {import('./types.js').CVContent} */ data
) {
  return sidebarSectionItems(key, data)?.length ?? 0
}

/**
 * Every sidebar slot key the packer knows how to measure and slice, in registry order.
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export const SIDEBAR_SECTION_KEYS = Object.keys(SIDEBAR_SECTIONS)

/**
 * Measured height of a contiguous slice of one sidebar section — items
 * `[start, end)` under the section's title, with the "(cont.)" marker whenever
 * `start > 0`. Returns `null` when the section renders nothing at all (its
 * component's own `if (!data.x?.length) return null` guard) and must therefore
 * be dropped from the flow rather than packed as a zero-height block — a
 * phantom block would still earn its divider and leave a stray rule in the
 * column.
 *
 * @param {string} key   sidebar slot key (registry.js)
 * @param {import('./types.js').CVContent} data
 * @param {SidebarMetrics} sm
 * @param {import('./types.js').Measurer} [measure]
 * @param {number} [start]
 * @param {number} [end]
 * @returns {number | null}
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function sidebarSliceH(key, data, sm, measure = undefined, start = 0, end = undefined) {
  const def = SIDEBAR_SECTIONS[key]
  // An unknown key renders nothing (registry.js warns and returns null), so it
  // contributes no height and no divider.
  if (!def) return null
  const all = def.items(data)
  if (!def.always && all.length === 0) return null
  const items = /** @type {never[]} */ (all.slice(start, end ?? all.length))
  return quantize(
    def.height(items, sm, measure, sectionTitleLabel(def.label, isContinuedStart(start)))
  )
}

/**
 * Measured height of one WHOLE sidebar section (the `[0, n)` slice) — the
 * pre-split view of the same measurement, kept as the name every caller that
 * does not care about slicing uses.
 *
 * @param {string} key
 * @param {import('./types.js').CVContent} data
 * @param {SidebarMetrics} sm
 * @param {import('./types.js').Measurer} [measure]
 * @returns {number | null}
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function sidebarSectionH(key, data, sm, measure = undefined) {
  return sidebarSliceH(key, data, sm, measure)
}

/**
 * Measured height of the identity block that is INJECTED at the top of every
 * page's sidebar (never packed — design doc §4.2). `identity-photo` (page 1)
 * is the name block plus the optional photo; `identity-compact` is the name
 * block alone with symmetric padding.
 *
 * @param {string[]} keys  the identity slot keys assigned to this page
 * @param {import('./types.js').CVContent} data
 * @param {SidebarMetrics} sm
 * @param {import('./types.js').Measurer} [measure]
 *
 * @internal exported for the C0 harness only — not API (see the module
 * docblock): it cannot be called without `deriveSidebarMetrics`, which is
 * itself harness-only. The plan publishes `page.identity` and folds the height
 * into `sidebarFill.budget`; a diagnostics consumer wants those, not this.
 */
export function identityH(keys, data, sm, measure = undefined) {
  const { t } = sm
  const ch = t.chrome
  const ty = t.typography
  const p = data.personal ?? { name: '' }

  // Both identity components render name / rule / title / company in the same
  // order; a missing title or company still occupies its (empty) line, which
  // is why these are measured unconditionally.
  const nameBlockH =
    rowH(measure, p.name, ty.name.size, sm.identityW, sm.cw, {
      weight: ty.name.weight,
      leading: NATURAL_LINE_HEIGHT,
      letterSpacing: ty.name.spacing
    }) +
    ch.dividerHeight +
    ch.identityDividerMy * 2 +
    rowH(measure, p.title, ty.title.size, sm.identityW, sm.cw, { leading: 1.5 }) +
    t.spacing.entryMetaMt +
    rowH(measure, p.company, ty.company.size, sm.identityW, sm.cw, { weight: ty.company.weight })

  let h = 0
  for (const key of keys) {
    if (key === 'identity-photo') {
      h += ch.identityPt + ch.identityPb + nameBlockH
      if (data.profilePhoto) h += ch.photoHeight + ch.photoPb
    } else if (key === 'identity-compact') {
      h += ch.identityPt * 2 + nameBlockH
    }
  }
  return quantize(h)
}

// ── The two-flow coordinator (C3, design doc §4.5) ─────────────────────────

const IDENTITY_PREFIX = 'identity-'

/**
 * Is this slot key an identity block? Exported so CVDocument.buildSidebar
 * splits injected-identity from packed-section keys with the SAME predicate the
 * packer used to exclude them from the flow — a second `'identity-'` literal in
 * the renderer would be a silent divergence waiting to happen.
 */
export const isIdentityKey = (/** @type {string} */ k) => k.startsWith(IDENTITY_PREFIX)

/**
 * The sidebar's single ordered section flow: every sidebar section the layout
 * declares, in the order it declares them across the page kinds, with the
 * per-page identity slots removed (they are injected, not packed) and
 * duplicates collapsed.
 *
 * NOTE what this changes about the layout YAML's meaning. The page-kind buckets
 * (`pages.first` / `pages.continuation` / `pages.last`) are now read as ONE
 * ordered flow: `last.sidebar: [referees]` means "referees comes last in the
 * sidebar", not "referees renders on the final page" — the packer decides which
 * page it lands on, from measurement. The buckets are still how a user
 * expresses ORDER, which is designer intent; they are no longer a page
 * assignment. (Explicit per-page assignment is a later chunk's `layout.buckets`
 * lever.)
 *
 * This subsumes the pre-C3 `resolveFirstSidebar()` fold, which produced ONE
 * page's key list and hoped it fit; the same concatenation now feeds
 * `packSidebar`, which measures the flow and distributes it across as many
 * pages as it needs.
 */
export function sidebarFlowKeys(
  /** @type {import('./types.js').NormalizedLayout | undefined} */ layout
) {
  const declared = [
    ...(layout?.first?.sidebar ?? []),
    ...(layout?.continuation?.sidebar ?? []),
    ...(layout?.last?.sidebar ?? [])
  ]
  return [...new Set(declared.filter((k) => !isIdentityKey(k)))]
}

/** The identity slot keys a given page index gets: page 1's, else the continuation's (falling back to `last`, then `first`). */
function identityKeysFor(
  /** @type {import('./types.js').NormalizedLayout | undefined} */ layout,
  /** @type {number} */ pageIndex
) {
  const first = (layout?.first?.sidebar ?? []).filter(isIdentityKey)
  if (pageIndex === 0) return first
  const cont = (layout?.continuation?.sidebar ?? []).filter(isIdentityKey)
  if (cont.length > 0) return cont
  const last = (layout?.last?.sidebar ?? []).filter(isIdentityKey)
  return last.length > 0 ? last : first
}

/**
 * @typedef {import('./types.js').SidebarSlice & {
 *   height: number,
 *   gapBefore: number,
 *   split: SplitFn<SidebarBlock>,
 * }} SidebarBlock
 */

/**
 * One sidebar section slice as a `packBlocks` flow block. `split` cuts it at an
 * ITEM boundary, never inside one, and never with an empty side — so the title
 * always keeps at least one item under it on both pages (no orphaned heading).
 *
 * Like the experience splitter, each candidate prefix is RE-MEASURED (the
 * continuation title differs from the original, so the two halves do not sum to
 * the whole) behind `largestFittingPrefix`'s binary search.
 *
 * "Continued" is not a field: it is `isContinuedSlice(slice)`, asked of `start`
 * wherever it is needed (the title measured here, the title rendered by
 * `sliceTitle` in sections/sectionSlice.js). C3b shipped it as a derived
 * boolean alongside the `start` it derived from; C4 deleted that second copy,
 * because two carriers of one fact are two things to keep in agreement.
 *
 * @param {{
 *   key: string,
 *   data: import('./types.js').CVContent,
 *   sm: SidebarMetrics,
 *   measure: import('./types.js').Measurer | undefined,
 *   itemCount: number,
 *   gapBefore: number,
 * }} ctx
 * @param {number} start
 * @param {number} end
 * @returns {SidebarBlock}
 */
function sidebarBlock(ctx, start, end) {
  const sliceH = (/** @type {number} */ from, /** @type {number} */ to) =>
    /** @type {number} */ (sidebarSliceH(ctx.key, ctx.data, ctx.sm, ctx.measure, from, to))
  const height = sliceH(start, end)
  return {
    key: ctx.key,
    start,
    end,
    itemCount: ctx.itemCount,
    height,
    gapBefore: ctx.gapBefore,
    split: (room, forceMinimum) => {
      const k = largestFittingPrefix(
        end - start,
        (kk) => sliceH(start, start + kk),
        room,
        forceMinimum
      )
      if (k === 0) return null
      const head = sidebarBlock(ctx, start, start + k)
      const tail = sidebarBlock(ctx, start + k, end)
      assertShrinks(`sidebar section "${ctx.key}"`, end - start, end - start - k, tail, height)
      return { head, tail }
    }
  }
}

/**
 * Pack the sidebar flow across pages, splitting a section that does not fit at
 * an ITEM boundary (C3b — design doc §2.4/§6, required by Invariant 0 so a
 * section taller than a page FLOWS inside pages the plan actually numbered
 * instead of being carried onto sheets it never counted).
 *
 * The budget is the body box minus the page's injected identity block and the
 * column's own padding, minus the `spacing.safety` backstop (design doc G-a):
 * `bodyH - identityH(page) - sidebarPad.top - sidebarPad.bottom - safety`.
 * Page 1 is much tighter than the rest whenever `identity-photo` carries a
 * photo, which the per-page `budgetFn` encodes directly.
 *
 * @param {string[]} keys   ordered sidebar section keys (sidebarFlowKeys())
 * @param {import('./types.js').CVContent} data
 * @param {import('./types.js').NormalizedLayout | undefined} layout
 * @param {import('./types.js').Theme} [theme]
 * @param {import('./types.js').Measurer} [measure]
 * @returns {{ pages: import('./types.js').SidebarSlice[][], pageMetrics: { used: number, budget: number }[], totalPages: number }}
 *   `pages[i]` is page `i`'s ordered slices. A section that fits whole is a
 *   single slice spanning `[0, itemCount)`; a slice with `start > 0` is a
 *   continuation (`isContinuedSlice`).
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function packSidebar(keys, data, layout, theme = undefined, measure = undefined) {
  const sm = deriveSidebarMetrics(theme)
  /** @type {SidebarBlock[]} */
  const flow = []
  for (const key of keys) {
    // The presence guard (a section whose component renders nothing must not
    // earn a divider) lives in sidebarSliceH and is read off the whole section.
    if (sidebarSectionH(key, data, sm, measure) === null) continue
    const itemCount = sidebarItemCount(key, data)
    flow.push(
      sidebarBlock(
        { key, data, sm, measure, itemCount, gapBefore: sm.sectionDividerH },
        0,
        itemCount
      )
    )
  }

  const budgetFn = (/** @type {number} */ pageIndex) =>
    sm.bodyH -
    identityH(identityKeysFor(layout, pageIndex), data, sm, measure) -
    sm.padTop -
    sm.padBottom -
    sm.safety

  const packed = packBlocks(flow, budgetFn)
  return {
    // The projection publishes the two geometry terms the block already
    // measured (C6a). It used to drop both, which made the plan not
    // self-describing: `sidebarFill.used` was a number no consumer could take
    // apart, so anything wanting "how much of this page is THIS section" had to
    // re-measure through `sidebarSliceH` — an @internal function taking an
    // @internal metrics object. Publishing them costs nothing (they are already
    // computed, and `packSidebar` was deleting them) and makes the per-page
    // arithmetic checkable from outside: `used === Σ (height + gapBefore)`,
    // exactly, which is asserted by both the unit suite and the render-agreement
    // test rather than left as a comment.
    //
    // `gapBefore` is the gap ACTUALLY CHARGED on this page — zero for the first
    // slice (nothing precedes it, so buildSidebar draws no rule above it), the
    // section divider for every later one. Publishing the block's unconditional
    // `sm.sectionDividerH` instead would be a number that does not add up.
    pages: packed.map((p) =>
      p.blocks.map(({ key, start, end, itemCount, height, gapBefore }, i) => ({
        key,
        start,
        end,
        itemCount,
        height,
        gapBefore: i === 0 ? 0 : gapBefore
      }))
    ),
    pageMetrics: packed.map(({ used, budget }) => ({ used, budget })),
    totalPages: packed.length
  }
}

/**
 * The two-flow coordinator: pack each column independently, take
 * `P = max(P_main, P_sidebar)`, and front-load both into P pages.
 *
 * The shorter flow simply runs out: its trailing pages get an empty column,
 * which is the design doc's deliberate G1 *residual* (one flow genuinely
 * exceeding the other by a page of content) rather than the wasted-space bug
 * — and it is now a real, numbered, badge-consistent page instead of an
 * unplanned physical sheet react-pdf conjured behind the packer's back.
 *
 * @param {object} args
 * @param {import('./types.js').CVContent} args.content
 * @param {import('./types.js').NormalizedLayout} [args.layout]
 *   defaults to the built-in two-column layout. Defaulting (rather than
 *   treating "no layout" as "no sidebar sections") is the safe direction: an
 *   empty flow would silently plan a sidebar with nothing in it.
 * @param {import('./types.js').CVConfig} [args.config]
 * @param {import('./types.js').Theme} [args.theme]
 * @param {import('./types.js').Measurer} [args.measure]
 * @returns {import('./types.js').LayoutPlan}
 */
export function planTwoColumn({
  content,
  layout = TWO_COLUMN_LAYOUT,
  config = {},
  theme = undefined,
  measure = undefined
}) {
  const main = packExperiences(
    content.experience ?? [],
    content.summary ?? [],
    config,
    theme,
    measure
  )
  const sidebar = packSidebar(sidebarFlowKeys(layout), content, layout, theme, measure)

  // At least one page always exists, even for a CV with no experience at all.
  const totalPages = Math.max(1, main.totalPages, sidebar.totalPages)
  const mainChunks = [main.page1Experiences, ...main.continuationChunks]

  return {
    totalPages,
    mainPageCount: main.totalPages,
    sidebarPageCount: sidebar.totalPages,
    pages: Array.from({ length: totalPages }, (_, index) => {
      const mainBlocks = mainChunks[index] ?? []
      // `sidebarSlices` is the ONLY per-page sidebar field (C4). C3b also
      // published `sidebarKeys = sidebarSlices.map(s => s.key)`, a projection
      // of this array carried as a second array; consumers had already started
      // choosing between them inconsistently (the render-diff harness read the
      // keys, the renderer read the slices), which is a shape C6 must not
      // publish and C7 must not document. "Which sections are on this page, in
      // order" is `page.sidebarSlices.map(s => s.key)` — derived at the point
      // of use, never stored.
      const sidebarSlices = sidebar.pages[index] ?? []
      const mainFill = main.pageMetrics[index] ?? null
      const sidebarFill = sidebar.pageMetrics[index] ?? null
      const over = (/** @type {{used: number, budget: number} | null} */ f) =>
        f ? Math.max(0, quantize(f.used - f.budget)) : 0
      const mainEmpty = mainBlocks.length === 0
      const sidebarEmpty = sidebarSlices.length === 0
      return {
        index,
        // Injected, never packed — see identityH().
        identity: identityKeysFor(layout, index),
        mainBlocks,
        sidebarSlices,
        mainFill,
        sidebarFill,
        /**
         * How far past its budget this page's content reaches, in pt. Non-zero
         * only where Invariant 0 forced an over-tall block onto a page (see
         * packBlocks' rule 1) or where a config-forced page-1 split exceeds what
         * fits; react-pdf then FLOWS that surplus onto extra physical sheets.
         */
        overflowPt: quantize(over(mainFill) + over(sidebarFill)),
        /** Which column (if any) has no content on this page — the G1 residual signal. */
        emptyColumn:
          mainEmpty && sidebarEmpty
            ? /** @type {const} */ ('both')
            : mainEmpty
              ? /** @type {const} */ ('main')
              : sidebarEmpty
                ? /** @type {const} */ ('sidebar')
                : null
      }
    })
  }
}
