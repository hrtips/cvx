// ── The REAL sidebar plan (C3) ─────────────────────────────────────────────
//
// Pre-C3 this file built a *structural approximation* of the sidebar: the
// engine did not measure or pack sidebar content at all, it assigned a fixed
// section list per page KIND and repeated that list verbatim onto every
// physical page the column overflowed onto, so all this harness could check
// was "is each present section's key reachable somewhere". Four sidebar
// assertions were `it.todo` for exactly that reason.
//
// layout.js now packs the sidebar for real (`packSidebar`) and coordinates it
// with the main column (`planTwoColumn`, P = max), so this module no longer
// mirrors anything: it calls the engine and reshapes its output into the
// LayoutPlan shape invariants.js consumes, plus the per-page fill numbers the
// front-load and over-budget checks need.
//
// C3b granularity: a section is no longer atomic — `packSidebar` may cut it at
// an item boundary, so `plan.pages[i].sidebarSlices` carries item ranges. The
// front-load rows below encode that: a page that OPENS with a continuation gets
// `continuesPrevious` plus the independently-derived cost of moving one more
// item back onto the previous page (`itemIncrement`), which is what turns
// `frontLoadMaximal`'s whole-block question into the split-aware one.
//
// WHICH NUMBERS ARE INDEPENDENT, precisely (this is the whole point of the
// module and review has burned this project on it before):
//   - `budget`        — sidebarBudget.js, theme tokens only. Independent.
//   - `itemIncrement` — sidebarBudget.js, theme tokens + the content bag.
//                       Independent. `null` for a section whose per-item height
//                       needs glyph widths (competencies) — such pages are
//                       SKIPPED by the maximality check, not waved through.
//   - `oracleUsed`    — sidebarBudget.js, whole-page sum; `null` when any slice
//                       on the page is not token-derivable. Independent.
//   - `used` / `packerBudget` / `firstBlockHeight` — the packer's own numbers,
//                       carried so a test can assert they AGREE with the
//                       independent ones. Never the sole basis of a check that
//                       is supposed to falsify the packer.
// ─────────────────────────────────────────────────────────────────────────

import { TWO_COLUMN_LAYOUT } from '../../src/pdf/defaultLayouts.js'
import {
  deriveSidebarMetrics,
  isContinuedSlice,
  planTwoColumn,
  sidebarFlowKeys,
  sidebarSectionH
} from '../../src/pdf/layout.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import {
  expectedMinUnitH,
  expectedPageUsedH,
  expectedRefereeIncrement,
  expectedSidebarBudget,
  perItemH
} from './sidebarBudget.js'
import { sidebarLayoutPlan } from './sidebarItems.js'
import { harnessMeasurer } from './structuralFacts.js'

/**
 * What ONE more item of `slice`'s section would have added to the previous
 * page, from theme tokens alone — or `null` when this oracle cannot derive it.
 *
 * @param {{ key: string, start: number }} slice   the CONTINUATION slice (its `start` is the item that moved)
 * @param {object} content
 */
function independentItemIncrement(slice, content) {
  if (slice.key === 'referees') {
    const entry = (content.referees ?? [])[slice.start]
    return entry ? expectedRefereeIncrement(entry) : null
  }
  return perItemH(slice.key) ?? null
}

/**
 * Run the real engine over a content bag and return everything the invariants
 * need: the LayoutPlan (item-level ids per page, both flows) and the per-page
 * sidebar fill/budget rows.
 */
export function realSidebarPlan(content, layout = TWO_COLUMN_LAYOUT) {
  const measure = harnessMeasurer()
  const plan = planTwoColumn({ content, layout, theme: tealTheme, measure })
  const sm = deriveSidebarMetrics(tealTheme)

  const photo = Boolean(content.profilePhoto)
  const pageFills = plan.pages.map((page) => {
    const first = page.sidebarSlices[0]
    const onlySlice = page.sidebarSlices.length === 1 ? first : null
    return {
      used: page.sidebarFill?.used ?? 0,
      budget: expectedSidebarBudget(page.index, { photo }),
      packerBudget: page.sidebarFill?.budget ?? null,
      /** The independently-derived page total, or null when a slice needs glyph widths. */
      oracleUsed: page.sidebarSlices.length ? expectedPageUsedH(page.sidebarSlices, content) : null,
      blockCount: page.sidebarSlices.length,
      /** True when this page opens with the tail of a section the previous page started. */
      continuesPrevious: isContinuedSlice(first),
      itemIncrement: isContinuedSlice(first) ? independentItemIncrement(first, content) : undefined,
      /**
       * Could a lone over-budget block have been cut smaller? Only a one-item
       * slice could not — that is Invariant 0's irreducible residual.
       */
      indivisible: onlySlice ? onlySlice.end - onlySlice.start <= 1 : false,
      // The height the NEXT page's first section would add to this one — what
      // frontLoadMaximal needs to prove the section genuinely did not fit.
      // Only meaningful for a section that STARTS on that page (a continuation
      // is handled by `itemIncrement` above), so it is the whole-section height.
      firstBlockHeight:
        first == null || isContinuedSlice(first)
          ? null
          : sidebarSectionH(first.key, content, sm, measure),
      /**
       * The SMALLEST placeable piece of that section (title + one item), from
       * theme tokens. C3b splits, so "the whole section did not fit" stopped
       * being the right maximality question — and this is the number that makes
       * rule 1b (a page ending early) falsifiable rather than a free pass: an
       * empty page is legal only if even this did not fit on it.
       */
      minUnit:
        first == null || isContinuedSlice(first) ? null : expectedMinUnitH(first.key, content),
      gapBefore: sm.sectionDividerH
    }
  })

  return { plan, layoutPlan: sidebarLayoutPlan(plan, content), pageFills }
}

/**
 * Which sidebar section keys have renderable content, mirroring each
 * Section.jsx component's own `if (!x?.length) return null` presence guard.
 * `referees` always renders (real entries, or the "available upon request"
 * placeholder — RefereesSection.jsx), so it is always "present" content.
 *
 * Identity slots are excluded: they are injected per page by the coordinator,
 * never packed, so they are not part of the section flow this checks.
 */
export function presentSidebarKeys(content, layout = TWO_COLUMN_LAYOUT) {
  const sm = deriveSidebarMetrics(tealTheme)
  return sidebarFlowKeys(layout).filter(
    (key) => sidebarSectionH(key, content, sm, harnessMeasurer()) !== null
  )
}
