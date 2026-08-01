// ── Sidebar structural plan — vitest-only (imports a .jsx file) ───────────
//
// Imports the REAL `TWO_COLUMN_LAYOUT` from src/pdf/CVDocument.jsx (now
// exported there — the only sanctioned src/ change in this pass; see that
// file's docblock) instead of a hand-copied duplicate, per review's
// mirror-drift finding. This file is split out from blocks.js specifically
// because it needs a .jsx import: that only resolves under a bundler/Vite
// transform (which vitest provides), never under plain `node` — and
// generateBaseline.js runs under plain `node`. blocks.js (the main-column
// plan, loaded by BOTH vitest and generateBaseline.js) stays free of this
// dependency; only layoutHarnessInvariants.test.js (vitest-only) imports
// this module.
//
// This is a *structural* (whole-section, unpacked) approximation of the
// sidebar: the current engine does not measure or split sidebar content at
// all, it just assigns fixed section keys per page-kind and repeats that
// whole list verbatim on every physical page the sidebar's real content
// overflows onto. See layoutHarnessInvariants.test.js for exactly which
// sidebar assertions that limitation forces us to skip (marked `.todo`,
// with a reason, pending C3), and test/layout-harness/contentOracle.js for
// the *real*, non-structural content-completeness check that replaces the
// vacuous version of this section-presence idea.
// ─────────────────────────────────────────────────────────────────────────

import { TWO_COLUMN_LAYOUT } from '../../src/pdf/CVDocument.jsx'
import { resolveFirstSidebar } from '../../src/pdf/layout.js'

/** Mirrors CVDocument.jsx's local `contLayout()` sidebar selection. */
function continuationSidebarKeys(contPageIndex, contCount) {
  const isFirst = contPageIndex === 0
  const isLast = contPageIndex === contCount - 1
  const cont = TWO_COLUMN_LAYOUT.continuation
  const last = TWO_COLUMN_LAYOUT.last
  if (isFirst && isLast) return [...new Set([...(cont.sidebar ?? []), ...(last.sidebar ?? [])])]
  if (isLast) return last.sidebar
  return cont.sidebar
}

/**
 * The sidebar's *structural* (whole-section, unpacked) plan: which section
 * keys the static layout assigns to each logical page today, given the
 * logical page count (packExperiences().totalPages). This is NOT a real
 * pack (see module docblock) — it only supports section-presence-level
 * checks, never item-level ones.
 */
export function sidebarStructuralPlan(totalPages) {
  const isSinglePage = totalPages <= 1
  const pages = [
    {
      index: 0,
      main: [],
      sidebar: resolveFirstSidebar(TWO_COLUMN_LAYOUT, isSinglePage)
    }
  ]
  const contCount = totalPages - 1
  for (let i = 1; i < totalPages; i++) {
    pages.push({ index: i, main: [], sidebar: continuationSidebarKeys(i - 1, contCount) })
  }
  return { pages, totalPages: pages.length }
}

/**
 * Which sidebar section keys have renderable content, mirroring each
 * Section.jsx component's own `if (!x?.length) return null` presence guard.
 * `referees` always renders (real entries, or the "available upon request"
 * placeholder — RefereesSection.jsx), so it is always "present" content.
 *
 * `identity-compact` is deliberately NOT in the unconditional base list:
 * it is only ever assigned to continuation/last pages, so a genuinely
 * single-page CV (no continuation pages at all) never needs it — the
 * identity block itself is always satisfied by `identity-photo` on page 1,
 * which always exists.
 */
export function presentSidebarKeys(content) {
  const keys = ['identity-photo', 'contact', 'referees']
  if (content.achievements?.length) keys.push('achievements')
  if (content.education?.length) keys.push('education')
  if (content.certifications?.length) keys.push('certifications')
  if (content.competencies?.length) keys.push('competencies')
  if (content.languages?.length) keys.push('languages')
  if (content.publications?.length) keys.push('publications')
  return keys
}
