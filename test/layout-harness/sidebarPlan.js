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
// Note the whole-section granularity of this slice: a section is atomic, so the
// front-load check here is `frontLoadMaximal` (no page could have taken the
// next page's first section), not fill-monotonicity — see that function's
// docblock for why the latter is unachievable until sections split at item
// boundaries.
// ─────────────────────────────────────────────────────────────────────────

import { TWO_COLUMN_LAYOUT } from '../../src/pdf/defaultLayouts.js'
import {
  deriveSidebarMetrics,
  planTwoColumn,
  sidebarFlowKeys,
  sidebarSectionH
} from '../../src/pdf/layout.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { expectedSidebarBudget } from './sidebarBudget.js'
import { sidebarLayoutPlan } from './sidebarItems.js'
import { harnessMeasurer } from './structuralFacts.js'

/**
 * Run the real engine over a content bag and return everything the invariants
 * need: the LayoutPlan (item-level ids per page, both flows) and the per-page
 * sidebar fill/budget rows.
 */
export function realSidebarPlan(content, layout = TWO_COLUMN_LAYOUT) {
  const measure = harnessMeasurer()
  const plan = planTwoColumn({
    content,
    layout,
    config: content.config,
    theme: tealTheme,
    measure
  })
  const sm = deriveSidebarMetrics(tealTheme)

  // `budget` is the INDEPENDENTLY derived one (sidebarBudget.js: arithmetic over
  // the theme's raw tokens, no call into layout.js), never `page.sidebarFill
  // .budget`. That substitution is what gives the front-load / over-budget
  // checks any power: with the packer's own budget they could only detect the
  // packer contradicting itself. `packerBudget` is carried alongside so a test
  // can assert the two agree — which is the check that actually catches a wrong
  // budget formula.
  const photo = Boolean(content.profilePhoto)
  const pageFills = plan.pages.map((page) => {
    const firstKey = page.sidebarKeys[0]
    return {
      used: page.sidebarFill?.used ?? 0,
      budget: expectedSidebarBudget(page.index, { photo }),
      packerBudget: page.sidebarFill?.budget ?? null,
      blockCount: page.sidebarKeys.length,
      // The height the NEXT page's first section would add to this one — what
      // frontLoadMaximal needs to prove the section genuinely did not fit.
      firstBlockHeight: firstKey == null ? null : sidebarSectionH(firstKey, content, sm, measure),
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
