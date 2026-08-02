// ── Sidebar block ids, at ITEM granularity ─────────────────────────────────
//
// The sidebar analogue of blocks.js: a stable id per rendered *item*, not per
// section, so the "placed exactly once / nothing dropped / order preserved"
// invariants say something real about the sidebar flow.
//
// As of C3b this is a genuine ITEM-level check, not a section-level one wearing
// an item-level name. The packer emits per-page `sidebarSlices` — `{ key,
// start, end, continued, itemCount }` — so the ACTUAL side of every comparison
// is built by expanding each slice's own `[start, end)` range, while the
// EXPECTED side is built by walking the content arrays. The two derivations are
// therefore different: a split that drops its last item, duplicates an item
// across the boundary, or reverses two slices changes the actual side only.
// (Pre-C3b both sides expanded from the section key, so the check could only
// ever prove a section-level fact — recorded honestly at the time.)
//
// The failure modes it catches:
//   - the pre-C3 engine assigned a fixed section list per PAGE KIND and
//     repeated it verbatim on every continuation page, so on a 5-page CV
//     education/certifications/competencies/languages rendered FIVE times —
//     `placedExactlyOnce` on item ids is exactly the check that catches that;
//   - a section silently missing from the plan (e.g. filtered out by a
//     mis-typed presence guard) drops every one of its items;
//   - a split whose two halves do not tile `[0, itemCount)` exactly.
//
// HEADINGS are ids too (`sb:<key>::head@<start>`), but they live only in
// `sidebarLayoutPlan` (the per-page shape the orphan-heading and empty-column
// checks read), never in the item-id sets: a split section legitimately renders
// its title once per page, so counting heads in `placedExactlyOnce` would flag
// correct behaviour. The head id carries its slice's start index so two slices
// of one section are distinguishable.
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

/** One id per item. Index-prefixed so two items with the same label can never collide. */
export function sectionItemIds(key, content) {
  const labels = sectionItemLabels(key, content)
  if (labels === null) return null
  return labels.map((label, i) => `sb:${key}::item:${i}:${label}`)
}

/**
 * The heading id one SLICE renders. A split section shows its title once per
 * page, so the id carries the slice's first item index — two heads of the same
 * section are different ids, and `noOrphanHeading` can name the offending one.
 */
export function sliceHeadId(key, start) {
  return `sb:${key}::head@${start}`
}

/**
 * The full expected sidebar ITEM id set for one content bag — the "expected"
 * side of Invariant 0 for the sidebar, in the layout's designer-intent flow
 * order. Derived from the CONTENT, never from the plan.
 */
export function sidebarItemIds(content, layout = TWO_COLUMN_LAYOUT) {
  return sidebarFlowKeys(layout).flatMap((key) => sectionItemIds(key, content) ?? [])
}

/**
 * The ids one planned SLICE contributes: its heading, then the items its
 * `[start, end)` range actually covers.
 *
 * The referees placeholder ("References available upon request.") is a single
 * synthetic item so an empty referees section still has exactly one item id;
 * `sidebarItemCount` reports 0 for it, so the slice is `[0, 0)` and the range
 * would expand to nothing — hence the explicit widening below, which keeps the
 * expected and actual sides comparable for that one shape.
 */
function sliceIds(slice, content) {
  const labels = sectionItemLabels(slice.key, content) ?? []
  const end = slice.itemCount === 0 ? labels.length : slice.end
  const ids = []
  for (let i = slice.start; i < end; i++) ids.push(`sb:${slice.key}::item:${i}:${labels[i]}`)
  return { head: sliceHeadId(slice.key, slice.start), items: ids }
}

/**
 * A planTwoColumn() result re-expressed in the `{ pages: [{ index, main,
 * sidebar }] }` LayoutPlan shape every invariant in invariants.js consumes.
 * `sidebar` is `[headId, ...itemIds]` per slice, in page order — the shape
 * `noOrphanHeading` needs (a heading must be followed by something that is not
 * another heading, on the same page).
 *
 * `main` carries one id per placed experience *fragment* — enough for the
 * empty-column check to tell "this page has main content" from "it does not",
 * which is all G1 needs (bullet-level main ids are blocks.js's job).
 */
export function sidebarLayoutPlan(plan, content) {
  return {
    pages: plan.pages.map((page) => ({
      index: page.index,
      main: page.mainBlocks.map((e, i) => `exp-fragment:${page.index}:${i}:${e.role}`),
      sidebar: page.sidebarSlices.flatMap((slice) => {
        const { head, items } = sliceIds(slice, content)
        return [head, ...items]
      })
    })),
    totalPages: plan.totalPages
  }
}

/** Is this id a sidebar section HEADING (as opposed to one of its items)? */
export const isSidebarHeadId = (/** @type {string} */ id) => id.includes('::head@')

/** The ITEM ids a planTwoColumn() result actually places, flattened page by page, in order. */
export function sidebarPlanItemIds(plan, content) {
  return plan.pages.flatMap((page) =>
    page.sidebarSlices.flatMap((slice) => sliceIds(slice, content).items)
  )
}
