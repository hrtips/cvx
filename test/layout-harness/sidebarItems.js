// ── Sidebar block ids, at ITEM granularity ─────────────────────────────────
//
// The sidebar analogue of blocks.js: a stable id per rendered *item*, not per
// section, so the "placed exactly once / nothing dropped / order preserved"
// invariants say something real about the sidebar flow.
//
// Why item granularity when C3a's packer is whole-section? Because the
// failure modes it catches are item-shaped even when the packer is not:
//   - the pre-C3 engine assigned a fixed section list per PAGE KIND and
//     repeated it verbatim on every continuation page, so on a 5-page CV
//     education/certifications/competencies/languages rendered FIVE times —
//     `placedExactlyOnce` on item ids is exactly the check that catches that,
//     and it could not be written before a real per-page sidebar plan existed;
//   - a section silently missing from the plan (e.g. filtered out by a
//     mis-typed presence guard) drops every one of its items.
// What it cannot yet exercise is one section's items landing on two different
// pages — that needs item-level splitting (the next slice), at which point
// these same ids describe the split without changing shape.
//
// Plain-Node-safe (no .jsx imports): loaded by generateBaseline.js under bare
// `node` as well as by vitest.
// ─────────────────────────────────────────────────────────────────────────

import { TWO_COLUMN_LAYOUT } from '../../src/pdf/defaultLayouts.js'
import { sidebarFlowKeys } from '../../src/pdf/layout.js'

/**
 * The item labels one sidebar section renders, in render order, mirroring each
 * component's own iteration (and its presence guard). `null` means the section
 * renders nothing at all and is legitimately absent from the plan.
 *
 * @param {string} key
 * @param {object} content
 * @returns {string[] | null}
 */
export function sectionItemLabels(key, content) {
  const p = content.personal ?? {}
  switch (key) {
    case 'contact':
      // ContactSection's `rows` array, after its `.filter(r => r.value)`.
      return [
        p.phone,
        p.email,
        p.linkedin,
        p.facebook,
        p.location,
        ...(p.links ?? []).map((l) => l.label || l.href)
      ].filter(Boolean)
    case 'achievements':
      return content.achievements?.length ? content.achievements.map((a) => a.year) : null
    case 'education':
      return content.education?.length ? content.education.map((e) => e.degree) : null
    case 'certifications':
      return content.certifications?.length ? content.certifications.map((c) => c.name) : null
    case 'publications':
      return content.publications?.length ? content.publications.map((x) => x.title) : null
    case 'languages':
      return content.languages?.length ? content.languages.map((l) => l.language) : null
    case 'competencies':
      return content.competencies?.length ? [...content.competencies] : null
    case 'referees':
      // Always renders: the entries, or the "available upon request" line.
      return content.referees?.length
        ? content.referees.map((r) => r.name)
        : ['(available-upon-request)']
    default:
      return null
  }
}

/** Section title + one id per item. Index-prefixed so two items with the same label can never collide. */
export function sectionBlockIds(key, content) {
  const labels = sectionItemLabels(key, content)
  if (labels === null) return null
  return [`sb:${key}::head`, ...labels.map((label, i) => `sb:${key}::item:${i}:${label}`)]
}

/**
 * The full expected sidebar id set for one content bag — the "expected" side
 * of Invariant 0 for the sidebar, in the layout's designer-intent flow order.
 */
export function sidebarItemIds(content, layout = TWO_COLUMN_LAYOUT) {
  return sidebarFlowKeys(layout).flatMap((key) => sectionBlockIds(key, content) ?? [])
}

/**
 * A planTwoColumn() result re-expressed in the `{ pages: [{ index, main,
 * sidebar }] }` LayoutPlan shape every invariant in invariants.js consumes.
 * `main` carries one id per placed experience *fragment* — enough for the
 * empty-column check to tell "this page has main content" from "it does not",
 * which is all G1 needs (bullet-level main ids are blocks.js's job).
 */
export function sidebarLayoutPlan(plan, content) {
  return {
    pages: plan.pages.map((page) => ({
      index: page.index,
      main: page.mainBlocks.map((e, i) => `exp-fragment:${page.index}:${i}:${e.role}`),
      sidebar: page.sidebarKeys.flatMap((key) => sectionBlockIds(key, content) ?? [])
    })),
    totalPages: plan.totalPages
  }
}

/** The ids a planTwoColumn() result actually places, flattened page by page, in order. */
export function sidebarPlanItemIds(plan, content) {
  return sidebarLayoutPlan(plan, content).pages.flatMap((p) => p.sidebar)
}
