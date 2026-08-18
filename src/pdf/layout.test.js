// packExperiences' public contract. The `resolveFirstSidebar (RV1)` describe
// that used to head this file is gone with the function: its single-page
// sidebar fold is subsumed by sidebarFlowKeys() + packSidebar() (C3a), and its
// `isSinglePage === false` branch was unreachable in production — keeping tests
// alive for retired behaviour is how a dead code path survives a review.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { packExperiences } from './layout.js'

describe('packExperiences', () => {
  const summary = ['A short summary.']
  const exp = (/** @type {number} */ n) =>
    Array.from({ length: n }, (_, i) => ({
      role: `R${i}`,
      company: `C${i}`,
      period: 'p',
      bullets: ['b']
    }))

  it('keeps a short CV on a single page (continuationChunks empty)', () => {
    const r = packExperiences(exp(1), summary, undefined)
    expect(r.continuationChunks.length).toBe(0)
    expect(r.totalPages).toBe(1)
  })

  it('always places at least one entry on page 1', () => {
    expect(
      packExperiences(exp(3), summary, undefined).page1Experiences.length
    ).toBeGreaterThanOrEqual(1)
  })

  // (An 'honours an explicit config split' test lived here until the
  // page1ExperienceCount / page1SplitBullets levers were removed — maintainer
  // ruling, design-layout-fidelity.md Review outcome #1.)
})

// C3b — the automatic branch may now cut an entry at a BULLET boundary when the
// whole entry does not fit the page's remaining room, instead of pushing it
// wholesale onto the next page (which is what left page 1 with a 200pt hole and
// then overflowed it anyway). Asserted here on the char-width estimate, no
// fonts: what matters is the split's shape and completeness, not the pt values.
describe('packExperiences — automatic bullet-level splitting', () => {
  /** One entry with `n` bullets long enough that the whole entry cannot fit page 1's residual budget. */
  const bigEntry = (/** @type {number} */ n) => ({
    role: 'Principal Engineer',
    company: 'Example Holdings',
    period: '2019 – 2024',
    bullets: Array.from(
      { length: n },
      (_, i) =>
        `Bullet ${i}: a deliberately long line of prose describing one delivery in enough detail that it wraps across several rendered lines of the main column.`
    )
  })

  /**
   * Every (entry, bulletIndex) pair the packed pages actually render, in order.
   * @param {{
   *   page1Experiences: import('./types.js').ExperienceEntry[],
   *   continuationChunks: import('./types.js').ExperienceEntry[][],
   * }} r
   */
  const renderedBullets = (r) =>
    [r.page1Experiences, ...r.continuationChunks].flatMap((chunk, page) =>
      chunk.flatMap((e) => {
        const from = e.startBullet ?? 0
        const to = e.endBullet ?? (e.bullets ?? []).length
        return Array.from({ length: to - from }, (_, k) => ({
          page,
          role: e.role,
          bullet: from + k
        }))
      })
    )

  it('cuts one over-tall entry across pages, keeping every bullet exactly once and in order', () => {
    const summaryBullets = Array.from(
      { length: 8 },
      (_, i) =>
        `Summary line ${i}: several clauses of text so that the summary itself consumes most of page one's main column before any experience entry is placed.`
    )
    const r = packExperiences([bigEntry(14)], summaryBullets, undefined)
    expect(r.totalPages).toBeGreaterThan(1)

    const rendered = renderedBullets(r)
    expect(rendered.map((b) => b.bullet)).toEqual([...Array(14).keys()])
    // exactly one fragment per page, and page 1 really did get some of them
    expect(r.page1Experiences).toHaveLength(1)
    expect(r.page1Experiences[0].endBullet).toBeGreaterThan(0)
    expect(r.page1Experiences[0].isContinuation).toBeFalsy()
    for (const chunk of r.continuationChunks) {
      expect(chunk[0].isContinuation).toBe(true)
    }
    // the head's cut point IS the continuation's start — no gap, no overlap
    expect(r.continuationChunks[0][0].startBullet).toBe(r.page1Experiences[0].endBullet)
  })

  it("never leaves the entry head alone (no bullets) on a page — the main column's orphan rule", () => {
    const r = packExperiences(
      [bigEntry(14)],
      Array.from({ length: 8 }, (_, i) => `Summary ${i}: ${'padding text '.repeat(12)}`),
      undefined
    )
    for (const chunk of [r.page1Experiences, ...r.continuationChunks]) {
      for (const e of chunk) {
        const from = e.startBullet ?? 0
        const to = e.endBullet ?? (e.bullets ?? []).length
        expect(to - from).toBeGreaterThan(0)
      }
    }
  })

  it('does not split an entry that fits whole', () => {
    const small = Array.from({ length: 2 }, (_, i) => ({
      role: `R${i}`,
      company: `C${i}`,
      period: 'p',
      bullets: ['b']
    }))
    const r = packExperiences(small, ['A short summary.'], undefined)
    for (const e of r.page1Experiences) {
      expect(e.endBullet).toBeUndefined()
      expect(e.isContinuation).toBeFalsy()
    }
  })

  it('leaves a single-bullet entry unsplit even when it cannot fit (nothing legal to cut)', () => {
    const one = {
      role: 'R',
      company: 'C',
      period: 'p',
      bullets: [`${'a very long bullet clause '.repeat(400)}`]
    }
    const r = packExperiences([one], ['s'], undefined)
    expect(r.page1Experiences).toHaveLength(1)
    expect(r.page1Experiences[0].endBullet ?? 1).toBe(1)
  })
})

// N3: `PAGE1_OVERFLOW_WARN_THRESHOLD` and the theme's `spacing.safety` are two
// literals that must stay equal, and nothing made them.
//
// `overflowWarnings()`'s own docblock justifies the threshold BY the margin —
// "the budgets already subtract `spacing.safety`, so a sub-point overrun is
// measurement noise eating the margin, not a page break". That is a claim
// about a RELATIONSHIP, encoded as two unrelated numbers that happen to agree.
//
// It cannot be collapsed into one: `overflowWarnings(plan)` takes only the
// plan, deliberately, because §2.4 pins Diagnostics as a pure function of the
// Plan — so it has no theme to read. What it can have is a tripwire, and
// doctrine 13 says why it earns one: the 220pt predecessor of this very
// constant "sat between the estimator's overshoot and the mildest real defect
// and silently suppressed a real warning for the product's whole life".
//
// Read out of the source rather than imported, because the constant is
// module-private ON PURPOSE ("overflowWarnings() is the only consumer"), and
// widening the API to test it would trade a real design property for a
// convenience. layout.api.test.js already reads this file the same way.
describe('the overflow threshold tracks the theme safety margin it is justified by (N3)', () => {
  const source = readFileSync(new URL('./layout.js', import.meta.url), 'utf8')

  it("is the same number as every shipped theme's spacing.safety", async () => {
    const m = /const PAGE1_OVERFLOW_WARN_THRESHOLD = ([\d.]+)/.exec(source)
    expect(m, 'PAGE1_OVERFLOW_WARN_THRESHOLD was renamed or removed').toBeTruthy()
    const threshold = Number(m?.[1])

    const { discoverThemes } = await import('./themes/index.js')
    const themes = await discoverThemes()
    expect(Object.keys(themes).length).toBeGreaterThan(1) // not vacuous
    for (const [name, theme] of Object.entries(themes)) {
      expect(
        theme.spacing.safety,
        `theme "${name}" has spacing.safety ${theme.spacing.safety} but the overflow warning suppresses everything at or below ${threshold}pt — the threshold exists to be exactly the margin, so one moved without the other`
      ).toBe(threshold)
    }
  })
})
