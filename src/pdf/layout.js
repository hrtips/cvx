// Pure-JS page packing — no DOM, no browser.
// All dimensions in typographic points (pt).
//
// TWO FLOWS, ONE ENGINE (C3 / design doc §4.5). The designed layout has two
// semantically-pinned columns: experience flows down the main column, the
// sidebar sections flow down the sidebar. Both are measured, both are packed
// by the same front-load first-fit engine (`packBlocks`) against per-page
// budgets derived from one shared box (`bodyHeight`), and the document takes
// `P = max(P_main, P_sidebar)` pages (`planTwoColumn`). Nothing is dropped to
// make a flow fit: a block that fits nowhere is placed anyway and FLOWS (see
// packBlocks' contract and Invariant 0).
//
// Pre-C3 only the main column was packed; the sidebar was a static
// section->page-kind assignment repeated verbatim onto every continuation
// page — which both duplicated sections across pages and silently overflowed
// whenever the column was taller than the sheet.
//
// The theme argument provides all typography/spacing/geometry values so the
// estimator stays in sync with what components actually render.
//
// deriveMetrics/lineCount/entryH/summaryH are exported (in addition to the
// public API below) purely so the C0 test harness (test/layout-harness/
// estimator.js) can compute page-fill estimates without maintaining a
// hand-copied duplicate of this file's private formulas — no behavior
// change, this is the same code that packExperiences() itself calls.
//
// MEASUREMENT INJECTION (C2 / design doc §5): this file ships in the Vite
// browser bundle (the in-app preview), so it must stay isomorphic — no
// fontkit, no node:fs. `entryH`/`summaryH`/`estimatePage1Overflow`/
// `packExperiences` all take an OPTIONAL trailing `measure` argument shaped
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
 * Pack an ordered block flow onto pages, front-loaded: fill page *i* with as
 * many leading blocks as fit its budget, then start page *i+1*. This is the
 * exact greedy first-fit loop `packExperiences()` has always used for the
 * main column, lifted out so the sidebar flow can be packed by the same
 * code (design doc §4.4 — the `greedy`/front-load policy; `balance` and
 * `optimal` are later chunks and are deliberately NOT implemented here).
 *
 * Contract, in order of priority:
 *  1. **Every block is placed, exactly once, in order** (Invariant 0). A
 *     block that cannot fit an empty page is placed anyway rather than
 *     dropped — it then overflows, which react-pdf FLOWS onto extra physical
 *     pages (it never clips). This forced placement is also what guarantees
 *     termination.
 *  2. No page is over budget unless rule 1 forced it.
 *  3. `gapBefore` (the separator a block only gets when something precedes it
 *     on the same page — the main column's entry divider, the sidebar's
 *     section divider) is charged only to non-first blocks on a page, exactly
 *     as the components render it.
 *
 * Heights are compared through `quantize()` (see its docblock) and `used`
 * accumulates raw, mirroring the pre-C3 loop term for term so this
 * refactor cannot move a knife-edge page break.
 *
 * @template {{ height: number, gapBefore?: number }} B
 * @param {B[]} flow                             ordered blocks for one column
 * @param {(pageIndex: number) => number} budgetFn  usable height of page `i`, pt
 * @param {'frontload'} [policy]
 * @returns {PackedPage<B>[]}
 */
export function packBlocks(flow, budgetFn, policy = 'frontload') {
  if (policy !== 'frontload') {
    throw new Error(`packBlocks: unsupported policy "${policy}" (only 'frontload' exists today)`)
  }
  /** @type {PackedPage<B>[]} */
  const pages = []
  let i = 0
  while (i < flow.length) {
    const budget = budgetFn(pages.length)

    // Rule 1, stated where it happens: the first block on a page is placed
    // UNCONDITIONALLY. A block taller than any page still gets placed — it
    // then overflows and FLOWS (react-pdf's wrap:true), which is the only
    // Invariant-0-compatible answer, since the alternative is dropping it.
    // This is also what guarantees termination: every iteration of the outer
    // loop consumes at least one block.
    //
    // (Pre-C3 this was written as a `if (page.length === 0) page.push(...)`
    // fallback *after* the fill loop, which the fill loop's own
    // `page.length > 0 &&` guard made unreachable — the same decision, but
    // dead and therefore untestable. Hoisting it makes the rule explicit and
    // exercised, with byte-identical arithmetic: the first block never charges
    // a `gapBefore`, every later one always does.)
    /** @type {B[]} */
    const blocks = [flow[i]]
    let used = flow[i].height
    i++

    while (i < flow.length) {
      const b = flow[i]
      const gap = b.gapBefore ?? 0
      if (quantize(used + gap + b.height) > quantize(budget)) break
      blocks.push(b)
      used += gap + b.height
      i++
    }
    pages.push({ blocks, used: quantize(used), budget: quantize(budget) })
  }
  return pages
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
 * Warning threshold for estimatePage1Overflow, in points.
 *
 * Pre-C2, this was 220pt — an empirical fudge sized to absorb the
 * char-width estimator's own ~20-34% looseness (calibration note, now
 * historical: the shipped scaffold's tuned config used to estimate +209pt
 * under the loose estimator and render with room to spare; the mildest
 * observed real overflow estimated +257pt; 220 sat between the two).
 *
 * C2 replaces that loose estimator with real fontkit measurement wherever a
 * `measure` is injected (render.js always injects one), so the threshold
 * shrinks to a small, honest safety backstop — `spacing.safety` (15pt),
 * the same per-page margin the packer itself budgets against — rather than
 * a number sized to paper over a bad estimate. G-a: the margin is shrunk,
 * not deleted; a real measurement can still be off by a point or two
 * (kerning/kerning-adjacent rounding), so a bare `> 0` would be too twitchy.
 *
 * When no `measure` is injected (the isomorphic browser-preview fallback,
 * or any caller that doesn't build one), this same small threshold now
 * applies to the LOOSE estimate too — which will warn somewhat more often
 * there than it used to (the loose estimate overshoots real height, so a
 * config that truly fits can still read as "15pt over" on the estimate
 * alone). That trade-off is intentional: every real entry point that emits
 * this warning today (`cvx build`, `cvx validate`, the `build_pdf` /
 * `validate_cv` MCP tools) always has `fontsDir` available and injects the
 * real measurer, so it always gets the honest, tight threshold; only a
 * hypothetical measurer-less caller sees the looser signal degrade.
 */
export const PAGE1_OVERFLOW_WARN_THRESHOLD = 15

/**
 * Estimate how far a forced page1ExperienceCount overshoots the page-1 budget.
 *
 * Returns the raw estimate in points (0 when no count is forced). Compare
 * against PAGE1_OVERFLOW_WARN_THRESHOLD before warning. Mirrors the
 * config-driven branch of packExperiences: the first (count - 1) entries
 * render whole, the last is optionally cut at page1SplitBullets. When
 * content really overflows, react-pdf FLOWS it onto extra physical pages —
 * it does not clip and (thanks to the templates' minHeight, never a fixed
 * height) does not compress. The cost of a forced overflow is therefore
 * unplanned pages and wasted space, not lost text. Verified by render
 * 2026-08-01: page1ExperienceCount forced ~541pt over budget yields 3 pages
 * with all 20 bullets present in the extracted text.
 *
 * @param {import('./types.js').Measurer} [measure]
 *   optional real-font measurer (render.js/validateContent.js inject one
 *   when they have `fontsDir`); omit for the char-width estimate.
 */
export function estimatePage1Overflow(
  /** @type {import('./types.js').ExperienceEntry[]} */ experience,
  /** @type {import('./types.js').Summary} */ summary,
  /** @type {import('./types.js').CVConfig} */ config = {},
  /** @type {import('./types.js').Theme | undefined} */ theme = undefined,
  /** @type {import('./types.js').Measurer | undefined} */ measure = undefined
) {
  const { page1ExperienceCount: count, page1SplitBullets: splitAt } = config
  if (count == null) return 0

  const m = deriveMetrics(theme)
  const entries = experience.slice(0, count).map((e, i) => {
    const isLast = i === count - 1
    if (isLast && splitAt != null && splitAt < (e.bullets?.length ?? 0))
      return { ...e, endBullet: splitAt }
    return e
  })

  let used = 0
  entries.forEach((e, i) => {
    used += entryH(e, m, measure) + (i > 0 ? calcDividerH(m) : 0)
  })

  const budget = mainFirstBudget(m, summaryH(summary ?? [], m, measure))

  return Math.max(0, Math.round(quantize(used) - quantize(budget)))
}

/**
 * Wrap experience entries as `packBlocks` flow blocks: the entry divider is
 * the `gapBefore` (ExperienceSection renders it between entries only).
 *
 * @param {import('./types.js').ExperienceEntry[]} entries
 * @param {Metrics} m
 * @param {import('./types.js').Measurer | undefined} measure
 * @returns {{ entry: import('./types.js').ExperienceEntry, height: number, gapBefore: number }[]}
 */
function experienceBlocks(entries, m, measure) {
  const gapBefore = calcDividerH(m)
  return entries.map((entry) => ({ entry, height: entryH(entry, m, measure), gapBefore }))
}

/**
 * @param {import('./types.js').Measurer} [measure]
 *   optional real-font measurer — see estimatePage1Overflow's docblock.
 * @returns {{
 *   page1Experiences: import('./types.js').ExperienceEntry[],
 *   continuationChunks: import('./types.js').ExperienceEntry[][],
 *   totalPages: number,
 *   pageMetrics: { used: number, budget: number }[],
 * }}
 *   `pageMetrics[i]` is page `i`'s packed experience height and its budget —
 *   the per-page fill signal the C0 harness's front-load / over-budget
 *   invariants need (and, later, C6's `plan_layout` diagnostics).
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
        // render.js warns when it is; see estimatePage1Overflow).
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
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const sp = t.spacing
  const ty = t.typography.sidebarContact
  const p = data.personal ?? { name: '' }
  // Mirrors ContactSection's `rows` array + `.filter(r => r.value)`.
  const values = [
    p.phone,
    p.email,
    p.linkedin,
    p.facebook,
    p.location,
    ...(p.links ?? []).map((l) => l.label || l.href)
  ].filter(Boolean)
  const iconH = sp.iconWidth + sp.iconMt
  const valueW = sm.innerW - sp.iconWidth - sp.iconMr

  let h = sidebarTitleH('Contact', sm, measure)
  for (const value of values) {
    h +=
      Math.max(iconH, rowH(measure, value, ty.size, valueW, sm.cw, { leading: ty.leading })) +
      sp.contactRowMb
  }
  return h + sp.sectionGap // ContactSection's own wrap marginBottom
}

/** AchievementsSection — year + indented text, every item margin-bottomed (including the last). */
function achievementsH(
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  let h = sidebarTitleH('Achievements', sm, measure)
  for (const a of data.achievements ?? []) {
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
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH('Education', sm, measure)
  for (const e of data.education ?? []) {
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
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH('Certifications', sm, measure)
  for (const c of data.certifications ?? []) {
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
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH('Publications', sm, measure)
  for (const p of data.publications ?? []) {
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
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const ty = t.typography
  let h = sidebarTitleH('Languages', sm, measure)
  for (const l of data.languages ?? []) {
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
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const ch = t.chrome
  const ty = t.typography.tag
  const tags = data.competencies ?? []
  const titleH = sidebarTitleH('Core Competencies', sm, measure)
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
  /** @type {import('./types.js').CVContent} */ data,
  /** @type {SidebarMetrics} */ sm,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const { t } = sm
  const ty = t.typography
  const referees = data.referees ?? []
  let h = sidebarTitleH('Referees', sm, measure)
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
 * Measured height of one sidebar section, or `null` when the section renders
 * nothing at all (its component's own `if (!data.x?.length) return null`
 * guard) and must therefore be dropped from the flow rather than packed as a
 * zero-height block — a phantom block would still earn its divider and leave
 * a stray rule in the column.
 *
 * `contact` and `referees` have no presence guard: contact always renders its
 * title, and referees always renders either its entries or the "available
 * upon request" line.
 *
 * @param {string} key   sidebar slot key (registry.js)
 * @param {import('./types.js').CVContent} data
 * @param {SidebarMetrics} sm
 * @param {import('./types.js').Measurer} [measure]
 * @returns {number | null}
 */
export function sidebarSectionH(key, data, sm, measure = undefined) {
  switch (key) {
    case 'contact':
      return quantize(contactH(data, sm, measure))
    case 'achievements':
      return data.achievements?.length ? quantize(achievementsH(data, sm, measure)) : null
    case 'education':
      return data.education?.length ? quantize(educationH(data, sm, measure)) : null
    case 'certifications':
      return data.certifications?.length ? quantize(certificationsH(data, sm, measure)) : null
    case 'publications':
      return data.publications?.length ? quantize(publicationsH(data, sm, measure)) : null
    case 'languages':
      return data.languages?.length ? quantize(languagesH(data, sm, measure)) : null
    case 'competencies':
      return data.competencies?.length ? quantize(competenciesH(data, sm, measure)) : null
    case 'referees':
      return quantize(refereesH(data, sm, measure))
    default:
      // An unknown key renders nothing (registry.js warns and returns null),
      // so it contributes no height and no divider.
      return null
  }
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
 * Pack the sidebar flow across pages at WHOLE-SECTION granularity (a section
 * is atomic in this slice; item-level splitting of an over-tall section is
 * the next slice and is what Invariant 0 ultimately needs — until then an
 * over-tall section is placed alone and FLOWS onto extra physical pages,
 * never clipped).
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
 * @returns {{ pages: string[][], pageMetrics: { used: number, budget: number }[], totalPages: number }}
 */
export function packSidebar(keys, data, layout, theme = undefined, measure = undefined) {
  const sm = deriveSidebarMetrics(theme)
  const flow = keys
    .map((key) => ({ key, height: sidebarSectionH(key, data, sm, measure) }))
    .filter((b) => b.height !== null)
    .map((b) => ({
      key: b.key,
      height: /** @type {number} */ (b.height),
      gapBefore: sm.sectionDividerH
    }))

  const budgetFn = (/** @type {number} */ pageIndex) =>
    sm.bodyH -
    identityH(identityKeysFor(layout, pageIndex), data, sm, measure) -
    sm.padTop -
    sm.padBottom -
    sm.safety

  const packed = packBlocks(flow, budgetFn)
  return {
    pages: packed.map((p) => p.blocks.map((b) => b.key)),
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
      const sidebarKeys = sidebar.pages[index] ?? []
      const mainFill = main.pageMetrics[index] ?? null
      const sidebarFill = sidebar.pageMetrics[index] ?? null
      const over = (/** @type {{used: number, budget: number} | null} */ f) =>
        f ? Math.max(0, quantize(f.used - f.budget)) : 0
      const mainEmpty = mainBlocks.length === 0
      const sidebarEmpty = sidebarKeys.length === 0
      return {
        index,
        // Injected, never packed — see identityH().
        identity: identityKeysFor(layout, index),
        mainBlocks,
        sidebarKeys,
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
