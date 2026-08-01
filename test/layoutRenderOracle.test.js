// C0 — the rendered oracle, baseline-locked against the CURRENT engine,
// PLUS hard invariants and the content-completeness oracle (both non-
// negotiable, checked on every fixture, never baseline-locked).
//
// packExperiences() only packs the main column; the sidebar isn't measured
// or packed at all (see test/layout-harness/blocks.js), so the two bugs
// this whole sprint exists to fix — (a) a sidebar taller than one physical
// page produces an extra physical page with an empty MAIN column, and (b) a
// near-blank trailing page from the corner badge — are invisible to any
// assertion made on the structural plan alone (layoutHarnessInvariants.test.js).
// This file builds the curated fixture set (test/layout-harness/fixtures.js:
// pairwise coverage + named risk/edge cases) and, for every fixture:
//
//   1. HARD-asserts the main-column invariants (invariant0, placedExactlyOnce,
//      orderPreserved, noOrphanHeading) via structuralFacts.js — these must
//      be true for every fixture, always; a regenerate can never flip one
//      to false and have the suite stay green (generateBaseline.js itself
//      refuses to write a baseline if any of these come back false).
//   2. HARD-asserts content completeness (contentOracle.js): every present
//      section's per-item sentinel text is findable in the rendered PDF's
//      extracted text (pdftotext), main AND sidebar, both variants. This
//      replaces the old *structural* "sidebar section-presence" check,
//      which review correctly flagged as vacuous (it only proved a
//      section's KEY was assigned to a page-kind, never that the section's
//      actual items survived the render).
//   3. BASELINE-LOCKS the purely descriptive/known-bug facts: physical page
//      count, which pages are blank, which pages have an empty column and
//      on which side, plus the logical (packExperiences) page count for
//      comparison. This is where "empty column" / "blank page" are allowed
//      to be true — those ARE the known bugs — so this part of the suite is
//      green today only because it matches what was *recorded*, and goes
//      red on a regression (a NEW failure, or any of these facts changing)
//      — see test/layout-harness/baseline.js. C1/C2/C3 regenerate
//      baseline.json (node test/layout-harness/generateBaseline.js) as they
//      land real fixes.
//
// Guarded with `describe.skipIf(!hasPdftoppm())`: CI runs `npm test` on
// ubuntu/macOS/Windows legs with no poppler installed by default (only one
// pinned ubuntu-latest+node22 leg installs poppler-utils — see
// .github/workflows/ci.yml) — without this guard those legs would ERROR,
// not skip, and committing this file would break CI outright.

import { cpSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { afterAll, describe, expect, it } from 'vitest'
import { diff, loadBaseline, normalizeOracleFacts } from './layout-harness/baseline.js'
import { checkCompleteness, sentinelsFor, tailSentinel } from './layout-harness/contentOracle.js'
import { buildContent } from './layout-harness/contentSpecs.js'
import { buildFixturePlan, describeFixturePlan } from './layout-harness/fixtures.js'
import { runOracle } from './layout-harness/renderOracle.js'
import {
  cleanupFixtureDirs,
  detectProfilePhoto,
  extractText,
  hasPdftoppm,
  mkFixtureDir,
  ROOT,
  writeFixtureContent
} from './layout-harness/scaffold.js'
import { hardInvariantViolations, structuralFactsFor } from './layout-harness/structuralFacts.js'

const { fixtures, meta } = buildFixturePlan()
const baseline = loadBaseline()

function assertHardInvariants(content) {
  const structural = structuralFactsFor(content)
  const violations = hardInvariantViolations(structural)
  expect(
    violations,
    `hard main-column invariant violation(s):\n  ${violations.join('\n  ')}`
  ).toEqual([])
  return structural
}

function assertContentComplete(oracle, content) {
  const sentinels = sentinelsFor(content)
  for (const variant of ['designed', 'ats']) {
    const text = extractText(oracle[variant].pdfPath)
    const { ok, missing } = checkCompleteness(text, sentinels)
    expect(
      ok,
      `${variant}: content dropped from the render — missing sentinels: ${JSON.stringify(missing)}`
    ).toBe(true)
  }
}

function assertMatchesDescriptiveBaseline(id, actual) {
  const recorded = baseline.fixtures[id]
  if (!recorded) {
    throw new Error(
      `No baseline entry for fixture "${id}" — run: node test/layout-harness/generateBaseline.js`
    )
  }
  const d = [
    ...diff(actual.logicalTotalPages, recorded.logicalTotalPages, 'logicalTotalPages'),
    ...diff(actual.oracle, recorded.oracle, 'oracle')
  ]
  if (d.length > 0) {
    throw new Error(
      `REGRESSION for fixture "${id}" vs baseline.json (if this is an intentional fix, ` +
        `regenerate with: node test/layout-harness/generateBaseline.js):\n  ${d.join('\n  ')}`
    )
  }
}

describe('C0 content-completeness oracle — self-test (proves the check is not vacuous; no pdftoppm needed)', () => {
  it('flags a missing sentinel and passes when every sentinel is present', () => {
    const sentinels = [
      { section: 'certifications', text: 'Certification 7' },
      { section: 'referees', text: 'Referee 2' }
    ]
    expect(checkCompleteness('... Certification 7 ... Referee 2 ...', sentinels).ok).toBe(true)

    const droppedReferees = checkCompleteness(
      '... Certification 7 ... (referees section silently dropped) ...',
      sentinels
    )
    expect(droppedReferees.ok).toBe(false)
    expect(droppedReferees.missing).toEqual([{ section: 'referees', text: 'Referee 2' }])
  })

  it('does NOT accept a longer sibling as a match — a dropped "Certification 1" cannot hide behind "Certification 19"', () => {
    const sentinels = [{ section: 'certifications', text: 'Certification 1' }]
    // The exact masking review found: the fixtures generate index-suffixed
    // labels, so plain includes() reported this as present.
    expect(
      checkCompleteness('Certification 0 Certification 19 Certification 2', sentinels).ok
    ).toBe(false)
    // ...but a real occurrence, however punctuated or line-wrapped, still matches
    expect(checkCompleteness('… Certification 1, Issuer 1 …', sentinels).ok).toBe(true)
    expect(checkCompleteness('Certification\n1 Issuer', sentinels).ok).toBe(true)
    expect(checkCompleteness('(Certification 1)', sentinels).ok).toBe(true)
  })

  it('still matches sentinels that begin or end with punctuation (achievement bodies lead with an em dash; bullet tails end with a full stop)', () => {
    expect(
      checkCompleteness('Award 0 — Example Body 0 Award 1', [
        { section: 'achievements', text: '— Example Body 0' }
      ]).ok
    ).toBe(true)
    expect(
      checkCompleteness('…coverage across multiple districts and international cities.', [
        { section: 'experience', text: 'and international cities.' }
      ]).ok
    ).toBe(true)
  })

  it('sentinelsFor() extracts a greppable sentinel for EVERY item of every present section (round 2 fix: was last-item-only)', () => {
    const content = buildContent({
      id: 'x',
      sections: { certifications: 'many', referees: 'absent' },
      textLength: 'typical',
      volume: 'multi-page'
    })
    const sentinels = sentinelsFor(content)
    // "many" = 8 items (indices 0..7) — EVERY item's sentinel is present now,
    // not just the last: a silently-dropped MIDDLE item is exactly what
    // last-item-only checking could never notice.
    expect(sentinels).toContainEqual({ section: 'certifications', text: 'Certification 0' })
    expect(sentinels).toContainEqual({ section: 'certifications', text: 'Certification 7' })
    expect(sentinels.filter((s) => s.section === 'certifications')).toHaveLength(8)
    // absent sections contribute no sentinel at all:
    expect(sentinels.some((s) => s.section === 'referees')).toBe(false)
  })

  it('sentinelsFor() extracts every experience role (not just one) AND every bullet (round 2 fix: bullets were never checked at all)', () => {
    const content = buildContent({
      id: 'x',
      sections: { certifications: 'one' },
      textLength: 'typical',
      volume: 'multi-page'
    })
    const sentinels = sentinelsFor(content)
    // every experience entry (multi-page volume = 5 entries) contributes its role:
    for (const e of content.experience) {
      expect(sentinels).toContainEqual({ section: 'experience', text: e.role })
    }
    // AND every one of its bullets, as a TAIL substring (see tailSentinel() —
    // a physical-page clip drops a wrapped block's LATER words while its
    // first line can still render, so the tail is the part that actually
    // proves the whole bullet survived):
    for (const e of content.experience) {
      for (const b of e.bullets) {
        expect(sentinels).toContainEqual({ section: 'experience', text: tailSentinel(b) })
      }
    }
    const totalBullets = content.experience.reduce((n, e) => n + e.bullets.length, 0)
    expect(sentinels.filter((s) => s.section === 'experience')).toHaveLength(
      content.experience.length + totalBullets
    )
  })

  it('tailSentinel() returns the trailing words of a long string and the whole (short) string unchanged', () => {
    expect(tailSentinel('Led a team of five engineers.')).toBe('Led a team of five engineers.')
    expect(
      tailSentinel(
        'Established and scaled a citywide security operation from a solo initiative to a franchised network.'
      )
    ).toBe('solo initiative to a franchised network.')
    expect(tailSentinel('')).toBe('')
    expect(tailSentinel(null)).toBe('')
  })

  it('personal.name is never a sentinel (documented — see contentOracle.js NON_LATIN_NAME_CAVEAT)', () => {
    const content = buildContent({
      id: 'x',
      personalName: 'ANYTHING AT ALL',
      sections: {},
      textLength: 'short',
      volume: 'fits-1-page'
    })
    expect(sentinelsFor(content).some((s) => s.text === content.personal.name)).toBe(false)
  })
})

describe('C0 fixture plan bookkeeping (pairwise coverage accounting matches what was recorded — no pdftoppm needed, always runs)', () => {
  it('logs the plan (informational)', () => {
    console.log(describeFixturePlan(meta))
    expect(fixtures.length).toBe(meta.totalFixtures)
  })

  it('matches the recorded baseline exactly — a change here means the fixture generator itself changed', () => {
    expect({
      totalFixtures: meta.totalFixtures,
      pairwiseRows: meta.pairwise.rowsGenerated,
      riskScenarios: meta.riskScenarioCount,
      namedEdgeCases: meta.namedEdgeCaseCount,
      totalCartesianCombinations: meta.pairwise.totalCartesianCombinations,
      droppedCombinations: meta.pairwise.droppedCombinations
    }).toEqual(baseline.fixturePlan)
  })
})

describe.skipIf(!hasPdftoppm())(
  'C0 render oracle — every curated fixture: hard invariants + content completeness + baseline-locked descriptive facts',
  () => {
    afterAll(() => cleanupFixtureDirs())

    for (const spec of fixtures) {
      it(`${spec.id}: hard invariants hold, content is complete, descriptive facts match baseline`, () => {
        const dir = mkFixtureDir(spec.id)
        const content = buildContent(spec)
        writeFixtureContent(dir, content)

        const oracle = runOracle(dir)
        expect(oracle.ok).toBe(true) // a build failure is never expected — would itself be a big regression

        const structural = assertHardInvariants(content)
        assertContentComplete(oracle, content)
        assertMatchesDescriptiveBaseline(spec.id, {
          logicalTotalPages: structural.logicalTotalPages,
          oracle: normalizeOracleFacts(oracle)
        })
      }, 20000)
    }
  }
)

describe.skipIf(!hasPdftoppm())(
  'C0 render oracle — the shipped scaffold (template/cv-content, unmodified)',
  () => {
    afterAll(() => cleanupFixtureDirs())

    // History: this test used to assert the scaffold's default config
    // (page1ExperienceCount: 2, page1SplitBullets: 2) reproduced bug (a)/(b)
    // (physical page count 4 vs logical 2, a blank page, an empty sidebar
    // column) — the concrete example research/c0-baseline.md walked through.
    // A review round (post-C2) found that forcing that split was never
    // actually necessary (the scaffold's own AGENTS.md rule: "add pagination
    // keys only if page 1 overflows") and, per real font measurement, was
    // genuinely ~72pt over page 1's honest budget — so it was removed from
    // template/cv-content/config.yaml (and the root cv-content/config.yaml
    // demo), letting automatic pagination handle it. Automatic pagination
    // respects its own budget by construction, so the shipped scaffold is now
    // a CLEAN example (physical pageCount === logical totalPages, no blank
    // page, no empty column) rather than a buggy one — asserted explicitly
    // below, not just "matches baseline". Bug (a)/(b) are real bugs in the
    // engine, still reproducible (and still baseline-locked) on other curated
    // fixtures in this same describe file — the shipped scaffold no longer
    // being one of them is a genuine improvement, not the bug being fixed
    // everywhere.
    it('renders cleanly — no forced split, no blank page, no empty column — baseline-locked from the real default config', () => {
      const dir = mkFixtureDir('scaffold-default')
      cpSync(path.join(ROOT, 'template', 'cv-content'), path.join(dir, 'cv-content'), {
        recursive: true
      })
      const oracle = runOracle(dir)
      expect(oracle.ok).toBe(true)

      const templateDir = path.join(ROOT, 'template', 'cv-content')
      const read = (f) => load(readFileSync(path.join(templateDir, f), 'utf8'))
      const content = {
        // `personal` and `profilePhoto` are load-bearing for the SIDEBAR plan
        // (the contact rows come from personal; identity-photo reserves
        // chrome.photoHeight on page 1 only when a photo exists), so both are
        // read here rather than omitted as "metadata".
        personal: read('personal.yaml'),
        profilePhoto: detectProfilePhoto(templateDir),
        experience: read('experience.yaml'),
        summary: read('summary.yaml'),
        config: read('config.yaml'),
        education: read('education.yaml'),
        certifications: read('certifications.yaml'),
        publications: read('publications.yaml'),
        languages: read('languages.yaml'),
        referees: read('referees.yaml'),
        achievements: read('achievements.yaml'),
        competencies: read('competencies.yaml')
      }
      expect(content.config.page1ExperienceCount).toBeUndefined() // guards against the forced keys silently creeping back in

      const structural = assertHardInvariants(content)
      assertContentComplete(oracle, content)
      assertMatchesDescriptiveBaseline('scaffold-default', {
        logicalTotalPages: structural.logicalTotalPages,
        oracle: normalizeOracleFacts(oracle)
      })

      // Spelled out explicitly too (not just "matches baseline"): physical and
      // logical page counts now agree exactly, and there is no blank page or
      // empty column at all.
      expect(oracle.designed.pageCount).toBe(structural.logicalTotalPages)
      expect(oracle.designed.blankPages).toEqual([])
      expect(oracle.designed.emptyColumns).toEqual([])
    }, 20000)
  }
)

describe.skipIf(!hasPdftoppm())(
  'C0 render oracle — non-Latin name (documented G-a gap, not hidden)',
  () => {
    afterAll(() => cleanupFixtureDirs())

    it('Sinhala glyphs in personal.name are NOT reliably recoverable from the render (Lato has no glyphs, no fallback font registered) — asserted explicitly so the gap stays visible', () => {
      const spec = fixtures.find((f) => f.id === 'edge-non-latin-name')
      const dir = mkFixtureDir(spec.id)
      const content = buildContent(spec)
      writeFixtureContent(dir, content)

      const oracle = runOracle(dir)
      expect(oracle.ok).toBe(true)
      assertHardInvariants(content) // the main column's structural invariants don't care what the name says — still hold

      for (const variant of ['designed', 'ats']) {
        const text = extractText(oracle[variant].pdfPath)
        // The documented gap (design doc G-a): asserted, not silently omitted.
        // If a future fix (a registered fallback font) makes this recoverable,
        // THIS assertion should start failing — that is the intended signal
        // to update it, not evidence of a harness bug.
        expect(text).not.toContain(content.personal.name)
      }
      // Everything else in this fixture is plain Latin (only personal.name is
      // Sinhala) and must still be fully complete — sentinelsFor() never
      // includes personal.name in the first place (see contentOracle.js), so
      // this is the same assertion every other fixture gets.
      assertContentComplete(oracle, content)
    }, 20000)
  }
)
