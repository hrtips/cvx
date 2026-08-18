// The genericity guard (INV-8 / ruling R-I): the packing core reads SHAPE,
// never identity.
//
// RV6 re-specified this. §6 used to describe it as "no section-name literals /
// vocabulary imports in core" — a denylist over names — and that guard,
// written as specified, would have passed green over the real violation:
//
//     items += b.itemCount ?? b.entry?.bullets?.length ?? …     // maxPagesFor
//     const key = block?.key ?? block?.entry?.role ?? block?.id // describeBlock
//
// `b.entry.bullets` is structural knowledge of the experience vocabulary with
// the identity spelled nowhere. No denylist of ['summary','experience',…]
// catches it, and neither would one over `.progression`, `.startBullet` or
// `data.competencies`. The reach also went STALE: D7 made progression rows
// legal split atoms and did not move that line, so the page cap was computed
// from a model the splitter no longer used and `packBlocks` could throw its
// own termination error on schema-valid content.
//
// So the contract is POSITIVE and about the block type, not about names: the
// packer may read exactly these properties and no others. A Proxy makes that
// mechanically checkable rather than a matter of review.

import { describe, expect, it } from 'vitest'
import { packBlocks } from './layout.js'

/**
 * Everything `packBlocks` and its helpers are permitted to know about a block.
 *
 * `entry` is deliberately ABSENT: it is the experience vocabulary's payload,
 * carried BY a block for the renderer's benefit, and nothing in the packing
 * core may look inside it.
 */
const ALLOWED = new Set([
  'height',
  'gapBefore',
  'split',
  'itemCount',
  'id',
  // Set by the packer itself on the pieces it produces, then read back.
  'key',
  'start',
  'end'
])

/** Symbols and internals a Proxy sees during ordinary JS operations. */
const isPlumbing = (/** @type {string | symbol} */ prop) =>
  typeof prop === 'symbol' || prop === 'toJSON' || prop === 'constructor' || prop === 'then'

/**
 * A block that records every property the engine reads, and reports anything
 * outside the contract. `entry` is present in the target — a real block
 * carries one — so this fails on ACCESS, not on absence.
 */
/** @returns {any} the Proxy stands in for a block of any shape; typing it would defeat the observation */
function watchedBlock(
  /** @type {Record<string, unknown>} */ shape,
  /** @type {Set<string>} */ seen
) {
  const target = {
    entry: { role: 'Engineer', company: 'Acme', bullets: ['a', 'b'], progression: [] },
    ...shape
  }
  return new Proxy(target, {
    get(t, prop, recv) {
      if (!isPlumbing(prop)) seen.add(String(prop))
      return Reflect.get(t, prop, recv)
    }
  })
}

describe('the packing core knows shapes, never identities (INV-8 / R-I)', () => {
  it('reads only the declared block contract, on the ordinary path', () => {
    /** @type {Set<string>} */
    const seen = new Set()
    const flow = [
      watchedBlock({ height: 100, gapBefore: 0, itemCount: 2 }, seen),
      watchedBlock({ height: 200, gapBefore: 10, itemCount: 3 }, seen)
    ]
    packBlocks(flow, () => 400)
    const forbidden = [...seen].filter((p) => !ALLOWED.has(p))
    expect(
      forbidden,
      `the packer read ${JSON.stringify(forbidden)} off a block — only the declared contract is allowed (R-I)`
    ).toEqual([])
  })

  it('reads only the declared block contract when it has to SPLIT', () => {
    // The split path is where the leak actually was: `maxPagesFor` runs before
    // packing and `describeBlock` runs in the error path, and both reached
    // through `entry`.
    /** @type {Set<string>} */
    const seen = new Set()
    const tall = watchedBlock(
      {
        height: 900,
        gapBefore: 0,
        itemCount: 6,
        id: 'tall',
        split: (/** @type {number} */ room) =>
          room < 100
            ? null
            : {
                head: { height: 100, gapBefore: 0, itemCount: 1, id: 'tall' },
                tail: { height: 300, gapBefore: 0, itemCount: 2, id: 'tall' }
              }
      },
      seen
    )
    packBlocks([tall], () => 400)
    const forbidden = [...seen].filter((p) => !ALLOWED.has(p))
    expect(forbidden, `split path read ${JSON.stringify(forbidden)}`).toEqual([])
  })

  it('reads only the contract for a block that declares NO itemCount', () => {
    // This case is the one that matters, and writing the guard without it made
    // it vacuous: `items += b.itemCount ?? b.entry?.bullets?.length ?? …`
    // short-circuits on `itemCount`, so a fixture that declares one never
    // reaches the leak. The blocks that fell through to `entry.bullets` were
    // exactly the ones WITHOUT it. Verified by restoring the old line and
    // watching this go red.
    /** @type {Set<string>} */
    const seen = new Set()
    const flow = [
      watchedBlock({ height: 120, gapBefore: 0 }, seen),
      watchedBlock(
        {
          height: 500,
          gapBefore: 0,
          split: (/** @type {number} */ room) =>
            room < 80
              ? null
              : { head: { height: 80, gapBefore: 0 }, tail: { height: 200, gapBefore: 0 } }
        },
        seen
      )
    ]
    packBlocks(flow, () => 300)
    const forbidden = [...seen].filter((p) => !ALLOWED.has(p))
    expect(
      forbidden,
      `the packer read ${JSON.stringify(forbidden)} off a block with no itemCount`
    ).toEqual([])
  })

  it('is not vacuous: a packer that reached into `entry` would fail this', () => {
    // Mutation discipline (§6). If the Proxy ever stops observing, every
    // assertion above passes trivially — so prove the observer works by
    // reading the exact property the real defect read.
    /** @type {Set<string>} */
    const seen = new Set()
    const b = watchedBlock({ height: 10, gapBefore: 0, itemCount: 1 }, seen)
    void (/** @type {any} */ (b).entry?.bullets?.length)
    expect([...seen].filter((p) => !ALLOWED.has(p))).toEqual(['entry'])
  })
})
