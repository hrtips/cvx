// S2 — main-column measure-vs-render diff: what `entryH()` predicts, against
// what react-pdf actually laid out.
//
// The sidebar has had this instrument since C3a (`layoutSidebarMeasureDiff.test.js`)
// and the main column has had nothing: `entryH()` predates both the measurement
// primitives and the harness, composes literals by hand, and is verified by no
// test at all. Five classes of error live in it, worth 46.70pt of phantom height
// on the CV that prompted this work — see research/design-layout-fidelity.md §2.
//
// ── WHY THIS TEST PINS NUMBERS THAT ARE WRONG ─────────────────────────────
//
// The box-model fix (§3.1–3.6) has NOT landed. S2 lands FIRST, on purpose, and
// records TODAY's deltas as its expectations. C0's rule, restated by §4: build
// the ruler before cutting. If the model were corrected first, this table would
// be written against the corrected engine and could not demonstrate that
// anything changed. S3 replaces every number below with a flat 0.01pt
// tolerance, and **the diff of this table across those two commits IS the
// evidence the fix worked**.
//
// So: a non-zero expectation here is a recorded defect, never a target. Each one
// carries the term that explains it. If one of these numbers moves before S3,
// something changed that nobody described — investigate, do not re-record.
//
// Guarded with `describe.skipIf(!hasPdftoppm())` for the same reason as its
// neighbours: only one pinned CI leg installs poppler.

import { beforeAll, describe, expect, it } from 'vitest'
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
  writeFixtureContent
} from './layout-harness/scaffold.js'

/**
 * TODAY's per-entry error, in pt, as `predicted - observed`. Positive means the
 * model reserves MORE room than the render needs (safe, wasteful); negative
 * means it reserves LESS (the direction that overflows a page).
 *
 * Every row is decomposable, which is why it is trustworthy rather than merely
 * recorded — the terms are §2.2/§2.3's:
 *
 *   +4.00  the entry-margin fudge, `entryMb * (15/11)` against a rendered
 *          `marginBottom: entryMb`                                    (§3.1 A)
 *   +2.70  the company/period row: `lh(9, 1.5)` = 13.50 charged for a row the
 *          component leaves unstyled, which renders at 9 x 1.2 = 10.80 (§3.2 B)
 *   +2.40  the location row, same class: 12.00 charged, 9.60 rendered  (§3.2 B)
 *   +1.60  per progression row: 14.20 charged, 12.60 rendered         (§3.2 B)
 *   -13.00 per unmodelled second ROLE line                            (§3.3 C)
 *   -10.80 per unmodelled second COMPANY line                         (§3.3 C)
 *    -9.60 per unmodelled second LOCATION line                        (§3.3 C)
 *    0.00  the description term, which is exact today (its component sets an
 *          explicit lineHeight, so the model's `lh()` is right)
 */
const EXPECTED_ENTRY_DELTA_PT = {
  plain: 6.7, //                    4.00 + 2.70
  filler: 6.7, //                   a plain entry under another name
  description: 6.7, //              4.00 + 2.70 + 0.00 (description exact)
  located: 9.1, //                  4.00 + 2.70 + 2.40
  progression2: 9.9, //             4.00 + 2.70 + 2 x 1.60
  progression4: 13.1, //            4.00 + 2.70 + 4 x 1.60 — the motivating CV's entry
  'wrapping-role': -6.3, //         4.00 + 2.70 - 13.00
  'wrapping-company': -4.1, //      4.00 + 2.70 - 10.80  (its meta row IS the wrap)
  'wrapping-location': -0.5, //     4.00 + 2.70 + 2.40 - 9.60
  'many-bullets-split': 6.7, //     22 bullets, whole: bullets themselves are exact
  continuation: 4 //                the margin term ALONE — a continuation renders
  //                                only a role line and bullets, both exact
}

/**
 * The same defects seen through family 2, which measures the HEAD (role top to
 * first bullet text top) rather than the whole entry. Every row is its
 * `EXPECTED_ENTRY_DELTA_PT` twin minus 4.00: the entry margin sits BELOW the
 * bullets, so a head measurement cannot see it. That relationship is asserted
 * below rather than left as a coincidence — it is what proves the two families
 * are measuring the same document two different ways.
 */
const HEAD_MINUS_ENTRY_PT = -4
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
 * `short` is 0.00 — the summary composition is right when nothing wraps near a
 * boundary. `near-boundary` is +13.50: exactly one body line (9 x 1.5), because
 * `measure.js`'s pure-greedy `lineCount` breaks a line that textkit keeps by
 * shrinking its inter-word glue (§3.5). That 13.50pt comes straight off page 1's
 * experience budget, and it is the single largest term in the 46.70pt total.
 */
const EXPECTED_FIXED_DELTA_PT = { short: 0, 'near-boundary': 13.5 }

/**
 * Tolerance on the EXPECTATION match, not on the measurement. `observed` is
 * derived from PDF coordinates pdftotext prints to 6dp and then rounded to
 * hundredths, so two independent renders of the same shape can differ in the
 * last digit (75.62 vs 75.63 for the described entry). 0.05pt covers that and
 * nothing else — it is 1/270th of a body line. S3 replaces this whole table
 * with a flat 0.01pt tolerance against ZERO.
 */
const EXPECTATION_TOLERANCE_PT = 0.05

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
     * composition is exact when nothing wraps near a boundary, and that it is
     * 13.50pt out when something does (§3.5).
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
        `${label}: ${family} "${row.shape}" (${row.role}) measured ${row.deltaPt}pt (predicted ${row.predicted}, observed ${row.observed}) but S2 recorded ${expected}pt. A moved delta means the engine changed without anyone describing the change — investigate it, do not re-record it.`
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
          `${label}: summaryH + spacer measured ${row.deltaPt}pt against the render, S2 recorded ${expected}pt`
        ).toBeLessThanOrEqual(EXPECTATION_TOLERANCE_PT)
      }
      // Spelled out separately so the glue-shrink finding cannot quietly become
      // a zero: the near-boundary bullet MUST cost a whole rendered body line.
      const near = runs.get('near-boundary-summary').diff.fixedRows[0]
      expect(near.deltaPt).toBeGreaterThan(13)
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
   * Per-entry delta each fixture's shape produces, from the same decomposition
   * as the corpus table:
   *
   *   progression x4    4.00 + 2.70 + 4 x 1.60           = +13.10
   *   short location    4.00 + 2.70 + 2.40               =  +9.10
   *   wrapping heads    4.00 + 2.70 - 13.00 - 10.80      = -17.10
   *   wrapping location 4.00 + 2.70 + 2.40 - 9.60        =  -0.50
   *
   * A continuation slice measures +4.00 (entry) / 0.00 (head) whatever the head
   * shape was — it renders a role line and bullets, and both are exact.
   */
  const EDGE_EXPECTATIONS = {
    'edge-progression-entries': { entry: 13.1, head: 9.1, inkPastBox: 'none' },
    'edge-located-entries': { entry: 9.1, head: 5.1, inkPastBox: 'none' },
    // The only fixture in the whole plan that pushes ink outside the content
    // box, and it does so on every entry: §2.4's wrapping-company defect.
    'edge-wrapping-heads': { entry: -17.1, head: -21.1, inkPastBox: 'periods' },
    'edge-wrapping-location': { entry: -0.5, head: -4.5, inkPastBox: 'none' }
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
          `${id}: entry "${row.role}" measured ${row.deltaPt}pt (predicted ${row.predicted}, observed ${row.observed}), S2 recorded ${want}pt`
        ).toBeLessThanOrEqual(EXPECTATION_TOLERANCE_PT)
      }
      for (const row of diff.headRows) {
        const want = row.isContinuation ? 0 : expected.head
        expect(
          Math.abs(row.deltaPt - want),
          `${id}: head "${row.role}" measured ${row.deltaPt}pt (predicted ${row.predicted}, observed ${row.observed}), S2 recorded ${want}pt`
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
