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
//   summary if the summary spills), and four
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
// This module exports 30 names. Only eleven of them are API. The rest are
// exported so the C0 harness can measure the engine with the engine's own
// formulas instead of a hand-copied second implementation (C0's mirror-drift
// finding) — a testing affordance, not a commitment, and C7 must not document
// them as one.
//
//   PUBLIC — imported by shipped code, or part of the plan shape C6's
//   diagnostics and C7's docs are built on. Changing one of these is a
//   breaking change:
//     planTwoColumn, overflowWarnings, bodyHeight, contactRows,
//     sidebarFlowKeys, isIdentityKey, isContinuedSlice, sectionTitleLabel,
//     MEASURED_MAIN_KEYS, SIDEBAR_SECTION_KEYS, MAIN_SLOT_KEYS, bulletText
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
//     bulletWidth,
//     summaryH, entryH, entryParts, packBlocks, packExperiences, packSidebar,
//     identityH,
//     sidebarSliceH, sidebarSectionH, sidebarSectionItems, sidebarItemCount,
//     CONTINUED_SUFFIX, assertShrinks
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
  // NOTE: there is deliberately no `bulletW` here. The bullet column's width is
  // `bulletWidth(m, measure)` — the dash's real advance plus BulletList's
  // marginRight — and keeping a second, slightly-wider answer derived from
  // `spacing.bulletIndent` is how the model under-counted wrapped bullet lines
  // (design-layout-fidelity.md §3.4). `bulletIndent` survives only inside
  // bulletWidth's isomorphic browser fallback.

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
    // Typography
    sectionTitleSize: ty.sectionTitle.size,
    sectionTitleLeading: ty.sectionTitle.leading,
    roleSize: ty.role.size,
    roleLeading: ty.role.leading,
    roleWeight: ty.role.weight,
    captionSize: ty.caption.size,
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
    progPl: sp.progPl,
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
// ExpItem renders "{role} (cont'd)" on a continuation; the model measures the
// COMPOSED string. DECISION, not oversight (design §3.3): the suffix renders
// at meta size but is measured at the ROLE size — ~20% wider — because that is
// the safe side of a wrap boundary; an exact mirror would need a mixed-size
// line the measurer cannot express.
const CONTINUED_ROLE_SUFFIX = "(cont'd)"
// BulletList.jsx draws an en dash at the body size in semibold with a literal
// 5pt marginRight; the dash column is therefore its ADVANCE + 5, not the
// theme's `bulletIndent` guess. Mirrors a component fact, like BODY_STYLE.
const BULLET_DASH = '\u2013'
const BULLET_DASH_STYLE = { weight: 600, italic: false }
const BULLET_DASH_MR = 5
/**
 * The bullet column's wrap width: innerW minus the dash column BulletList
 * actually draws (dash advance + its literal 5pt marginRight).
 * @internal exported for the C0 harness only — not API (see the module docblock).
 */
export function bulletWidth(
  /** @type {Metrics} */ m,
  /** @type {import('./types.js').Measurer | undefined} */ measure
) {
  const dash = measure?.widthOf
    ? measure.widthOf(BULLET_DASH, m.bodySize, BULLET_DASH_STYLE)
    : BULLET_DASH.length * m.bodySize * m.cw
  return m.innerW - dash - BULLET_DASH_MR
}

/**
 * The string a bullet actually DRAWS.
 *
 * RV4: `BulletList.jsx` renders the object form as one `<Text>` — `text`, then
 * the `<Link>` label, then `suffix`, back to back — so react-pdf wraps them as
 * a single run. All four height formulas measured `b.text` alone and dropped
 * the other two, which under-measured any bullet whose link label or suffix
 * pushed the combined string past a line boundary: 27.00pt on the shipped
 * theme, two full body lines, against a 15pt safety margin.
 *
 * Unpriced ink, so INV-3 — and invisible to INV-2's diff tables because the
 * harness's own comparison helper stripped `link`/`suffix` the same way. The
 * instrument agreed with the bug, which is why this is exported at all rather
 * than duplicated: one function, every side.
 *
 * Public because SHIPPED code imports it: `ATSDocument.jsx` draws bullets with
 * it, `BulletList.jsx`'s JSX composes the same three parts, the four
 * measurement call sites price it, and the render-diff harness matches rendered
 * rows against it. That is the whole point — one definition of "what a bullet
 * says", so the measurer and both renderers cannot disagree again.
 * @param {string | { text?: string, link?: { label?: string }, suffix?: string }} b
 * @returns {string}
 */
export function bulletText(b) {
  if (typeof b === 'string') return b
  return `${b?.text ?? ''}${b?.link?.label ?? ''}${b?.suffix ?? ''}`
}

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
  // Nothing renders for an empty summary — `SummarySection` returns null on
  // `!summary?.length` — so nothing is charged. Mirroring that (§4: the model
  // mirrors the render) is what makes an experience-less, summary-less CV
  // report an honestly blank main column instead of one holding a phantom
  // title. Every fixture and the shipped scaffold have a summary, so this
  // changes no existing packing decision; the baseline is unmoved.
  if (summary.length === 0) return 0
  let h = calcTitleH(m) + m.descMt // title + bullet list margin-top
  for (const b of summary) {
    const txt = bulletText(b)
    h +=
      countLines(measure, txt, m.bodySize, bulletWidth(m, measure), m.cw, BODY_STYLE) *
      lh(m.bodySize, m.bodyLeading)
  }
  h += (summary.length - 1) * m.summaryBulletGap
  return quantize(h)
}

/**
 * The progression rows one piece renders — `[startProg, endProg)`, defaulting
 * to the whole table (D7). Both kinds of piece can carry rows: a head takes a
 * prefix, its continuation takes the rest.
 *
 * @param {import('./types.js').ExperienceEntry} e
 * @returns {import('./types.js').ProgressionStep[]}
 */
function progressionSlice(e) {
  const all = e.progression ?? []
  return all.slice(e.startProg ?? 0, e.endProg ?? all.length)
}

/**
 * The COMPONENTS of one entry's measured height, in render order — the same
 * arithmetic `entryH` sums, exposed as its terms.
 *
 * P2/D4: `entryH` computes these and immediately collapses them to one number,
 * so `smallestPiecePt` arrived as an opaque total and nothing anywhere said
 * which term dominated it. On real CVs `description` + `progression` are
 * 52-60% of an entry's head, which is why the one sentence explaining the
 * blockage pointed readers at the summary instead.
 *
 * REPORTING ONLY — `entryH` remains the authoritative height and its body is
 * deliberately NOT refactored to sum this. Summing the same terms in a
 * different association order moved 240 of 4320 swept entry shapes by 0.01pt
 * (float addition is not associative; every case was the progression +
 * description combination). At a knife edge that is a different packing
 * decision and a dead baseline, for a feature that only publishes numbers. So
 * the two are kept separate and pinned together by a test asserting they agree
 * within one quantum — see `layout.entryParts.test.js`.
 *
 * `headPt` is the indivisible part: everything a page-leading piece must carry
 * before its first bullet. `bulletsPt` is per-bullet, in slice order.
 *
 * @internal exported for the C0 harness only — not API (see the module docblock).
 * @returns {{ rolePt: number, metaPt: number, locationPt: number, descriptionPt: number,
 *   progressionPt: number, bulletsPt: number[], bulletGapPt: number, entryMbPt: number,
 *   headPt: number, totalPt: number }}
 */
export function entryParts(
  /** @type {import('./types.js').ExperienceEntry} */ e,
  /** @type {Metrics} */ m,
  /** @type {import('./types.js').Measurer | undefined} */ measure = undefined
) {
  const visible = (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet)
  const bulletsPt = visible.map(
    (b) =>
      countLines(measure, bulletText(b), m.bodySize, bulletWidth(m, measure), m.cw, BODY_STYLE) *
      lh(m.bodySize, m.bodyLeading)
  )
  // A continuation piece drops company/period/location/description/progression
  // entirely and re-renders the role line with its "(cont'd)" suffix.
  const rolePt = e.isContinuation
    ? rowH(measure, `${e.role} ${CONTINUED_ROLE_SUFFIX}`, m.roleSize, m.innerW, m.cw, {
        weight: m.roleWeight,
        leading: m.roleLeading
      })
    : rowH(measure, e.role, m.roleSize, m.innerW, m.cw, {
        weight: m.roleWeight,
        leading: m.roleLeading
      })
  let metaPt = 0
  let locationPt = 0
  let descriptionPt = 0
  let progressionPt = 0
  if (!e.isContinuation) {
    metaPt =
      m.entryMetaMt +
      Math.max(
        rowH(measure, e.company ?? '', m.bodySize, m.innerW, m.cw, {}),
        rowH(measure, e.period ?? '', m.metaSize, m.innerW, m.cw, {})
      )
    if (e.location)
      locationPt = m.locationMb + rowH(measure, e.location, m.metaSize, m.innerW, m.cw, {})
    if (e.description) {
      const dl = countLines(measure, e.description, m.descSize, m.innerW, m.cw, DESC_STYLE)
      descriptionPt = m.descMt + dl * lh(m.descSize, m.descLeading) + m.descMb
    }
  }
  // D7: the promotion table is a SLICE now, on both kinds of piece. A
  // continuation used to carry no progression at all; it can now carry the
  // rows its head did not take, which is what lets a role start on a part-full
  // page instead of waiting for room for the whole table.
  const progRows = progressionSlice(e)
  if (progRows.length > 0) {
    const pw = m.innerW - m.progPl - m.sectionBorderWidth
    progressionPt =
      m.progMt +
      m.progMb +
      progRows.reduce(
        (acc, p) =>
          acc +
          m.progPy * 2 +
          Math.max(
            rowH(measure, p.title ?? '', m.metaSize, pw, m.cw, {}),
            rowH(measure, p.period ?? '', m.captionSize, pw, m.cw, {})
          ),
        0
      )
  }
  // `descMt` is the bullet list's own margin-top, charged once when any bullet
  // is visible — it belongs to the bullets, not the head.
  const listMt = bulletsPt.length > 0 ? m.descMt : 0
  const bulletGapPt = bulletsPt.length > 0 ? (bulletsPt.length - 1) * m.bulletGap : 0
  const headPt = rolePt + metaPt + locationPt + descriptionPt + progressionPt
  return {
    rolePt,
    metaPt,
    locationPt,
    descriptionPt,
    progressionPt,
    bulletsPt,
    bulletGapPt,
    entryMbPt: m.entryMb,
    headPt,
    totalPt: headPt + listMt + bulletsPt.reduce((a, b) => a + b, 0) + bulletGapPt + m.entryMb
  }
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
    let h = rowH(measure, `${e.role} ${CONTINUED_ROLE_SUFFIX}`, m.roleSize, m.innerW, m.cw, {
      weight: m.roleWeight,
      leading: m.roleLeading
    })
    // D7: a continuation may now carry the progression rows its head did not
    // take. Charged in exactly the order ExpItem draws them — table, then
    // bullets — so the mirror between model and render holds.
    const contProg = progressionSlice(e)
    if (contProg.length > 0) {
      h += m.progMt + m.progMb
      const pw = m.innerW - m.progPl - m.sectionBorderWidth
      for (const p of contProg) {
        h +=
          m.progPy * 2 +
          Math.max(
            rowH(measure, p.title ?? '', m.metaSize, pw, m.cw, {}),
            rowH(measure, p.period ?? '', m.captionSize, pw, m.cw, {})
          )
      }
    }
    const visible = (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet)
    if (visible.length > 0) {
      h += m.descMt
      for (const b of visible) {
        const txt = bulletText(b)
        h +=
          countLines(measure, txt, m.bodySize, bulletWidth(m, measure), m.cw, BODY_STYLE) *
          lh(m.bodySize, m.bodyLeading)
      }
      h += (visible.length - 1) * m.bulletGap
    }
    h += m.entryMb
    return quantize(h)
  }

  let h = 0
  h += rowH(measure, e.role, m.roleSize, m.innerW, m.cw, {
    weight: m.roleWeight,
    leading: m.roleLeading
  })
  h +=
    m.entryMetaMt +
    Math.max(
      rowH(measure, e.company ?? '', m.bodySize, m.innerW, m.cw, {}),
      rowH(measure, e.period ?? '', m.metaSize, m.innerW, m.cw, {})
    )
  if (e.location) h += m.locationMb + rowH(measure, e.location, m.metaSize, m.innerW, m.cw, {})
  if (e.description) {
    const dl = countLines(measure, e.description, m.descSize, m.innerW, m.cw, DESC_STYLE)
    h += m.descMt + dl * lh(m.descSize, m.descLeading) + m.descMb
  }
  // D7: the rows THIS piece renders, not necessarily the whole table.
  const headProg = progressionSlice(e)
  if (headProg.length > 0) {
    h += m.progMt + m.progMb
    const pw = m.innerW - m.progPl - m.sectionBorderWidth
    for (const p of headProg) {
      h +=
        m.progPy * 2 +
        Math.max(
          rowH(measure, p.title ?? '', m.metaSize, pw, m.cw, {}),
          rowH(measure, p.period ?? '', m.captionSize, pw, m.cw, {})
        )
    }
  }
  const visibleBullets = (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet)
  if (visibleBullets.length > 0) {
    h += m.descMt
    for (const b of visibleBullets) {
      const txt = bulletText(b)
      h +=
        countLines(measure, txt, m.bodySize, bulletWidth(m, measure), m.cw, BODY_STYLE) *
        lh(m.bodySize, m.bodyLeading)
    }
    h += (visibleBullets.length - 1) * m.bulletGap
  }
  h += m.entryMb
  return quantize(h)
}

// ── The generic packing engine (C3, design doc §4.4 `greedy`/`frontload`) ───

/**
 * @template {{ height: number, gapBefore?: number }} B
 * @typedef {{ blocks: B[], used: number, budget: number, blockedBy: BlockDecline | null }} PackedPage
 */

/**
 * §3.8's decline record: why the next block did not start on a page. See
 * declineOf().
 * @typedef {{ index: number, smallestPiecePt: number, residualPt: number, gapBeforePt: number }} BlockDecline
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

  /** Flow index the current `carry` was cut from — kept so a decline of a
   * carried tail names the right block (review R-b: `i` has already advanced
   * past it, and both budget functions being two-valued is what keeps the
   * wrong-index path unreachable TODAY; a third budget — P3's per-page
   * geometry is the plausible route — would make it live). */
  let carryIndex = -1
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
        // The page ends EMPTY, and packBlocks knows exactly why: the lead's
        // smallest legal piece is taller than this page's whole budget. That
        // reason used to be thrown away here — recording it is what lets the
        // diagnostics say "short by Xpt" instead of nothing (§3.8's blockedBy;
        // the post-mortem's T7 is this line staying silent).
        pages.push({
          blocks: [],
          used: 0,
          budget: quantize(budget),
          blockedBy: declineOf(lead, carry !== null ? carryIndex : i, quantize(budget), 0)
        })
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

    /** @type {ReturnType<typeof declineOf> | null} */
    let blockedBy = null
    /** @type {B[]} */
    const blocks = [leadCut ? leadCut.head : lead]
    let used = blocks[0].height
    if (leadCut) {
      assertCarryShrinks(lead, leadCut.tail, i - 1)
      carry = leadCut.tail
      carryIndex = i - 1
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
      if (cut === null) {
        // The decline that ends most pages: block b could not start here, not
        // even cut to its smallest legal piece. Record why (§3.8). A page that
        // ends via a SPLIT instead (cut !== null, carry set) records null —
        // the next block DID start here, as a head.
        blockedBy = declineOf(b, i, quantize(budget - used), gap)
        break
      }
      assertCarryShrinks(b, cut.tail, i)
      blocks.push(cut.head)
      used += gap + cut.head.height
      carry = cut.tail
      carryIndex = i
      i++
    }
    pages.push({ blocks, used: quantize(used), budget: quantize(budget), blockedBy })
  }
  return pages
}

/**
 * Why a page ended without the next block starting on it: the price of the
 * page break, recorded at the moment packBlocks declines the block. Data, not
 * a warning — it is true at nearly every page boundary and carries no
 * judgement. `smallestPiecePt` is the block's minimum legal piece (head +
 * one item), or its whole height when it has no legal cut; `residualPt` is
 * the room that was left BEFORE the gap the block would have charged.
 *
 * @template {{ height: number, gapBefore?: number, split?: SplitFn<B> }} B
 * @param {B} block
 * @param {number} index   the block's flow index
 * @param {number} residualPt
 * @param {number} gapBeforePt
 */
function declineOf(block, index, residualPt, gapBeforePt) {
  const min = block.split?.(0, true) ?? null
  return {
    index,
    smallestPiecePt: quantize(min ? min.head.height : block.height),
    residualPt,
    gapBeforePt
  }
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
function mainFirstBudget(
  /** @type {Metrics} */ m,
  /** @type {number} */ sumH,
  /** @type {number} */ spacerPt
) {
  return (
    m.bodyH -
    m.cornerH -
    m.mainPad.top -
    m.mainPad.bottom -
    sumH -
    spacerPt -
    calcTitleH(m) -
    m.safety
  )
}

/** Usable height for experience entries on a continuation page (only the "Experience (continued)" title sits above them). */
function mainContBudget(/** @type {Metrics} */ m, /** @type {number} */ spacerPt = 0) {
  return (
    m.bodyH - m.cornerH - m.contPad.top - m.contPad.bottom - calcTitleH(m) - m.safety - spacerPt
  )
}

/**
 * The spacer height a page-kind's `main` slot actually DECLARES, in points (D5).
 *
 * The budgets used to subtract `theme.spacing.spacer` — a constant 27 — whether
 * or not the layout had a spacer slot and whatever value it carried, so
 * `spacer: 0`, `spacer: 200`, two spacers and no spacer at all produced
 * byte-identical plans while the renderer honoured the declared value. Two
 * consequences, both measured: 27pt of page 1 was unusable even with no spacer
 * present (deleting one did not return it — demonstrated on a CV whose
 * `shortByPt` was 23.36, below the phantom), and a continuation-page spacer was
 * charged nothing at all, so `spacer: 200` there spilled a fourth sheet against
 * a three-page plan.
 *
 * @param {import('./types.js').NormalizedLayout | undefined} layout
 * @param {'first' | 'continuation' | 'last'} kind
 */
function declaredMainSpacerPt(layout, kind) {
  let total = 0
  for (const slot of layout?.[kind]?.main ?? []) {
    if (typeof slot !== 'string' || !slot.startsWith('spacer:')) continue
    const v = Number.parseFloat(slot.slice('spacer:'.length))
    if (Number.isFinite(v)) total += v
  }
  return total
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
 * one description, one sidebar item — is taller than a whole page. (A third,
 * config-forced shape existed until the page1ExperienceCount lever was
 * removed.) The message says which shape it is.
 *
 * Threshold is `PAGE1_OVERFLOW_WARN_THRESHOLD`: the budgets already subtract `spacing.safety`, so a
 * sub-point overrun is measurement noise eating the margin, not a page break.
 *
 * @param {import('./types.js').LayoutPlan | undefined} plan
 * @returns {{ page: number, overflowPt: number, forcedByConfig: boolean, message: string }[]}
 */
export function overflowWarnings(plan) {
  const out = []
  for (const page of plan?.pages ?? []) {
    if (page.overflowPt <= PAGE1_OVERFLOW_WARN_THRESHOLD) continue
    const over = Math.round(page.overflowPt)
    // Which of the two shapes is it? A negative main budget means the FIXED
    // content the packer subtracts before packing anything (the summary, the
    // spacer, the section title) is already taller than the column — no
    // pagination of the experience list can help, because the experience list
    // is not what overflowed.
    //
    // (There used to be a third, config-forced shape here. The
    // page1ExperienceCount / page1SplitBullets levers were REMOVED — measured
    // anti-lever, see design-cvx-as-instrument.md §7 and
    // design-layout-fidelity.md §3.10's Review outcome — so automatic packing,
    // which never overflows by itself, is the only packing there is.
    // `forcedByConfig` stays on the shape, always false, so consumers that
    // match on it keep working; documented deprecated in types.d.ts.)
    const fixedTooTall = (page.mainFill?.budget ?? 0) < 0
    out.push({
      page: page.index + 1,
      overflowPt: page.overflowPt,
      forcedByConfig: false,
      message: fixedTooTall
        ? `page ${page.index + 1} is ~${over}pt over budget before a single experience entry ` +
          `is placed: the summary alone is taller than the main column, so it flows onto an ` +
          `extra physical sheet the page numbering does not count. The summary is fixed page-1 ` +
          `content rather than a packed block, so no pagination can move it.`
        : `page ${page.index + 1} is ~${over}pt over budget — a single block on it is taller ` +
          `than a whole page and cannot be split any further, so it flows onto an extra ` +
          `physical sheet the page numbering does not count. The block is one item (a bullet, ` +
          `a description or a sidebar entry), and item boundaries are the only legal cuts.`
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
      // D7 `prog-split`. The cut axis is the entry's ATOMS in document order:
      // the progression rows this piece holds, then its bullets. Before, only
      // bullets were atoms, so the whole promotion table was welded into the
      // indivisible head — a 12-row table made the head arbitrarily tall with
      // no upper bound, and a role carrying one was far harder to start on a
      // part-full page than its bullet count suggested.
      //
      // The anti-orphan rule is unchanged and is what makes this safe: the
      // search range `[1, n-1]` inside `largestFittingPrefix` keeps at least
      // one atom on each side, so a head that cuts inside the table still
      // carries the heading PLUS at least one progression row. That is why
      // this variant never orphans a bare heading, where deferring the table
      // wholesale (or the description with it) does.
      const prog = entry.progression ?? []
      const pStart = entry.startProg ?? 0
      const pEnd = entry.endProg ?? prog.length
      const nProg = Math.max(0, pEnd - pStart)

      const bullets = entry.bullets ?? []
      const bStart = entry.startBullet ?? 0
      const bEnd = entry.endBullet ?? bullets.length
      const nBullets = Math.max(0, bEnd - bStart)

      const n = nProg + nBullets
      /** The piece holding the first `k` atoms: table rows first, then bullets. */
      const pieceAt = (/** @type {number} */ k) => ({
        ...entry,
        startProg: pStart,
        endProg: pStart + Math.min(k, nProg),
        startBullet: bStart,
        endBullet: bStart + Math.max(0, k - nProg)
      })
      const headAt = (/** @type {number} */ k) => entryH(pieceAt(k), m, measure)
      const k = largestFittingPrefix(n, headAt, room, forceMinimum)
      if (k === 0) return null
      // The head keeps the entry's own kind (a continuation stays a
      // continuation), so a long entry can be cut more than once.
      const head = experienceBlock(pieceAt(k), m, measure, gapBefore)
      const tail = experienceBlock(
        {
          ...entry,
          isContinuation: true,
          startProg: pStart + Math.min(k, nProg),
          endProg: pEnd,
          startBullet: bStart + Math.max(0, k - nProg),
          endBullet: bEnd
        },
        m,
        measure,
        gapBefore
      )
      assertShrinks(`experience entry "${entry.role}"`, n, n - k, tail, height)
      return { head, tail }
    }
  }
}

/**
 * The measurement a placed piece carries out of the packer (P2).
 *
 * `heightPt` is the packer's own authoritative figure for this piece; the
 * remaining terms are `entryParts`' reporting breakdown of it, so a consumer
 * can price an edit ("this bullet costs 43pt", "this progression table costs
 * 63.9pt of an indivisible head") by subtraction instead of by rebuilding.
 *
 * @param {ExperienceBlock} b
 * @param {Metrics} m
 * @param {import('./types.js').Measurer | undefined} measure
 */
function measuredOf(b, m, measure) {
  const p = entryParts(b.entry, m, measure)
  return {
    heightPt: quantize(b.height),
    gapBeforePt: quantize(b.gapBefore),
    // The indivisible page-leading part: a piece cannot start a page without
    // all of this PLUS its first bullet (see `experienceBlock().split`).
    headPt: quantize(p.headPt),
    head: {
      rolePt: quantize(p.rolePt),
      metaPt: quantize(p.metaPt),
      locationPt: quantize(p.locationPt),
      descriptionPt: quantize(p.descriptionPt),
      progressionPt: quantize(p.progressionPt)
    },
    bulletsPt: p.bulletsPt.map(quantize),
    bulletGapPt: quantize(p.bulletGapPt)
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
 *   pageMetrics: { used: number, budget: number, capacity: number, blockedBy: (BlockDecline & { entry: import('./types.js').ExperienceEntry | null }) | null }[],
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
  /** @type {import('./types.js').Theme | undefined} */ theme = undefined,
  /** @type {import('./types.js').Measurer | undefined} */ measure = undefined,
  /**
   * What the LAYOUT declares for page 1's main column (D2/D5). Omitted, the
   * pre-fix constants apply, which is what the harness callers want; the
   * planner passes the real figures.
   * @type {{ firstSpacerPt?: number, contSpacerPt?: number, summaryInFirstMain?: boolean }}
   */ slots = {}
) {
  const m = deriveMetrics(theme)
  const spacer1 = slots.firstSpacerPt ?? m.spacer
  const BC = mainContBudget(m, slots.contSpacerPt ?? 0)
  // ── Automatic front-load bin-packing ─────────────────────────────────────
  // D2: only charge the summary to page 1 when the layout actually puts it
  // there. It used to be charged unconditionally, so a `first.main` without
  // `summary` reserved its whole height (298.8pt on the scaffold) for content
  // that is never drawn.
  const sumH = slots.summaryInFirstMain === false ? 0 : summaryH(summary, m, measure)
  const B1 = mainFirstBudget(m, sumH, spacer1)
  const packed = packBlocks(experienceBlocks(experience, m, measure), (i) => (i === 0 ? B1 : BC))

  // I2 — THE DEGENERATE INPUT MUST STILL HAVE A ROW.
  //
  // `packBlocks([])` returns zero pages, which is right for a flow with no
  // blocks — but page 1 is not empty when there is a summary on it, and the
  // caller has no other way to learn that. Publishing zero pages here deleted
  // the page-1 metrics row, and with it: every `main.*` diagnostic (they read
  // null), the `overflowPt` sum (nothing to add), and the reachability of
  // `overflowWarnings`' own fixedTooTall branch — which is keyed on
  // `mainFill.budget < 0` and so could never fire on the one shape where the
  // summary alone overflows the column. A 30-bullet summary with no experience
  // rendered three sheets with `warnings: []`. The row IS the fix; the
  // warnings that follow are the machinery that already existed.
  //
  // The budget deliberately differs from `mainFirstBudget`: that charges the
  // "EXPERIENCE" section title, and `ExperienceSection` returns null for an
  // empty list, so no such title is drawn. Charging it would over-state the
  // fixed content by a title's height — the model mirrors the render (§4).
  if (packed.length === 0 && sumH > 0) {
    const capacity = quantize(mainColumnCapacity(m, m.mainPad))
    return {
      page1Experiences: [],
      continuationChunks: [],
      totalPages: 1,
      pageMetrics: [
        /** @type {{ used: number, budget: number, capacity: number, spacerPt: number, blockedBy: null }} */ ({
          used: 0,
          budget: quantize(capacity - sumH - spacer1),
          capacity,
          spacerPt: quantize(spacer1),
          // Nothing was blocked: there is no next entry to name.
          blockedBy: null
        })
      ]
    }
  }

  // P2: carry each placed piece's measured geometry out with it. `packBlocks`
  // computed `b.height` and this line used to drop it on the floor, which is
  // why an assistant could see `shortByPt` (how much to free) but nothing at
  // all about what any candidate edit was WORTH — so pricing one meant editing
  // the YAML and rebuilding. `measured` is additive: the renderer reads
  // role/company/bullets off these objects and ignores it.
  const pages = packed.map((p) =>
    p.blocks.map((b) => ({ ...b.entry, measured: measuredOf(b, m, measure) }))
  )

  return {
    page1Experiences: pages[0] ?? [],
    continuationChunks: pages.slice(1),
    totalPages: pages.length,
    // `capacity` is the WHOLE column this page offers (§3.9): what remains
    // after the physical frame (pads, badge, safety) but before any fixed
    // content. `capacity − budget` is therefore the page's fixed content —
    // summary + spacer + section title on page 1, the title alone on
    // continuation pages — which is what makes fills comparable across pages.
    // `blockedBy` names the entry that could not start on this page (§3.8).
    pageMetrics: packed.map(({ used, budget, blockedBy }, i) => ({
      used,
      budget,
      capacity: quantize(
        i === 0 ? mainColumnCapacity(m, m.mainPad) : mainColumnCapacity(m, m.contPad)
      ),
      // The literal `- spacer: N` this page's main slot declares (D5 made the
      // planner charge the declared value rather than a theme constant). It is
      // published because it is the CHEAPEST lever there is for a small
      // shortfall — pure whitespace, editable in the layout file, costing no
      // words — and the 1.8.0 dogfood found an author with a "don't change the
      // text" brief discovering it by reading the YAML, because
      // `page1-ends-early` named only content edits. A number beside
      // `shortByPt` turns that judgement into arithmetic.
      spacerPt: quantize(i === 0 ? spacer1 : (slots.contSpacerPt ?? 0)),
      blockedBy: blockedBy ? { ...blockedBy, entry: experience[blockedBy.index] ?? null } : null
    }))
  }
}

/**
 * The whole main column on one page, before any content — fixed or packed —
 * is charged: body box minus the page-number badge, this page kind's paddings,
 * and the safety backstop. Denominator of the §3.9 comparable fill.
 *
 * @param {Metrics} m
 * @param {{ top: number, bottom: number }} pad
 */
function mainColumnCapacity(m, pad) {
  return m.bodyH - m.cornerH - pad.top - pad.bottom - m.safety
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
 * Every sidebar slot key the packer knows how to measure and slice, in registry
 * order.
 *
 * Public for the same reason `MEASURED_MAIN_KEYS` is: it is the ONE list. The
 * packer drops any sidebar slot key absent from it, and `validateContent.js`
 * turns exactly that condition into the `slot-not-renderable` error — so a
 * hand-copied second list in the validator is the drift shape that would let
 * the two disagree, and the disagreement is silent content loss (D2: `summary`
 * in a sidebar slot deleted the section from the PDF while `validate --strict`
 * reported ok). Whatever the packer cannot render, the validator must refuse.
 */
export const SIDEBAR_SECTION_KEYS = Object.keys(SIDEBAR_SECTIONS)

/**
 * The main-flow section keys this packer actually measures — the whole of what
 * `packExperiences` prices. Exported because it is the ONE list: the
 * `main-slot-unmeasured` fact, the schema's caveat and the docs all derive
 * from it, so the day I4/I6 widen the packer they cannot fall out of step with
 * what the instrument claims (a hand-copied second list is the drift shape
 * that let a reordered component pass a 455-test suite — see ARCHITECTURE §4).
 *
 * Public, but NOT a permanent surface: §8's I4/I6 make the packer measure
 * main-slot sections, at which point this constant and the fact derived from
 * it both disappear. Removing it then is not a breaking change — it is the
 * scaffolding for a gap coming down, and it is recorded here so a future
 * reader does not treat the public tag as a promise to keep it forever.
 */
export const MEASURED_MAIN_KEYS = Object.freeze(['summary', 'experience'])

/**
 * The section a slot entry names. Resolved layouts normalise every slot to a
 * `key` or `key:arg` STRING — `{spacer: 27}` in the YAML arrives here as
 * `'spacer:27'`, and a continuation marker as `'experience:continued'` — so
 * the section is the part before the colon. (Discovered by measurement while
 * building I1: comparing whole slot strings reported the shipped default
 * layout's own spacer as an unmeasured section.)
 *
 * @param {unknown} slot
 * @returns {string}
 */
const slotKey = (slot) => String(slot ?? '').split(':')[0]

/**
 * Every section key a layout can render, in either column. `contact` is here
 * because a slot draws it, even though its content lives in `personal.yaml`.
 *
 */
const RENDERABLE_SECTION_KEYS = Object.freeze([...MEASURED_MAIN_KEYS, ...SIDEBAR_SECTION_KEYS])

/**
 * Every slot key a `main` slot can actually draw — the accept-list
 * `validateContent`'s `slot-not-renderable` check derives from (RV1).
 *
 * Public for the same reason `SIDEBAR_SECTION_KEYS` is: it is the ONE list,
 * and a hand-copied second copy is precisely how this gap stayed open. D2 gave
 * the sidebar half a shared list in 1.8.0; the main half was never written at
 * all, so `- experiance` in `first.main` deleted five of the scaffold's sixteen
 * bullets under a clean `validate --strict`.
 *
 * Three things sit here that `RENDERABLE_SECTION_KEYS` does not carry, and each
 * is load-bearing rather than defensive:
 *
 * - `header-ats` draws from `personal.yaml` rather than a content section of
 *   its own, so it is not a "renderable section" — but the SHIPPED
 *   single-column layout puts it in `first.main` (`defaultLayouts.js`), and an
 *   accept-list without it would fail the scaffold CVX itself generates.
 * - `experience:continued` is the one `:continued` form the renderer
 *   implements (`sections/registry.js`). Every other `<section>:continued`
 *   draws nothing, which is why main slots match the WHOLE key rather than the
 *   `split(':')[0]` prefix the sidebar arm uses (RV1).
 * - the `identity-*` keys are matched by prefix at the call site, as the
 *   sidebar arm already does.
 *
 * Not a permanent surface, for the same reason `MEASURED_MAIN_KEYS` is not:
 * when I6 gives every section a co-located plugin, the renderer's own registry
 * becomes the single list and this one goes away with the gap it patches.
 */
export const MAIN_SLOT_KEYS = Object.freeze([
  ...RENDERABLE_SECTION_KEYS,
  'header-ats',
  'experience:continued'
])

/**
 * Content sections that are POPULATED but that no slot in this layout renders —
 * so the designed PDF silently omits them.
 *
 * The 1.8.0 dogfood found this the hard way: `referees.yaml` with a real
 * referee in it rendered in the ATS variant and vanished from the designed one,
 * with `validate --strict` clean and both builds reporting nothing. It is the
 * shipped DEFAULT: `layouts/two-column.yaml` deliberately omits `referees`
 * (~231pt), so anyone who fills that file in loses it from the designed CV.
 *
 * Why the engine cannot just render it anyway: a section with no slot has no
 * position — the layout IS the statement of where things go, and inventing a
 * place for an unplaced section would override the designer (§7.3). So the
 * honest move is not to place it, but to say so. That is INV-5: the content is
 * still in `cv-content/` and still in the ATS variant, and the one unacceptable
 * outcome is the user not knowing the two deliverables differ.
 *
 * `contact` and the identity blocks are excluded because they are drawn from
 * `personal.yaml` by their own slots, and `keywords` is metadata that is never
 * drawn at all.
 *
 * @param {import('./types.js').CVContent} content
 * @param {{ first?: { main?: unknown[], sidebar?: unknown[] }, continuation?: { main?: unknown[], sidebar?: unknown[] }, last?: { main?: unknown[], sidebar?: unknown[] } }} layout
 * @returns {string[]} populated-but-unplaced section keys, in content order
 */
function unplacedSections(content, layout) {
  const placed = new Set()
  for (const page of [layout?.first, layout?.continuation, layout?.last]) {
    for (const slot of [...(page?.main ?? []), ...(page?.sidebar ?? [])]) {
      const key = slotKey(slot)
      if (key) placed.add(key)
    }
  }
  const populated = (/** @type {string} */ key) => {
    const v = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (content))?.[key]
    return Array.isArray(v) ? v.length > 0 : Boolean(v)
  }
  return RENDERABLE_SECTION_KEYS.filter((key) => populated(key) && !placed.has(key))
}

/**
 * Which sections a layout puts in a `main` slot that {@link MEASURED_MAIN_KEYS}
 * does not cover — deduplicated, in first-seen order, across every page kind
 * (a section unmeasured on continuation pages is just as unpriced as one on
 * page 1). Spacers are vertical space charged by the budget arithmetic, not
 * sections, so they are never reported.
 *
 * @param {{ first?: { main?: unknown[] }, continuation?: { main?: unknown[] }, last?: { main?: unknown[] } }} layout
 * @returns {string[]}
 */
function unmeasuredMainKeys(layout) {
  const seen = new Set()
  for (const kind of /** @type {const} */ (['first', 'continuation', 'last'])) {
    for (const slot of layout?.[kind]?.main ?? []) {
      const key = slotKey(slot)
      if (!key) continue
      // D5: spacers ARE measured now — `declaredMainSpacerPt` charges what the
      // layout declares, on page 1 and on continuation pages. Before that they
      // were skipped here with the comment "charged by the budget arithmetic",
      // which was false: the arithmetic charged a theme constant, not the slot.
      if (key === 'spacer') continue
      // D6: which keys are measured is a fact about the SLOT, not the key.
      // `summary` is priced by `mainFirstBudget` and therefore measured in
      // `first.main` only — put it in `continuation.main` and nothing measures
      // it, yet the flat key list said it was measured everywhere, so the one
      // case this warning exists for was the one case it stayed silent on
      // (verified: it produced a 4th sheet against a 3-page plan in silence,
      // while `achievements` in the same slot fired the warning correctly).
      if (key === 'summary' ? kind === 'first' : MEASURED_MAIN_KEYS.includes(key)) continue
      seen.add(key)
    }
  }
  return [...seen]
}

/**
 * Slot keys a `main` slot cannot draw at all — a typo, or a `:continued` form
 * the renderer does not implement.
 *
 * RV1: distinct from {@link unmeasuredMainKeys}, and the difference is the
 * whole point. "Unmeasured" means the ink reaches the page and the plan's
 * arithmetic excludes it — a fact. This means the ink NEVER REACHES THE PAGE:
 * `sections/registry.js` resolves the key to nothing, logs to stderr with no
 * code, and returns null. `- experiance` in `first.main` deleted five of the
 * scaffold's sixteen bullets that way, with `notices: []` and exit 0.
 *
 * `validate` catches this first and more helpfully (it can offer "did you
 * mean"), but plain `cvx build` never validates — only `validate` and
 * `build --all` do — so validation alone would leave the defect shippable.
 * INV-5 requires every defect state to carry a named code; this is that code.
 *
 * @param {{ first?: { main?: unknown[] }, continuation?: { main?: unknown[] }, last?: { main?: unknown[] } }} layout
 * @returns {string[]} unrenderable keys, deduplicated, in first-seen order
 */
function unrenderableMainKeys(layout) {
  const seen = new Set()
  for (const kind of /** @type {const} */ (['first', 'continuation', 'last'])) {
    for (const slot of layout?.[kind]?.main ?? []) {
      const key = String(slot ?? '')
      if (key === '') continue
      if (isIdentityKey(key)) continue
      // A spacer with a real number is fine; one without is N4's `height: NaN`,
      // which `validate` rejects. Either way it is not a MISSING section, so it
      // is not this fact's subject.
      if (key === 'spacer' || key.startsWith('spacer:')) continue
      if (MAIN_SLOT_KEYS.includes(key)) continue
      seen.add(key)
    }
  }
  return [...seen]
}

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
 * @returns {{ pages: import('./types.js').SidebarSlice[][], pageMetrics: { used: number, budget: number, capacity: number, blockedBy: (BlockDecline & { key: string | null }) | null }[], totalPages: number }}
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
    // Same §3.9 decomposition as the main column: sidebar capacity is the
    // column minus pads and safety; `capacity − budget` is this page's
    // identity block. `blockedBy` carries the section key (§3.8).
    pageMetrics: packed.map(({ used, budget, blockedBy }) => ({
      used,
      budget,
      capacity: quantize(sm.bodyH - sm.padTop - sm.padBottom - sm.safety),
      blockedBy: blockedBy ? { ...blockedBy, key: flow[blockedBy.index]?.key ?? null } : null
    })),
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
 * @param {import('./types.js').Theme} [args.theme]
 * @param {import('./types.js').Measurer} [args.measure]
 * @returns {import('./types.js').LayoutPlan}
 */
export function planTwoColumn({
  content,
  layout = TWO_COLUMN_LAYOUT,
  theme = undefined,
  measure = undefined
}) {
  const main = packExperiences(content.experience ?? [], content.summary ?? [], theme, measure, {
    firstSpacerPt: declaredMainSpacerPt(layout, 'first'),
    contSpacerPt: declaredMainSpacerPt(layout, 'continuation'),
    summaryInFirstMain: (layout?.first?.main ?? []).some((k) => slotKey(k) === 'summary')
  })
  // Does the summary put ink on page 1? `SummarySection` renders null for an
  // empty list, so an empty summary is not "fixed content that is there" —
  // this is the one fixed main-column block that can make a page non-empty
  // without a packed block (see `mainEmpty` below).
  // D2: ...and only if the layout actually puts it on page 1. A `first.main`
  // without `summary` renders no summary there, so it cannot be what makes
  // page 1 non-empty.
  const summaryRenders =
    (content.summary ?? []).length > 0 &&
    (layout?.first?.main ?? []).some((k) => slotKey(k) === 'summary')
  const sidebar = packSidebar(sidebarFlowKeys(layout), content, layout, theme, measure)

  // At least one page always exists, even for a CV with no experience at all.
  const totalPages = Math.max(1, main.totalPages, sidebar.totalPages)
  const mainChunks = [main.page1Experiences, ...main.continuationChunks]

  return {
    totalPages,
    /**
     * Sections this layout puts in a `main` slot that the packer above did not
     * measure — it prices the summary and the experience flow, nothing else
     * (see this module's PACKED vs FIXED note). The renderer still draws them,
     * so `totalPages` and `overflowPt` are describing less than the page holds
     * whenever this is non-empty; `layoutDiagnostics` turns it into the
     * `main-slot-unmeasured` fact so the blindness is stated rather than
     * inferred. Empty for every layout whose main slots hold only measured
     * keys, which is every shipped layout. Retired by §8's I4/I6, when the
     * planner starts measuring these and the array is empty by construction.
     */
    unmeasuredMainKeys: unmeasuredMainKeys(layout),
    unrenderableMainKeys: unrenderableMainKeys(layout),
    /**
     * Populated content sections no slot in this layout renders — present in
     * `cv-content/` and in the ATS variant, absent from this designed PDF.
     * `layoutDiagnostics` turns it into the `section-has-no-slot` defect.
     */
    unplacedSections: unplacedSections(content, layout),
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
      // pageMetrics rows carry the fill numbers AND the §3.8 decline record;
      // the plan publishes them as two fields — ColumnFill stays a pure number
      // bag, and blockedBy is page data a diagnostics reader keys on directly.
      const mainRow = main.pageMetrics[index] ?? null
      const sidebarRow = sidebar.pageMetrics[index] ?? null
      const fillOf = (
        /** @type {{ used: number, budget: number, capacity: number, spacerPt?: number } | null} */ r
      ) =>
        r
          ? {
              used: r.used,
              budget: r.budget,
              capacity: r.capacity,
              // Carried through rather than dropped: the sidebar rows have no
              // spacer, so this stays undefined there and the diagnostics
              // publish null.
              ...(r.spacerPt === undefined ? {} : { spacerPt: r.spacerPt })
            }
          : null
      const mainFill = fillOf(mainRow)
      const sidebarFill = fillOf(sidebarRow)
      const over = (/** @type {{used: number, budget: number} | null} */ f) =>
        f ? Math.max(0, quantize(f.used - f.budget)) : 0
      // I2 — "empty" means NO INK IN THE COLUMN, not "no packed blocks".
      //
      // The old test was `mainBlocks.length === 0`, which reported page 1 of
      // every experience-less CV as an empty main column while the reader was
      // looking at a full summary on it. A student CV is the ordinary case of
      // that, not an edge case. Fixed content is content: the summary occupies
      // the column exactly as much as an experience entry does.
      //
      // The test is what RENDERS, never the budget's fixed term. A first cut
      // of I2 used `capacity - budget <= 0` for "no fixed content" and it was
      // dead code: that term is strictly positive on every page that has a row
      // (page 1 charges the summary and the spacer; a continuation charges its
      // title), so the predicate silently collapsed to `mainRow === null` and
      // reported a page that draws nothing as non-empty. Two of the things it
      // charges are not ink: the spacer is blank space, and the section title
      // is drawn only when entries accompany it (ExperienceSection returns
      // null for an empty list). So the summary is the only fixed content that
      // can make a main column non-empty, and it renders on page 1 alone.
      //
      // Chrome is NOT content, deliberately: the identity block and the page
      // badge appear on every page by construction, so counting them would
      // make `emptyColumn` unreachable and delete the G1 residual signal that
      // C4 measured as the honest description of a last page whose sidebar
      // outlasted the experience list.
      const mainEmpty = mainBlocks.length === 0 && !(index === 0 && summaryRenders)
      const sidebarEmpty = sidebarSlices.length === 0
      return {
        index,
        // Injected, never packed — see identityH().
        identity: identityKeysFor(layout, index),
        mainBlocks,
        sidebarSlices,
        mainFill,
        sidebarFill,
        /** Why the NEXT main block did not start on this page; null when it did, or this is the flow's last page (§3.8). */
        mainBlockedBy: mainRow?.blockedBy ?? null,
        sidebarBlockedBy: sidebarRow?.blockedBy ?? null,
        /**
         * How far past its budget this page's content reaches, in pt. Non-zero
         * only where Invariant 0 forced an over-tall block onto a page (see
         * packBlocks' rule 1c) — the one genuinely irreducible shape; the
         * config-forced split that could also cause it was removed in S5; react-pdf then FLOWS that surplus onto extra physical sheets.
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
