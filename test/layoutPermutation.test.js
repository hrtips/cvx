// D2/D3 — the content oracle, driven over LAYOUT permutations.
//
// `layoutRenderOracle.test.js` proves every section's items survive the render
// for a curated set of CONTENT fixtures — but always through the two shipped
// layouts. That is the blind spot both release blockers walked through: neither
// bug is reachable by varying content, and both delete a whole section from the
// PDF while `validate --strict` reports ok.
//
//   D2  `summary` in a sidebar slot: `packSidebar` skips any key
//       `sidebarSectionH` returns null for, and the two-column renderer only
//       draws the slices the packer produced — so the section reached neither.
//   D3  a section only in `continuation.main` on a TWO-page CV: `mainSlotKeys`
//       returned `last.main` for the final page, and on a 2-page document the
//       final page is the only non-first page, so `continuation.main` was never
//       consulted for anything, for any key.
//
// The permutations below are the layout shapes SKILL.md actually teaches
// authors to write (§"Student and first-job CVs" moves sections into `main`),
// so this is the reachable surface, not a synthetic one.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dump } from 'js-yaml'
import { afterAll, describe, expect, it } from 'vitest'
import {
  cleanupFixtureDirs,
  extractText,
  hasPdftoppm,
  mkFixtureDir,
  runCli,
  writeFixtureContent
} from './layout-harness/scaffold.js'

/** Distinctive strings — one per section — that must survive into the PDF. */
const MARK = {
  summary: 'Zephyrine summary sentinel',
  achievements: 'Quixotic achievement sentinel',
  education: 'Vermillion institute sentinel',
  competencies: 'Perambulate sentinel'
}

/** @param {number} roles */
const content = (roles) => ({
  personal: { name: 'Perm Test', title: 'Engineer', email: 'p@t.z' },
  summary: [`${MARK.summary} describing a career in one line.`],
  experience: Array.from({ length: roles }, (_, i) => ({
    role: `Engineer ${i}`,
    company: `Company ${i}`,
    period: '2020 – 2024',
    bullets: Array.from(
      { length: 6 },
      (_unusedBullet, b) =>
        `Bullet ${b} of role ${i}: a long achievement sentence that wraps and consumes column height.`
    )
  })),
  education: [{ degree: 'BSc', institution: MARK.education, period: '2016' }],
  competencies: [MARK.competencies, 'Second Skill', 'Third Skill'],
  achievements: [{ year: MARK.achievements, text: '— 2024, Somewhere' }],
  referees: []
})

/** Write a layout file into an existing fixture dir. */
function writeLayout(dir, layout) {
  const dest = path.join(dir, 'cv-content', 'layouts')
  mkdirSync(dest, { recursive: true })
  writeFileSync(path.join(dest, 'two-column.yaml'), dump(layout, { lineWidth: -1 }))
  writeFileSync(
    path.join(dir, 'cv-content', 'config.yaml'),
    dump({ schemaVersion: 1, theme: 'teal', layout: 'two-column' }, { lineWidth: -1 })
  )
}

/**
 * Build and return the PDF's extracted text. Reading order (no `-layout`):
 * layout mode interleaves the two columns and manufactures false misses.
 */
function buildAndExtract(dir) {
  const res = runCli(dir, ['build', '--json'])
  expect(res.code, `build failed:\n${res.stderr}`).toBe(0)
  const out = JSON.parse(res.stdout)
  const pdf = path.join(dir, out.filename ?? out.outputs?.[0]?.filename)
  expect(existsSync(pdf), `no PDF at ${pdf}`).toBe(true)
  return { text: extractText(pdf), plan: out.diagnostics ?? out.outputs?.[0]?.diagnostics }
}

describe.skipIf(!hasPdftoppm())('layout permutations — no section may vanish (D2/D3)', () => {
  afterAll(cleanupFixtureDirs)

  it('D3: a section only in `continuation.main` renders on a TWO-page CV', () => {
    // 3 roles × 6 wrapping bullets is exactly 2 planned pages (calibrated);
    // the assertion below fails loudly if that ever drifts, because a 1- or
    // 3-page fixture would not exercise the bug at all.
    const dir = mkFixtureDir('perm-cont-main-2page')
    writeFixtureContent(dir, content(3))
    writeLayout(dir, {
      template: 'two-column',
      pages: {
        first: { sidebar: ['identity-photo', 'contact'], main: ['summary', 'experience'] },
        continuation: {
          sidebar: ['identity-compact', 'education'],
          main: ['achievements', 'experience:continued']
        },
        last: { sidebar: ['identity-compact'], main: ['experience:continued'] }
      }
    })
    const { text, plan } = buildAndExtract(dir)
    expect(plan.totalPages, 'fixture must be exactly 2 pages to exercise the bug').toBe(2)
    // Pre-fix this was 0: the final page took `last.main`, so `achievements`
    // rendered nowhere at all while validation stayed green.
    expect(text).toContain(MARK.achievements)
  }, 60000)

  it('D3: the same layout does not DUPLICATE that section on a three-page CV', () => {
    const dir = mkFixtureDir('perm-cont-main-3page')
    writeFixtureContent(dir, content(6))
    writeLayout(dir, {
      template: 'two-column',
      pages: {
        first: { sidebar: ['identity-photo', 'contact'], main: ['summary', 'experience'] },
        continuation: {
          sidebar: ['identity-compact', 'education'],
          main: ['achievements', 'experience:continued']
        },
        last: { sidebar: ['identity-compact'], main: ['experience:continued'] }
      }
    })
    const { text, plan } = buildAndExtract(dir)
    expect(plan.totalPages).toBeGreaterThanOrEqual(3)
    // The union only applies when the final page is ALSO the only continuation
    // page. On 3+ pages the continuation keys already rendered earlier, so a
    // union on the last page would print this twice.
    expect(text.split(MARK.achievements).length - 1).toBe(1)
  }, 60000)

  it('the student-layout shape (sections moved into `main`) loses nothing', () => {
    // SKILL.md §"Student and first-job CVs" teaches exactly this edit.
    const dir = mkFixtureDir('perm-student-main')
    const c = content(0)
    writeFixtureContent(dir, c)
    writeLayout(dir, {
      template: 'two-column',
      pages: {
        first: {
          sidebar: ['identity-photo', 'contact'],
          main: ['summary', { spacer: 14 }, 'education', { spacer: 10 }, 'competencies']
        }
      }
    })
    const { text } = buildAndExtract(dir)
    for (const key of ['summary', 'education', 'competencies']) {
      expect(text, `${key} vanished from a main-slot layout`).toContain(MARK[key])
    }
  }, 60000)

  it('D1: `referees: []` prints the promised fallback line in BOTH variants', () => {
    // Three shipped texts promise this, and `[]` is what `cvx init` scaffolds.
    // The designed variant honoured it (SIDEBAR_SECTIONS' `always` flag); the
    // ATS variant gated the whole block on `length > 0` and printed nothing.
    const dir = mkFixtureDir('perm-referees-empty')
    writeFixtureContent(dir, { ...content(2), referees: [] })
    writeLayout(dir, {
      template: 'two-column',
      pages: {
        first: { sidebar: ['identity-photo', 'contact'], main: ['summary', 'experience'] },
        last: { sidebar: ['identity-compact', 'referees'], main: ['experience:continued'] }
      }
    })
    expect(runCli(dir, ['build', '--all', '--json']).code).toBe(0)
    for (const name of ['perm-test.pdf', 'perm-test-ats.pdf']) {
      const text = extractText(path.join(dir, name))
      expect(text.toLowerCase(), `${name} lost the fallback line`).toContain(
        'references available upon request'
      )
    }
  }, 60000)

  it('D2: a key the sidebar cannot render is a validation ERROR, never a silent drop', () => {
    const dir = mkFixtureDir('perm-summary-in-sidebar')
    writeFixtureContent(dir, content(2))
    writeLayout(dir, {
      template: 'two-column',
      pages: {
        first: {
          sidebar: ['identity-photo', 'contact', 'summary'],
          main: ['experience']
        }
      }
    })
    const res = runCli(dir, ['validate', '--json'])
    expect(res.code, 'must fail validation, not build a CV with no summary').toBe(2)
    const out = JSON.parse(res.stdout)
    expect(out.ok).toBe(false)
    const finding = out.errors.find((e) => e.code === 'slot-not-renderable')
    expect(finding, `no slot-not-renderable error in ${JSON.stringify(out.errors)}`).toBeTruthy()
    expect(finding.path).toBe('/first/sidebar/2')
    expect(finding.message).toContain('summary')
  }, 60000)
})
