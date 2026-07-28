// Pure-JS page packing — no DOM, no browser.
// All dimensions in typographic points (pt).
//
// Greedy bin-packing: fill each page with as many whole experience entries as
// fit within the page budget, then start a new page.
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

import { tealTheme } from './themes/teal.js'

export function deriveMetrics(theme) {
  const t = theme ?? tealTheme
  const ty = t.typography
  const sp = t.spacing
  const g  = t.geometry
  const ch = t.chrome

  const mainW   = g.pageWidth * (1 - g.sidebarFraction)
  const innerW  = mainW - g.mainPad.left - g.mainPad.right
  const bulletW = innerW - sp.bulletIndent

  return {
    // Page geometry
    pageH: g.pageHeight, topBar: g.topBar,
    mainPad: g.mainPad, contPad: g.contPad,
    innerW, bulletW,
    // Typography
    sectionTitleSize: ty.sectionTitle.size,
    sectionTitleLeading: ty.sectionTitle.leading,
    roleSize: ty.role.size, roleLeading: ty.role.leading,
    bodySize: ty.body.size, bodyLeading: ty.body.leading,
    metaSize: ty.meta.size, metaLeading: ty.meta.leading,
    descSize: ty.description.size, descLeading: ty.description.leading,
    // Spacing
    sectionTitlePb: sp.sectionTitlePb,
    sectionBorderWidth: ch.sectionBorderWidth,
    sectionTitleMb: sp.sectionTitleMb,
    bulletGap: sp.bulletGap,
    summaryBulletGap: sp.summaryBulletGap,
    entryMb: sp.entryMb,
    entryMetaMt: sp.entryMetaMt,
    locationMb: sp.locationMb,
    descMt: sp.descMt, descMb: sp.descMb,
    progMt: sp.progMt, progMb: sp.progMb, progPy: sp.progPy,
    dividerHeight: ch.dividerHeight,
    dividerMargin: ch.dividerMargin,
    spacer: sp.spacer,
    safety: sp.safety,
    cw: ty.charWidthFraction,
  }
}

function lh(pt, leading) { return pt * leading }

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
function quantize(pt) {
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
export function lineCount(text, pt, w, cw) {
  const cpl = Math.max(1, Math.floor(w / (pt * cw)))
  return Math.max(1, Math.ceil(text.length / cpl))
}

/** `measure` (if given) takes priority; the char-width estimate above is always the fallback — see module docblock. */
function countLines(measure, text, pt, w, cw, opts) {
  if (measure?.lineCount) return measure.lineCount(text, pt, w, opts)
  return lineCount(text, pt, w, cw)
}

function calcTitleH(m) {
  return lh(m.sectionTitleSize, m.sectionTitleLeading) + m.sectionTitlePb + m.sectionBorderWidth + m.sectionTitleMb
}

function calcDividerH(m) {
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

export function summaryH(summary, m, measure) {
  let h = calcTitleH(m) + m.descMt  // title + bullet list margin-top
  for (const b of summary) {
    const txt = typeof b === 'string' ? b : b.text
    h += countLines(measure, txt, m.bodySize, m.bulletW, m.cw, BODY_STYLE) * lh(m.bodySize, m.bodyLeading)
  }
  h += (summary.length - 1) * m.summaryBulletGap
  return quantize(h)
}

export function entryH(e, m, measure) {
  if (e.isContinuation) {
    let h = lh(m.roleSize, m.roleLeading)
    const visible = (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet)
    if (visible.length > 0) {
      h += m.descMt
      for (const b of visible) {
        const txt = typeof b === 'string' ? b : b.text
        h += countLines(measure, txt, m.bodySize, m.bulletW, m.cw, BODY_STYLE) * lh(m.bodySize, m.bodyLeading)
      }
      h += (visible.length - 1) * m.bulletGap
    }
    h += m.entryMb * (15 / 11)  // 11.25pt scaled from entryMb
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
      h += countLines(measure, txt, m.bodySize, m.bulletW, m.cw, BODY_STYLE) * lh(m.bodySize, m.bodyLeading)
    }
    h += (visibleBullets.length - 1) * m.bulletGap
  }
  h += m.entryMb * (15 / 11)  // 11.25pt
  return quantize(h)
}

/**
 * Resolve the page-1 sidebar section keys for the two-column layout.
 *
 * When the CV fits on a single page (no continuation pages), the sections the
 * layout would otherwise show only on continuation/last pages — typically
 * education, competencies, referees — would silently never render. To prevent
 * that content loss, fold them into page 1. Identity slots are de-duplicated
 * (page 1's identity block wins) and order is preserved.
 *
 * @param {object} layout        active layout ({ first, continuation, last })
 * @param {boolean} isSinglePage true when there are no continuation pages
 * @returns {string[]} sidebar section keys for page 1
 */
export function resolveFirstSidebar(layout, isSinglePage) {
  const first = layout?.first?.sidebar ?? []
  if (!isSinglePage) return [...first]

  const extra = [
    ...(layout?.continuation?.sidebar ?? []),
    ...(layout?.last?.sidebar ?? []),
  ].filter((k) => !k.startsWith('identity-'))

  return [...new Set([...first, ...extra])]
}

/**
 * Warning threshold for estimatePage1Overflow, in points.
 *
 * Pre-C2, this was 220pt — an empirical fudge sized to absorb the
 * char-width estimator's own ~20-34% looseness (calibration note, now
 * historical: the shipped scaffold's tuned config used to estimate +209pt
 * under the loose estimator and render with room to spare; the mildest
 * observed real clip estimated +257pt; 220 sat between the two).
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
 * content really overflows, the renderer clips it at the page edge (the
 * template columns use minHeight, never shrink).
 *
 * @param {ReturnType<import('./measure.js').createMeasurer>} [measure]
 *   optional real-font measurer (render.js/validateContent.js inject one
 *   when they have `fontsDir`); omit for the char-width estimate.
 */
export function estimatePage1Overflow(experience, summary, config = {}, theme, measure) {
  const { page1ExperienceCount: count, page1SplitBullets: splitAt } = config
  if (count == null) return 0

  const m = deriveMetrics(theme)
  const entries = experience.slice(0, count).map((e, i) => {
    const isLast = i === count - 1
    if (isLast && splitAt != null && splitAt < (e.bullets?.length ?? 0)) return { ...e, endBullet: splitAt }
    return e
  })

  let used = 0
  entries.forEach((e, i) => {
    used += entryH(e, m, measure) + (i > 0 ? calcDividerH(m) : 0)
  })

  const budget = m.pageH - m.topBar - m.mainPad.top - m.mainPad.bottom
    - summaryH(summary ?? [], m, measure) - m.spacer - calcTitleH(m) - m.safety

  return Math.max(0, Math.round(quantize(used) - quantize(budget)))
}

/**
 * @param {ReturnType<import('./measure.js').createMeasurer>} [measure]
 *   optional real-font measurer — see estimatePage1Overflow's docblock.
 */
export function packExperiences(experience, summary, config = {}, theme, measure) {
  const m = deriveMetrics(theme)
  const { page1ExperienceCount, page1SplitBullets } = config

  const TITLE_H   = calcTitleH(m)
  const DIVIDER_H = calcDividerH(m)
  const BC = m.pageH - m.topBar - m.contPad.top - m.contPad.bottom - TITLE_H - m.safety

  // ── Config-driven explicit split ─────────────────────────────────────────
  if (page1ExperienceCount != null) {
    const count   = page1ExperienceCount
    const splitAt = page1SplitBullets ?? null

    const fullOnPage1 = experience.slice(0, count - 1)
    const splitEntry  = experience[count - 1]
    const afterPage1  = experience.slice(count)

    let page1Experiences
    let continuationHead = []

    if (!splitEntry) {
      page1Experiences = fullOnPage1
    } else if (splitAt != null && splitAt < (splitEntry.bullets?.length ?? 0)) {
      page1Experiences = [...fullOnPage1, { ...splitEntry, endBullet: splitAt }]
      continuationHead = [{ ...splitEntry, isContinuation: true, startBullet: splitAt }]
    } else {
      page1Experiences = [...fullOnPage1, splitEntry]
    }

    const rem = [...continuationHead, ...afterPage1]
    const contPages = []
    let r = [...rem]
    while (r.length > 0) {
      const page = []
      let used = 0
      for (const e of r) {
        const eh = entryH(e, m, measure)
        const dh = page.length > 0 ? DIVIDER_H : 0
        if (page.length > 0 && quantize(used + dh + eh) > quantize(BC)) break
        page.push(e)
        used += dh + eh
      }
      if (page.length === 0) page.push(r[0])
      contPages.push(page)
      r = r.slice(page.length)
    }

    return { page1Experiences, continuationChunks: contPages, totalPages: 1 + contPages.length }
  }

  // ── Automatic greedy bin-packing ─────────────────────────────────────────
  const sumH = summaryH(summary, m, measure)
  const B1 = m.pageH - m.topBar - m.mainPad.top - m.mainPad.bottom - sumH - m.spacer - TITLE_H - m.safety

  const pages   = []
  let remaining = [...experience]
  let budget    = B1

  while (remaining.length > 0) {
    const page = []
    let used   = 0
    for (const e of remaining) {
      const eh = entryH(e, m, measure)
      const dh = page.length > 0 ? DIVIDER_H : 0
      if (page.length > 0 && quantize(used + dh + eh) > quantize(budget)) break
      page.push(e)
      used += dh + eh
    }
    if (page.length === 0) page.push(remaining[0])
    pages.push(page)
    remaining = remaining.slice(page.length)
    budget    = BC
  }

  return { page1Experiences: pages[0] ?? [], continuationChunks: pages.slice(1), totalPages: pages.length }
}
