// ── Rendering one SLICE of a sidebar section (C3b) ──────────────────────────
//
// `packSidebar` may cut a section at an item boundary and place the halves on
// consecutive pages (layout.js — required by Invariant 0: a section taller than
// a page must FLOW inside pages the plan numbered, never be carried onto a
// sheet the plan never counted). These two helpers are what each section
// component uses to render its share of that decision, and they are the render
// side of the contract the packer measured:
//
//   - the ITEMS a slice shows are `items.slice(start, end)`, which is exactly
//     the array layout.js's per-section formula measured;
//   - the TITLE a continued slice shows is composed by the packer's own
//     `sectionTitleLabel()` (imported — the marker string is never re-spelled
//     here), so the string rendered is the string measured. A "(cont.)" typed
//     twice is a mis-measured title waiting to happen.
//
// Absent slice = the whole section, unchanged. That is the single-column (ATS)
// path and the browser preview, neither of which slices anything.
// ─────────────────────────────────────────────────────────────────────────────

import { sectionTitleLabel } from '../layout.js'

/**
 * The items one slice renders. `undefined` slice (or `undefined` items) is the
 * identity case — the whole list.
 *
 * THROWS on a short list rather than clamping. `Array#slice` silently returns
 * fewer elements when `end` runs past the array, so a component whose list is
 * shorter than the engine's would drop the tail of every page with no error
 * anywhere — content lost to a mismatch, which is an Invariant-0 violation and
 * exactly the class of bug the slice contract exists to make impossible. The
 * lists cannot legitimately differ: the engine and the renderer read the same
 * `data`, and `contact` (the one assembled list) is produced by layout.js for
 * both. So a short list is a bug, and it says so.
 *
 * @template T
 * @param {T[] | undefined} items
 * @param {import('../types.js').SidebarSlice} [slice]
 * @returns {T[]}
 */
export function sliceItems(items, slice) {
  const all = items ?? []
  if (!slice) return all
  if (slice.end > all.length) {
    throw new Error(
      `sectionSlice: "${slice.key}" was planned as items [${slice.start}, ${slice.end}) of ` +
        `${slice.itemCount} but the component has only ${all.length}. The packer and the ` +
        `renderer disagree about this section's item list; slicing would silently drop content.`
    )
  }
  return all.slice(slice.start, slice.end)
}

/**
 * The title one slice renders: the section's label, plus the continuation
 * marker when an earlier page already showed part of this section.
 *
 * @param {string} label
 * @param {import('../types.js').SidebarSlice} [slice]
 */
export function sliceTitle(label, slice) {
  return sectionTitleLabel(label, slice?.continued === true)
}
