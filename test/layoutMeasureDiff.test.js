// C0 — measure-vs-render diff harness (stub for C2).
//
// layout.js's `lineCount` is a char-width estimate (`floor(width /
// (size*charWidthFraction))` chars per line); C2 replaces it with a real
// fontkit measurer. There's no real measurer to compare against yet, so
// this harness renders the corpus through the *actual* react-pdf + pinned
// Lato pipeline and rasterizes it (test/layout-harness/measureDiff.js) to
// get a genuine "how many lines did this actually wrap to" — not a stand-in.
//
// Baseline-locked like the render oracle: this does NOT assert the
// estimator is *accurate* (it currently isn't — see the numbers below and
// research/c0-baseline.md), only that today's measured error hasn't changed
// since it was recorded. When C2 lands the real measurer, swap
// measureDiff.js's `estimatedLineCount()` for it, regenerate baseline.json,
// and the recorded error should collapse toward 0% — that delta *is* C2's
// acceptance evidence.
//
// Guarded with `describe.skipIf(!hasPdftoppm())` where a render+rasterize
// is actually needed — see layoutRenderOracle.test.js's docblock for why
// (CI runs `npm test` on legs with no poppler installed; only one pinned
// leg does, and this suite must SKIP cleanly elsewhere, not error).
import { describe, it, expect, afterAll } from 'vitest'
import { runDiffCorpus, CORPUS } from './layout-harness/measureDiff.js'
import { loadBaseline, diff } from './layout-harness/baseline.js'
import { hasPdftoppm, cleanupFixtureDirs } from './layout-harness/scaffold.js'

const baseline = loadBaseline()

describe('C0 measure-vs-render diff corpus — the corpus itself (no rendering needed, always runs)', () => {
  it('the corpus itself (ids) matches what was recorded — a change here means the corpus changed, not just the numbers', () => {
    expect(CORPUS.map((c) => c.id)).toEqual(baseline.measureDiffCorpus.map((r) => r.id))
  })
})

describe.skipIf(!hasPdftoppm())('C0 measure-vs-render diff corpus — baseline-locked (stub for C2)', () => {
  afterAll(() => cleanupFixtureDirs())

  it('estimated-vs-rendered line counts match the recorded baseline for every corpus row', async () => {
    const rows = await runDiffCorpus()
    const d = diff(rows, baseline.measureDiffCorpus)
    if (d.length > 0) {
      throw new Error(
        'REGRESSION vs baseline.json.measureDiffCorpus (if this is an intentional measurer change — e.g. C2 landing — ' +
        `regenerate with: node test/layout-harness/generateBaseline.js):\n  ${d.join('\n  ')}`
      )
    }
  }, 30000)

  it('documents the known direction and magnitude of today\'s estimator error (informational)', async () => {
    const rows = await runDiffCorpus()
    const latinRows = rows.filter((r) => !r.id.startsWith('non-latin'))
    const nonLatinRows = rows.filter((r) => r.id.startsWith('non-latin'))

    // Design doc's own claim: "today's char-width estimate overshoots ~34%".
    // Every Latin row we sampled overshoots (estimated > rendered); none
    // under-shoots (which would be the more dangerous direction — risking
    // real clipping rather than just a loose safety margin).
    for (const r of latinRows) expect(r.estimated).toBeGreaterThanOrEqual(r.rendered)

    // Non-Latin (Sinhala/Tamil/Devanagari) fallback-font risk (design doc
    // G-a): Lato has no glyphs for these scripts and no fallback (e.g.
    // Noto) is registered today, so the *rendered* line count collapses
    // (far fewer visible ink bands than the estimator predicts) rather than
    // growing — the opposite failure shape from the Latin rows, and a
    // starker one: not just "loose", but measuring the wrong thing entirely.
    for (const r of nonLatinRows) expect(r.estimated).toBeGreaterThan(r.rendered)
  }, 30000)
})
