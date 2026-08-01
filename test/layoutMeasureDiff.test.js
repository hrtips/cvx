// C2 — measure-vs-render diff harness, now populated with the real measurer.
//
// layout.js's OLD `lineCount` was a char-width estimate (`floor(width /
// (size*charWidthFraction))` chars per line); C2 (src/pdf/measure.js) added
// a real fontkit measurer. This harness renders the corpus through the
// *actual* react-pdf + pinned Lato pipeline and rasterizes it
// (test/layout-harness/measureDiff.js) to get a genuine "how many lines did
// this actually wrap to", and now compares THREE things per row: the old
// estimate, the new measurement, and that rendered ground truth.
//
// Baseline-locked like the render oracle: this does NOT hard-assert the new
// measurer is *perfectly* accurate in general — it asserts today's recorded
// numbers haven't regressed, plus a small set of hard, structural
// expectations (below) that must hold regardless of the exact numbers.
//
// Guarded with `describe.skipIf(!hasPdftoppm())` where a render+rasterize
// is actually needed — see layoutRenderOracle.test.js's docblock for why
// (CI runs `npm test` on legs with no poppler installed; only one pinned
// leg does, and this suite must SKIP cleanly elsewhere, not error).
import { afterAll, describe, expect, it } from 'vitest'
import { diff, loadBaseline } from './layout-harness/baseline.js'
import { CORPUS, runDiffCorpus } from './layout-harness/measureDiff.js'
import { cleanupFixtureDirs, hasPdftoppm } from './layout-harness/scaffold.js'

const baseline = loadBaseline()

describe('C0/C2 measure-vs-render diff corpus — the corpus itself (no rendering needed, always runs)', () => {
  it('the corpus itself (ids) matches what was recorded — a change here means the corpus changed, not just the numbers', () => {
    expect(CORPUS.map((c) => c.id)).toEqual(baseline.measureDiffCorpus.map((r) => r.id))
  })
})

describe.skipIf(!hasPdftoppm())('C2 measure-vs-render diff corpus — baseline-locked', () => {
  afterAll(() => cleanupFixtureDirs())

  it('estimated/measured/rendered line counts match the recorded baseline for every corpus row', async () => {
    const rows = await runDiffCorpus()
    const d = diff(rows, baseline.measureDiffCorpus)
    // Empty diff = no regression. On failure the array of differences prints
    // directly; if the measurer change is intentional, regenerate the baseline
    // with: node test/layout-harness/generateBaseline.js
    expect(d).toEqual([])
  }, 30000)

  it('HARD: the real measurer (C2) is at least as accurate as the old estimate on every Latin row, and exact on most', async () => {
    const rows = await runDiffCorpus()
    const latinRows = rows.filter((r) => !r.id.startsWith('non-latin'))
    expect(latinRows.length).toBeGreaterThan(0)
    for (const r of latinRows) {
      // |measured error| must never be WORSE than |estimated error| — C2 is
      // a strict accuracy upgrade on text the bundled font can actually
      // render, never a regression on any individual corpus row.
      expect(Math.abs(r.measuredErrorPct)).toBeLessThanOrEqual(Math.abs(r.estimatedErrorPct))
    }
    // On this corpus, real measurement lands exactly on the rendered line
    // count for ordinary Latin text (0% error) — recorded, not just
    // "not worse", because that's the headline result worth protecting.
    for (const r of latinRows) expect(r.measured).toBe(r.rendered)
  }, 30000)

  it("documents the known direction and magnitude of the OLD estimator's error, and that it is now the browser-preview fallback only (informational)", async () => {
    const rows = await runDiffCorpus()
    const latinRows = rows.filter((r) => !r.id.startsWith('non-latin'))

    // Design doc's own claim: "today's char-width estimate overshoots ~34%".
    // Every Latin row we sampled overshoots (estimated > rendered); none
    // under-shoots (which would be the more dangerous direction — risking
    // real clipping rather than just a loose safety margin). Still true
    // post-C2 — this is the FALLBACK formula's behavior, unchanged by
    // design (layout.js keeps it verbatim for the isomorphic browser
    // preview when no measurer is injected).
    for (const r of latinRows) expect(r.estimated).toBeGreaterThanOrEqual(r.rendered)
  }, 30000)

  it("non-Latin: measurement accuracy is UNCHANGED by C2 (expected — see measure.js's detect-and-warn approach, not fixed here)", async () => {
    const rows = await runDiffCorpus()
    const nonLatinRows = rows.filter((r) => r.id.startsWith('non-latin'))
    expect(nonLatinRows.length).toBeGreaterThan(0)

    // Lato has no glyphs for Sinhala/Tamil/Devanagari and C2 deliberately
    // does NOT bundle a fallback font (tarball-size budget — the
    // maintainer's call to make separately); real measurement of text the
    // font can't render is not meaningfully possible, so `measured` neither
    // improves nor regresses here — both still mispredict against the
    // (near-invisible) rendered ground truth. What DID change: measure.js's
    // unsupportedChars()/findUnsupportedGlyphs() now DETECTS this and
    // WARNS (validateContent.js / render.js), turning the old silent
    // failure into a loud, honest one — see src/pdf/measure.test.js and
    // validateContent.test.js's "unsupported-glyph detection" suite.
    for (const r of nonLatinRows) expect(r.measured).toBe(r.estimated)
  }, 30000)
})
