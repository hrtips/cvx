import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  pdfkitIsDeterministic,
  resolveCreationDate,
  seedMathRandom,
  setupReproducibility,
  verifyPdfkitDeterminism
} from './reproducible.js'

const realRandom = Math.random

afterEach(() => {
  Math.random = realRandom
  vi.restoreAllMocks()
})

describe('resolveCreationDate (SOURCE_DATE_EPOCH)', () => {
  it('returns undefined when SOURCE_DATE_EPOCH is unset', () => {
    expect(resolveCreationDate({})).toBeUndefined()
    expect(resolveCreationDate()).toBeUndefined()
  })

  it('returns undefined for an empty value', () => {
    expect(resolveCreationDate({ SOURCE_DATE_EPOCH: '' })).toBeUndefined()
  })

  it('pins the date to the given epoch seconds', () => {
    const d = resolveCreationDate({ SOURCE_DATE_EPOCH: '1700000000' })
    expect(d).toBeInstanceOf(Date)
    expect(/** @type {Date} */ (d).getTime()).toBe(1700000000 * 1000)
  })

  it('accepts epoch zero', () => {
    expect(/** @type {Date} */ (resolveCreationDate({ SOURCE_DATE_EPOCH: '0' })).getTime()).toBe(0)
  })

  it('rejects non-integer or negative values with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveCreationDate({ SOURCE_DATE_EPOCH: 'yesterday' })).toBeUndefined()
    expect(resolveCreationDate({ SOURCE_DATE_EPOCH: '1.5' })).toBeUndefined()
    expect(resolveCreationDate({ SOURCE_DATE_EPOCH: '-60' })).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(3)
    warn.mockRestore()
  })
})

describe('seedMathRandom', () => {
  it('produces an identical sequence for the same seed', () => {
    seedMathRandom(42)
    const first = [Math.random(), Math.random(), Math.random()]
    seedMathRandom(42)
    const second = [Math.random(), Math.random(), Math.random()]
    expect(second).toEqual(first)
  })

  it('stays within [0, 1)', () => {
    seedMathRandom(7)
    for (let i = 0; i < 1000; i++) {
      const v = Math.random()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

// The upstream properties byte-identical mode rests on since @react-pdf/renderer
// 4.9 moved to upstream pdfkit (see the module header, item 3). A tripwire: if
// a pdfkit bump reintroduces async deflate streams or random subset tags, the
// installed-pdfkit test goes red before the dependency update lands.
describe('pdfkitIsDeterministic', () => {
  const GOOD =
    'const tag = [1, 2, 3, 4, 5, 6].map(i => String.fromCharCode((this.id.charCodeAt(i) || 73) + 17))'

  it('accepts synchronous deflate with id-derived subset tags', () => {
    expect(pdfkitIsDeterministic(`${GOOD}; this.buffer = zlib.deflateSync(this.buffer)`)).toBe(true)
  })

  it('rejects async deflate streams (objects race for file position)', () => {
    expect(pdfkitIsDeterministic(`${GOOD}; const d = zlib.createDeflate()`)).toBe(false)
  })

  it('rejects subset tags that are no longer derived from the font id', () => {
    expect(pdfkitIsDeterministic('const tag = randomTag(); zlib.deflateSync(b)')).toBe(false)
  })

  it('rejects any Math.random in pdfkit', () => {
    expect(pdfkitIsDeterministic(`${GOOD}; Math.random() * 26 + 65`)).toBe(false)
  })
})

describe('verifyPdfkitDeterminism', () => {
  it('holds for the pdfkit @react-pdf/renderer actually loads', () => {
    expect(verifyPdfkitDeterminism()).toBe(true)
  })
})

describe('setupReproducibility', () => {
  it('pins nothing when SOURCE_DATE_EPOCH is unset', () => {
    setupReproducibility({})
    expect(Math.random).toBe(realRandom)
  })

  it('pins the date and seeds the RNG when SOURCE_DATE_EPOCH is set', () => {
    const { creationDate } = setupReproducibility({ SOURCE_DATE_EPOCH: '1700000000' })
    expect(/** @type {Date} */ (creationDate).getTime()).toBe(1700000000 * 1000)
    expect(Math.random).not.toBe(realRandom)
  })

  it('warns, and still pins, when the installed pdfkit has lost those properties', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { creationDate } = setupReproducibility(
      { SOURCE_DATE_EPOCH: '1700000000' },
      { verify: () => false }
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('may NOT be byte-identical'))
    expect(creationDate).toBeInstanceOf(Date)
  })

  it('stays quiet when pdfkit cannot be inspected (null is not a failure)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    setupReproducibility({ SOURCE_DATE_EPOCH: '1700000000' }, { verify: () => null })
    expect(warn).not.toHaveBeenCalled()
  })
})
