// ── Sidebar measure-vs-render diff (C3a) ───────────────────────────────────
//
// The sidebar analogue of measureDiff.js, and the reason layout.js's sidebar
// formulas can be trusted rather than merely believed: it renders a real CV
// through the real CLI, reads the TRUE vertical position of every sidebar
// section title out of the PDF with `pdftotext -bbox`, and compares the
// observed distance between consecutive titles against what
// `sidebarSectionH()` predicted for the section in between.
//
// Why title-to-title offsets? Because they are the one geometric fact that is
// (a) recoverable from a rendered PDF without instrumenting the components and
// (b) exactly `sectionHeight + sectionDividerH` by construction — every
// section on a page is laid out one after another in a plain block flow, with
// buildSidebar's rule between them. So for pages with 2+ sections, each
// interior gap is a direct, independent measurement of one section's height.
//
// Why `-bbox` and not ink bands: a `<Text>`'s first word's `yMin` IS the top of
// its line box (verified: with an explicit lineHeight > the font's natural one,
// the extra leading lands BELOW the baseline, so yMin stays pinned to the line
// top). Ink bands would only give the inked extent, which stops short of a
// block's trailing margin.
//
// NOTE the deliberate asymmetry with measureDiff.js: that harness compares
// LINE COUNTS (a wrap decision), this one compares HEIGHTS in pt (a box-model
// composition). Both are needed — a correct line count composed with a wrong
// margin still mispaginates.
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import {
  CONTINUED_SUFFIX,
  deriveSidebarMetrics,
  identityH,
  planTwoColumn,
  sidebarSliceH
} from '../../src/pdf/layout.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { buildAll } from './scaffold.js'
import { harnessMeasurer } from './structuralFacts.js'

/** The uppercase label each sidebar section's SectionTitle renders (its component's literal). */
export const SECTION_TITLE_TEXT = {
  contact: 'CONTACT',
  achievements: 'ACHIEVEMENTS',
  education: 'EDUCATION',
  certifications: 'CERTIFICATIONS',
  competencies: 'CORECOMPETENCIES',
  languages: 'LANGUAGES',
  publications: 'PUBLICATIONS',
  referees: 'REFEREES'
}

/**
 * The title text one planned SLICE renders, as it comes back out of the PDF.
 * `sidebarRowsByPage` joins a row's `<word>`s with no separator (a letter-
 * spaced title arrives one glyph per word), so the rendered spaces vanish —
 * hence `CERTIFICATIONS(CONT.)` rather than `CERTIFICATIONS (CONT.)`. The
 * marker itself is imported from layout.js, never re-typed, so a continuation
 * whose title the renderer and the packer disagree about fails HERE.
 *
 * @param {{ key: string, continued: boolean }} slice
 */
export function sliceTitleText(slice) {
  const base = SECTION_TITLE_TEXT[slice.key]
  return slice.continued ? `${base}${CONTINUED_SUFFIX.toUpperCase()}` : base
}

const WORD_RE =
  /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g

/**
 * Per physical page, the sidebar's text rows as `{ yMin, text }`, where `text`
 * is every word on that row concatenated (letter-spaced titles come back one
 * glyph per `<word>`, so joining is what makes them greppable).
 */
export function sidebarRowsByPage(pdfPath, sidebarMaxX) {
  const xml = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], { encoding: 'utf8' })
  return xml
    .split('<page ')
    .slice(1)
    .map((pageXml) => {
      /** @type {Map<string, {yMin: number, words: {x: number, t: string}[]}>} */
      const rows = new Map()
      for (const m of pageXml.matchAll(WORD_RE)) {
        const xMin = Number(m[1])
        if (xMin >= sidebarMaxX) continue
        const key = Number(m[2]).toFixed(2)
        if (!rows.has(key)) rows.set(key, { yMin: Number(m[2]), words: [] })
        rows.get(key)?.words.push({ x: xMin, t: m[5] })
      }
      return [...rows.values()]
        .sort((a, b) => a.yMin - b.yMin)
        .map(({ yMin, words }) => ({
          yMin,
          text: words
            .sort((a, b) => a.x - b.x)
            .map((w) => w.t)
            .join('')
        }))
    })
}

/** Round to hundredths, normalizing -0 to 0 so an exact match reads as `0` for callers using `toBe(0)`. */
function round2(/** @type {number} */ n) {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r
}

/**
 * Build `fixtureDir`'s designed PDF and diff predicted vs observed geometry.
 *
 * Two independent families of measurement come out of one render:
 *
 *  - `rows` — one row per *interior* section on a page (a section with another
 *    section's title after it): observed height = next title's top - this
 *    title's top - the inter-section divider. This is what validates
 *    `sidebarSectionH`.
 *  - `identityRows` — one row per page: the FIRST section title's top is
 *    `topBar + identityH(page) + sidebarPad.top`, so its observed position
 *    validates `identityH` (including whether the page-1 photo is reserved)
 *    and the column's top padding. This one is only emitted when the document
 *    did not overflow (`physicalPages === planPages`): only the FIRST physical
 *    sheet of a logical page carries the top bar — react-pdf paints it once at
 *    the top of the page tree, so an overflow continuation sheet starts its
 *    body at y=0 — and once any page overflows, physical index no longer
 *    corresponds to plan index at all.
 *
 * The last section on a page has no following title, so the differencing above
 * structurally cannot reach it. In the built-in layout `referees` is always
 * last in the flow, so it is only reachable by reordering the flow — which is
 * what `layout` is for (pass a normalized layout AND write the matching
 * layouts/two-column.yaml into the fixture, so the render and the plan agree).
 *
 * @returns {{ rows: {page: number, key: string, predicted: number, observed: number, deltaPt: number}[],
 *             identityRows: {page: number, keys: string[], predicted: number, observed: number, deltaPt: number}[],
 *             skipped: {page: number, reason: string, keys: string[]}[],
 *             unmeasuredTail: {page: number, key: string}[],
 *             keysMeasured: string[],
 *             pagesChecked: number, sectionsFound: number, planPages: number, physicalPages: number }}
 */
export function runSidebarDiff(fixtureDir, content, layout = undefined) {
  const { code, result, stderr } = buildAll(fixtureDir)
  if (code !== 0 || !result?.ok) {
    throw new Error(`build failed (code ${code}): ${stderr?.slice(0, 1000)}`)
  }
  const designed = result.outputs.find((o) => !o.ats)
  const pdfPath = path.join(fixtureDir, designed.filename)

  const measure = harnessMeasurer()
  const sm = deriveSidebarMetrics(tealTheme)
  const plan = planTwoColumn({ content, layout, config: content.config, theme: tealTheme, measure })

  const pages = sidebarRowsByPage(pdfPath, sm.colW)
  const rows = []
  const identityRows = []
  /** Pages the diff could NOT measure, with the reason — surfaced, never swallowed. */
  const skipped = []
  /** The last section of each page: structurally undifferenceable (no title after it). */
  const unmeasuredTail = []
  const pagesAlign = pages.length === plan.totalPages
  let pagesChecked = 0
  let sectionsFound = 0

  plan.pages.forEach((planPage, i) => {
    const pageRows = pages[i]
    if (!pageRows) {
      skipped.push({ page: i, reason: 'no-physical-page', keys: planPage.sidebarKeys })
      return
    }
    // Where each of this page's section titles actually landed, in order. C3b:
    // one entry per SLICE, so a section split across two pages is differenced
    // on each of them and its continuation title is looked up by the marked
    // text the renderer actually emits.
    const titleTops = planPage.sidebarSlices.map((slice) => {
      const hit = pageRows.find((r) => r.text === sliceTitleText(slice))
      return { slice, key: slice.key, top: hit?.yMin }
    })
    const notFound = titleTops.filter((t) => t.top === undefined).map((t) => t.key)
    if (notFound.length > 0) {
      // A planned section whose title is not on its planned physical page: the
      // column overflowed and react-pdf carried it onto a continuation sheet, so
      // plan index no longer maps to physical index. Recorded, NOT silently
      // dropped — review's point: quietly skipping these turns the statistic
      // into "0.00pt on the pages that already fit".
      skipped.push({ page: i, reason: 'title-not-on-planned-page', keys: notFound })
      return
    }
    if (planPage.sidebarKeys.length === 1) {
      skipped.push({
        page: i,
        reason: 'single-section-no-following-title',
        keys: planPage.sidebarKeys
      })
    }
    if (planPage.sidebarKeys.length > 0) {
      // The LAST section on any page is never differenced (nothing follows it).
      unmeasuredTail.push({ page: i, key: planPage.sidebarKeys[planPage.sidebarKeys.length - 1] })
    }

    if (pagesAlign && titleTops.length > 0) {
      const predicted =
        tealTheme.geometry.topBar + identityH(planPage.identity, content, sm, measure) + sm.padTop
      const observed = Number(titleTops[0].top)
      identityRows.push({
        page: i,
        keys: planPage.identity,
        predicted: round2(predicted),
        observed: round2(observed),
        deltaPt: round2(predicted - observed)
      })
    }

    if (titleTops.length < 2) return
    pagesChecked++
    for (let k = 0; k < titleTops.length - 1; k++) {
      const { key, start, end } = titleTops[k].slice
      const predicted = Number(sidebarSliceH(key, content, sm, measure, start, end))
      const observed = Number(titleTops[k + 1].top) - Number(titleTops[k].top) - sm.sectionDividerH
      sectionsFound++
      rows.push({
        page: i,
        key: titleTops[k].key,
        predicted,
        observed: round2(observed),
        deltaPt: round2(predicted - observed)
      })
    }
  })

  return {
    rows,
    identityRows,
    skipped,
    unmeasuredTail,
    /** Section keys this run actually differenced — the diff's real coverage. */
    keysMeasured: [...new Set(rows.map((r) => r.key))].sort(),
    pagesChecked,
    sectionsFound,
    planPages: plan.totalPages,
    physicalPages: pages.length
  }
}
