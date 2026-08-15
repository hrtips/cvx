// Unit tests for the envelope-level defect — in-process, because the CLI legs
// exercise it in a child process where the coverage gate cannot see it.

import { describe, expect, it } from 'vitest'
import { attachPhysicalWarnings, physicalPageWarnings } from './physicalPagesWarning.js'

/** A minimal PDF whose page tree and page objects both say `pages`. */
const pdfOf = (/** @type {number} */ pages) =>
  `%PDF-1.3\n1 0 obj\n<<\n/Type /Pages\n/Count ${pages}\n>>\nendobj\n3 0 obj\n<<\n/Type /Catalog\n/Pages 1 0 R\n>>\nendobj\n${Array.from(
    { length: pages },
    (_, i) => `${10 + i} 0 obj\n<<\n/Type /Page\n>>\nendobj\n`
  ).join('')}trailer\n<<\n/Root 3 0 R\n>>`

const warn = (/** @type {number} */ physical, /** @type {number} */ planned) =>
  physicalPageWarnings(Buffer.from(pdfOf(physical)), { totalPages: planned })

describe('physicalPageWarnings', () => {
  it('is silent when the sheets match the plan', () => {
    expect(warn(2, 2)).toEqual([])
  })

  it('is silent when the counter cannot establish a count (null, not a guess)', () => {
    expect(physicalPageWarnings(Buffer.from('not a pdf'), { totalPages: 1 })).toEqual([])
    expect(physicalPageWarnings(Buffer.alloc(0), { totalPages: 1 })).toEqual([])
  })

  it('is silent without a plan to compare against', () => {
    expect(physicalPageWarnings(Buffer.from(pdfOf(2)), /** @type {any} */ ({}))).toEqual([])
    expect(physicalPageWarnings(Buffer.from(pdfOf(2)), /** @type {any} */ (null))).toEqual([])
  })

  it('is silent when the PDF has FEWER sheets than planned', () => {
    // Structurally impossible (a planned page is an explicit <Page> element),
    // and asserted as a harness invariant rather than reported as a second,
    // unreachable message. If it ever happens the harness says so.
    expect(warn(1, 3)).toEqual([])
  })

  it('reports the defect with both numbers when sheets exceed the plan', () => {
    const [w] = warn(3, 2)
    expect(w.code).toBe('physical-pages-exceed-plan')
    expect(w.kind).toBe('defect')
    expect(w.planned).toBe(2)
    expect(w.physical).toBe(3)
    expect(w.message).toContain('3')
    expect(w.message).toContain('2')
  })

  it('counts the surplus in the message, singular and plural', () => {
    expect(warn(3, 2)[0].message).toMatch(/1 sheet carries/)
    expect(warn(5, 2)[0].message).toMatch(/3 sheets carry/)
  })

  it('R-F: it prices the condition and never prescribes an edit', () => {
    const [w] = warn(4, 1)
    expect(w.message).not.toMatch(/\bshorten\b|\btrim\b|\bremove\b|\byou should\b|\bmove the\b/i)
  })
})

describe('attachPhysicalWarnings — the one merge both build envelopes use', () => {
  /** A minimal diagnostics object — only the fields this seam touches. */
  const diagnosticsOf = (/** @type {any[]} */ warnings = []) =>
    /** @type {any} */ ({ version: 2, totalPages: 2, pages: [], warnings })
  const fact = { code: 'page1-ends-early', kind: 'fact', message: 'a priced page break' }

  it('returns null diagnostics for the ATS variant and adds nothing', () => {
    const out = attachPhysicalWarnings({
      diagnostics: null,
      buffer: Buffer.from(pdfOf(9)),
      plan: { totalPages: 1 },
      ats: true
    })
    expect(out.diagnostics).toBeNull()
    expect(out.added).toEqual([])
  })

  it('passes diagnostics through untouched when the sheets match', () => {
    const d = diagnosticsOf([fact])
    const out = attachPhysicalWarnings({
      diagnostics: d,
      buffer: Buffer.from(pdfOf(2)),
      plan: { totalPages: 2 }
    })
    expect(out.added).toEqual([])
    expect(out.diagnostics).toEqual(d)
  })

  it('prepends the defect BEFORE existing facts, and reports it as `added`', () => {
    const out = attachPhysicalWarnings({
      diagnostics: diagnosticsOf([fact]),
      buffer: Buffer.from(pdfOf(4)),
      plan: { totalPages: 2 }
    })
    expect(out.added).toHaveLength(1)
    expect(out.diagnostics?.warnings.map((/** @type {any} */ w) => w.code)).toEqual([
      'physical-pages-exceed-plan',
      'page1-ends-early'
    ])
  })

  it('does not mutate the diagnostics object it was given', () => {
    const d = diagnosticsOf([fact])
    attachPhysicalWarnings({
      diagnostics: d,
      buffer: Buffer.from(pdfOf(4)),
      plan: { totalPages: 2 }
    })
    expect(d.warnings.map((/** @type {any} */ w) => w.code)).toEqual(['page1-ends-early'])
  })

  it('adds nothing when there is no plan to compare against', () => {
    const d = diagnosticsOf()
    const out = attachPhysicalWarnings({
      diagnostics: d,
      buffer: Buffer.from(pdfOf(4)),
      plan: undefined
    })
    expect(out.added).toEqual([])
    expect(out.diagnostics).toBe(d)
  })
})
