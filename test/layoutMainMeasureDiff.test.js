// S2 — main-column measure-vs-render diff: what `entryH()` predicts, against
// what react-pdf actually laid out.
//
// The sidebar has had this instrument since C3a (`layoutSidebarMeasureDiff.test.js`)
// and the main column has had nothing: `entryH()` predates both the measurement
// primitives and the harness, composes literals by hand, and is verified by no
// test at all. Five classes of error live in it, worth 46.70pt of phantom height
// on the CV that prompted this work — see research/design-layout-fidelity.md §2.
//
// ── THE TABLE BELOW IS ZEROS, AND THAT IS THE CLAIM ────────────────────────
//
// S2 landed this test one commit before the box-model fix, with TODAY's
// measured defects pinned as its expectations (+6.70 plain, +9.10 located,
// +13.10 at four progression rows, −6.30 wrapping role, +13.50 glue-shrink on
// a near-boundary summary — each decomposed to its term). S3 then corrected
// the model, and this table flipped to zero with the tolerance at 0.01pt.
// The diff between those two commits is the evidence the fix worked: same
// instrument, same shapes, defect table → zero table.
//
// So: any non-zero delta here is a NEW defect. Investigate; never re-record.
// The historical defect table lives in the S2 commit and in
// research/design-layout-fidelity.md §2.2–2.3.
//
// Guarded with `describe.skipIf(!hasPdftoppm())` for the same reason as its
// neighbours: only one pinned CI leg installs poppler.

import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { bulletWidth, deriveMetrics } from '../src/pdf/layout.js'
import { createMeasurer } from '../src/pdf/measure.js'
import { tealTheme } from '../src/pdf/themes/teal.js'
import { buildContent } from './layout-harness/contentSpecs.js'
import { buildFixturePlan } from './layout-harness/fixtures.js'
import {
  runMainDiff,
  SHAPE_ENTRIES,
  SHAPE_KEYS,
  shapeCorpusContent
} from './layout-harness/mainMeasureDiff.js'
import {
  cleanupFixtureDirs,
  hasPdftoppm,
  mkFixtureDir,
  ROOT,
  writeFixtureContent
} from './layout-harness/scaffold.js'

/**
 * Per-entry error, in pt, as `predicted - observed`. Positive means the model
 * reserves MORE room than the render needs (safe, wasteful); negative means it
 * reserves LESS (the direction that overflows a page).
 *
 * All zero since S3 (design-layout-fidelity.md §3.1–3.6): the entry margin is
 * charged as the component renders it, unstyled rows go through `rowH()` at
 * the font's natural line height with real wrap counts, the bullet column
 * mirrors the dash advance, and `lineCount` mirrors textkit's glue shrink.
 * The per-shape structure is kept (rather than one scalar zero) so a future
 * defect lands on the shape that names its term.
 */
const EXPECTED_ENTRY_DELTA_PT = {
  plain: 0, //               §3.1 (margin) + §3.2 (meta row)
  filler: 0, //              a plain entry under another name
  description: 0, //         was exact before S3 and must stay exact
  located: 0, //             §3.2 (location row)
  progression2: 0, //        §3.2 (progression rows)
  progression4: 0, //        §3.2 — the motivating CV's entry shape
  'wrapping-role': 0, //     §3.3 (wrap counted, was -13.00/line)
  'wrapping-company': 0, //  §3.3 (its meta row IS the wrap)
  'wrapping-location': 0, // §3.3
  'many-bullets-split': 0, // bullets were exact; §3.4 keeps them exact
  continuation: 0 //         §3.1 + §3.3's composed "(cont'd)" role line
}

/**
 * The same shapes seen through family 2, which measures the HEAD (role top to
 * first bullet text top) rather than the whole entry. The entry margin sits
 * BELOW the bullets, so a head measurement cannot see it — before S3 that made
 * every head delta `entry delta − 4.00` (the margin fudge); with the margin
 * charged as rendered, the two families agree exactly and the offset is zero.
 * The relationship is still asserted rather than left as a coincidence — it is
 * what proves the two families are measuring the same document two ways.
 */
const HEAD_MINUS_ENTRY_PT = 0
const EXPECTED_HEAD_DELTA_PT = Object.fromEntries(
  Object.entries(EXPECTED_ENTRY_DELTA_PT).map(([k, v]) => [
    k,
    Math.round((v + HEAD_MINUS_ENTRY_PT) * 100) / 100
  ])
)

/**
 * Family 3, `summaryH + spacer` vs the rendered Summary-title -> Experience-title
 * distance, per summary variant.
 *
 * Both zero since S3. `near-boundary` was +13.50 — exactly one body line —
 * because `measure.js`'s pure-greedy `lineCount` broke a line textkit keeps by
 * shrinking its inter-word glue (§3.5); `lineCount` now mirrors the shrink
 * rule (width/3 per space), so a near-boundary bullet is the shape MOST worth
 * keeping: it fails first if either side of that mirror drifts.
 */
const EXPECTED_FIXED_DELTA_PT = { short: 0, 'near-boundary': 0 }

/**
 * 0.01pt, the sidebar harness's bar and justification: pdftotext prints
 * coordinates to 6dp and the box model is exact arithmetic over quarter-points
 * and real glyph advances — nothing here rounds. If this ever needs loosening,
 * the formula is wrong, not the tolerance.
 */
const EXPECTATION_TOLERANCE_PT = 0.01

// ── Assertions that need no poppler, so every CI leg runs them ─────────────
describe('main measure-diff — the shape corpus and the expectation table agree (no poppler needed)', () => {
  it('has an expected delta for every shape the corpus can produce, and no orphans', () => {
    // A shape with no table row would be measured and silently unasserted; a
    // table row with no shape would be an expectation nothing can ever check.
    // `filler` is in the table but not in SHAPE_KEYS by design — it is the tail
    // of throwaway entries that makes the split entry's continuation reachable.
    expect(SHAPE_KEYS.every((k) => k in EXPECTED_ENTRY_DELTA_PT)).toBe(true)
    expect(Object.keys(EXPECTED_ENTRY_DELTA_PT).sort()).toEqual([...SHAPE_KEYS, 'filler'].sort())
    expect(Object.keys(EXPECTED_HEAD_DELTA_PT).sort()).toEqual(
      Object.keys(EXPECTED_ENTRY_DELTA_PT).sort()
    )
  })

  it('isolates one term per entry — nine shapes, nine distinct terms', () => {
    expect(SHAPE_ENTRIES.map((s) => s.shape)).toEqual([
      'plain',
      'description',
      'located',
      'progression2',
      'progression4',
      'wrapping-role',
      'wrapping-company',
      'wrapping-location',
      'many-bullets-split'
    ])
  })

  it('carries the XML entities that make mechanic (b) load-bearing', () => {
    // `pdftotext -bbox` emits `&amp;`/`&apos;` for these. Without decoding, this
    // entry's role never matches the row it rendered on and the coverage floor
    // below fails — which is the point: the mechanic is exercised by the corpus,
    // not merely described in a comment.
    const plain = SHAPE_ENTRIES.find((s) => s.shape === 'plain')
    expect(plain?.role).toContain('&')
    expect(plain?.role).toContain("'")
  })

  it('is deterministic — same corpus in, byte-identical content out', () => {
    // No RNG, no Date: the render-oracle baseline and this table both depend on
    // it, and a fixture that drifts turns a pinned delta into noise.
    expect(JSON.stringify(shapeCorpusContent())).toBe(JSON.stringify(shapeCorpusContent()))
    expect(JSON.stringify(shapeCorpusContent({ order: 'reversed' }))).not.toBe(
      JSON.stringify(shapeCorpusContent())
    )
  })
})

describe.skipIf(!hasPdftoppm())(
  'main measure-diff — predicted vs rendered main-column geometry',
  () => {
    /**
     * Three renders of the same nine shapes.
     *
     * Two ORDERINGS, because family 1 differences consecutive role tops and so
     * structurally cannot reach the last entry on a page — whichever shapes land
     * at a page foot in one ordering are invisible to it. Forward and reversed
     * move the page boundaries, the union covers all nine, and where the two
     * overlap they are independent measurements of the same height that must
     * agree. (Family 2 reaches every entry in every run; that is what it is for.)
     *
     * Two SUMMARIES, because family 3 has two things to say: that the summary
     * composition is exact when nothing wraps near a boundary, and that it
     * STAYS exact on a near-boundary bullet — the shape that measured +13.50
     * before S3 mirrored textkit's glue shrink (§3.5), and the first to fail
     * if either side of that mirror drifts.
     */
    const CORPUS_RUNS = [
      { label: 'forward', opts: { order: 'forward', summary: 'short' } },
      { label: 'reversed', opts: { order: 'reversed', summary: 'short' } },
      { label: 'near-boundary-summary', opts: { order: 'forward', summary: 'near-boundary' } }
    ]

    /** Rendered once, asserted many times — three CLI builds is the expensive part of this file. */
    const runs = new Map()
    beforeAll(() => {
      for (const { label, opts } of CORPUS_RUNS) {
        const content = shapeCorpusContent(opts)
        const dir = mkFixtureDir(`main-diff-${label}`)
        writeFixtureContent(dir, content)
        runs.set(label, { diff: runMainDiff(dir, content), summary: opts.summary })
      }
      cleanupFixtureDirs()
    }, 120000)

    /** A continuation slice measures the same everywhere — role line and bullets, both exact, plus the margin fudge. */
    const CONTINUATION = { entry: EXPECTED_ENTRY_DELTA_PT.continuation, head: 0 }

    function checkRow(label, family, row, expected) {
      expect(
        Math.abs(row.deltaPt - expected),
        `${label}: ${family} "${row.shape}" (${row.role}) measured ${row.deltaPt}pt (predicted ${row.predicted}, observed ${row.observed}) but the table expects ${expected}pt. A moved delta means the engine changed without anyone describing the change — investigate it, do not re-record it.`
      ).toBeLessThanOrEqual(EXPECTATION_TOLERANCE_PT)
    }

    it('coverage: every planned role is on its planned page, in all three runs', () => {
      // Coverage is REPORTED and then ASSERTED. The sidebar harness's lesson,
      // copied verbatim: silently skipping the pages a role could not be found
      // on turns "0.00pt everywhere" into "0.00pt on the pages that already fit".
      for (const [label, { diff }] of runs) {
        console.log(
          `  ${label}: ${diff.entriesMeasured} entry heights ${JSON.stringify(diff.shapesMeasured)}` +
            ` | ${diff.headsMeasured} head heights` +
            ` | skipped ${JSON.stringify(diff.skipped)}` +
            ` | page-tail entries not differenceable by family 1 ${JSON.stringify(
              diff.unmeasuredTail.map((t) => t.role)
            )}`
        )
        // The one skip reason that means "the plan and the render disagree about
        // which page this is on". It must never occur: it is the
        // physical-vs-logical divergence C3b closed, and it would shrink the
        // sample without shrinking the claim.
        const misplaced = diff.skipped.filter((s) => s.reason === 'role-not-on-planned-page')
        expect(
          misplaced,
          `${label}: planned roles were not on their planned page — the render has drifted from the plan: ${JSON.stringify(misplaced)}`
        ).toEqual([])
        expect(diff.physicalPages, `${label}: physical sheets != planned pages`).toBe(
          diff.planPages
        )
        // FLOORS, so this file can never pass by measuring nothing.
        expect(diff.entriesMeasured, `${label}: too few entry heights differenced`).toBeGreaterThan(
          5
        )
        expect(diff.headsMeasured, `${label}: too few head heights differenced`).toBeGreaterThan(9)
      }
    })

    it('coverage: the two orderings between them reach every shape with family 1', () => {
      // The reason there are two orderings at all. If this ever fails, a shape
      // has become a page tail in BOTH orderings and its entry-level delta is
      // going unasserted — add a filler entry or change the ordering, do not
      // drop the shape.
      const union = new Set()
      for (const [, { diff }] of runs) for (const s of diff.shapesMeasured) union.add(s)
      expect([...union].sort()).toEqual(expect.arrayContaining([...SHAPE_KEYS].sort()))
    })

    it('family 1 — every entry height matches its recorded delta', () => {
      let checked = 0
      for (const [label, { diff }] of runs) {
        for (const row of diff.entryRows) {
          const expected = row.isContinuation
            ? CONTINUATION.entry
            : EXPECTED_ENTRY_DELTA_PT[row.shape]
          expect(expected, `${label}: no recorded delta for shape "${row.shape}"`).toBeDefined()
          checkRow(label, 'entry height', row, expected)
          checked++
        }
      }
      console.log(`  family 1: ${checked} entry heights differenced against the render`)
      expect(checked).toBeGreaterThanOrEqual(20)
    })

    it('family 2 — every head height matches its recorded delta, and it is family 1 minus the entry margin', () => {
      let checked = 0
      for (const [label, { diff }] of runs) {
        for (const row of diff.headRows) {
          const expected = row.isContinuation
            ? CONTINUATION.head
            : EXPECTED_HEAD_DELTA_PT[row.shape]
          expect(
            expected,
            `${label}: no recorded head delta for shape "${row.shape}"`
          ).toBeDefined()
          checkRow(label, 'head height', row, expected)
          checked++
        }
      }
      console.log(`  family 2: ${checked} head heights differenced against the render`)
      // Family 2 reaches page-last entries and split heads that family 1 cannot,
      // so it must see strictly more rows than family 1 does.
      for (const [label, { diff }] of runs) {
        expect(
          diff.headsMeasured,
          `${label}: family 2 should reach more entries than family 1`
        ).toBeGreaterThan(diff.entriesMeasured)
      }
      expect(checked).toBeGreaterThanOrEqual(30)
    })

    it('family 3 — summaryH + spacer against the rendered Summary -> Experience distance', () => {
      for (const [label, { diff, summary }] of runs) {
        expect(diff.fixedRows.length, `${label}: family 3 measured nothing`).toBe(1)
        const row = diff.fixedRows[0]
        const expected = EXPECTED_FIXED_DELTA_PT[summary]
        console.log(
          `  ${label} (${summary} summary): predicted ${row.predicted}, observed ${row.observed}, delta ${row.deltaPt}pt`
        )
        expect(
          Math.abs(row.deltaPt - expected),
          `${label}: summaryH + spacer measured ${row.deltaPt}pt against the render, the table expects ${expected}pt`
        ).toBeLessThanOrEqual(EXPECTATION_TOLERANCE_PT)
      }
      // Spelled out separately so the probe cannot quietly stop probing: the
      // near-boundary bullet must sit INSIDE the shrink window — wider than the
      // rendered column (a no-shrink breaker would wrap it) yet within the
      // column plus textkit's 1/3-of-a-space-per-space shrink (the renderer
      // keeps it on one line). If a font change or an edit to the string moves
      // it out of that window, family 3 would go on passing with a probe that
      // no longer exercises §3.5's mirror — this fails instead.
      const m = deriveMetrics(tealTheme)
      const measurer = createMeasurer(path.join(ROOT, 'src', 'fonts'))
      const text = shapeCorpusContent({ summary: 'near-boundary' }).summary[0]
      const natural = measurer.widthOf(text, m.bodySize, { weight: 400, italic: false })
      const spaceW = measurer.widthOf(' ', m.bodySize, { weight: 400, italic: false })
      const spaces = text.split(' ').length - 1
      const column = bulletWidth(m, measurer)
      expect(natural, 'no-shrink greedy must need a second line').toBeGreaterThan(column)
      expect(natural, 'textkit must keep it on one line via shrink').toBeLessThanOrEqual(
        column + (spaces * spaceW) / 3
      )
    })

    it('no main-column ink past the content box, except the one shape that is a known render defect', () => {
      // §2.4, found in passing and reproduced here on purpose: when a company is
      // long enough to wrap, it takes the full container width and the period —
      // its flex sibling in a `justifyContent: space-between` row — is pushed
      // OUT of the padded content box. Measured at 24.19pt into the 33pt right
      // padding on a real CV; 5.59pt here. A longer pair runs off the sheet.
      //
      // This is a RENDER defect and out of scope for S3 (which is model-side),
      // so it is pinned rather than asserted away. Every other row on every
      // page must be inside the box — including the near-boundary summary
      // bullet, whose glue-shrunk line lands EXACTLY on the edge.
      const PERIOD_RE = /^\d{4}–\d{4}$/
      for (const [label, { diff }] of runs) {
        console.log(`  ${label}: ink past the content box ${JSON.stringify(diff.inkPastBox)}`)
        const unexplained = diff.inkPastBox.filter((v) => !PERIOD_RE.test(v.text))
        expect(
          unexplained,
          `${label}: main-column ink outside the content box that is NOT the known wrapping-company period defect: ${JSON.stringify(unexplained)}`
        ).toEqual([])
        expect(
          diff.inkPastBox.length,
          `${label}: expected exactly the wrapping-company entry's period to overflow`
        ).toBe(1)
      }
    })
  }
)

// ── S2a: the four named edge fixtures ──────────────────────────────────────
//
// The shape corpus proves the terms in isolation. These prove the same terms
// through the CURATED corpus — the one `baseline.json` records and the render
// oracle gates on — where every entry carries the shape at once and the packer
// has to paginate around it. Before S2a, `grep -rn progression test/` found
// nothing and no fixture set `location`, so two of `entryH()`'s six head terms
// were unreachable from the fixture plan entirely (§5.2).
describe.skipIf(!hasPdftoppm())('main measure-diff — the S2a head-shape fixtures', () => {
  /**
   * All zero since S3 — the fixtures exist to prove the terms stay exact
   * through the CURATED corpus, not only through the harness's own shapes.
   * Their S2-era deltas (progression +13.10, located +9.10, wrapping heads
   * −17.10, wrapping location −0.50) live in the S2 commit.
   *
   * inkPastBox is UNCHANGED by S3: the wrapping-company period still renders
   * 5.59pt outside the content box on every such entry. That is a render
   * defect (§2.4's family, same as the sidebar contact clipping), not a model
   * defect — it stays pinned here until it is fixed render-side, and anything
   * NEW past the box still fails.
   */
  const EDGE_EXPECTATIONS = {
    'edge-progression-entries': { entry: 0, head: 0, inkPastBox: 'none' },
    'edge-located-entries': { entry: 0, head: 0, inkPastBox: 'none' },
    'edge-wrapping-heads': { entry: 0, head: 0, inkPastBox: 'periods' },
    'edge-wrapping-location': { entry: 0, head: 0, inkPastBox: 'none' }
  }

  for (const [id, expected] of Object.entries(EDGE_EXPECTATIONS)) {
    it(`${id}: every entry and head matches its recorded delta`, () => {
      const spec = buildFixturePlan().fixtures.find((f) => f.id === id)
      expect(spec, `fixture ${id} vanished from the plan`).toBeTruthy()
      const content = buildContent(spec)
      const dir = mkFixtureDir(`main-diff-${id}`)
      writeFixtureContent(dir, content)
      const diff = runMainDiff(dir, content)

      console.log(
        `  ${id}: ${diff.entriesMeasured} entry heights, ${diff.headsMeasured} head heights` +
          ` | skipped ${JSON.stringify(diff.skipped)}` +
          ` | ink past box ${JSON.stringify(diff.inkPastBox)}`
      )
      const misplaced = diff.skipped.filter((s) => s.reason === 'role-not-on-planned-page')
      expect(misplaced, `${id}: roles were not on their planned page`).toEqual([])
      expect(diff.physicalPages).toBe(diff.planPages)
      expect(diff.entriesMeasured, `${id}: nothing differenced`).toBeGreaterThan(1)
      expect(diff.headsMeasured, `${id}: no heads differenced`).toBeGreaterThan(1)

      for (const row of diff.entryRows) {
        const want = row.isContinuation ? EXPECTED_ENTRY_DELTA_PT.continuation : expected.entry
        expect(
          Math.abs(row.deltaPt - want),
          `${id}: entry "${row.role}" measured ${row.deltaPt}pt (predicted ${row.predicted}, observed ${row.observed}), the table expects ${want}pt`
        ).toBeLessThanOrEqual(EXPECTATION_TOLERANCE_PT)
      }
      for (const row of diff.headRows) {
        const want = row.isContinuation ? 0 : expected.head
        expect(
          Math.abs(row.deltaPt - want),
          `${id}: head "${row.role}" measured ${row.deltaPt}pt (predicted ${row.predicted}, observed ${row.observed}), the table expects ${want}pt`
        ).toBeLessThanOrEqual(EXPECTATION_TOLERANCE_PT)
      }

      // The wrapped-company fixture is the only one in the plan that puts ink
      // outside the content box, and only ever the period (§2.4) — pinned, not
      // asserted away: it is a RENDER defect, model-side S3 does not touch it,
      // and no test could see it before this one. Classified rather than
      // branched on, so the assertion is the same shape for all four fixtures.
      const kinds = diff.inkPastBox.map((v) =>
        /^\d{4}–\d{4}$/.test(v.text) ? 'wrapped-company-period' : v.text
      )
      expect(
        [...new Set(kinds)],
        `${id}: main-column ink outside the content box: ${JSON.stringify(diff.inkPastBox)}`
      ).toEqual(expected.inkPastBox === 'periods' ? ['wrapped-company-period'] : [])
      cleanupFixtureDirs()
    }, 60000)
  }
})
