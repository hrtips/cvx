// The slice contract's two failure directions, unit-tested.
//
// `sliceItems` deliberately does NOT clamp. `Array#slice` silently returns
// fewer elements when `end` runs past the array, so a component whose item list
// is shorter than the engine's would drop the tail of every page with no error
// anywhere — Invariant 0 broken by a mismatch nobody can see. Since the two
// lists read the same `data` (and `contact`, the one assembled list, is
// produced by layout.js for both sides), a short list is a bug, and it says so.
//
// The plan/render mirror test (layout.mirror.test.js) proves the lists agree
// today; this proves what happens the day they stop.

import { describe, expect, it } from 'vitest'
import { sliceItems, sliceTitle } from './sectionSlice.js'

/** @param {number} start @param {number} end @param {number} itemCount */
const slice = (start, end, itemCount = 4) => ({
  key: 'certifications',
  start,
  end,
  continued: start > 0,
  itemCount
})

describe('sliceItems', () => {
  const items = ['a', 'b', 'c', 'd']

  it('returns the whole list when there is no slice (the ATS path and the browser preview)', () => {
    expect(sliceItems(items, undefined)).toEqual(items)
    expect(sliceItems(undefined, undefined)).toEqual([])
  })

  it('returns exactly the planned range', () => {
    expect(sliceItems(items, slice(0, 2))).toEqual(['a', 'b'])
    expect(sliceItems(items, slice(2, 4))).toEqual(['c', 'd'])
    expect(sliceItems(items, slice(1, 2))).toEqual(['b'])
  })

  it('THROWS instead of clamping when the component has fewer items than the plan expected', () => {
    // The silent-clamp failure mode: `['a','b'].slice(0, 4)` is `['a','b']`,
    // so without this guard two planned items would simply never be drawn.
    expect(() => sliceItems(['a', 'b'], slice(0, 4))).toThrow(
      /"certifications" was planned as items \[0, 4\) of 4 but the component has only 2/
    )
    expect(() => sliceItems(undefined, slice(0, 1))).toThrow(/component has only 0/)
  })

  it('does not throw when the plan is within the list, including an exact fit', () => {
    expect(() => sliceItems(items, slice(0, 4))).not.toThrow()
    expect(() => sliceItems(items, slice(3, 4))).not.toThrow()
  })
})

describe('sliceTitle', () => {
  it('marks a continuation and leaves a first slice alone', () => {
    expect(sliceTitle('Certifications', slice(0, 2))).toBe('Certifications')
    expect(sliceTitle('Certifications', slice(2, 4))).toBe('Certifications (cont.)')
  })

  it('leaves an unsliced section alone', () => {
    expect(sliceTitle('Referees', undefined)).toBe('Referees')
  })
})
