// packExperiences' public contract. The `resolveFirstSidebar (RV1)` describe
// that used to head this file is gone with the function: its single-page
// sidebar fold is subsumed by sidebarFlowKeys() + packSidebar() (C3a), and its
// `isSinglePage === false` branch was unreachable in production — keeping tests
// alive for retired behaviour is how a dead code path survives a review.
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
