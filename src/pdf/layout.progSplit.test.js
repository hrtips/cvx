// ── D7 `prog-split`: the promotion table breaks at a row boundary ───────────
//
// The baseline proof for the change. Before it, an entry's page-leading piece
// carried role + meta + location + description + THE WHOLE progression table +
// one bullet, indivisibly — a floor with no upper bound, so a 12-row table made
// the head arbitrarily tall and a role carrying one was far harder to start on
// a part-full page than its bullet count suggested.
//
// The cut axis is now the entry's atoms in document order: its progression rows
// first, then its bullets. `largestFittingPrefix`'s `[1, n-1]` range is
// unchanged and is what keeps this safe — both sides keep at least one atom, so
// a head that cuts inside the table still carries the heading PLUS at least one
// row. That is the property this file pins, because the harness's structural
// `noOrphanHeading` cannot see it: its id model has no progression rows, so a
// head carrying three table rows and no bullets reads to it as "nothing follows
// this heading" (test/layout-harness/invariants.js). The real invariant is
// "every piece carries at least one unit of substantive content", asserted here.
import { describe, expect, it } from 'vitest'
import { planTwoColumn } from './layout.js'

/** A role whose promotion table is long enough that it cannot fit whole beside a full summary. */
const PROMOTED = {
  role: 'Head of People',
  company: 'Geveo Australasia (Pvt) Ltd.',
  period: 'Apr 2015 – May 2024',
  description: 'Geveo specialises in enterprise software solutions and SaaS products.',
  progression: [
    { title: 'Head of People', period: 'Jan 2022 – May 2024' },
    { title: 'Human Resources Manager', period: 'Aug 2020 – Dec 2021' },
    { title: 'Assistant Human Resources Manager', period: 'Jan 2016 – Jul 2020' },
    { title: 'Human Resources Executive', period: 'Apr 2015 – Dec 2015' },
    { title: 'Human Resources Intern', period: 'Jan 2015 – Mar 2015' },
    { title: 'Placement Student', period: 'Jun 2014 – Dec 2014' }
  ],
  bullets: Array.from(
    { length: 5 },
    (_unused, i) =>
      `Bullet ${i}: a long achievement sentence that wraps across more than one line of the main column and consumes real vertical space.`
  )
}

const FILLER = (/** @type {number} */ n) => ({
  role: `Filler Role ${n}`,
  company: `Company ${n}`,
  period: '2020 – 2024',
  bullets: Array.from(
    { length: 5 },
    (_unused, i) =>
      `Bullet ${i} of filler ${n}: a long achievement sentence that wraps and consumes column height.`
  )
})

/** A CV whose page 1 is partly consumed, so the promoted role must start mid-page. */
const content = (/** @type {number} */ summaryBullets) => ({
  personal: { name: 'Split Test' },
  summary: Array.from(
    { length: summaryBullets },
    (_unused, i) =>
      `Summary ${i}: a sentence long enough to wrap across two lines of the main column comfortably.`
  ),
  experience: [FILLER(1), PROMOTED, FILLER(2)],
  competencies: ['a']
})

/** Every placed piece of the main flow, page by page. */
const piecesOf = (/** @type {any} */ plan) =>
  plan.pages.flatMap((/** @type {any} */ p) =>
    (p.mainBlocks ?? []).map((/** @type {any} */ e) => ({ page: p.index, e }))
  )

const progOf = (/** @type {any} */ e) =>
  (e.progression ?? []).slice(e.startProg ?? 0, e.endProg ?? (e.progression ?? []).length)
const bulletsOf = (/** @type {any} */ e) =>
  (e.bullets ?? []).slice(e.startBullet ?? 0, e.endBullet ?? (e.bullets ?? []).length)

describe('D7 prog-split — the promotion table is a splittable atom', () => {
  it('a role with a long promotion table starts on a part-full page, cutting INSIDE the table', () => {
    // summary=7 is the calibrated shape where page 1 has room for the heading
    // and some rows but not all six. Pre-D7 this piece could not exist: the
    // whole table was welded to the head, so the role waited for a page with
    // room for every row AND a bullet.
    const plan = planTwoColumn({ content: content(7) })
    const pieces = piecesOf(plan).filter((/** @type {any} */ p) => p.e.role === PROMOTED.role)
    expect(pieces.length).toBeGreaterThan(1)
    const head = pieces[0]
    expect(head.e.isContinuation).not.toBe(true)
    const rows = progOf(head.e).length
    expect(rows).toBeGreaterThan(0)
    expect(rows).toBeLessThan(PROMOTED.progression.length)
    // ...and the rows it did not take continue on the next piece.
    expect(progOf(pieces[1].e).length).toBe(PROMOTED.progression.length - rows)
  })

  it('the head takes monotonically fewer rows as page 1 fills, then defers rather than orphaning', () => {
    // The property that makes this steerable: it degrades one row at a time
    // down to the legal minimum of one, and when even that will not fit the
    // role moves off the page whole instead of leaving a bare heading behind.
    let previous = Number.POSITIVE_INFINITY
    let sawPartial = false
    let sawDeferral = false
    for (const summaryLen of [5, 6, 7, 8, 9, 10]) {
      const plan = planTwoColumn({ content: content(summaryLen) })
      const pieces = piecesOf(plan).filter((/** @type {any} */ p) => p.e.role === PROMOTED.role)
      const startsOnPage1 = pieces[0]?.page === 0
      if (!startsOnPage1) {
        sawDeferral = true
        continue
      }
      const rows = progOf(pieces[0].e).length
      expect(rows, `summary=${summaryLen}: head grew instead of shrinking`).toBeLessThanOrEqual(
        previous
      )
      expect(rows, `summary=${summaryLen}: a head must keep at least one row`).toBeGreaterThan(0)
      if (rows < PROMOTED.progression.length) sawPartial = true
      previous = rows
    }
    // Non-vacuous: the sweep must actually exercise both ends of the behaviour.
    expect(sawPartial, 'no mid-table cut observed — the sweep proves nothing').toBe(true)
    expect(sawDeferral, 'no deferral observed — the anti-orphan path is untested').toBe(true)
  })

  it('every progression row is placed EXACTLY ONCE, in document order', () => {
    for (const summaryLen of [2, 4, 6, 7, 8, 9]) {
      const plan = planTwoColumn({ content: content(summaryLen) })
      const seen = piecesOf(plan)
        .filter((/** @type {any} */ p) => p.e.role === PROMOTED.role)
        .flatMap((/** @type {any} */ p) => progOf(p.e).map((/** @type {any} */ r) => r.title))
      expect(seen, `summary=${summaryLen}: rows lost or duplicated`).toEqual(
        PROMOTED.progression.map((r) => r.title)
      )
    }
  })

  it('every bullet is placed EXACTLY ONCE, in document order', () => {
    for (const summaryLen of [2, 4, 6, 7, 8, 9]) {
      const plan = planTwoColumn({ content: content(summaryLen) })
      const seen = piecesOf(plan)
        .filter((/** @type {any} */ p) => p.e.role === PROMOTED.role)
        .flatMap((/** @type {any} */ p) => bulletsOf(p.e))
      expect(seen, `summary=${summaryLen}: bullets lost or duplicated`).toEqual(PROMOTED.bullets)
    }
  })

  it('THE SAFETY PROPERTY: no piece is a bare heading — each carries a row or a bullet', () => {
    // This is what the harness's structural noOrphanHeading is trying to say and
    // can no longer express: a progression row IS substantive content under the
    // heading, so a head with rows and no bullets is not an orphan.
    for (const summaryLen of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const plan = planTwoColumn({ content: content(summaryLen) })
      for (const { page, e } of piecesOf(plan)) {
        const units = progOf(e).length + bulletsOf(e).length
        expect(
          units,
          `page ${page}: "${e.role}" placed with no content under its heading`
        ).toBeGreaterThan(0)
      }
    }
  })

  it('a split never strands the table alone — the tail always continues the role', () => {
    const plan = planTwoColumn({ content: content(7) })
    const pieces = piecesOf(plan).filter((/** @type {any} */ p) => p.e.role === PROMOTED.role)
    for (const piece of pieces.slice(1)) expect(piece.e.isContinuation).toBe(true)
    // ...and the pieces are on consecutive pages, in order.
    const pages = pieces.map((/** @type {any} */ p) => p.page)
    expect(pages).toEqual([...pages].sort((a, b) => a - b))
    expect(new Set(pages).size).toBe(pages.length)
  })

  it('an entry with no progression behaves exactly as before (bullets are the only atoms)', () => {
    const plan = planTwoColumn({ content: content(4) })
    for (const { e } of piecesOf(plan).filter((/** @type {any} */ p) =>
      p.e.role.startsWith('Filler')
    )) {
      expect(progOf(e)).toEqual([])
      expect(bulletsOf(e).length).toBeGreaterThan(0)
    }
  })

  it('fills page 1 better than the pre-D7 packer could: no page1-ends-early on this shape', () => {
    // The observable win. With the table indivisible, this CV ended page 1
    // early because the promoted role could not start there.
    const plan = planTwoColumn({ content: content(7) })
    const page1 = plan.pages[0]
    expect(page1.mainBlocks.length).toBeGreaterThan(1)
    expect(page1.mainBlocks.some((/** @type {any} */ e) => e.role === PROMOTED.role)).toBe(true)
  })
})
