// ── Baseline-lock: load/compare/write test/layout-harness/baseline.json ────
//
// The whole point of C0 is to build the ruler *without* fixing the engine
// (that's C1–C3's job). A harness that asserts "no empty column" today would
// ship permanently red — useless as a signal and guaranteed to get ignored.
// Instead: record what the CURRENT engine actually does once (this file +
// generateBaseline.js), check that recording in, and have every vitest run
// assert *only* "today's run still matches the recording". The suite goes
// green when the engine's current (buggy) behaviour is reproduced exactly,
// and red only on a REGRESSION — a NEW failure, or a page-count change that
// wasn't there before. C1/C2/C3 regenerate the file (re-run
// generateBaseline.js) as they land real fixes; the diff of baseline.json
// across those commits *is* the sprint's changelog of what got fixed.
//
// Byte-size/ink-ratio numbers are recorded for human debugging but are NOT
// part of the strictly-compared shape (normalizeVariantFacts strips them) —
// they can jitter a little across poppler versions/machines without that
// being a real regression; page counts and the derived blank/empty-column
// BOOLEAN facts should not (see renderOracle.js's calibration margins).
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASELINE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'baseline.json'
)

export function loadBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
}

export function writeBaseline(data) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(data, null, 2)}\n`)
}

/** The regression-relevant subset of one variant's oracle facts (drops raw byte sizes / ink ratios — see module docblock). */
export function normalizeVariantFacts(v) {
  if (v == null) return v
  return {
    pageCount: v.pageCount,
    blankPages: v.blankPages,
    emptyColumns:
      v.emptyColumns === null ? null : v.emptyColumns.map(({ page, side }) => ({ page, side }))
  }
}

export function normalizeOracleFacts(facts) {
  if (!facts.ok) return { ok: false, code: facts.code }
  return {
    ok: true,
    designed: normalizeVariantFacts(facts.designed),
    ats: normalizeVariantFacts(facts.ats)
  }
}

/** Recursive structural diff, for a readable regression failure message. */
export function diff(actual, expected, pathPrefix = '') {
  const same = JSON.stringify(actual) === JSON.stringify(expected)
  if (same) return []
  const bothPlainObjects =
    actual &&
    expected &&
    typeof actual === 'object' &&
    typeof expected === 'object' &&
    Array.isArray(actual) === Array.isArray(expected)
  if (!bothPlainObjects) {
    return [
      `${pathPrefix || '(root)'}: baseline had ${JSON.stringify(expected)}, now ${JSON.stringify(actual)}`
    ]
  }
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  const diffs = []
  for (const key of keys) {
    diffs.push(...diff(actual[key], expected[key], pathPrefix ? `${pathPrefix}.${key}` : key))
  }
  return diffs
}

/** Throws with a readable message listing every mismatched path if `actual` deep-diffs from `baseline[key]`. */
export function assertMatchesBaseline(baseline, key, actual) {
  if (!(key in baseline)) {
    throw new Error(
      `No baseline entry for "${key}" — run: node test/layout-harness/generateBaseline.js`
    )
  }
  const d = diff(actual, baseline[key])
  if (d.length > 0) {
    throw new Error(
      `REGRESSION vs baseline.json["${key}"] (this means the engine's behaviour changed — ` +
        `if this is an intentional fix, regenerate with: node test/layout-harness/generateBaseline.js):\n  ` +
        d.join('\n  ')
    )
  }
}
