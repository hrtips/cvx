import { describe, expect, it } from 'vitest'
import { buildKeywords } from './keywords.js'

// Convenience: build and split back into a keyword array.
const kw = (
  /** @type {Parameters<typeof buildKeywords>[0]} */ data,
  /** @type {Parameters<typeof buildKeywords>[1]} */ config
) => buildKeywords(data, config).split(', ').filter(Boolean)

describe('buildKeywords', () => {
  it('returns "" when there is no content', () => {
    expect(buildKeywords({}, {})).toBe('')
  })

  it('returns "" when disabled', () => {
    expect(buildKeywords({ competencies: ['A'] }, { atsKeywords: { enabled: false } })).toBe('')
  })

  it('flattens grouped/object competencies and keyword objects', () => {
    // competencies as grouped objects + keyword entries as {group, items}
    const out = kw(
      /** @type {any} */ ({
        competencies: [{ group: 'Cloud', items: ['AWS', 'GCP'] }],
        keywords: [{ items: ['Kubernetes'] }]
      }),
      { atsKeywords: { autoDerive: true } }
    )
    expect(out).toEqual(expect.arrayContaining(['AWS', 'GCP', 'Kubernetes']))
  })

  it('derives titles from experience roles and progression steps', () => {
    const out = kw(
      {
        personal: { name: 'X', title: 'Staff Engineer' },
        experience: [
          { role: 'Lead', company: 'C', progression: [{ title: 'Senior' }, { title: 'Principal' }] }
        ]
      },
      { atsKeywords: { autoDerive: true } }
    )
    expect(out).toEqual(expect.arrayContaining(['Staff Engineer', 'Lead', 'Senior', 'Principal']))
  })

  it('defensively handles off-type keyword shapes (numbers, bare strings)', () => {
    // The schema rejects these, but the renderer must not crash on hand-edited
    // YAML: a non-string/non-object array item is dropped; a bare-string value
    // (not an array) is coerced to a single keyword.
    const numbersDropped = kw(/** @type {any} */ ({ keywords: ['Keep', 7, null] }), {
      atsKeywords: { autoDerive: false }
    })
    expect(numbersDropped).toEqual(['Keep'])
    const bareString = kw(/** @type {any} */ ({ keywords: 'Solo' }), {
      atsKeywords: { autoDerive: false }
    })
    expect(bareString).toEqual(['Solo'])
  })

  it('caps the keyword count at atsKeywords.max', () => {
    const out = kw(
      { competencies: ['A', 'B', 'C', 'D', 'E'] },
      { atsKeywords: { autoDerive: false, enabled: true, max: 2 } }
    )
    expect(out.length).toBeLessThanOrEqual(2)
  })

  it('includes flat manual keywords', () => {
    expect(kw({ keywords: ['Alpha', 'Beta'] }, { atsKeywords: { autoDerive: false } })).toEqual([
      'Alpha',
      'Beta'
    ])
  })

  it('accepts the grouped-map keyword form', () => {
    expect(
      kw({ keywords: { Skills: ['A', 'B'], Tools: ['C'] } }, { atsKeywords: { autoDerive: false } })
    ).toEqual(['A', 'B', 'C'])
  })

  it('accepts the list-of-grouped-maps form', () => {
    expect(
      kw({ keywords: [{ Skills: ['A'] }, 'D'] }, { atsKeywords: { autoDerive: false } })
    ).toEqual(['A', 'D'])
  })

  it('dedupes case-insensitively, preserving first-seen casing', () => {
    expect(
      kw(
        { keywords: ['Leadership', ' leadership ', 'LEADERSHIP'] },
        { atsKeywords: { autoDerive: false } }
      )
    ).toEqual(['Leadership'])
  })

  it('sanitises internal commas so no keyword corrupts the comma-joined field (R5)', () => {
    const out = buildKeywords({ experience: [{ role: 'Solo Operative, The Dark Knight' }] }, {})
    expect(out.split(', ').some((t) => t.includes(','))).toBe(false)
    expect(out).toContain('Solo Operative The Dark Knight')
  })

  it('derives competencies and titles but NOT company names', () => {
    const out = kw(
      {
        competencies: ['Skill One'],
        personal: { title: 'Head of X' },
        experience: [{ role: 'Manager', company: 'Acme Corp', progression: [{ title: 'Lead' }] }]
      },
      {}
    )
    expect(out).toContain('Skill One')
    expect(out).toContain('Head of X')
    expect(out).toContain('Manager')
    expect(out).toContain('Lead')
    expect(out).not.toContain('Acme Corp')
  })

  it('puts body-derived terms first so a max cap keeps on-page keywords (R6)', () => {
    expect(
      kw(
        {
          competencies: ['Derived One', 'Derived Two'],
          keywords: ['Manual One', 'Manual Two']
        },
        { atsKeywords: { max: 2 } }
      )
    ).toEqual(['Derived One', 'Derived Two'])
  })

  it('treats autoDerive:false as manual-only', () => {
    expect(
      kw(
        { competencies: ['Derived'], keywords: ['Manual'] },
        { atsKeywords: { autoDerive: false } }
      )
    ).toEqual(['Manual'])
  })
})
