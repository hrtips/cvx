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
import { deriveMetrics, entryH, summaryH } from './layout.js'
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

  // RV4: the object form renders as ONE <Text> — `text`, then the <Link>
  // label, then `suffix`, back to back, wrapped as a single run
  // (BulletList.jsx). Every height formula measured `b.text` alone and dropped
  // the other two, so a bullet whose link label or suffix pushes the combined
  // string past a line boundary was under-measured. Measured on the real
  // theme: 27.00pt — two full body lines — against a 15pt safety margin the
  // architecture describes as absorbing "a few points of noise, not this".
  //
  // The assertion is the equivalence, not a number: whatever the renderer
  // concatenates is what the planner must price. A number would pin one theme.
  it('prices the whole drawn string, not just `text` (RV4)', () => {
    const text = 'Summary point:'
    const suffix =
      ' and then a deliberately long continuation clause that must wrap across several lines' +
      ' because it is far wider than the column can hold on any single line at body size.'
    const label = 'the engineering blog'
    const href = 'https://example.com/blog'

    // text + suffix
    expect(summaryH([{ text, suffix }], M)).toBe(summaryH([text + suffix], M))
    // text + link.label + suffix, in render order
    expect(summaryH([{ text, link: { href, label }, suffix }], M)).toBe(
      summaryH([text + label + suffix], M)
    )
    // (No link-only case: the schema requires `text` on the object form, so a
    // bullet without it is rejected before it can be measured. `bulletText`
    // still defaults each part, because a measurer that throws on a shape the
    // validator would have caught is a worse failure than one that prices it.)
  })
})

// (The 'packExperiences — config-driven split' describe lived here until the
// page1ExperienceCount / page1SplitBullets levers were REMOVED — maintainer
// ruling, design-layout-fidelity.md Review outcome #1. The branch it tested
// is gone; automatic packing is the only path.)
