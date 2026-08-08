// ── Cross-render isolation: two builds in one process must not corrupt each
// other ──────────────────────────────────────────────────────────────────────
//
// THE BUG THIS FILE EXISTS FOR (shipped in v1.6.0, reproduced from
// `npm pack @hrtips/cvx@1.6.0`): calling the MCP tools `build_pdf({dir})` and
// then `build_pdf({dir, ats: true})` in ONE Node process produced an ATS PDF
// with letters missing from the rendered page — the scaffold's role headings
// came out as "oun er / iel Co / an er / ot a / O eration" instead of "Founder
// & Field Commander – Gotham Operations". Both calls returned `ok: true`;
// nothing warned. The MCP server is long-lived and skills/cvx/SKILL.md tells
// assistants to build both variants, so this was the normal path.
//
// Mechanism (full write-up in src/pdf/fonts.js): @react-pdf keeps one
// process-global font registry that caches the parsed fontkit font on each
// source; fontkit memoizes Glyph objects on the font keyed by glyph id ALONE,
// keeping the `codePoints` of the first lookup; and subset embedding at the END
// of a render looks glyphs up with NO code points, caching them empty.
// @react-pdf/textkit derives its glyph↔string index maps from
// `codePoints.length`, so on the NEXT render those glyphs collapse onto their
// neighbour's index and get sliced out of the line — gone from the page and
// from the text layer. research/c0-retro.md finding 1 is the same bug class,
// caught before v1.5.0 in `cvx build --all` and fixed there by rendering each
// variant in a separate process; the MCP path never got that fix.
//
// WHY THE ASSERTION LOOKS LIKE THIS. `ok: true` and a plausible byte count come
// back in both the broken and the fixed case, so only the rendered content can
// tell them apart — hence pdftotext, the same oracle
// test/layout-harness/contentOracle.js uses (plain, never -layout).
//
// Two traps, both hit while writing this file; do not remove the guards:
//
//   1. A bare `expect(text).toContain(role)` PASSES on the broken engine. The
//      scaffold's personal.title repeats the first role verbatim in the header
//      block, which renders through a different (unpoisoned) font source. The
//      assertion must therefore look at the EXPERIENCE section only.
//   2. A byte-identity oracle ("the ATS PDF must not depend on what preceded
//      it") cannot be written in-process: rendering the ATS variant first warms
//      the very glyphs the designed render would otherwise poison, so the
//      reference render immunises itself and the comparison passes vacuously.
//      The poppler-free half of this regression lives in src/pdf/fonts.test.js
//      instead, which asserts the registry invariant the fix rests on.

import { cpSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { load } from 'js-yaml'
import { afterAll, describe, expect, it } from 'vitest'
import { buildPdf } from '../src/mcp/tools.js'
import {
  cleanupFixtureDirs,
  extractText,
  hasPdftoppm,
  mkFixtureDir,
  ROOT
} from './layout-harness/scaffold.js'

const TEMPLATE = path.join(ROOT, 'template', 'cv-content')

/** Scaffold the shipped example CV into a fresh temp workspace. */
function scaffold(id) {
  const dir = mkFixtureDir(id)
  cpSync(TEMPLATE, path.join(dir, 'cv-content'), { recursive: true })
  return dir
}

/** Every role heading in the scaffold — read from the YAML, never hardcoded. */
function scaffoldRoles(dir) {
  const experience = /** @type {{ role?: string }[]} */ (
    load(readFileSync(path.join(dir, 'cv-content', 'experience.yaml'), 'utf8'))
  )
  return experience.map((e) => e.role).filter((role) => typeof role === 'string')
}

/**
 * Extracted text from the EXPERIENCE heading onwards. Trap 1 above: the header
 * block repeats personal.title (= the first role) in a different font source,
 * so whole-document containment cannot see the loss.
 */
function experienceSection(pdfPath) {
  const text = extractText(pdfPath)
  const start = text.indexOf('EXPERIENCE')
  expect(start, 'no EXPERIENCE heading in the extracted text').toBeGreaterThanOrEqual(0)
  return text.slice(start)
}

afterAll(() => cleanupFixtureDirs())

describe.skipIf(!hasPdftoppm())('one process, two variants', () => {
  it('build_pdf designed then ATS leaves every role heading intact in BOTH PDFs', async () => {
    const dir = scaffold('isolation-designed-then-ats')
    const roles = scaffoldRoles(dir)
    expect(roles.length).toBeGreaterThan(3) // the fixture must have something to lose

    const designed = await buildPdf({ dir })
    const ats = await buildPdf({ dir, ats: true })
    expect(designed.ok).toBe(true)
    expect(ats.ok).toBe(true)

    // The ATS variant is the one v1.6.0 corrupted (0 of 4 headings survived);
    // the designed one is checked too so the fix can't trade one for the other.
    for (const role of roles) {
      expect(experienceSection(ats.path), `ATS build lost "${role}"`).toContain(role)
      expect(experienceSection(designed.path), `designed build lost "${role}"`).toContain(role)
    }
  }, 30000)

  it('the reverse order (ATS then designed) stays intact too', async () => {
    // In a FRESH process this order was already clean in v1.6.0 (an ATS render
    // caches the glyphs it needs with their code points before any designed
    // render can cache them empty). It fails on the broken engine here anyway,
    // because it shares a worker with the test above and a poisoned glyph is
    // never un-poisoned — which is the point: after the fix, neither order nor
    // history may matter.
    const dir = scaffold('isolation-ats-then-designed')
    const roles = scaffoldRoles(dir)

    const ats = await buildPdf({ dir, ats: true })
    const designed = await buildPdf({ dir })
    expect(ats.ok).toBe(true)
    expect(designed.ok).toBe(true)

    for (const role of roles) {
      expect(experienceSection(designed.path), `designed build lost "${role}"`).toContain(role)
      expect(experienceSection(ats.path), `ATS build lost "${role}"`).toContain(role)
    }
  }, 30000)
})
