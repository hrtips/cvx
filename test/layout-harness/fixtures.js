// ── The curated C0 fixture set ──────────────────────────────────────────────
//
// The full cartesian the sprint doc specifies —
//   {certifications,publications,languages,referees,achievements: absent|one|many}
//   × {textLength: short|typical|long|overflowing} × {volume: fits-1-page|multi-page}
// — is 3^5 × 4 × 2 = 1,944 combinations. Rendering each through the real CLI
// + pdftoppm (what the oracle needs to see the sidebar/badge bugs at all —
// see renderOracle.js) costs roughly a second apiece; 1,944 of them is a
// non-starter for a suite that has to stay green in CI. So, per the sprint
// brief, this is reduced to a *prioritized* set, and the reduction is logged
// here rather than silently truncated:
//
//   1. Pairwise coverage (pairwise.js's greedyPairwiseCover): every single
//      (factor,level) touches every OTHER (factor,level) in at least one
//      fixture. This is the standard "catches the overwhelming majority of
//      interaction bugs for a fraction of the cost" combinatorial-testing
//      argument — going from all 1,944 combinations to full pairwise
//      coverage over this factor set takes only ~18 rows (computed, not
//      hand-picked — see buildFixturePlan()'s `meta.pairwise`).
//   2. The three specific risk scenarios QA found, hand-authored so they
//      exist regardless of whether the greedy pairwise cover happened to
//      produce something similar: tall-sidebar+short-main, maxed-out,
//      sparse-1-page.
//   3. The named edge cases the sprint calls out explicitly: a single
//      oversized section (~60 items), an all-optional-absent minimal CV,
//      one-entry sections (all five optional sections at once, which
//      pairwise coverage does NOT guarantee — it only promises every PAIR
//      of sections is simultaneously '1', not all five at once), a label-
//      less long URL link, and a non-Latin name. Two more are added beyond
//      the sprint's minimum because they exercise genuinely distinct code
//      paths in layout.js: `explicit-empty-referees` (referees: [] is a
//      different content shape than "file absent", per the referees.yaml
//      schema description) and `forced-split-config` (packExperiences()'s
//      config-driven page1ExperienceCount/page1SplitBullets branch, which
//      today has NO budget check at all — see estimatePage1Overflow's
//      warn-only safety net in validateContent.js — vs the auto branch
//      every pairwise/risk fixture below exercises, which greedily respects
//      its own budget by construction).
//
// The "variant" axis (designed | ats) from the sprint's cartesian is
// deliberately NOT multiplied into the fixture count: every fixture below
// is rendered through BOTH `cvx build` and `cvx build --ats` (scaffold.js's
// `buildAll()` — two separate processes; see that file for why not the
// batched `cvx build --all`), so variant coverage is complete without
// doubling the fixture list.
// ─────────────────────────────────────────────────────────────────────────

import { allPairs, cartesianSize, greedyPairwiseCover } from './pairwise.js'
import { LONG_URL, NON_LATIN_NAMES } from './textPool.js'

export const PAIRWISE_FACTORS = {
  certifications: ['absent', 'one', 'many'],
  publications: ['absent', 'one', 'many'],
  languages: ['absent', 'one', 'many'],
  referees: ['absent', 'one', 'many'],
  achievements: ['absent', 'one', 'many'],
  textLength: ['short', 'typical', 'long', 'overflowing'],
  volume: ['fits-1-page', 'multi-page']
}

function pairwiseRowToSpec(row, i) {
  const { textLength, volume, ...sections } = row
  return {
    id: `pw-${String(i).padStart(2, '0')}`,
    description: `pairwise: ${Object.entries(sections)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')}, textLength=${textLength}, volume=${volume}`,
    sections,
    textLength,
    volume
  }
}

// The three risk scenarios QA specifically flagged. Hand-authored (not
// derived from the pairwise cover) so they are guaranteed present.
function riskScenarioFixtures() {
  return [
    {
      id: 'risk-tall-sidebar-short-main',
      description:
        'tall sidebar (every optional section "many") + short main (short text, fits-1-page volume) — the exact shape that triggers bug (a): sidebar overflows a physical page while the main column has long since run out.',
      sections: {
        certifications: 'many',
        publications: 'many',
        languages: 'many',
        referees: 'many',
        achievements: 'many'
      },
      textLength: 'short',
      volume: 'fits-1-page'
    },
    {
      id: 'risk-maxed-out',
      description:
        'maxed out: every optional section "many", overflowing text, multi-page volume — worst-case content load (akin to the Batman demo).',
      sections: {
        certifications: 'many',
        publications: 'many',
        languages: 'many',
        referees: 'many',
        achievements: 'many'
      },
      textLength: 'overflowing',
      volume: 'multi-page'
    },
    {
      id: 'risk-sparse-1-page',
      description:
        "sparse: every optional section absent, short text, fits-1-page volume — the opposite extreme (near-empty CV; checks resolveFirstSidebar's single-page fold does not misbehave when there is almost nothing to fold).",
      sections: {
        certifications: 'absent',
        publications: 'absent',
        languages: 'absent',
        referees: 'absent',
        achievements: 'absent'
      },
      textLength: 'short',
      volume: 'fits-1-page'
    }
  ]
}

// The sprint's named edge cases, plus two extra (see module docblock).
function namedEdgeCaseFixtures() {
  return [
    {
      id: 'edge-oversized-section',
      description:
        'single oversized section: certifications has ~60 items, everything else at "one" — does an individual sidebar section this large ever clip, or only waste pages? (untested territory per C0\'s own analysis — see research/c0-baseline.md)',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'typical',
      volume: 'fits-1-page',
      oversizedSection: 'certifications',
      oversizedCount: 60
    },
    {
      id: 'edge-minimal',
      description:
        'all-optional-absent minimal CV: only personal + summary + experience (no education, competencies, or any of the five optional sections).',
      minimal: true,
      textLength: 'short',
      volume: 'fits-1-page'
    },
    {
      id: 'edge-one-entry-sections',
      description:
        'one-entry sections: all five optional sections simultaneously at "one" — pairwise coverage guarantees every PAIR of sections is jointly "one", not all five at once, so this is added explicitly.',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'typical',
      volume: 'fits-1-page'
    },
    {
      id: 'edge-labelless-long-url',
      description:
        'a label-less long-URL link in personal.links (renders as the raw href — ContactSection.jsx: `l.label || l.href`) — stresses long-token wrap in a real render path, not just the isolated measure-diff corpus.',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'typical',
      volume: 'fits-1-page',
      extraLink: { href: LONG_URL }
    },
    {
      id: 'edge-non-latin-name',
      description:
        'non-Latin personal.name (Sinhala) — ties to the fallback-font measurement risk (design doc G-a): Lato has no Sinhala glyphs and no fallback (e.g. Noto) is registered today.',
      personalName: NON_LATIN_NAMES.sinhala,
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'typical',
      volume: 'fits-1-page'
    },
    {
      id: 'edge-explicit-empty-referees',
      description:
        'referees: [] (explicit empty list) rather than absent (no file) — schema-documented distinct shape (empty list prints the "available upon request" placeholder in the two-column layout).',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        achievements: 'one'
      },
      explicitEmptySections: ['referees'],
      textLength: 'typical',
      volume: 'fits-1-page'
    },
    {
      id: 'edge-forced-split-config',
      description:
        "config-driven page1ExperienceCount + page1SplitBullets (mirrors the shipped scaffold's own config.yaml) — a distinct packExperiences() branch with no budget check of its own.",
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'typical',
      volume: 'multi-page',
      page1ExperienceCount: 2,
      page1SplitBullets: 2
    }
  ]
}

/**
 * The full curated fixture plan: pairwise rows + risk scenarios + named
 * edge cases, plus a `meta` block accounting for exactly what was generated
 * and what was left out of the raw cartesian (see module docblock — no
 * silent truncation).
 */
export function buildFixturePlan() {
  const pairwiseRows = greedyPairwiseCover(PAIRWISE_FACTORS)
  const pairwiseFixtures = pairwiseRows.map(pairwiseRowToSpec)
  const risks = riskScenarioFixtures()
  const edgeCases = namedEdgeCaseFixtures()
  const fixtures = [...pairwiseFixtures, ...risks, ...edgeCases]

  const ids = fixtures.map((f) => f.id)
  const duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (duplicateIds.length > 0)
    throw new Error(`buildFixturePlan: duplicate fixture ids: ${duplicateIds.join(', ')}`)

  const totalCartesian = cartesianSize(PAIRWISE_FACTORS)
  const totalPairs = allPairs(PAIRWISE_FACTORS).length

  return {
    fixtures,
    meta: {
      pairwise: {
        factors: PAIRWISE_FACTORS,
        totalCartesianCombinations: totalCartesian,
        totalPairsRequired: totalPairs,
        rowsGenerated: pairwiseFixtures.length,
        droppedCombinations: totalCartesian - pairwiseFixtures.length,
        droppedReason:
          'Full cartesian coverage is 1,944 combinations at ~1s/fixture-variant to render+rasterize — not viable for a CI-gated suite. Reduced to a greedy pairwise cover (every (factor,level) pair touches every other pair at least once) — the standard combinatorial-testing argument that pairwise coverage catches the large majority of interaction defects at a small fraction of full-cartesian cost. Computed deterministically (no RNG — see pairwise.js), not hand-picked.'
      },
      riskScenarioCount: risks.length,
      namedEdgeCaseCount: edgeCases.length,
      totalFixtures: fixtures.length,
      variantAxisNote:
        "\"variant: designed|ats\" from the sprint's cartesian is not multiplied into the fixture count — every fixture is rendered through both variants via scaffold.js's buildAll() (two separate CLI processes — see that file's docblock for why not the batched `cvx build --all`), so variant coverage is complete without doubling the fixture list."
    }
  }
}

/** Human-readable one-paragraph-per-topic log of the fixture plan (used by the oracle test's console output and research/c0-baseline.md). */
export function describeFixturePlan(meta) {
  const lines = []
  lines.push(
    `Full cartesian: ${meta.pairwise.totalCartesianCombinations} combinations (${Object.entries(
      meta.pairwise.factors
    )
      .map(([k, v]) => `${k}:${v.length}`)
      .join(' x ')}).`
  )
  lines.push(
    `Pairwise cover: ${meta.pairwise.rowsGenerated} fixtures satisfy all ${meta.pairwise.totalPairsRequired} required pairs (dropped ${meta.pairwise.droppedCombinations} of ${meta.pairwise.totalCartesianCombinations} raw combinations — ${meta.pairwise.droppedReason}).`
  )
  lines.push(
    `Plus ${meta.riskScenarioCount} named risk scenarios (tall-sidebar+short-main, maxed-out, sparse-1-page) and ${meta.namedEdgeCaseCount} named edge cases.`
  )
  lines.push(`Total curated fixtures: ${meta.totalFixtures}. ${meta.variantAxisNote}`)
  return lines.join('\n')
}
