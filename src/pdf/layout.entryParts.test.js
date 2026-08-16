// P2/D4 — `entryParts` publishes the terms `entryH` sums, and must agree with
// it. The two are separate functions on purpose (see entryParts' docblock:
// re-associating the sum moved 240 of 4320 swept shapes by 0.01pt), so this is
// the pin that stops them drifting into disagreement.
import { describe, expect, it } from 'vitest'
import { deriveMetrics, entryH, entryParts } from './layout.js'

const m = deriveMetrics(undefined)
const QUANTUM = 0.01

const BULLETS = [
  'Short one.',
  'A much longer bullet sentence that will certainly wrap across more than a single line of the column, consuming real vertical space.',
  'Mid length bullet here that may wrap once.',
  'Another one.'
]

/** Every structural combination × every legal slice — 4320 shapes. */
function* shapes() {
  for (const role of [
    'R',
    'A very long role title that wraps onto a second line in the main column'
  ])
    for (const company of [undefined, 'Co'])
      for (const period of [undefined, '2020 – 2024'])
        for (const location of [undefined, 'Colombo'])
          for (const description of [
            undefined,
            'A one-line description.',
            'A much longer description that wraps across at least two lines of the main column width easily enough.'
          ])
            for (const progression of [
              undefined,
              [{ title: 'T1', period: 'P1' }],
              [
                { title: 'T1', period: 'P1' },
                { title: 'T2', period: 'P2' },
                { title: 'T3', period: 'P3' },
                { title: 'T4', period: 'P4' }
              ]
            ])
              for (const isContinuation of [false, true])
                for (let s = 0; s <= BULLETS.length; s++)
                  for (let e = s; e <= BULLETS.length; e++)
                    yield {
                      role,
                      company,
                      period,
                      location,
                      description,
                      progression,
                      bullets: BULLETS,
                      startBullet: s,
                      endBullet: e,
                      isContinuation
                    }
}

describe('entryParts — the published breakdown of an entry height', () => {
  it('agrees with entryH within one quantum on every entry shape', () => {
    let checked = 0
    let worst = 0
    for (const e of shapes()) {
      const delta = Math.abs(entryParts(e, m).totalPt - entryH(e, m))
      worst = Math.max(worst, delta)
      checked++
    }
    // Non-vacuous: the sweep must actually be the full cross-product.
    expect(checked).toBe(4320)
    expect(worst).toBeLessThanOrEqual(QUANTUM)
  })

  it('the terms reconstruct the total exactly (no unaccounted height)', () => {
    for (const e of shapes()) {
      const p = entryParts(e, m)
      const listMt = p.bulletsPt.length > 0 ? m.descMt : 0
      const sum =
        p.headPt + listMt + p.bulletsPt.reduce((a, b) => a + b, 0) + p.bulletGapPt + p.entryMbPt
      expect(Math.abs(sum - p.totalPt)).toBeLessThan(1e-9)
    }
  })

  it('headPt is what a page-leading piece must carry, and excludes the bullets', () => {
    const e = {
      role: 'Head of People',
      company: 'Geveo',
      period: 'Apr 2015 – May 2024',
      description: 'Geveo specialises in enterprise software solutions and SaaS products.',
      progression: [
        { title: 'Head of People', period: 'Jan 2022 – May 2024' },
        { title: 'HR Manager', period: 'Aug 2020 – Dec 2021' },
        { title: 'Assistant HR Manager', period: 'Jan 2016 – Jul 2020' },
        { title: 'HR Executive', period: 'Apr 2015 – Dec 2015' }
      ],
      bullets: BULLETS
    }
    const p = entryParts(e, m)
    expect(p.headPt).toBe(p.rolePt + p.metaPt + p.locationPt + p.descriptionPt + p.progressionPt)
    expect(p.bulletsPt).toHaveLength(BULLETS.length)
    // The finding that started this: on an entry with a promotion table, the
    // description + progression dominate the head — which is exactly what the
    // old "the role heading plus one bullet" wording concealed.
    expect(p.descriptionPt + p.progressionPt).toBeGreaterThan(p.rolePt + p.metaPt)
  })

  it('a continuation piece charges no description, meta or location', () => {
    const base = {
      role: 'R',
      company: 'Co',
      period: '2020',
      description: 'D.',
      progression: [{ title: 'T', period: 'P' }],
      bullets: BULLETS
    }
    // D7 changed this: a continuation used to charge no progression either,
    // because it could not carry any. It can now carry the rows its head did
    // not take, so `progressionPt` is a function of the SLICE on both kinds of
    // piece — asserted below rather than pinned to zero here.
    const p = entryParts({ ...base, isContinuation: true, startProg: 1 }, m)
    expect(p.metaPt).toBe(0)
    expect(p.descriptionPt).toBe(0)
    expect(p.locationPt).toBe(0)
    expect(p.progressionPt).toBe(0) // startProg 1 of a 1-row table = no rows left
    expect(p.rolePt).toBeGreaterThan(0)
  })

  it('D7: a continuation carrying progression rows charges for them', () => {
    const base = {
      role: 'R',
      company: 'Co',
      period: '2020',
      progression: [
        { title: 'T1', period: 'P1' },
        { title: 'T2', period: 'P2' },
        { title: 'T3', period: 'P3' }
      ],
      bullets: BULLETS
    }
    const none = entryParts({ ...base, isContinuation: true, startProg: 3 }, m)
    const two = entryParts({ ...base, isContinuation: true, startProg: 1 }, m)
    expect(none.progressionPt).toBe(0)
    expect(two.progressionPt).toBeGreaterThan(0)
    // ...and a head taking a PREFIX charges less than the whole table.
    const whole = entryParts({ ...base, endProg: 3 }, m)
    const prefix = entryParts({ ...base, endProg: 2 }, m)
    expect(prefix.progressionPt).toBeLessThan(whole.progressionPt)
  })
})
