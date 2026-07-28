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
import { describe, it, expect, afterAll } from 'vitest'
import { cpSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { buildFixturePlan, describeFixturePlan } from './layout-harness/fixtures.js'
import { buildContent } from './layout-harness/contentSpecs.js'
import { ROOT, mkFixtureDir, writeFixtureContent, hasPdftoppm, extractText, cleanupFixtureDirs } from './layout-harness/scaffold.js'
import { runOracle } from './layout-harness/renderOracle.js'
import { normalizeOracleFacts, loadBaseline, diff } from './layout-harness/baseline.js'
import { structuralFactsFor, hardInvariantViolations } from './layout-harness/structuralFacts.js'
import { sentinelsFor, checkCompleteness } from './layout-harness/contentOracle.js'

const { fixtures, meta } = buildFixturePlan()
const baseline = loadBaseline()

function assertHardInvariants(content) {
  const structural = structuralFactsFor(content)
  const violations = hardInvariantViolations(structural)
  expect(violations, `hard main-column invariant violation(s):\n  ${violations.join('\n  ')}`).toEqual([])
  return structural
}

function assertContentComplete(oracle, content) {
  const sentinels = sentinelsFor(content)
  for (const variant of ['designed', 'ats']) {
    const text = extractText(oracle[variant].pdfPath)
    const { ok, missing } = checkCompleteness(text, sentinels)
    expect(ok, `${variant}: content dropped from the render — missing sentinels: ${JSON.stringify(missing)}`).toBe(true)
  }
}

function assertMatchesDescriptiveBaseline(id, actual) {
  const recorded = baseline.fixtures[id]
  if (!recorded) {
    throw new Error(`No baseline entry for fixture "${id}" — run: node test/layout-harness/generateBaseline.js`)
  }
  const d = [
    ...diff(actual.logicalTotalPages, recorded.logicalTotalPages, 'logicalTotalPages'),
    ...diff(actual.oracle, recorded.oracle, 'oracle'),
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
      { section: 'referees', text: 'Referee 2' },
    ]
    expect(checkCompleteness('... Certification 7 ... Referee 2 ...', sentinels).ok).toBe(true)

    const droppedReferees = checkCompleteness('... Certification 7 ... (referees section silently dropped) ...', sentinels)
    expect(droppedReferees.ok).toBe(false)
    expect(droppedReferees.missing).toEqual([{ section: 'referees', text: 'Referee 2' }])
  })

  it('sentinelsFor() extracts a greppable last-item sentinel per present section, and every experience role (not just the last)', () => {
    const content = buildContent({ id: 'x', sections: { certifications: 'many', referees: 'absent' }, textLength: 'typical', volume: 'multi-page' })
    const sentinels = sentinelsFor(content)
    // "many" = 8 items (indices 0..7) — the LAST item's sentinel, not the first, is the strong check (proves the section rendered all the way through).
    expect(sentinels).toContainEqual({ section: 'certifications', text: 'Certification 7' })
    expect(sentinels.some((s) => s.text === 'Certification 0')).toBe(false)
    // absent sections contribute no sentinel at all:
    expect(sentinels.some((s) => s.section === 'referees')).toBe(false)
    // every experience entry (multi-page volume = 5 entries), not just one:
    expect(sentinels.filter((s) => s.section === 'experience')).toEqual(content.experience.map((e) => ({ section: 'experience', text: e.role })))
  })

  it('personal.name is never a sentinel (documented — see contentOracle.js NON_LATIN_NAME_CAVEAT)', () => {
    const content = buildContent({ id: 'x', personalName: 'ANYTHING AT ALL', sections: {}, textLength: 'short', volume: 'fits-1-page' })
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
      droppedCombinations: meta.pairwise.droppedCombinations,
    }).toEqual(baseline.fixturePlan)
  })
})

describe.skipIf(!hasPdftoppm())('C0 render oracle — every curated fixture: hard invariants + content completeness + baseline-locked descriptive facts', () => {
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
      assertMatchesDescriptiveBaseline(spec.id, { logicalTotalPages: structural.logicalTotalPages, oracle: normalizeOracleFacts(oracle) })
    }, 20000)
  }
})

describe.skipIf(!hasPdftoppm())('C0 render oracle — the shipped scaffold (template/cv-content, unmodified)', () => {
  afterAll(() => cleanupFixtureDirs())

  it('reproduces the two known bugs, baseline-locked from the real default config', () => {
    const dir = mkFixtureDir('scaffold-default')
    cpSync(path.join(ROOT, 'template', 'cv-content'), path.join(dir, 'cv-content'), { recursive: true })
    const oracle = runOracle(dir)
    expect(oracle.ok).toBe(true)

    const templateDir = path.join(ROOT, 'template', 'cv-content')
    const read = (f) => load(readFileSync(path.join(templateDir, f), 'utf8'))
    const content = {
      experience: read('experience.yaml'), summary: read('summary.yaml'), config: read('config.yaml'),
      education: read('education.yaml'), certifications: read('certifications.yaml'),
      publications: read('publications.yaml'), languages: read('languages.yaml'),
      referees: read('referees.yaml'), achievements: read('achievements.yaml'), competencies: read('competencies.yaml'),
    }

    const structural = assertHardInvariants(content)
    assertContentComplete(oracle, content)
    assertMatchesDescriptiveBaseline('scaffold-default', { logicalTotalPages: structural.logicalTotalPages, oracle: normalizeOracleFacts(oracle) })

    // Spelled out explicitly too (not just "matches baseline"), because this
    // is the concrete example research/c0-baseline.md walks through: bug (b)
    // — the corner badge spills onto its own near-blank page (page index 1)
    // — the SIDEBAR band there has ZERO ink bands (nothing at all — the
    // badge lands in the MAIN band, not the sidebar); bug (a) — the sidebar
    // (education, certifications, competencies, languages, publications,
    // referees) outlives the main column and spills onto physical page
    // index 3. That page no longer shows up in `emptyColumns`: the corner
    // badge itself always contributes exactly one ink band to the MAIN
    // region on any page it lands on, so "main has 0 bands" specifically
    // does not trip there under the presence-based signal (a documented
    // trade-off — see renderOracle.js's docblock). Bug (a) is still fully
    // visible via the physical-vs-logical page-count gap asserted below,
    // and the content-completeness oracle above independently proves the
    // sidebar's tail content (referees, publications) really did render
    // there, in full, un-clipped.
    expect(oracle.designed.pageCount).toBe(4)
    expect(structural.logicalTotalPages).toBe(2)
    expect(oracle.designed.blankPages).toEqual([1])
    expect(oracle.designed.emptyColumns).toEqual([{ page: 1, side: 'sidebar' }])
  }, 20000)
})

describe.skipIf(!hasPdftoppm())('C0 render oracle — non-Latin name (documented G-a gap, not hidden)', () => {
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
})
