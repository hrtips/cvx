// packExperiences' public contract. The `resolveFirstSidebar (R1)` describe
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
    const r = packExperiences(exp(1), summary, {}, undefined)
    expect(r.continuationChunks.length).toBe(0)
    expect(r.totalPages).toBe(1)
  })

  it('always places at least one entry on page 1', () => {
    expect(
      packExperiences(exp(3), summary, {}, undefined).page1Experiences.length
    ).toBeGreaterThanOrEqual(1)
  })

  it('honours an explicit config split (page1ExperienceCount)', () => {
    const r = packExperiences(
      exp(4),
      summary,
      { page1ExperienceCount: 2, page1SplitBullets: null },
      undefined
    )
    expect(r.page1Experiences.length).toBe(2)
    expect(r.continuationChunks.flat().length).toBe(2)
  })
})
