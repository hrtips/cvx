// ── Generic greedy pairwise covering-array generator ───────────────────────
// No RNG (deterministic tie-breaking by fixed iteration order — required by
// the sprint's byte-reproducibility gate, which C0 extends to fixture
// *generation* too, not just PDF rendering). Not claimed to be minimal —
// it's the standard "seed from an uncovered pair, greedily complete the
// row" construction, good enough to turn a four-digit cartesian explosion
// into a a few dozen rows that still touch every pairwise interaction.
// ─────────────────────────────────────────────────────────────────────────

function pairKey(k1, v1, k2, v2) {
  return k1 < k2 ? `${k1}=${v1}&${k2}=${v2}` : `${k2}=${v2}&${k1}=${v1}`
}

/** Every (factor,level)×(factor,level) combination that pairwise coverage must hit at least once. */
export function allPairs(factors) {
  const keys = Object.keys(factors)
  const pairs = []
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      for (const a of factors[keys[i]]) {
        for (const b of factors[keys[j]]) {
          pairs.push(pairKey(keys[i], a, keys[j], b))
        }
      }
    }
  }
  return pairs
}

/** Cartesian product size — how big the "full combinatorial" set would be. */
export function cartesianSize(factors) {
  return Object.values(factors).reduce((n, levels) => n * levels.length, 1)
}

/**
 * Greedy pairwise cover: while any (factor,level) pair is uncovered, seed a
 * new row from the first remaining uncovered pair, then greedily fill every
 * other factor with whichever level covers the most still-uncovered pairs
 * against what's already fixed in that row.
 *
 * @param {Record<string, string[]>} factors
 * @returns {Record<string,string>[]} rows — each a complete assignment
 */
export function greedyPairwiseCover(factors) {
  const keys = Object.keys(factors)
  const uncovered = new Set(allPairs(factors))
  const rows = []

  while (uncovered.size > 0) {
    const [seed] = uncovered
    const [leftRaw, rightRaw] = seed.split('&')
    const [k1, v1] = leftRaw.split('=')
    const [k2, v2] = rightRaw.split('=')
    const row = { [k1]: v1, [k2]: v2 }

    for (const k of keys) {
      if (k in row) continue
      let bestLevel = factors[k][0]
      let bestScore = -1
      for (const level of factors[k]) {
        let score = 0
        for (const fixedKey of Object.keys(row)) {
          if (uncovered.has(pairKey(k, level, fixedKey, row[fixedKey]))) score++
        }
        if (score > bestScore) {
          bestScore = score
          bestLevel = level
        }
      }
      row[k] = bestLevel
    }

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        uncovered.delete(pairKey(keys[i], row[keys[i]], keys[j], row[keys[j]]))
      }
    }
    rows.push(row)
  }
  return rows
}
