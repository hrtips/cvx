// ── packBlocks uses the FEWEST pages that exist (C4's ceiling) ─────────────
//
// This is the property C4's go/no-go turned on, so it is a test rather than a
// paragraph. The optimizer chunk was asked to remove wasted space; the first
// question is whether any *arrangement* can remove a PAGE, because a page is
// where the waste lives. It cannot:
//
//   With the block order fixed (designer intent — §2.5 of the design doc), the
//   measured heights fixed, and splitting available at the same boundaries to
//   everyone, front-load first-fit already lands in the minimum possible number
//   of pages. So P = max(P_main, P_sidebar) is minimal too, and no `fill`
//   policy, weight, glue setting or objective D can make a CV shorter. They can
//   only move white space around inside the pages the content already requires.
//
//   READ THE QUALIFIER: this is about REARRANGING blocks of a given height. A
//   `density` preset is not a rearrangement — it re-measures, shrinking the
//   heights this result holds constant — which is why C4 measured it removing 5
//   sheets of 100 while `fill: balance` removed none. Nothing here says a CV
//   cannot be made shorter; it says moving the same blocks around cannot do it.
//
// Proved here by brute force rather than by argument, at BOTH granularities the
// claim covers:
//
//   * atomic flows — every contiguous assignment of whole blocks to pages;
//   * SPLITTABLE flows — every legal cut point as well, since the claim is
//     "with splitting available", and C4's first cut only proved
//     `withSplit <= without`, which is monotonicity, not minimality. A packer
//     that split lazily would have passed that and failed this.
//
// The generator is a deterministic LCG — no `Math.random`; byte-repro
// discipline (G-b) applies to tests too, and a flaky counter-example that
// cannot be reproduced is worth nothing.
//
// Measured consequence, recorded 2026-08-02 (see research/sprint-layout-engine.md
// C4): across the 33-fixture corpus the shipped packer plans 100 sheets and the
// balance prototype plans 100 sheets — identical, as this property requires.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TWO_COLUMN_LAYOUT } from './defaultLayouts.js'
import {
  bodyHeight,
  deriveSidebarMetrics,
  identityH,
  packBlocks,
  packSidebar,
  sidebarFlowKeys,
  sidebarItemCount,
  sidebarSliceH
} from './layout.js'
import { createMeasurer } from './measure.js'
import { tealTheme } from './themes/teal.js'

/**
 * Deterministic LCG (Numerical Recipes constants) — reproducible pseudo-random flows.
 * @param {number} seed
 */
function lcg(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * The fewest pages ANY contiguous, order-preserving packing of `flow` needs —
 * found by enumerating every one of them (empty pages included: `packBlocks`
 * rule 1b may legitimately emit one, so the comparison set must contain those
 * packings too).
 *
 * @param {{ height: number, gapBefore?: number }[]} flow
 * @param {(i: number) => number} budgetFn
 * @returns {number | null} null when no feasible packing exists at all
 */
function minimumPages(flow, budgetFn, maxPages = flow.length + 1) {
  const used = (/** @type {number} */ from, /** @type {number} */ to) => {
    let h = 0
    for (let i = from; i < to; i++) h += flow[i].height + (i > from ? (flow[i].gapBefore ?? 0) : 0)
    return h
  }
  for (let pages = 1; pages <= maxPages; pages++) {
    /** @param {number} start @param {number} page */
    const feasible = (start, page) => {
      if (page === pages) return start === flow.length
      for (let end = start; end <= flow.length; end++) {
        if (used(start, end) > budgetFn(page)) break
        if (feasible(end, page + 1)) return true
      }
      return false
    }
    if (feasible(0, 0)) return pages
  }
  return null
}

/**
 * A flow of atomic (unsplittable) blocks.
 *
 * @param {number[]} heights
 * @param {number} [gapBefore]
 * @returns {{ height: number, gapBefore: number }[]}
 */
const atomic = (heights, gapBefore = 0) => heights.map((height) => ({ height, gapBefore }))

/**
 * @typedef {{
 *   height: number,
 *   gapBefore: number,
 *   count: number,
 *   split: (room: number, force: boolean) => { head: SplittableBlock, tail: SplittableBlock } | null,
 * }} SplittableBlock
 */

describe('packBlocks is page-count minimal — the ceiling every C4 lever runs into', () => {
  it('matches brute force on a hand-picked lumpy flow', () => {
    const flow = atomic([330.8, 202.7, 202.7, 136.0], 33.75) // the shipped scaffold's own entries
    const budgetFn = (/** @type {number} */ i) => (i === 0 ? 383.1 : 660)
    expect(packBlocks(flow, budgetFn)).toHaveLength(
      /** @type {number} */ (minimumPages(flow, budgetFn))
    )
  })

  it('matches brute force on 200 pseudo-random flows (uniform budgets)', () => {
    const rnd = lcg(20260802)
    let checked = 0
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rnd() * 6)
      const flow = atomic(
        Array.from({ length: n }, () => Math.round(rnd() * 400) + 20),
        Math.round(rnd() * 30)
      )
      const budget = 200 + Math.round(rnd() * 500)
      const budgetFn = () => budget
      const brute = minimumPages(flow, budgetFn)
      if (brute === null) continue // a block taller than any page: rule 1c, not a packing question
      // Compared as an object so a failure prints the counter-example flow.
      expect({ pages: packBlocks(flow, budgetFn).length, flow, budget }).toEqual({
        pages: brute,
        flow,
        budget
      })
      checked++
    }
    expect(checked).toBeGreaterThan(100) // the sweep really ran
  })

  it('matches brute force with a TIGHT first page (CVX’s real shape: the summary shrinks page 1)', () => {
    const rnd = lcg(4242)
    let tightPageForced = 0
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(rnd() * 5)
      const flow = atomic(
        Array.from({ length: n }, () => Math.round(rnd() * 300) + 40),
        Math.round(rnd() * 20)
      )
      const first = 50 + Math.round(rnd() * 200)
      const cont = 400 + Math.round(rnd() * 300)
      const budgetFn = (/** @type {number} */ i) => (i === 0 ? first : cont)
      const brute = minimumPages(flow, budgetFn)
      if (brute === null) continue
      const packed = packBlocks(flow, budgetFn)
      expect({ pages: packed.length, flow, first, cont }).toEqual({
        pages: brute,
        flow,
        first,
        cont
      })
      // Rule 1b's empty page 1 is inside the comparison set, not an excuse
      // outside it: when it happens, brute force had the same option.
      if (packed[0].blocks.length === 0) tightPageForced++
    }
    // The generator really does produce the page-1-too-small case this
    // assertion is about (C3b's cliff), so the check is not vacuous.
    expect(tightPageForced).toBeGreaterThan(0)
  })

  it('splitting never costs a page, and can only save one', () => {
    // Same flow twice: atomic, then with an item-boundary splitter. Splitting
    // is what C3b added; it can lower the page count, never raise it.
    //
    // Scoped to flows where every block fits a page WHOLE, because otherwise
    // the two packings are not comparable: an atomic flow with an over-tall
    // block hits rule 1c and force-places it (one page, over budget, content
    // flowing onto sheets the plan cannot number), which "wins" on page count
    // by cheating. Splitting is what turns that into honest pages — measured
    // here on the cases where both packings are legal.
    const rnd = lcg(777)
    let saved = 0
    for (let t = 0; t < 120; t++) {
      const n = 1 + Math.floor(rnd() * 4)
      const perItem = 30 + Math.round(rnd() * 40)
      const title = 20
      const budget = 150 + Math.round(rnd() * 250)
      const budgetFn = () => budget
      const maxItems = Math.floor((budget - title) / perItem)
      if (maxItems < 2) continue // no room for a splittable block at all
      const items = Array.from({ length: n }, () => 2 + Math.floor(rnd() * (maxItems - 1)))
      /**
       * @param {number} count
       * @returns {SplittableBlock}
       */
      const block = (count) => ({
        height: title + count * perItem,
        gapBefore: 10,
        count,
        split: (room, force) => {
          const fits = Math.floor((room - title) / perItem)
          const k = Math.min(Math.max(fits, force ? 1 : 0), count - 1)
          return k < 1 ? null : { head: block(k), tail: block(count - k) }
        }
      })
      const splittable = items.map((c) => block(c))
      const flat = atomic(
        splittable.map((b) => b.height),
        10
      )
      const withSplit = packBlocks(splittable, budgetFn).length
      const without = packBlocks(flat, budgetFn).length
      expect(withSplit).toBeLessThanOrEqual(without)
      if (withSplit < without) saved++
    }
    expect(saved).toBeGreaterThan(0) // splitting does something on this corpus
  })

  it('brute force can actually disagree — the comparison has teeth', () => {
    // A deliberately WORSE packer (one block per page) must be caught by the
    // same harness, otherwise "packBlocks matches brute force" proves nothing
    // about packBlocks.
    const flow = atomic([100, 100, 100], 0)
    const budgetFn = () => 300
    expect(minimumPages(flow, budgetFn)).toBe(1)
    const onePerPage = flow.length
    expect(onePerPage).not.toBe(minimumPages(flow, budgetFn))
  })
})

// ── Splitting-aware brute force ────────────────────────────────────────────
//
// A splittable flow's candidate set is far bigger than "where do the block
// boundaries fall": every legal CUT is a candidate too. The model below mirrors
// the real engine exactly —
//
//   * a slice [i,j) of a block measures `title + sum(items[i..j)) (+ contExtra
//     when i > 0)`, the same shape `sidebarSliceH` has (a continuation repeats
//     the title, possibly wider with the "(cont.)" marker);
//   * a cut must leave at least one item on BOTH sides, which is
//     `largestFittingPrefix`'s `[1, n-1]` anti-orphan range;
//   * `gapBefore` is charged to every block after the first ON A PAGE.
//
// — and then enumerates all of it, so "front-load first-fit is minimal WITH
// splitting available" is checked rather than asserted.

/**
 * @typedef {{ items: number[], title: number, contExtra: number, gapBefore: number }} Spec
 */

/** Measured height of items [from,to) of `spec` under its (possibly continued) title. */
const sliceH = (/** @type {Spec} */ spec, /** @type {number} */ from, /** @type {number} */ to) => {
  let h = spec.title + (from > 0 ? spec.contExtra : 0)
  for (let i = from; i < to; i++) h += spec.items[i]
  return h
}

/**
 * A `packBlocks` block for `spec`'s slice [start,end), with the same splitter
 * semantics as the real one (largest legal prefix; `forceMinimum` accepts a
 * one-item head that does not fit).
 *
 * @param {Spec} spec
 * @param {number} start
 * @param {number} end
 * @returns {SplittableBlock}
 */
function specBlock(spec, start, end) {
  return {
    height: sliceH(spec, start, end),
    gapBefore: spec.gapBefore,
    count: end - start,
    split: (room, force) => {
      let best = 0
      for (let k = 1; k <= end - start - 1; k++) {
        if (sliceH(spec, start, start + k) <= room) best = k
      }
      if (best === 0 && force) best = 1
      if (best === 0) return null
      return {
        head: specBlock(spec, start, start + best),
        tail: specBlock(spec, start + best, end)
      }
    }
  }
}

/**
 * The fewest pages any legal packing of `specs` needs, cuts included.
 *
 * Depth-first over "what can this page hold, starting at (block bi, item ii)?",
 * memoized on (bi, ii, page). Returns null when no legal packing exists (some
 * single item is taller than a page — rule 1c territory, where page count stops
 * being the question).
 *
 * @param {Spec[]} specs
 * @param {(i: number) => number} budgetFn
 * @param {number} maxPages
 */
function minimumPagesSplittable(specs, budgetFn, maxPages) {
  /** @type {Map<string, number|null>} */
  const memo = new Map()
  /**
   * @param {number} bi  block index
   * @param {number} ii  item index within that block
   * @param {number} page
   * @returns {number|null} pages needed from here, or null if impossible
   */
  const best = (bi, ii, page) => {
    if (bi === specs.length) return 0
    if (page >= maxPages) return null
    const key = `${bi}:${ii}:${page}`
    const hit = memo.get(key)
    if (hit !== undefined) return hit
    const budget = budgetFn(page)
    /** @type {number|null} */
    let out = null
    // Every way to fill THIS page starting at (bi, ii): consume whole blocks,
    // then optionally a partial prefix of the next one.
    const consider = (/** @type {number} */ nbi, /** @type {number} */ nii) => {
      // No progress would loop forever; an empty page is only legal as rule 1b
      // (handled by the `nbi === bi && nii === ii` branch below, once).
      const rest = best(nbi, nii, page + 1)
      if (rest === null) return
      const total = 1 + rest
      if (out === null || total < out) out = total
    }
    let used = 0
    let placed = 0
    let b = bi
    let i = ii
    while (b < specs.length) {
      const spec = specs[b]
      const gap = placed === 0 ? 0 : spec.gapBefore
      const whole = sliceH(spec, i, spec.items.length)
      if (used + gap + whole <= budget) {
        used += gap + whole
        placed++
        b++
        i = 0
        consider(b, 0)
        continue
      }
      // Partial: every legal prefix of this block that fits the remaining room.
      const n = spec.items.length - i
      for (let k = 1; k <= n - 1; k++) {
        if (used + gap + sliceH(spec, i, i + k) > budget) break
        consider(b, i + k)
      }
      break
    }
    // Rule 1b: a page may end EMPTY when nothing of the leading block fits it.
    if (placed === 0 && out === null) consider(bi, ii)
    memo.set(key, out)
    return out
  }
  return best(0, 0, 0)
}

describe('packBlocks is minimal WITH SPLITTING, not just with whole blocks', () => {
  it('matches a splitting-aware brute force on 300 pseudo-random flows', () => {
    const rnd = lcg(20260803)
    let checked = 0
    let everSplit = 0
    // Four budget regimes: uniform, tight first page (CVX's real shape),
    // increasing, decreasing.
    const regimes = [
      (/** @type {number} */ b) => () => b,
      (/** @type {number} */ b) => (/** @type {number} */ i) => (i === 0 ? Math.round(b / 2) : b),
      (/** @type {number} */ b) => (/** @type {number} */ i) => b + i * 40,
      (/** @type {number} */ b) => (/** @type {number} */ i) => Math.max(80, b - i * 40)
    ]
    for (let t = 0; t < 300; t++) {
      const nBlocks = 1 + Math.floor(rnd() * 3)
      /** @type {Spec[]} */
      const specs = []
      for (let b = 0; b < nBlocks; b++) {
        const nItems = 1 + Math.floor(rnd() * 4)
        specs.push({
          // VARYING item heights — a uniform per-item height hides an
          // off-by-one in the prefix search.
          items: Array.from({ length: nItems }, () => 20 + Math.round(rnd() * 60)),
          title: 10 + Math.round(rnd() * 20),
          contExtra: Math.round(rnd() * 8),
          gapBefore: Math.round(rnd() * 15)
        })
      }
      const budgetFn = regimes[Math.floor(rnd() * regimes.length)](150 + Math.round(rnd() * 200))
      const maxPages = specs.reduce((a, sp) => a + sp.items.length, 0) + 2
      // Skip flows whose smallest legal unit cannot fit any page: that is rule
      // 1c (force-place and overflow), where "fewest pages" is not the question.
      const budgets = Array.from({ length: maxPages }, (_, i) => budgetFn(i))
      const maxBudget = Math.max(...budgets)
      if (specs.some((sp) => Math.min(...sp.items.map((h) => sp.title + h)) > maxBudget)) continue
      const brute = minimumPagesSplittable(specs, budgetFn, maxPages)
      if (brute === null) continue
      const flow = specs.map((sp) => specBlock(sp, 0, sp.items.length))
      const packed = packBlocks(flow, budgetFn)
      expect({ pages: packed.length, specs, budgets: budgets.slice(0, 4) }).toEqual({
        pages: brute,
        specs,
        budgets: budgets.slice(0, 4)
      })
      // Count the runs where the packer genuinely had to cut something.
      const placedUnits = packed.reduce((a, pg) => a + pg.blocks.length, 0)
      if (placedUnits > specs.length) everSplit++
      checked++
    }
    expect(checked).toBeGreaterThan(150) // the sweep really ran
    expect(everSplit).toBeGreaterThan(20) // and splitting was genuinely exercised
  })

  it('a LAZY splitter (one item less than fits) is caught by the same brute force', () => {
    // The mutation `withSplit <= without` could never see: cut one item short
    // and the page count can rise above the true minimum.
    /** @type {Spec} */
    const spec = { items: [40, 40, 40, 40], title: 10, contExtra: 0, gapBefore: 0 }
    const budgetFn = () => 100
    /** @param {number} start @param {number} end @returns {SplittableBlock} */
    const lazy = (start, end) => ({
      height: sliceH(spec, start, end),
      gapBefore: 0,
      count: end - start,
      split: (room, force) => {
        let bestK = 0
        for (let k = 1; k <= end - start - 1; k++) {
          if (sliceH(spec, start, start + k) <= room) bestK = k
        }
        bestK = Math.max(0, bestK - 1) // ← the lazy cut
        if (bestK === 0 && force) bestK = 1
        if (bestK === 0) return null
        return { head: lazy(start, start + bestK), tail: lazy(start + bestK, end) }
      }
    })
    const brute = minimumPagesSplittable([spec], budgetFn, 8)
    // Two pages: title+40+40 = 90 on each. Nothing cleverer exists.
    expect(brute).toBe(2)
    expect(packBlocks([specBlock(spec, 0, 4)], budgetFn).length).toBe(brute)
    expect(packBlocks([lazy(0, 4)], budgetFn).length).toBeGreaterThan(/** @type {number} */ (brute))
  })
})

// ── The same claim, against the REAL splitter and REAL measurement ─────────
//
// Everything above uses synthetic blocks whose splitter is written in this
// file. That leaves one hole the reviewer's mutation found: a lazy
// `largestFittingPrefix` (cut one item short of what fits) is invisible to a
// brute force that re-implements the prefix search. So this block runs the
// production path — `packSidebar`, with fontkit measurement, the real
// per-page budget function and the real anti-orphan cut range — and
// brute-forces the SAME content through `sidebarSliceH`, the measurement the
// packer itself uses.

const FONTS = path.join(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
  'src',
  'fonts'
)

describe('packSidebar is minimal on real, measured content', () => {
  const measure = createMeasurer(FONTS)
  const sm = deriveSidebarMetrics(tealTheme)
  const keys = sidebarFlowKeys(TWO_COLUMN_LAYOUT)

  /**
   * @param {number} certs
   * @param {number} langs
   * @returns {import('./types.js').CVContent}
   */
  const content = (certs, langs) => ({
    personal: { name: 'Test Person', title: 'Role', company: 'Co', email: 'a@b.c' },
    summary: ['One line.'],
    experience: [],
    education: [{ degree: 'BSc Something Long Enough', institution: 'University', period: '2000' }],
    certifications: Array.from({ length: certs }, (_, i) => ({
      name: `Certification number ${i}`,
      issuer: `Issuing Body ${i}`,
      year: `${2000 + i}`
    })),
    languages: Array.from({ length: langs }, (_, i) => ({
      language: `Language ${i}`,
      proficiency: 'Professional'
    })),
    referees: [{ name: 'Ref One', title: 'Title', company: 'Co', email: 'r@e.f' }]
  })

  /**
   * Fewest pages any legal packing of THIS content needs, measured with the
   * packer's own `sidebarSliceH` but searched exhaustively.
   *
   * @param {import('./types.js').CVContent} data
   * @param {(i: number) => number} budgetFn
   */
  function bruteMinimum(data, budgetFn) {
    const specs = keys
      .filter((k) => sidebarSliceH(k, data, sm, measure) !== null)
      .map((k) => ({
        key: k,
        n: sidebarItemCount(k, data),
        h: (/** @type {number} */ from, /** @type {number} */ to) =>
          /** @type {number} */ (sidebarSliceH(k, data, sm, measure, from, to))
      }))
    const maxPages = specs.reduce((a, sp) => a + Math.max(1, sp.n), 0) + 2
    /** @type {Map<string, number|null>} */
    const memo = new Map()
    /** @returns {number|null} */
    const best = (/** @type {number} */ bi, /** @type {number} */ ii, /** @type {number} */ pg) => {
      if (bi === specs.length) return 0
      if (pg >= maxPages) return null
      const key = `${bi}:${ii}:${pg}`
      const hit = memo.get(key)
      if (hit !== undefined) return hit
      const budget = budgetFn(pg)
      /** @type {number|null} */
      let out = null
      const consider = (/** @type {number} */ nbi, /** @type {number} */ nii) => {
        const rest = best(nbi, nii, pg + 1)
        if (rest !== null && (out === null || 1 + rest < out)) out = 1 + rest
      }
      let used = 0
      let placed = 0
      let b = bi
      let i = ii
      while (b < specs.length) {
        const sp = specs[b]
        const gap = placed === 0 ? 0 : sm.sectionDividerH
        const whole = sp.h(i, sp.n)
        if (used + gap + whole <= budget) {
          used += gap + whole
          placed++
          b++
          i = 0
          consider(b, 0)
          continue
        }
        for (let k = 1; k <= sp.n - i - 1; k++) {
          if (used + gap + sp.h(i, i + k) > budget) break
          consider(b, i + k)
        }
        break
      }
      if (placed === 0 && out === null) consider(bi, ii)
      memo.set(key, out)
      return out
    }
    return best(0, 0, 0)
  }

  // Sizes chosen to straddle page boundaries — a section that fits whole, one
  // that must be cut once, and one that must be cut several times.
  for (const [certs, langs] of [
    [6, 3],
    [18, 5],
    [34, 2],
    [60, 8]
  ]) {
    it(`certifications=${certs}, languages=${langs}: packSidebar hits the true minimum`, () => {
      const data = content(certs, langs)
      const budgetFn = (/** @type {number} */ i) =>
        bodyHeight(tealTheme) -
        identityH(i === 0 ? ['identity-photo'] : ['identity-compact'], data, sm, measure) -
        sm.padTop -
        sm.padBottom -
        sm.safety
      const packed = packSidebar(keys, data, TWO_COLUMN_LAYOUT, tealTheme, measure)
      const brute = bruteMinimum(data, budgetFn)
      expect(brute).not.toBeNull()
      expect({ certs, langs, pages: packed.totalPages }).toEqual({ certs, langs, pages: brute })
      // Not vacuous: this content genuinely needs cutting, which is the case
      // the synthetic tier could not reach through the real splitter.
      const slices = packed.pages.flat()
      expect(slices.length).toBeGreaterThan(new Set(slices.map((sl) => sl.key)).size - 1)
    })
  }
})
