import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { resolveCreationDate, seedMathRandom, setupReproducibility, makeDeflateSynchronous, verifyPatchPoints } from './reproducible.js'

// Same mutable module object the implementation patches (ESM namespace
// imports of builtins are frozen under Vitest).
const zlib = createRequire(import.meta.url)('zlib')

const realRandom = Math.random
const realCreateDeflate = zlib.createDeflate

afterEach(() => {
  Math.random = realRandom
  // Builtin exports are writable:false on Node ≥25 — restore via defineProperty.
  Object.defineProperty(zlib, 'createDeflate', { configurable: true, value: realCreateDeflate })
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
    expect(d.getTime()).toBe(1700000000 * 1000)
  })

  it('accepts epoch zero', () => {
    expect(resolveCreationDate({ SOURCE_DATE_EPOCH: '0' }).getTime()).toBe(0)
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

describe('makeDeflateSynchronous', () => {
  it('emits bytes identical to streaming deflate, synchronously', () => {
    const input = Buffer.from('cvx reproducible '.repeat(200))
    const expected = zlib.deflateSync(input)

    makeDeflateSynchronous()
    const shim = zlib.createDeflate()
    const out = []
    let ended = false
    shim.on('data', c => out.push(c))
    shim.on('end', () => { ended = true })
    shim.write(input.subarray(0, 100))
    shim.end(input.subarray(100))

    expect(ended).toBe(true) // no event-loop turn — write order stays deterministic
    expect(Buffer.concat(out).equals(expected)).toBe(true)
  })
})

describe('verifyPatchPoints', () => {
  // Tripwire: fails when a @react-pdf/pdfkit bump rewrites the internals our
  // reproducibility patches target (Math.random subset tags, createDeflate
  // streams). If this test goes red, byte-identical mode needs re-verifying
  // against the new internals before the dependency update lands.
  it('finds both patch points in the installed pdfkit', () => {
    expect(verifyPatchPoints()).toBe(true)
  })
})

describe('setupReproducibility', () => {
  it('pins nothing when SOURCE_DATE_EPOCH is unset', () => {
    setupReproducibility({})
    expect(Math.random).toBe(realRandom)
    expect(zlib.createDeflate).toBe(realCreateDeflate)
  })

  it('seeds the RNG and swaps deflate when SOURCE_DATE_EPOCH is set', () => {
    const { creationDate } = setupReproducibility({ SOURCE_DATE_EPOCH: '1700000000' })
    expect(creationDate.getTime()).toBe(1700000000 * 1000)
    expect(Math.random).not.toBe(realRandom)
    expect(zlib.createDeflate).not.toBe(realCreateDeflate)
  })
})
