// Unit tests for the sheet counter — in-process, so the branches are actually
// exercised (the CLI/MCP legs in test/physicalPages.test.js run it inside a
// child process or through lib/, where the per-file coverage gate can see
// nothing).
//
// These are hand-built PDF fragments, not renders: the point is to pin the
// NULL RULE and the structure-anchoring at the exact boundaries a real render
// never reaches, and which a dependency bump would.

import { describe, expect, it } from 'vitest'
import { countPdfPages } from './physicalPages.js'

/** Minimal well-formed page tree: catalog → pages node → N leaves. */
function pdf(/** @type {number} */ pages, { declared = pages, extra = '' } = {}) {
  const leaves = Array.from(
    { length: pages },
    (_, i) => `${10 + i} 0 obj\n<<\n/Type /Page\n/Parent 1 0 R\n>>\nendobj\n`
  ).join('')
  return `%PDF-1.3
1 0 obj
<<
/Type /Pages
/Count ${declared}
>>
endobj
3 0 obj
<<
/Type /Catalog
/Pages 1 0 R
>>
endobj
${leaves}${extra}trailer
<<
/Root 3 0 R
>>
%%EOF`
}

describe('countPdfPages — the happy path', () => {
  it('counts a one-page and a multi-page document', () => {
    expect(countPdfPages(Buffer.from(pdf(1)))).toBe(1)
    expect(countPdfPages(Buffer.from(pdf(4)))).toBe(4)
  })

  it('accepts a Uint8Array as well as a Buffer', () => {
    expect(countPdfPages(new Uint8Array(Buffer.from(pdf(2))))).toBe(2)
  })
})

describe('countPdfPages — the null rule (unknown, never a guess, never 0)', () => {
  it('returns null for empty or non-PDF input', () => {
    expect(countPdfPages(Buffer.alloc(0))).toBeNull()
    expect(countPdfPages(/** @type {any} */ (null))).toBeNull()
    expect(countPdfPages(Buffer.from('not a pdf at all'))).toBeNull()
  })

  it('returns null when the two readings disagree', () => {
    // The page tree claims 5; only 2 page objects exist. Refusing is the
    // point: reporting either number would be a guess, and a guess here
    // manufactures or hides a defect.
    expect(countPdfPages(Buffer.from(pdf(2, { declared: 5 })))).toBeNull()
  })

  it('returns null when the trailer chain cannot be resolved', () => {
    const noRoot = pdf(2).replace('/Root 3 0 R', '/Info 9 0 R')
    expect(countPdfPages(Buffer.from(noRoot))).toBeNull()

    const noPagesKey = pdf(2).replace('/Pages 1 0 R', '/Outlines 7 0 R')
    expect(countPdfPages(Buffer.from(noPagesKey))).toBeNull()

    const danglingRoot = pdf(2).replace('/Root 3 0 R', '/Root 99 0 R')
    expect(countPdfPages(Buffer.from(danglingRoot))).toBeNull()

    const noCount = pdf(2).replace(/\/Count \d+/, '/Kids [10 0 R 11 0 R]')
    expect(countPdfPages(Buffer.from(noCount))).toBeNull()
  })

  it('returns null rather than 0 when no page objects are present', () => {
    const catalogOnly = `%PDF-1.3\n1 0 obj\n<<\n/Type /Pages\n/Count 0\n>>\nendobj\n3 0 obj\n<<\n/Type /Catalog\n/Pages 1 0 R\n>>\nendobj\ntrailer\n<<\n/Root 3 0 R\n>>`
    expect(countPdfPages(Buffer.from(catalogOnly))).toBeNull()
  })
})

describe('countPdfPages — content is not structure (INV-12)', () => {
  it('ignores PDF tokens inside literal strings', () => {
    // The gate-7 finding, in miniature: an Info value carrying the very tokens
    // the counter reads. Both readings moved together in the first cut, so the
    // cross-check did not catch it.
    const hostile = pdf(2, {
      extra: '20 0 obj\n<<\n/Keywords (/Type /Page, /Count 9)\n>>\nendobj\n'
    })
    expect(countPdfPages(Buffer.from(hostile))).toBe(2)
  })

  it('is not fooled by escaped parens in a string payload', () => {
    // pdfkit escapes ( ) \ on the way in, so a payload cannot close its own
    // string early; this pins that the stripper honours the escape.
    const hostile = pdf(2, {
      extra: '20 0 obj\n<<\n/Keywords (a\\)/Type /Page b\\(c)\n>>\nendobj\n'
    })
    expect(countPdfPages(Buffer.from(hostile))).toBe(2)
  })

  it('ignores tokens inside stream bodies, and unbalanced parens there do not swallow the file', () => {
    // Compressed page content is binary: an unbalanced "(" in it made the
    // first structure-anchored cut read past the trailer and return null for
    // every real PDF. Both halves are pinned here.
    const withStream = pdf(3, {
      extra: `20 0 obj\n<<\n/Length 40\n>>\nstream\n((( /Type /Page /Count 77 \\( binary\nendstream\nendobj\n`
    })
    expect(countPdfPages(Buffer.from(withStream))).toBe(3)
  })

  it('does not mistake /Pages or an escaped /Page#73 for a page leaf', () => {
    const tricky = pdf(2, {
      extra: '30 0 obj\n<<\n/Type /Pages\n/Kids []\n>>\nendobj\n31 0 obj\n<<\n/Type /Page#73\n>>\nendobj\n'
    })
    expect(countPdfPages(Buffer.from(tricky))).toBe(2)
  })

  it('tolerates a stream with no endstream rather than throwing', () => {
    const truncated = `${pdf(1)}\n40 0 obj\n<<\n>>\nstream\nabc`
    expect(() => countPdfPages(Buffer.from(truncated))).not.toThrow()
  })
})
