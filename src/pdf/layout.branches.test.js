// Extra coverage for layout.js's estimator internals and the config-driven
// split branches that the packing-focused layout.test.js does not reach. Uses
// the char-width estimate (no measurer injected) so every result is
// deterministic and dependency-free.
//
// The `estimatePage1Overflow` block that used to live here went with the
// function in C3b: `overflowWarnings()` supersedes it (it reads the real plan
// and covers every page, not just a config-forced page 1), and keeping a dead
// export alive purely so its own test could exercise it is what knip exists to
// catch. The lever's warning is now covered by render.test.js and
// validateContent.test.js against the real build path.
import { describe, expect, it } from 'vitest'
import { deriveMetrics, entryH, packExperiences, summaryH } from './layout.js'
import { tealTheme } from './themes/teal.js'

const M = deriveMetrics(tealTheme)

describe('entryH', () => {
  it('grows with location, description, progression, and mixed bullets', () => {
    const bare = entryH({ role: 'Engineer' }, M)
    const full = entryH(
      {
        role: 'Engineer',
        location: 'London',
        description: 'A one-line description of the role.',
        progression: [
          { title: 'Lead', period: '2021' },
          { title: 'Eng', period: '2020' }
        ],
        bullets: ['A plain bullet.', { text: 'An object bullet.' }]
      },
      M
    )
    expect(bare).toBeGreaterThan(0)
    expect(full).toBeGreaterThan(bare)
  })

  it('handles continuation entries with and without visible bullets', () => {
    const withBullets = entryH(
      { role: 'R', bullets: ['a', 'b', 'c'], isContinuation: true, startBullet: 1, endBullet: 3 },
      M
    )
    const noBullets = entryH({ role: 'R', bullets: [], isContinuation: true }, M)
    expect(withBullets).toBeGreaterThan(noBullets)
    expect(noBullets).toBeGreaterThan(0)
  })
})

describe('summaryH', () => {
  it('measures string and object summary bullets', () => {
    expect(summaryH(['One line.', { text: 'Object line.' }], M)).toBeGreaterThan(0)
  })
})

describe('packExperiences — config-driven split', () => {
  const exp = (/** @type {number} */ n) =>
    Array.from({ length: n }, (_, i) => ({
      role: `R${i}`,
      company: `C${i}`,
      period: 'p',
      bullets: ['b']
    }))

  it('keeps all entries on page 1 when the forced count exceeds the list length', () => {
    const r = packExperiences(exp(2), ['s'], { page1ExperienceCount: 5, page1SplitBullets: null })
    expect(r.page1Experiences).toHaveLength(2)
    expect(r.continuationChunks).toEqual([])
    expect(r.totalPages).toBe(1)
  })

  it('splits the last page-1 entry at page1SplitBullets and continues the remainder', () => {
    const experience = [
      { role: 'Split', company: 'C', period: 'p', bullets: ['b0', 'b1', 'b2', 'b3'] },
      { role: 'Next', company: 'C', period: 'p', bullets: ['x'] }
    ]
    const r = packExperiences(experience, ['s'], { page1ExperienceCount: 1, page1SplitBullets: 2 })
    expect(r.page1Experiences[0].endBullet).toBe(2)
    const head = r.continuationChunks.flat()[0]
    expect(head.isContinuation).toBe(true)
    expect(head.startBullet).toBe(2)
    expect(r.totalPages).toBeGreaterThanOrEqual(2)
  })
})
