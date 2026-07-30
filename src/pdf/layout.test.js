import { describe, it, expect } from 'vitest'
import { resolveFirstSidebar, packExperiences } from './layout.js'

const LAYOUT = {
  first: { sidebar: ['identity-photo', 'contact', 'achievements'] },
  continuation: { sidebar: ['identity-compact', 'education', 'competencies'] },
  last: { sidebar: ['identity-compact', 'referees'] },
}

describe('resolveFirstSidebar (R1)', () => {
  it('leaves first.sidebar unchanged on multi-page CVs', () => {
    expect(resolveFirstSidebar(LAYOUT, false)).toEqual(['identity-photo', 'contact', 'achievements'])
  })

  it('folds continuation/last sections into page 1 on single-page CVs', () => {
    const out = resolveFirstSidebar(LAYOUT, true)
    expect(out).toContain('education')
    expect(out).toContain('competencies')
    expect(out).toContain('referees')
  })

  it('does not duplicate the identity slot when folding', () => {
    expect(resolveFirstSidebar(LAYOUT, true).filter((k) => k.startsWith('identity-')))
      .toEqual(['identity-photo'])
  })

  it('is safe on empty/missing layout', () => {
    expect(resolveFirstSidebar({}, true)).toEqual([])
    expect(resolveFirstSidebar(undefined, false)).toEqual([])
  })
})

describe('packExperiences', () => {
  const summary = ['A short summary.']
  const exp = (/** @type {number} */ n) => Array.from({ length: n }, (_, i) => ({ role: `R${i}`, company: `C${i}`, period: 'p', bullets: ['b'] }))

  it('keeps a short CV on a single page (continuationChunks empty)', () => {
    const r = packExperiences(exp(1), summary, {}, undefined)
    expect(r.continuationChunks.length).toBe(0)
    expect(r.totalPages).toBe(1)
  })

  it('always places at least one entry on page 1', () => {
    expect(packExperiences(exp(3), summary, {}, undefined).page1Experiences.length).toBeGreaterThanOrEqual(1)
  })

  it('honours an explicit config split (page1ExperienceCount)', () => {
    const r = packExperiences(exp(4), summary, { page1ExperienceCount: 2, page1SplitBullets: null }, undefined)
    expect(r.page1Experiences.length).toBe(2)
    expect(r.continuationChunks.flat().length).toBe(2)
  })
})
