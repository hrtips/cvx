// ── The offline optimality oracle (design-layout-fidelity.md, Review outcome #3) ──
//
// "Could a better packing have existed?" is the question the whole pagination
// post-mortem turned on, and until this file it was answered by argument. Here
// it is answered by enumeration, on the REAL corpus, with REAL measured heights,
// on every run:
//
//   for every fixture in test/layout-harness/fixtures.js's plan, enumerate EVERY
//   legal packing of the main flow — every boundary between entries, plus every
//   legal bullet-level cut inside one — and assert the shipped greedy packer's
//   answer is in the optimal set.
//
// OPTIMAL means, exactly and only, a LEXICOGRAPHIC TUPLE of two integers:
//
//   (1) fewest pages, then
//   (2) fullest first page, in whole hundredths of a point.
//
// There is deliberately NO aggregated score across pages — no Σ slack, no mean
// fill, no waste objective. Sprint C4 measured what those rank highest (a
// pagination that leaves page 1's main column EMPTY, and a certifications
// section fragmented across five pages at fills of 0.15/0.07/0.12/0.07), and
// design risk RV1 forbids publishing one. This file must not smuggle one in
// through the back door of a test: the two components are compared in order,
// never combined, and (2) is only ever consulted to break a tie in (1). A CV's
// first page is the one a reader looks at, which is the only reason a tiebreak
// exists at all.
//
// WHAT THIS ADDS OVER src/pdf/layout.minimality.test.js, which must not be
// duplicated. That file already proves page-count minimality generatively, over
// pseudo-random synthetic flows and over `packSidebar` on measured sidebar
// content. Its two structural gaps are exactly this file's value:
//
//   a. it never runs on the CURATED CORPUS. Its heights are `20 + rnd()*60`,
//      not `entryH()` of a real experience entry with a progression block and a
//      wrapping role, and its budgets are `150 + rnd()*200`, not the real
//      `mainFirstBudget(m, summaryH(...))`. A packer that is minimal on
//      synthetic lumps and wrong on the shape the corpus actually holds passes
//      it. (The main flow's splitter is also not the one it exercises: its
//      "real splitter" tier is `packSidebar`'s.)
//   b. it never checks the TIEBREAK. Page count is a coarse objective — most
//      documents have many packings that share it. Which of those the packer
//      lands on is what a reader sees, and nothing anywhere else asserts it.
//
// EXHAUSTIVE, AND WHY A DP IS STILL EXHAUSTIVE. The number of legal packings is
// exponential in the number of atoms (the sweep reports the running total, and
// it is in the billions), so they are not materialised one by one. They do not need
// to be: a packing is a path through the DAG whose nodes are "the flow resumes
// at entry e, ATOM a, on page kind k" and whose edges are "one legal way to
// fill that page".
//
// AN ATOM, since D7 `prog-split`, is a progression row or a bullet, in document
// order: rows first, then bullets. Before D7 the cut axis was bullets alone and
// this oracle modelled it exactly; after it, an oracle that still enumerated
// bullet cuts searched a STRICTLY SMALLER space than the packer and duly
// reported the packer as beating its own "optimum" (edge-page1-blocked: page-1
// fill 35369 cents against a best-of-oracle 17227). A narrower model does not
// make the packer wrong; it makes the oracle wrong, and an oracle that can be
// beaten is not an oracle. Objective (1) decomposes over that DAG (fewest pages from a
// node is independent of how the node was reached), and objective (2) depends
// only on the FIRST edge — so the optimum over every path is found by evaluating
// every node once and every first-page filling once. `statesExplored` below
// counts the nodes and `edgesExplored` the edges; `packingsCovered` counts the
// paths those nodes stand for, which is the honest size of the search.
//
// LEGALITY, mirrored from the engine rather than invented here (layout.js
// `packBlocks` / `experienceBlock`):
//   * entries keep designer order, and a page holds a contiguous run of them;
//   * the first block on a page charges no gap, every later one charges the
//     entry divider (`dividerHeight + 2*dividerMargin`);
//   * a cut must leave at least one ATOM on BOTH sides (the anti-orphan rule
//     `largestFittingPrefix` enforces as `[1, n-1]`) — which is exactly why
//     cutting inside the promotion table never orphans a bare heading: the head
//     keeps the heading plus at least one row;
//   * a split head is always its page's LAST block — its tail leads the next;
//   * a tail costs the CONTINUATION form (`isContinuation: true`), which is not
//     a suffix of the whole entry: it repeats the role with a "(cont'd)" tag and
//     drops the company/period/location/description, and carries only the
//     progression rows its own slice holds. The two
//     halves of a cut therefore do not sum to the uncut height, which is why
//     every slice is measured rather than read off a prefix table;
//   * an EMPTY page is legal only where `packBlocks` rule 1b emits one — nothing
//     of the leading block fits this page, and a later page would take it. Page 1
//     is the only page whose budget differs, so that can only ever happen there;
//     a continuation page that cannot start the block means no legal packing
//     exists at all (rule 1c territory, where "fewest pages" stops being the
//     question and the fixture is SKIPPED with its reason logged).
//
// Heights and budgets go through the same `quantize()` grain the packer compares
// at (hundredths of a point), so this oracle cannot disagree with it over float
// noise — a disagreement here is a disagreement about packing.

import { describe, expect, it } from 'vitest'
import { deriveMetrics, entryH, packExperiences } from '../src/pdf/layout.js'
import { tealTheme } from '../src/pdf/themes/teal.js'
import { buildContent } from './layout-harness/contentSpecs.js'
import { buildFixturePlan } from './layout-harness/fixtures.js'
import { harnessMeasurer } from './layout-harness/structuralFacts.js'

/**
 * State-space budget for ONE fixture, in nodes + edges. Nothing in the corpus
 * comes close (most fixtures have <= 8 entries and the whole sweep costs a few
 * thousand), so this is a tripwire for a future fixture that would silently turn
 * a 2-second test into a 20-minute one — not a routine escape hatch. A fixture
 * that trips it is REPORTED, with its size, not quietly dropped.
 */
const MAX_STATES = 200_000

/**
 * An UPPER BOUND on the nodes + edges `optimalPacking` would visit for this
 * flow, computed without visiting any of them — which is what makes MAX_STATES a
 * guard rather than a post-mortem. A node is "the flow resumes at entry e,
 * atom a" (one per atom boundary, plus the end), and a page can be filled at
 * most one way per boundary it could stop at, so the product bounds the edges.
 * Atoms are progression rows then bullets (D7), so the bound grew with the cut
 * axis — which is the point: it must bound the space the PACKER can reach.
 *
 * @param {import('../src/pdf/types.js').ExperienceEntry[]} entries
 */
function stateSpaceBound(entries) {
  const boundaries = entries.reduce((n, e) => n + atomsOf(e), 0) + entries.length + 1
  return boundaries + boundaries * boundaries
}

/**
 * How many ATOMS an entry offers the cut axis: its progression rows, then its
 * bullets (D7 `prog-split`). Mirrors `layout.js`'s own `n = nProg + nBullets`.
 *
 * @param {import('../src/pdf/types.js').ExperienceEntry} e
 */
function atomsOf(e) {
  return (e.progression ?? []).length + (e.bullets ?? []).length
}

/**
 * The piece of `e` holding atoms `[from, to)` — rows first, then bullets, and a
 * CONTINUATION whenever it does not start at atom 0.
 *
 * Deliberately a transcription of `layout.js`'s `pieceAt()` plus its tail
 * construction, not a re-derivation: an oracle that computed the slice its own
 * way would be checking the packer against a second opinion about what a piece
 * IS, when the only question it is meant to answer is which sequence of pieces
 * the packer chose.
 *
 * @param {import('../src/pdf/types.js').ExperienceEntry} e
 * @param {number} from
 * @param {number} to
 */
function atomSlice(e, from, to) {
  const nProg = (e.progression ?? []).length
  return {
    ...e,
    ...(from > 0 ? { isContinuation: true } : {}),
    startProg: Math.min(from, nProg),
    endProg: Math.min(to, nProg),
    startBullet: Math.max(0, from - nProg),
    endBullet: Math.max(0, to - nProg)
  }
}

/** Hundredths of a point — layout.js's `quantize()`, re-stated because it is module-private there. */
const q = (/** @type {number} */ n) => Math.round(n * 100) / 100

/** The comparison currency: whole hundredths of a point, as an INTEGER, so a tuple compare is exact. */
const cent = (/** @type {number} */ n) => Math.round(n * 100)

const measure = harnessMeasurer()
const m = deriveMetrics(tealTheme)
/** The entry divider ExperienceSection renders between entries — `calcDividerH()`, which layout.js keeps private. */
const DIVIDER_H = m.dividerHeight + m.dividerMargin * 2

/**
 * Every legal packing of one main flow, reduced to its optimum.
 *
 * @param {import('../src/pdf/types.js').ExperienceEntry[]} entries
 * @param {number} firstBudget  page 1's experience budget (summary already subtracted)
 * @param {number} contBudget   every later page's
 * @returns {{
 *   pages: number | null,
 *   page1UsedCents: number,
 *   optimalFirstFillings: number,
 *   statesExplored: number,
 *   edgesExplored: number,
 *   packingsCovered: number,
 * }}
 *   `pages: null` means NO legal packing exists — some entry's smallest legal
 *   piece is taller than any page (design doc G7's irreducible residual), which
 *   the engine handles by force-placing and recording `overflowPt`. Page count
 *   is not a meaningful question there, so callers skip.
 */
function optimalPacking(entries, firstBudget, contBudget) {
  const atomCount = entries.map(atomsOf)
  let statesExplored = 0
  let edgesExplored = 0

  /** Measured height of entry `i`'s ATOMS `[from, to)`, memoized — every filling below asks for the same slices. @type {Map<string, number>} */
  const heights = new Map()
  const sliceH = (
    /** @type {number} */ i,
    /** @type {number} */ from,
    /** @type {number} */ to
  ) => {
    const key = `${i}:${from}:${to}`
    const hit = heights.get(key)
    if (hit !== undefined) return hit
    // `from > 0` is a CONTINUATION, and its head is a different shape — see the
    // module docblock. This mirrors `experienceBlock()`'s own two constructions
    // and, for the atom ranges, `layout.js`'s `pieceAt()` exactly: rows first,
    // then bullets.
    const h = entryH(atomSlice(entries[i], from, to), m, measure)
    heights.set(key, h)
    return h
  }

  /**
   * Every legal way to fill ONE page of `budget` when the flow resumes at entry
   * `ei`, bullet `bi` — each returned as the position the NEXT page resumes at
   * plus the height this page then holds.
   *
   * `empty` is the rule-1b page: returned only when nothing at all could be
   * placed, so a packing cannot pad itself with blank pages to game the tuple.
   *
   * @returns {{ nextE: number, nextB: number, used: number, empty: boolean }[]}
   */
  const fillings = (
    /** @type {number} */ ei,
    /** @type {number} */ bi,
    /** @type {number} */ budget
  ) => {
    /** @type {{ nextE: number, nextB: number, used: number, empty: boolean }[]} */
    const out = []
    let used = 0
    let placed = 0
    let e = ei
    let b = bi
    while (e < entries.length) {
      const gap = placed === 0 ? 0 : DIVIDER_H
      // Every legal PREFIX of this entry that fits ends the page here (a split
      // head is its page's last block). Prefix height is non-decreasing in `k`,
      // which is what makes the engine's binary search exact and this `break`
      // safe. Offered even when the whole entry would fit: a packing is free to
      // cut early, and an oracle that assumed otherwise would be asserting the
      // greedy rule it is supposed to be checking.
      for (let k = b + 1; k < atomCount[e]; k++) {
        if (q(used + gap + sliceH(e, b, k)) > q(budget)) break
        out.push({ nextE: e, nextB: k, used: used + gap + sliceH(e, b, k), empty: false })
      }
      const whole = sliceH(e, b, atomCount[e])
      if (q(used + gap + whole) > q(budget)) break
      used += gap + whole
      placed++
      e++
      b = 0
      out.push({ nextE: e, nextB: 0, used, empty: false })
    }
    if (out.length === 0) out.push({ nextE: ei, nextB: bi, used: 0, empty: true })
    return out
  }

  /** Fewest pages needed from (ei, bi) onwards, every page a continuation page. @type {Map<string, number|null>} */
  const memo = new Map()
  const minPagesFrom = (/** @type {number} */ ei, /** @type {number} */ bi) => {
    if (ei === entries.length) return 0
    const key = `${ei}:${bi}`
    const hit = memo.get(key)
    if (hit !== undefined) return hit
    statesExplored++
    /** @type {number|null} */
    let best = null
    for (const f of fillings(ei, bi, contBudget)) {
      edgesExplored++
      // A continuation page that can hold nothing would be followed by another
      // identical page that can hold nothing: not a packing, an infinite loop.
      if (f.empty) continue
      const rest = minPagesFrom(f.nextE, f.nextB)
      if (rest === null) continue
      if (best === null || 1 + rest < best) best = 1 + rest
    }
    memo.set(key, best)
    return best
  }

  /** How many legal packings the nodes above stand for — the honest size of the search. @type {Map<string, number>} */
  const pathMemo = new Map()
  const packingsFrom = (/** @type {number} */ ei, /** @type {number} */ bi) => {
    if (ei === entries.length) return 1
    const key = `${ei}:${bi}`
    const hit = pathMemo.get(key)
    if (hit !== undefined) return hit
    let n = 0
    for (const f of fillings(ei, bi, contBudget)) {
      if (f.empty) continue
      n += packingsFrom(f.nextE, f.nextB)
    }
    pathMemo.set(key, n)
    return n
  }

  // Page 1 is the only page whose budget differs, so it is the only one whose
  // fillings are enumerated separately — and the only one an empty page can
  // legally happen on.
  const first = fillings(0, 0, firstBudget)
  statesExplored++
  /** @type {number|null} */
  let pages = null
  let page1UsedCents = -1
  let optimalFirstFillings = 0
  let packingsCovered = 0
  for (const f of first) {
    edgesExplored++
    const rest = minPagesFrom(f.nextE, f.nextB)
    packingsCovered += packingsFrom(f.nextE, f.nextB)
    if (rest === null) continue
    const total = 1 + rest
    // LEXICOGRAPHIC, in this order and never combined: fewer pages always wins;
    // page-1 fullness is consulted only when the page counts tie.
    if (pages === null || total < pages) {
      pages = total
      page1UsedCents = cent(f.used)
      optimalFirstFillings = 1
    } else if (total === pages) {
      optimalFirstFillings++
      if (cent(f.used) > page1UsedCents) page1UsedCents = cent(f.used)
    }
  }
  return {
    pages,
    page1UsedCents,
    optimalFirstFillings,
    statesExplored,
    edgesExplored,
    packingsCovered
  }
}

/**
 * Every fixture's content and the plan the shipped packer produces for it.
 * Built once: `entryH` opens no files but does real glyph-advance word-wrapping,
 * and the sweep below asks for the same numbers twice.
 */
const CORPUS = buildFixturePlan().fixtures.map((spec) => {
  const content = buildContent(spec)
  return {
    id: spec.id,
    // `tealTheme` because every fixture's config.yaml says so (contentSpecs.js
    // `buildConfig`), asserted below rather than assumed — the same choice
    // structuralFacts.js makes for the same reason.
    themeName: content.config.theme,
    experience: content.experience,
    packed: packExperiences(content.experience, content.summary, tealTheme, measure)
  }
})

describe('the greedy main-column packer is optimal on the real corpus', () => {
  it('every fixture plans under the theme this oracle measures with', () => {
    // A fixture that asked for a different theme would be measured here against
    // teal's box model and silently compared to a plan built from another one.
    expect([...new Set(CORPUS.map((row) => row.themeName))]).toEqual(['teal'])
  })

  it('the continuation-page budget is one number for the whole corpus', () => {
    // `mainContBudget()` depends on the theme alone — no content term reaches it
    // — which is what lets a fixture that packs onto ONE page still be
    // enumerated against the same later-page budget as every other. Asserted
    // rather than assumed, because the enumeration below rests on it.
    const budgets = new Set(
      CORPUS.flatMap((row) => row.packed.pageMetrics.slice(1).map((pm) => pm.budget))
    )
    expect(budgets.size).toBe(1)
  })

  it('lands in the optimal set — fewest pages, then fullest page 1 — on every fixture', () => {
    const contBudget = /** @type {number} */ (
      [
        ...new Set(CORPUS.flatMap((row) => row.packed.pageMetrics.slice(1).map((pm) => pm.budget)))
      ][0]
    )

    /** Collected, not thrown one at a time, so a single run reports every fixture that is off. */
    const suboptimal = []
    /** @type {{ id: string, reason: string, detail: string }[]} */
    const skipped = []
    const stats = {
      measured: 0,
      states: 0,
      edges: 0,
      packings: 0,
      splitFixtures: 0,
      /** Fixtures where more than one page-1 filling reaches the optimal page count — i.e. the tiebreak actually decided something. */
      tiebreakFixtures: 0
    }

    for (const { id, experience, packed } of CORPUS) {
      // Sized BEFORE anything is enumerated: a fixture big enough to turn this
      // into a 20-minute test is skipped rather than survived. Nothing in the
      // corpus is close (most fixtures have <= 8 entries), so this is a tripwire
      // for a future one — and it reports the size it refused, so the reader can
      // judge whether the fixture or the bound is wrong.
      const bound = stateSpaceBound(experience)
      if (bound > MAX_STATES) {
        skipped.push({ id, reason: 'state-space', detail: `bound ${bound} > ${MAX_STATES}` })
        continue
      }
      const firstBudget = packed.pageMetrics[0].budget
      const optimal = optimalPacking(experience, firstBudget, contBudget)

      if (optimal.pages === null) {
        // G7's irreducible residual: some entry's smallest legal piece (head +
        // one bullet) is taller than a whole page, so NO legal packing exists
        // and `packBlocks` rule 1c force-places it and records `overflowPt`.
        // "Fewest pages" is not the question there — overflow is, and
        // planLayout.test.js asserts that separately.
        skipped.push({
          id,
          reason: 'no-legal-packing',
          detail: 'an entry piece is taller than a page'
        })
        continue
      }

      stats.measured++
      stats.states += optimal.statesExplored
      stats.edges += optimal.edgesExplored
      stats.packings += optimal.packingsCovered
      if (optimal.optimalFirstFillings > 1) stats.tiebreakFixtures++
      if (packed.continuationChunks.some((chunk) => chunk.some((e) => e.isContinuation)))
        stats.splitFixtures++

      // THE ASSERTION, as one lexicographic tuple of integers. Compared as a
      // whole object so a failure prints which component moved and by how much.
      suboptimal.push({
        id,
        pages: packed.totalPages,
        page1UsedCents: cent(packed.pageMetrics[0].used),
        best: { pages: optimal.pages, page1UsedCents: optimal.page1UsedCents }
      })
    }

    const off = suboptimal.filter(
      (r) => r.pages !== r.best.pages || r.page1UsedCents !== r.best.page1UsedCents
    )
    expect(
      off,
      'the shipped packer is not in the optimal set (fewest pages, then fullest page 1)'
    ).toEqual([])

    // The skip list is part of the result, not a footnote: a sweep that quietly
    // stopped covering the corpus would still be green.
    for (const s of skipped) console.log(`  SKIPPED ${s.id}: ${s.reason} — ${s.detail}`)
    console.log(
      `  optimality oracle: ${stats.measured}/${CORPUS.length} fixtures proved optimal, ${skipped.length} skipped; ` +
        `${stats.states} states + ${stats.edges} edges explored, covering ${stats.packings.toLocaleString('en-US')} legal packings; ` +
        `${stats.splitFixtures} fixture(s) needed an atom-level split, ${stats.tiebreakFixtures} had a page-1 tiebreak to decide.`
    )
    expect(skipped.length, `skip list grew: ${JSON.stringify(skipped)}`).toBeLessThanOrEqual(2)
    // Nothing fell out of the sweep silently: every fixture was either proved or
    // skipped with a reason.
    expect(stats.measured + skipped.length).toBe(CORPUS.length)
    // Not vacuous in the two directions that matter: the corpus really does
    // contain documents the packer has to CUT (where a lazy split would show),
    // and documents where several packings share the optimal page count (where
    // the tiebreak is a decision rather than a formality).
    expect(stats.splitFixtures).toBeGreaterThan(0)
    expect(stats.tiebreakFixtures).toBeGreaterThan(0)
  })

  it('the oracle can disagree: a packer that ends page 1 one entry early is not in the optimal set', () => {
    // Without this, "the packer matches the oracle" proves nothing about the
    // packer. Three entries and a page-1 budget sized to hold exactly the first
    // two: [A B | C] and [A | B C] both take two pages, so the page-count
    // component TIES and only the tiebreak separates them. The oracle must
    // return the fuller page 1 — and must therefore reject a packer answering
    // [A | B C], which is exactly the shape C4's `balance` prototype produced.
    const entry = (/** @type {number} */ i, /** @type {number} */ bullets) => ({
      role: `Role ${i}`,
      company: `Company ${i}`,
      period: `20${10 + i} – 20${11 + i}`,
      bullets: Array.from({ length: bullets }, (_, b) => `Bullet ${b} of role ${i}, short.`)
    })
    const entries = [entry(0, 1), entry(1, 1), entry(2, 1)]
    const [hA, hB, hC] = entries.map((e) => entryH(e, m, measure))
    // Page 1 takes A + divider + B and not one point more; a continuation page
    // takes anything left. Explicit budgets, so the shape is constructed rather
    // than hoped for.
    const firstBudget = q(hA + DIVIDER_H + hB)
    const contBudget = q(hA + hB + hC + 2 * DIVIDER_H)

    const optimal = optimalPacking(entries, firstBudget, contBudget)
    expect(optimal.pages).toBe(2)
    expect(optimal.page1UsedCents).toBe(cent(hA + DIVIDER_H + hB))
    // The lazy answer is legal (its page 2 holds B, the divider and C) and has
    // the SAME page count — and is still rejected, which is the tiebreak doing
    // work no page-count check could do.
    expect(cent(hA)).toBeLessThan(optimal.page1UsedCents)
    expect(q(hB + DIVIDER_H + hC)).toBeLessThanOrEqual(contBudget)
  })

  it('a page count that could be lower is caught, not just a page 1 that could be fuller', () => {
    // The other component of the tuple, on the same construction: one page holds
    // all three entries, so the optimum is 1 and any packer answering 2 or 3 is
    // off by the FIRST component — which dominates, whatever page 1's fill does.
    const entries = Array.from({ length: 3 }, (_, i) => ({
      role: `Role ${i}`,
      company: `Company ${i}`,
      period: '2010 – 2011',
      bullets: ['One short bullet.']
    }))
    const total = entries.reduce((sum, e) => sum + entryH(e, m, measure), 0) + 2 * DIVIDER_H
    const optimal = optimalPacking(entries, q(total), q(total))
    expect(optimal.pages).toBe(1)
    expect(optimal.page1UsedCents).toBe(cent(total))
    expect(optimal.pages).not.toBe(entries.length)
  })
})
