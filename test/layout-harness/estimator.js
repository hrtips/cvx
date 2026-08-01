// ── Char-width estimator — thin re-export, not a mirror ────────────────────
//
// Was previously a hand-copied duplicate of layout.js's private formulas
// (mirror-drift risk flagged by review). Fixed at the source instead:
// deriveMetrics/lineCount/entryH/summaryH are now genuinely exported from
// src/pdf/layout.js (the only sanctioned src/ change in this pass — purely
// additive, no behavior change; see layout.test.js staying green). This
// file just re-exports them under the same names the rest of the harness
// already imports from './estimator.js', so nothing downstream had to
// change its import path.
//
// This is the seam C2 fills: C2's real src/pdf/measure.js (fontkit-backed)
// will present the same `lineCount(text, size, maxWidth) → integer` shape,
// so measureDiff.js's "estimated" side swaps to the real measurer without
// this file changing, and layout.js's own char-width estimator retires.
// ─────────────────────────────────────────────────────────────────────────

export { deriveMetrics, entryH, lineCount, summaryH } from '../../src/pdf/layout.js'
