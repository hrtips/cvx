#!/usr/bin/env node

// ── Generate/refresh test/layout-harness/baseline.json ─────────────────────
//
// Run manually (never from `npm test` itself — see baseline.js docblock):
//
//   node test/layout-harness/generateBaseline.js
//
// This is the ONE place that writes baseline.json. C1/C2/C3 re-run this
// after landing a real fix, review the diff (that diff *is* the evidence
// the fix worked), and commit the refreshed file.
//
// Two things this script REFUSES to do quietly:
//   1. Run against a stale lib/ — `bin/cvx.js` (which the render oracle
//      shells out to) imports from lib/, not src/, so this rebuilds lib/
//      from the current src/ first. Skipping this would silently compare
//      "today's src/" structural facts against "whatever lib/ happened to
//      contain last" render facts — two different engines pretending to
//      be one.
//   2. Record a hard invariant (invariant0 / placedExactlyOnce /
//      orderPreserved / noOrphanHeading, or content-completeness) as
//      false. Those are never allowed to be false — if one is, this script
//      prints every violation and exits non-zero WITHOUT writing
//      baseline.json, rather than baking a "this bug is now expected" entry
//      into the recording.
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { cpSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { normalizeLayout } from '../../src/pdf/loadLayout.js'
import { BASELINE_PATH, normalizeOracleFacts, writeBaseline } from './baseline.js'
import { checkCompleteness, sentinelsFor } from './contentOracle.js'
import { buildContent } from './contentSpecs.js'
import { buildFixturePlan } from './fixtures.js'
import { runDiffCorpus } from './measureDiff.js'
import { runOracle } from './renderOracle.js'
import {
  cleanupFixtureDirs,
  detectProfilePhoto,
  extractText,
  hasPdftoppm,
  mkFixtureDir,
  ROOT,
  writeFixtureContent
} from './scaffold.js'
import { hardInvariantViolations, structuralFactsFor } from './structuralFacts.js'

/** Every violation found across the whole run — collected, not thrown immediately, so one run surfaces everything at once. */
const fatalViolations = []

function factsForContent(id, content) {
  const dir = mkFixtureDir(id)
  writeFixtureContent(dir, content)
  const oracle = runOracle(dir)
  if (!oracle.ok) {
    fatalViolations.push(
      `${id}: build failed (code ${oracle.code}) — ${oracle.stderr ?? ''}`.trim()
    )
    return { oracle: normalizeOracleFacts(oracle), logicalTotalPages: null }
  }

  const structural = structuralFactsFor(content)
  for (const v of hardInvariantViolations(structural)) fatalViolations.push(`${id}: ${v}`)

  const sentinels = sentinelsFor(content)
  for (const variant of ['designed', 'ats']) {
    const text = extractText(oracle[variant].pdfPath)
    const { ok, missing } = checkCompleteness(text, sentinels)
    if (!ok)
      fatalViolations.push(
        `${id}: content-completeness (${variant}) — missing ${JSON.stringify(missing)}`
      )
  }

  return { oracle: normalizeOracleFacts(oracle), logicalTotalPages: structural.logicalTotalPages }
}

/** Read the shipped template/cv-content scaffold's content directly (no CLI needed to build the content bag itself). */
function readScaffoldContent() {
  const dir = path.join(ROOT, 'template', 'cv-content')
  const read = (f) => load(readFileSync(path.join(dir, f), 'utf8'))
  return {
    personal: read('personal.yaml'),
    // Presence-only, but load-bearing: identity-photo reserves
    // chrome.photoHeight on page 1 when a photo exists (layout.js identityH).
    profilePhoto: detectProfilePhoto(dir),
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
}

function main() {
  console.log(
    'Rebuilding lib/ from the current src/ (so the render oracle — which shells out to bin/cvx.js, which imports lib/ — matches what we are about to record)...'
  )
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-lib.js')], {
    cwd: ROOT,
    stdio: 'inherit'
  })

  if (!hasPdftoppm()) {
    console.error('\nERROR: pdftoppm (and pdftotext, same poppler package) not found on PATH.')
    console.error('generateBaseline.js needs both to render+rasterize+extract-text fixtures.')
    console.error(
      'Install poppler-utils (Linux) / poppler (macOS: brew install poppler) and retry.'
    )
    process.exitCode = 1
    return
  }

  console.log('Generating test/layout-harness/baseline.json against the CURRENT engine...')
  const { fixtures, meta } = buildFixturePlan()

  const fixtureResults = {}
  for (const spec of fixtures) {
    process.stdout.write(`  ${spec.id} ... `)
    const t0 = Date.now()
    const content = buildContent(spec)
    fixtureResults[spec.id] = {
      description: spec.description,
      ...factsForContent(spec.id, content)
    }
    console.log(`${Date.now() - t0}ms`)
  }

  // The shipped scaffold itself (template/cv-content), unmodified — the
  // concrete example research/c0-baseline.md walks through.
  process.stdout.write('  scaffold-default ... ')
  const t0 = Date.now()
  const scaffoldDir = mkFixtureDir('scaffold-default')
  cpSync(path.join(ROOT, 'template', 'cv-content'), path.join(scaffoldDir, 'cv-content'), {
    recursive: true
  })
  const scaffoldOracle = runOracle(scaffoldDir)
  const scaffoldContent = readScaffoldContent()
  if (!scaffoldOracle.ok) {
    fatalViolations.push(
      `scaffold-default: build failed (code ${scaffoldOracle.code}) — ${scaffoldOracle.stderr ?? ''}`.trim()
    )
  } else {
    // Plan with the scaffold's own layout file, which the render uses — not
    // the built-in default. See structuralFactsFor.
    const structural = structuralFactsFor(
      scaffoldContent,
      normalizeLayout(
        load(
          readFileSync(
            path.join(ROOT, 'template', 'cv-content', 'layouts', 'two-column.yaml'),
            'utf8'
          )
        )
      )
    )
    for (const v of hardInvariantViolations(structural))
      fatalViolations.push(`scaffold-default: ${v}`)
    const sentinels = sentinelsFor(scaffoldContent)
    for (const variant of ['designed', 'ats']) {
      const text = extractText(scaffoldOracle[variant].pdfPath)
      const { ok, missing } = checkCompleteness(text, sentinels)
      if (!ok)
        fatalViolations.push(
          `scaffold-default: content-completeness (${variant}) — missing ${JSON.stringify(missing)}`
        )
    }
    fixtureResults['scaffold-default'] = {
      description:
        'The shipped template/cv-content scaffold, unmodified (default config.yaml: theme + layout only — no forced page1ExperienceCount/page1SplitBullets since review round 2; automatic pagination handles it without a wasted page).',
      oracle: normalizeOracleFacts(scaffoldOracle),
      logicalTotalPages: structural.logicalTotalPages
    }
  }
  console.log(`${Date.now() - t0}ms`)

  if (fatalViolations.length > 0) {
    console.error(
      `\nREFUSING to write baseline.json: ${fatalViolations.length} hard-invariant / content-completeness violation(s) found.`
    )
    console.error(
      'These must never be silently recorded as "expected" — fix the harness or the engine, then re-run:\n'
    )
    for (const v of fatalViolations) console.error(`  - ${v}`)
    cleanupFixtureDirs()
    process.exitCode = 1
    return
  }

  console.log('Running the measure-vs-render diff corpus...')
  return runDiffCorpus().then((measureDiffCorpus) => {
    const baseline = {
      schemaVersion: 2,
      note: 'Recorded 2026-07-28, POST-C2 (real fontkit measurement — src/pdf/measure.js) and its round-2 review fixes: per-bullet/per-sidebar-item content-completeness sentinels (contentOracle.js), the shipped scaffold\'s forced page-1 split removed (template/cv-content/config.yaml + the root cv-content/config.yaml demo — automatic pagination fits this content without a wasted page), a broadened measure-vs-render corpus (bold role, italic description, sidebar row, bold name — at real layout.js widths, not an arbitrary 200pt), and quantized page-budget comparisons (layout.js). This note previously (incorrectly) claimed "the CURRENT (pre-C1/C2/C3) engine" — false as of C2; corrected here rather than left stale. Regenerate with `node test/layout-harness/generateBaseline.js` after a real fix lands, and review the diff — that diff IS the evidence the fix worked (or, if unexpected, evidence of a regression to stop and investigate, not launder in). See research/c0-baseline.md for the narrative. Hard invariants (invariant0/placedExactlyOnce/orderPreserved/noOrphanHeading) and content-completeness are NOT recorded here — they are asserted directly in layoutRenderOracle.test.js and this script refuses to write a baseline if any of them fail.',
      fixturePlan: {
        totalFixtures: meta.totalFixtures,
        pairwiseRows: meta.pairwise.rowsGenerated,
        riskScenarios: meta.riskScenarioCount,
        namedEdgeCases: meta.namedEdgeCaseCount,
        totalCartesianCombinations: meta.pairwise.totalCartesianCombinations,
        droppedCombinations: meta.pairwise.droppedCombinations
      },
      fixtures: fixtureResults,
      measureDiffCorpus
    }

    writeBaseline(baseline)
    console.log(`Wrote ${path.relative(ROOT, BASELINE_PATH)}`)
    cleanupFixtureDirs()
  })
}

await main()
