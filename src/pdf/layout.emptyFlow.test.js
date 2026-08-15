// I2 — the empty experience flow gets an honest page-1 row (RED FIRST).
//
// Root cause of the 2026-08 silent 3-sheet incident, §3 of the archived plan:
// `packBlocks([])` returns zero pages, so `packExperiences` with
// `experience: []` published `totalPages: 0` and NO page-1 metrics row at all.
// Every main.* diagnostic read null, `overflowPt` had nothing to sum, and the
// existing fixedTooTall overflow branch (keyed on `mainFill.budget < 0`) was
// unreachable on exactly the shape that needed it. The degenerate input
// deleted the very row that carries its warning.
//
// What I2 ships (ARCHITECTURE §8 row I2, diagnostics v3 per R-E):
//   (a) packExperiences emits a page-1 metrics row whenever the summary
//       renders, even with an empty flow: used 0, budget = capacity − summary
//       − spacer (NO title: ExperienceSection returns null for an empty list,
//       and the model mirrors the render — §4), blockedBy null.
//   (b) planTwoColumn's mainPageCount becomes 1 in that state; fill becomes a
//       number; when the summary alone exceeds the column, budget < 0 and the
//       EXISTING fixedTooTall overflow warning fires — no new code needed.
//   (c) `experience-empty` fact (kind 'fact', page 1, payload fixedPt),
//       mutually exclusive with `page1-no-experience` in both directions.
//   (d) `emptyColumn` means "no content beyond the per-page chrome": a page-1
//       main column carrying a summary is NOT empty; identity blocks and the
//       page badge are chrome and never count as content.
//   (e) diagnostics.version: 3 (mainPageCount 0→1 and fill null→number are
//       semantic changes to published fields; I1's non-page-scoped warning
//       fields ride the same bump).

import { describe, expect, it } from 'vitest'
import {
  deriveMetrics,
  overflowWarnings,
  packExperiences,
  planTwoColumn,
  summaryH
} from './layout.js'
import { layoutDiagnostics } from './layoutDiagnostics.js'

const SUMMARY_4 = [
  'Led the platform team through a two-year replatforming effort with zero downtime.',
  'Shipped the billing system that now clears the majority of the company revenue.',
  'Built and mentored a team of nine engineers across three time zones.',
  'Drove the incident program that halved the mean time to recovery.'
]

/** ~30 two-line bullets: taller than any single column can hold. */
const SUMMARY_TALL = Array.from(
  { length: 30 },
  (_, i) =>
    `Probe sentence number ${i + 1} for the tall summary overflow experiment, deliberately long enough to wrap onto a second line in the main column of the page.`
)

const ROLE = {
  role: 'Alpha Engineer',
  company: 'Bravo Systems',
  period: '2020 – 2024',
  bullets: ['Delivered the charlie subsystem on time and under budget for two years running.']
}

const PERSONAL = { name: 'Alpha Tester', title: 'Engineer' }

/** Sidebar-ish content so planTwoColumn has a second flow (default layout). */
const SIDEBAR = {
  personal: PERSONAL,
  competencies: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'],
  education: [{ degree: 'BSc Testing', institution: 'Harness University', period: '2010 – 2014' }]
}

describe('I2(a) — packExperiences gives the empty flow an honest page-1 row', () => {
  it('emits one page with a zero-used row when the summary renders', () => {
    const r = packExperiences([], SUMMARY_4)
    expect(r.totalPages).toBe(1)
    expect(r.page1Experiences).toEqual([])
    expect(r.continuationChunks).toEqual([])
    expect(r.pageMetrics).toHaveLength(1)
    const row = r.pageMetrics[0]
    expect(row.used).toBe(0)
    expect(row.blockedBy).toBeNull()
    expect(row.capacity).toBeGreaterThan(0)
    expect(row.budget).toBeGreaterThan(0) // a 4-bullet summary leaves real room
  })

  it('stays at zero pages when nothing in the main flow renders at all', () => {
    const r = packExperiences([], [])
    expect(r.totalPages).toBe(0)
    expect(r.pageMetrics).toEqual([])
  })

  it('the budget mirrors the render: summary and spacer charged, the unrendered title NOT', () => {
    // ExperienceSection returns null for an empty list — no "EXPERIENCE" title
    // ink exists on this page, so charging calcTitleH would over-state the
    // fixed content by ~20pt (§4: the model mirrors the render).
    const r = packExperiences([], SUMMARY_4)
    const row = r.pageMetrics[0]
    const sumH = summaryH(SUMMARY_4, deriveMetrics(undefined))
    // fixed = capacity − budget must equal summary + spacer exactly.
    const fixed = row.capacity - row.budget
    const spacer = fixed - sumH
    expect(spacer).toBeGreaterThan(0) // the layout's spacer is real, rendered space
    expect(spacer).toBeLessThan(30) // and it is a spacer, not a title + spacer
  })

  it('a summary taller than the column drives the budget negative', () => {
    const r = packExperiences([], SUMMARY_TALL)
    expect(r.totalPages).toBe(1)
    expect(r.pageMetrics[0].budget).toBeLessThan(0)
  })
})

describe('I2(b) — the plan and the existing overflow machinery see the shape', () => {
  it('mainPageCount is 1 and page 1 carries a numeric fill', () => {
    const plan = planTwoColumn({ content: { experience: [], summary: SUMMARY_4, ...SIDEBAR } })
    expect(plan.mainPageCount).toBe(1)
    expect(plan.pages[0].mainFill).not.toBeNull()
    expect(plan.pages[0].mainFill?.used).toBe(0)
  })

  it('the 30-bullet shape is a priced overflow through the EXISTING fixedTooTall branch', () => {
    const plan = planTwoColumn({ content: { experience: [], summary: SUMMARY_TALL, ...SIDEBAR } })
    expect(plan.pages[0].overflowPt).toBeGreaterThan(0)
    const warnings = overflowWarnings(plan)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].page).toBe(1)
    expect(warnings[0].message).toMatch(/summary alone is taller than the main column/)
  })

  it('fill > 1 exactly when the page is over budget (the invariant, no longer vacuous here)', () => {
    const d = layoutDiagnostics(
      planTwoColumn({ content: { experience: [], summary: SUMMARY_TALL, ...SIDEBAR } })
    )
    const page1 = d?.pages[0]
    expect(page1?.main.fill).toBeGreaterThan(1)
    expect(page1?.overflowPt).toBeGreaterThan(0)
    const dOk = layoutDiagnostics(
      planTwoColumn({ content: { experience: [], summary: SUMMARY_4, ...SIDEBAR } })
    )
    expect(dOk?.pages[0].main.fill).toBeGreaterThan(0)
    expect(dOk?.pages[0].main.fill).toBeLessThan(1)
    expect(dOk?.pages[0].overflowPt).toBe(0)
  })
})

describe('I2(c) — the experience-empty fact, mutually exclusive with page1-no-experience', () => {
  const diagnose = (/** @type {any} */ content) => layoutDiagnostics(planTwoColumn({ content }))

  it('fires as a fact with the page-1 fixed content as its price', () => {
    const d = diagnose({ experience: [], summary: SUMMARY_4, ...SIDEBAR })
    const w = d?.warnings.find((x) => x.code === 'experience-empty')
    expect(w).toBeDefined()
    expect(w?.kind).toBe('fact')
    expect(w?.page).toBe(1)
    expect(w?.fixedPt).toBeGreaterThan(0)
    // R-F: names the condition, prices it, never prescribes an edit.
    expect(w?.message).not.toMatch(/\bshorten\b|\badd\b|\bmove\b|\byou should\b/i)
    expect(w?.message).not.toMatch(/\n/)
  })

  it('is absent the moment one role exists', () => {
    const d = diagnose({ experience: [ROLE], summary: SUMMARY_4, ...SIDEBAR })
    expect(d?.warnings.some((w) => w.code === 'experience-empty')).toBe(false)
  })

  it('never coexists with page1-no-experience, in either direction', () => {
    // Zero roles anywhere → experience-empty, and page1-no-experience is
    // structurally unreachable (its precondition is roles pushed to page 2).
    const empty = diagnose({ experience: [], summary: SUMMARY_4, ...SIDEBAR })
    expect(empty?.warnings.some((w) => w.code === 'experience-empty')).toBe(true)
    expect(empty?.warnings.some((w) => w.code === 'page1-no-experience')).toBe(false)
    // Roles exist but page 1 shows none → the defect, not the fact.
    const blocked = diagnose({
      experience: [ROLE],
      summary: SUMMARY_TALL.slice(0, 24),
      ...SIDEBAR
    })
    const codes = blocked?.warnings.map((w) => w.code) ?? []
    // Stated as the invariant itself rather than a conditional check: whatever
    // this fixture happens to produce, the two codes may never co-occur.
    expect(codes.includes('page1-no-experience') && codes.includes('experience-empty')).toBe(false)
  })
})

describe('I2(d) — emptyColumn means "no content beyond the chrome"', () => {
  it('a page-1 main column carrying a summary is not empty', () => {
    const plan = planTwoColumn({ content: { experience: [], summary: SUMMARY_4, ...SIDEBAR } })
    expect(plan.pages[0].emptyColumn).not.toBe('main')
    expect(plan.pages[0].emptyColumn).not.toBe('both')
  })

  it('a later page whose main flow has ended is still honestly empty', () => {
    // Enough sidebar to outlast the main flow: page 2 exists for the sidebar
    // alone, its main column renders nothing (no summary there, no entries,
    // no title), and the G1 residual signal must keep saying so.
    const tallSidebar = {
      personal: PERSONAL,
      competencies: Array.from({ length: 60 }, (_, i) => `Skill number ${i + 1}`),
      education: SIDEBAR.education,
      certifications: Array.from({ length: 12 }, (_, i) => ({
        name: `Certification number ${i + 1} with a reasonably long name attached`,
        issuer: 'Issuing Body'
      }))
    }
    const plan = planTwoColumn({
      content: { experience: [], summary: SUMMARY_4, ...tallSidebar }
    })
    expect(plan.totalPages).toBeGreaterThan(1)
    expect(plan.pages[0].emptyColumn).toBeNull()
    expect(plan.pages.at(-1)?.emptyColumn).toBe('main')
  })
})

describe('I2(e) — the shape version says its meaning moved', () => {
  it('diagnostics carry version 3', () => {
    const d = layoutDiagnostics(
      planTwoColumn({ content: { experience: [ROLE], summary: SUMMARY_4, ...SIDEBAR } })
    )
    expect(d?.version).toBe(3)
  })
})
