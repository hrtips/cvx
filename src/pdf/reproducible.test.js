import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveCreationDate, seedMathRandom, setupReproducibility } from './reproducible.js'

const realRandom = Math.random

afterEach(() => {
  Math.random = realRandom
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

describe('setupReproducibility', () => {
  it('seeds the RNG only when SOURCE_DATE_EPOCH is set', () => {
    setupReproducibility({})
    expect(Math.random).toBe(realRandom)

    const { creationDate } = setupReproducibility({ SOURCE_DATE_EPOCH: '1700000000' })
    expect(creationDate.getTime()).toBe(1700000000 * 1000)
    expect(Math.random).not.toBe(realRandom)
  })
})
