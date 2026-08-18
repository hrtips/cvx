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
        'sparse: every optional section absent, short text, fits-1-page volume — the opposite extreme (near-empty CV; checks the sidebar packer does not misbehave when there is almost nothing to pack).',
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
        'single oversized section: certifications has ~60 items, everything else at "one" — does an individual sidebar section this large ever clip, or only waste pages? (untested territory per C0\'s own analysis — see research/archive/c0-baseline.md)',
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
      id: 'edge-linked-bullet',
      description:
        "RV4: an experience bullet in the documented `{ text, link, suffix }` object form, sized so the concatenated string wraps. BulletList.jsx draws the three parts as one run; every height formula measured `text` alone, a 27pt under-measure against a 15pt safety margin. No fixture reached the shape before this one, and the render-diff harness's own helper stripped the same two fields — so INV-2's zeros were a fact about the corpus, not the code.",
      sections: { certifications: 'one', languages: 'one', achievements: 'one' },
      textLength: 'typical',
      volume: 'fits-1-page',
      linkedBullet: true
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
    // ── The four shapes C3b's review found the corpus could not express ──────
    //
    // Every curated fixture above measured summaryH === 422.4pt and
    // identityH === 67.95pt, so two of the packer's most consequential terms
    // were effectively constants. The page-1 cliff sits at ~452pt of summary
    // (below which the smallest legal piece of an experience entry, 177.75pt,
    // still fits the residual) and turns NEGATIVE past ~630pt. The corpus
    // stopped 29.6pt short of the first threshold, uniformly — which is why a
    // scaffold with eleven summary bullets produced a 4-sheet PDF whose sheet 2
    // held nothing but the string "1 of 3", silently, while the suite was green.
    {
      id: 'edge-summary-crosses-cliff',
      description:
        'summary long enough that page 1 has less residual room than the smallest legal piece of an experience entry (head + 1 bullet). Exercises packBlocks rule 1b: the page must end early, entry-free, rather than force-place and overflow onto an unnumbered sheet.',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'typical',
      volume: 'multi-page',
      summaryBullets: 11
    },
    {
      id: 'edge-summary-exceeds-page',
      description:
        "summary taller than the whole main column, so page 1's experience budget is NEGATIVE. Irreducible: the summary is fixed page-1 content, not a packed block, so no pagination fits it — the engine must report it in overflowPt and warn, not paper over it.",
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'typical',
      volume: 'multi-page',
      summaryBullets: 26
    },
    {
      id: 'edge-tall-identity',
      description:
        "a long personal.title/company makes the injected identity block several hundred pt tall, shrinking every page's sidebar budget. The identity is never packed, so its height is pure subtraction — and the curated corpus held it at a constant 67.95pt.",
      sections: {
        certifications: 'many',
        publications: 'many',
        languages: 'many',
        referees: 'many',
        achievements: 'many'
      },
      textLength: 'typical',
      volume: 'fits-1-page',
      tallIdentity: true
    },
    {
      id: 'edge-page-tall-item',
      description:
        "design doc G7's irreducible residual, on both flows at once: one experience bullet and one certification each taller than a whole page. Nothing can be split small enough, so packBlocks must force-place, record overflowPt, and the build must warn — the one remaining case where physical sheets legitimately exceed the plan.",
      sections: { publications: 'one', languages: 'one', referees: 'one', achievements: 'one' },
      textLength: 'typical',
      volume: 'fits-1-page',
      pageTallBullet: true,
      oversizedSection: 'certifications',
      oversizedItemPageTall: true
    },
    // ── S2a: the four head shapes the corpus could not express ──────────────
    //
    // `grep -rn progression test/` found nothing and no fixture set `location`,
    // so two of `entryH()`'s six head terms — and every wrapped-head shape —
    // were unreachable from the curated corpus
    // (research/archive/design-layout-fidelity.md §5.2). These four are ADDITIVE: they
    // introduce no pairwise factor and touch no existing spec, so `baseline.json`
    // gains four keys and no existing row moves.
    //
    // S2b (the three new PAIRWISE factors — location, progression, headLength)
    // is DEFERRED, and deliberately: adding a factor changes every pairwise
    // fixture's content, so every baseline row would be rewritten, and that
    // regeneration has to be its own commit or S3's baseline diff stops being
    // interpretable (§5.2). S2a plus the main-column harness's own shape corpus
    // (mainMeasureDiff.js) already reach every term S3 corrects. The deferral is
    // also recorded in `buildFixturePlan()`'s `meta.deferred`, where a reader
    // counting axes will look for it.
    //
    // `textLength: 'short'` throughout: the axis under test is the HEAD, and
    // short single-line bullets keep each entry's measured height attributable
    // to its head rows rather than to a bullet that wrapped one way in the model
    // and another in the render.
    {
      id: 'edge-progression-entries',
      description:
        "every experience entry carries a 4-step progression block — the shape `entryH()` mis-measures worst (+1.60pt per row on top of the +6.70pt base, i.e. the motivating CV's +13.10pt entry), and the one no fixture could express before: `progression` appeared nowhere in test/.",
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'short',
      volume: 'multi-page',
      entryProgression: 4
    },
    {
      id: 'edge-located-entries',
      description:
        'every experience entry carries a short single-line `location` — the +2.40pt location term (§3.2). No fixture set `location` at all before this one, so the row was modelled and never rendered under test.',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'short',
      volume: 'multi-page',
      entryLocation: 'short'
    },
    {
      id: 'edge-wrapping-heads',
      description:
        'a role AND a company that each wrap to two rendered lines on every entry — both currently UNDER-measured (§3.3: the model charges one role line and one meta row regardless), so this fixture is on the unsafe side of the mirror, where an error overflows a page rather than wasting space.',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'short',
      volume: 'multi-page',
      wrappingRole: true,
      wrappingCompany: true
    },
    {
      id: 'edge-wrapping-location',
      description:
        'a `location` long enough to wrap to two rendered lines on every entry — the third under-measuring head shape (§3.3), and the one whose net entry delta is nearly zero today (+2.40 phantom location minus 9.60 unmodelled second line) purely by coincidence.',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'short',
      volume: 'multi-page',
      entryLocation: 'wrapping'
    },
    // ── S5: the F3 regression fixture (design-layout-fidelity.md §5.5) ──────
    //
    // The post-mortem's F3 shape, synthesized: page 1 ends with room to spare
    // because the NEXT entry's smallest legal piece (its head plus one bullet)
    // does not fit what is left. That is the stall §3.8's `blockedBy` and the
    // `page1-ends-early` warning exist to name, and until this fixture the
    // corpus could only express its DEGENERATE case (`edge-summary-crosses-
    // cliff`, where page 1 gets no entry at all and the warning is
    // `page1-no-experience`). The two are mutually exclusive by construction,
    // so both shapes need their own fixture or one of the two code paths is
    // never executed on real content.
    //
    // The numbers are chosen, not stumbled into (all measured with the real
    // fontkit measurer — test/layoutOptimality.test.js re-derives them, and
    // test/planLayout.test.js asserts the arithmetic identity):
    //   summary       5 'long' bullets  -> summaryH 273.90pt (§5.5 asks for
    //                                      270-290: big enough to squeeze page
    //                                      1's budget to 356.09pt, small enough
    //                                      that an entry still fits under it)
    //   entry 0       2 bullets         -> 172.27pt, ~48% of page 1's budget
    //                                      ("roughly half", so the page is
    //                                      visibly not full when it ends)
    //   entry 1       4 progression     -> smallest legal piece 191.18pt vs
    //                 steps                150.07pt left after the 33.75pt
    //                                      entry divider: short by 41.11pt
    //   entries 2-3   default            -> enough content for the flow to keep
    //                                      going, so page 1 ending early is a
    //                                      DECISION and not simply the last page
    //
    // Deliberately NOT asserted anywhere: the page count. 3 pages is the
    // correct output for this content, so pinning it would pin a content fact
    // that any legitimate future fidelity improvement may move — and it would
    // have passed on the pre-S3 engine too, i.e. it is exactly the assertion
    // that would not have caught the defect (§5.5).
    {
      id: 'edge-page1-blocked',
      description:
        'page 1 ends EARLY with one entry on it: the second entry carries a 4-step progression, and its smallest legal piece (head + 1 ATOM — one progression row — 109.87pt) is taller than the 74.32pt left, of which the 33.75pt entry divider eats half. Short by 69.30pt. The F3 shape from the post-mortem, and the only fixture that reaches the `page1-ends-early` warning — `edge-summary-crosses-cliff` reaches its degenerate twin (`page1-no-experience`, zero entries on page 1) instead. RE-CALIBRATED at D7 `prog-split`: the smallest piece used to be head + the WHOLE 4-row table + 1 bullet (191.18pt against 150.07pt), and once the table became splittable the entry fit on page 1 and this fixture stopped demonstrating anything. The summary carries two more bullets to restore the block — the fixture tests the packer declining, not any particular arithmetic, and the arithmetic had to move when the cut axis did.',
      sections: {
        certifications: 'one',
        publications: 'one',
        languages: 'one',
        referees: 'one',
        achievements: 'one'
      },
      textLength: 'long',
      volume: 'multi-page',
      experienceCount: 4,
      summaryBullets: 7,
      entryShapes: [{ bullets: 2 }, { progression: 4 }]
    },
    {
      id: 'edge-forced-split-config',
      description:
        'LEGACY config keys page1ExperienceCount + page1SplitBullets present in config.yaml — REMOVED (maintainer ruling, design-layout-fidelity.md Review outcome #1), so the engine must IGNORE them and paginate automatically: this fixture proves a legacy workspace builds, plans and renders identically to one without the keys. (It exercised the config-forced packExperiences() branch until that branch was deleted.)',
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
      /**
       * Axes that are deliberately NOT on the pairwise sweep, recorded here
       * rather than left silently absent (design-layout-fidelity.md §5.2's
       * instruction, verbatim: "if it is deferred, say so in the fixture plan's
       * meta rather than leaving the axes silently absent").
       */
      deferred: {
        pairwiseFactors: {
          location: ['absent', 'short', 'wrapping'],
          progression: ['absent', 'one', 'four'],
          headLength: ['short', 'wrapping']
        },
        slice: 'S2b',
        reason:
          "Adding these three factors grows the greedy cover from 18 rows to 19 (188 required pairs -> 377) — but it also changes EVERY pairwise fixture's content, so every baseline.json row is rewritten. That regeneration must be its own commit with no engine change in it, or S3's baseline diff becomes uninterpretable. S2a's four named edge fixtures (edge-progression-entries, edge-located-entries, edge-wrapping-heads, edge-wrapping-location) plus the main-column render diff's own shape corpus (test/layout-harness/mainMeasureDiff.js) already reach every term S3 corrects, so S2b blocks nothing."
      },
      variantAxisNote:
        "\"variant: designed|ats\" from the sprint's cartesian is not multiplied into the fixture count — every fixture is rendered through both variants via scaffold.js's buildAll() (two separate CLI processes — see that file's docblock for why not the batched `cvx build --all`), so variant coverage is complete without doubling the fixture list."
    }
  }
}

/** Human-readable one-paragraph-per-topic log of the fixture plan (used by the oracle test's console output and research/archive/c0-baseline.md). */
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
