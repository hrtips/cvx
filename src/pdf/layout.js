// Pure-JS page packing — no DOM, no browser.
// All dimensions in typographic points (pt).
//
// Greedy bin-packing: fill each page with as many whole experience entries as
// fit within the page budget, then start a new page.
//
// The theme argument provides all typography/spacing/geometry values so the
// estimator stays in sync with what components actually render.

import { tealTheme } from './themes/teal.js'

function deriveMetrics(theme) {
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

function lineCount(text, pt, w, cw) {
  const cpl = Math.max(1, Math.floor(w / (pt * cw)))
  return Math.max(1, Math.ceil(text.length / cpl))
}

function calcTitleH(m) {
  return lh(m.sectionTitleSize, m.sectionTitleLeading) + m.sectionTitlePb + m.sectionBorderWidth + m.sectionTitleMb
}

function calcDividerH(m) {
  return m.dividerHeight + m.dividerMargin * 2
}

function summaryH(summary, m) {
  let h = calcTitleH(m) + m.descMt  // title + bullet list margin-top
  for (const b of summary) {
    const txt = typeof b === 'string' ? b : b.text
    h += lineCount(txt, m.bodySize, m.bulletW, m.cw) * lh(m.bodySize, m.bodyLeading)
  }
  h += (summary.length - 1) * m.summaryBulletGap
  return h
}

function entryH(e, m) {
  if (e.isContinuation) {
    let h = lh(m.roleSize, m.roleLeading)
    const visible = (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet)
    if (visible.length > 0) {
      h += m.descMt
      for (const b of visible) {
        const txt = typeof b === 'string' ? b : b.text
        h += lineCount(txt, m.bodySize, m.bulletW, m.cw) * lh(m.bodySize, m.bodyLeading)
      }
      h += (visible.length - 1) * m.bulletGap
    }
    h += m.entryMb * (15 / 11)  // 11.25pt scaled from entryMb
    return h
  }

  let h = 0
  h += lh(m.roleSize, m.roleLeading)
  h += m.entryMetaMt + lh(m.bodySize, m.bodyLeading)
  if (e.location) h += m.locationMb + lh(m.metaSize, m.metaLeading)
  if (e.description) {
    const dl = lineCount(e.description, m.descSize, m.innerW, m.cw)
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
      h += lineCount(txt, m.bodySize, m.bulletW, m.cw) * lh(m.bodySize, m.bodyLeading)
    }
    h += (visibleBullets.length - 1) * m.bulletGap
  }
  h += m.entryMb * (15 / 11)  // 11.25pt
  return h
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
 * The estimator is intentionally conservative (charWidthFraction + ceil per
 * text block), so a raw estimate > 0 does not mean real clipping. Empirical
 * calibration (2026-07-26 dogfood): the shipped scaffold's tuned config
 * estimates +209pt and renders with room to spare; the mildest observed real
 * clip estimated +257pt. Warn above 220 — between the two.
 */
export const PAGE1_OVERFLOW_WARN_THRESHOLD = 220

/**
 * Estimate how far a forced page1ExperienceCount overshoots the page-1 budget.
 *
 * Returns the raw conservative estimate in points (0 when no count is
 * forced). Compare against PAGE1_OVERFLOW_WARN_THRESHOLD before warning.
 * Mirrors the config-driven branch of packExperiences: the first
 * (count - 1) entries render whole, the last is optionally cut at
 * page1SplitBullets. When content really overflows, the renderer clips it
 * at the page edge (the template columns use minHeight, never shrink).
 */
export function estimatePage1Overflow(experience, summary, config = {}, theme) {
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
    used += entryH(e, m) + (i > 0 ? calcDividerH(m) : 0)
  })

  const budget = m.pageH - m.topBar - m.mainPad.top - m.mainPad.bottom
    - summaryH(summary ?? [], m) - m.spacer - calcTitleH(m) - m.safety

  return Math.max(0, Math.round(used - budget))
}

export function packExperiences(experience, summary, config = {}, theme) {
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
        const eh = entryH(e, m)
        const dh = page.length > 0 ? DIVIDER_H : 0
        if (page.length > 0 && used + dh + eh > BC) break
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
  const sumH = summaryH(summary, m)
  const B1 = m.pageH - m.topBar - m.mainPad.top - m.mainPad.bottom - sumH - m.spacer - TITLE_H - m.safety

  const pages   = []
  let remaining = [...experience]
  let budget    = B1

  while (remaining.length > 0) {
    const page = []
    let used   = 0
    for (const e of remaining) {
      const eh = entryH(e, m)
      const dh = page.length > 0 ? DIVIDER_H : 0
      if (page.length > 0 && used + dh + eh > budget) break
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
