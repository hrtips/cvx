// C3a — sidebar measure-vs-render diff: does layout.js's sidebar box model
// actually agree with what react-pdf lays out?
//
// The whole C3a packer rests on `sidebarSectionH()` being right; if it is loose
// the packer either overflows (extra physical pages, the bug it exists to fix)
// or under-fills (the wasted space it exists to fix). measureDiff.js already
// proves LINE COUNTS match the render; this proves the composed HEIGHTS do, by
// reading the true position of every sidebar section title out of a real
// rendered PDF (`pdftotext -bbox`) and differencing consecutive titles.
//
// Guarded with `describe.skipIf(!hasPdftoppm())` for the same reason as
// layoutRenderOracle.test.js: only one pinned CI leg installs poppler.

import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dump, load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { normalizeLayout } from '../src/pdf/loadLayout.js'
import { buildContent } from './layout-harness/contentSpecs.js'
import { buildFixturePlan } from './layout-harness/fixtures.js'
import {
  cleanupFixtureDirs,
  detectProfilePhoto,
  hasPdftoppm,
  mkFixtureDir,
  ROOT,
  writeFixtureContent
} from './layout-harness/scaffold.js'
import { runSidebarDiff, SECTION_TITLE_TEXT } from './layout-harness/sidebarMeasureDiff.js'

// Every section that can appear in the sidebar flow must have a title literal
// here, or the diff would silently skip it. Asserted without poppler so the
// gap is caught on every CI leg, not just the one with it.
describe('sidebar measure-diff — title table covers the whole flow (no poppler needed)', () => {
  it('has a title literal for every packable sidebar section', () => {
    expect(Object.keys(SECTION_TITLE_TEXT).sort()).toEqual([
      'achievements',
      'certifications',
      'competencies',
      'contact',
      'education',
      'languages',
      'publications',
      'referees'
    ])
  })
})

describe.skipIf(!hasPdftoppm())(
  'sidebar measure-diff — predicted vs rendered section heights',
  () => {
    /**
     * Tolerance: ZERO. The box model is exact arithmetic over integers-and-
     * quarter-points plus real glyph advances — there is nothing here that should
     * round. `observed` is derived from PDF coordinates that pdftotext prints to
     * 6 decimal places, so a 0.01pt allowance covers the printed precision and
     * nothing else. If this ever needs loosening, the formula is wrong, not the
     * tolerance.
     */
    const TOLERANCE_PT = 0.01

    /**
     * @param {{ layout?: object, identityObservable?: boolean }} [opts]
     *   `identityObservable` is false only for a fixture that still overflows
     *   onto extra physical sheets: the identity check keys off "first physical
     *   sheet of a logical page", which stops being a well-defined mapping the
     *   moment physical and logical page counts diverge (see
     *   sidebarMeasureDiff.js). Section-height differencing is unaffected —
     *   it is page-local — so it still runs on those fixtures.
     */
    function check(label, dir, content, { layout, identityObservable = true } = {}) {
      const diff = runSidebarDiff(dir, content, layout)
      const { rows, identityRows, sectionsFound, skipped, unmeasuredTail, keysMeasured } = diff
      // Coverage is REPORTED, not assumed. Review's point: silently skipping the
      // pages a title could not be found on turns "0.00pt everywhere" into
      // "0.00pt on the pages that already fit". Every skipped page and every
      // undifferenceable page-tail section is logged next to what WAS measured,
      // so the sample this claim rests on is visible in the test output.
      console.log(
        `  ${label}: measured ${rows.length} section heights ${JSON.stringify(keysMeasured)}` +
          ` | skipped ${JSON.stringify(skipped)}` +
          ` | page-tail sections not differenceable ${JSON.stringify(unmeasuredTail.map((t) => t.key))}`
      )
      expect(
        sectionsFound,
        `${label}: no measurable section pair found — the diff would be vacuous`
      ).toBeGreaterThan(2)
      const bad = rows.filter((r) => Math.abs(r.deltaPt) > TOLERANCE_PT)
      expect(
        bad,
        `${label}: section height predicted != rendered for ${JSON.stringify(bad)}`
      ).toEqual([])
      // The injected identity block + column padding, validated the same way.
      expect(
        identityRows.length > 0,
        `${label}: identity rows measured=${identityRows.length}, expected observable=${identityObservable}`
      ).toBe(identityObservable)
      const badIdentity = identityRows.filter((r) => Math.abs(r.deltaPt) > TOLERANCE_PT)
      expect(
        badIdentity,
        `${label}: identity height predicted != rendered for ${JSON.stringify(badIdentity)}`
      ).toEqual([])
      return diff
    }

    it('the shipped scaffold (Bruce Wayne, with photo): every section height matches the render exactly', () => {
      const templateDir = path.join(ROOT, 'template', 'cv-content')
      const read = (f) => load(readFileSync(path.join(templateDir, f), 'utf8'))
      const content = {
        personal: read('personal.yaml'),
        profilePhoto: detectProfilePhoto(templateDir),
        summary: read('summary.yaml'),
        experience: read('experience.yaml'),
        config: read('config.yaml'),
        achievements: read('achievements.yaml'),
        education: read('education.yaml'),
        certifications: read('certifications.yaml'),
        competencies: read('competencies.yaml'),
        languages: read('languages.yaml'),
        publications: read('publications.yaml'),
        referees: read('referees.yaml')
      }
      const dir = mkFixtureDir('sidebar-diff-scaffold')
      // Copy the scaffold verbatim so the render sees the real photo, then diff.
      cpSync(templateDir, path.join(dir, 'cv-content'), { recursive: true })
      const { rows } = check('scaffold', dir, content)
      // Spelled out directly (not only inside check()) so this test can never
      // pass by measuring nothing: the scaffold has enough sidebar content that
      // several interior sections must be reachable.
      expect(rows.length).toBeGreaterThanOrEqual(4)
      expect(rows.map((r) => r.deltaPt)).toEqual(rows.map(() => 0))
      console.log(
        `  scaffold: ${rows.length} section heights verified against the render, max |delta| = ${Math.max(
          ...rows.map((r) => Math.abs(r.deltaPt))
        )}pt`
      )
      cleanupFixtureDirs()
    }, 30000)

    // Fixtures chosen to exercise every section builder at both "one" and "many"
    // item counts, plus the referees placeholder and a label-less long link.
    // `identityObservable: false` on pw-09 is not a waiver — it records a known,
    // still-open fact: pw-09's first experience entry (645.8pt) is taller than
    // page 1's residual budget after a 422pt summary, so the packer places it
    // anyway (Invariant 0: never drop) and it flows onto one extra physical
    // sheet. That is the item-splitting slice's job, not the sidebar's.
    for (const { id, identityObservable } of [
      { id: 'risk-tall-sidebar-short-main', identityObservable: true },
      { id: 'pw-09', identityObservable: false },
      { id: 'pw-12', identityObservable: true },
      { id: 'edge-one-entry-sections', identityObservable: true },
      { id: 'edge-explicit-empty-referees', identityObservable: true },
      { id: 'edge-labelless-long-url', identityObservable: true }
    ]) {
      it(`${id}: every section height matches the render exactly`, () => {
        const spec = buildFixturePlan().fixtures.find((f) => f.id === id)
        expect(spec, `fixture ${id} vanished from the plan`).toBeTruthy()
        const content = buildContent(spec)
        const dir = mkFixtureDir(`sidebar-diff-${id}`)
        writeFixtureContent(dir, content)
        check(id, dir, content, { identityObservable })
        cleanupFixtureDirs()
      }, 30000)
    }

    // `referees` is LAST in the built-in sidebar flow, so no section title ever
    // follows it and title-to-title differencing structurally cannot measure it.
    // A reordered layout (written into the fixture as layouts/two-column.yaml,
    // and normalized through the very same loadLayout.js the CLI uses, so the
    // plan and the render cannot disagree) puts a section after it.
    it('referees: height matches the render exactly, measured through a reordered sidebar flow', () => {
      const spec = buildFixturePlan().fixtures.find((f) => f.id === 'edge-one-entry-sections')
      const content = buildContent(spec)
      const dir = mkFixtureDir('sidebar-diff-referees')
      writeFixtureContent(dir, content)

      const rawLayout = {
        template: 'two-column',
        pages: {
          first: {
            sidebar: ['identity-photo', 'contact', 'referees', 'achievements'],
            main: ['summary', { spacer: 27 }, 'experience']
          },
          continuation: {
            sidebar: ['identity-compact', 'education', 'certifications', 'competencies'],
            main: ['experience:continued']
          },
          last: {
            sidebar: ['identity-compact', 'languages', 'publications'],
            main: ['experience:continued']
          }
        }
      }
      mkdirSync(path.join(dir, 'cv-content', 'layouts'), { recursive: true })
      writeFileSync(
        path.join(dir, 'cv-content', 'layouts', 'two-column.yaml'),
        dump(rawLayout, { lineWidth: -1 })
      )

      const { rows } = check('referees-reordered', dir, content, {
        layout: normalizeLayout(rawLayout)
      })
      const refereeRow = rows.find((r) => r.key === 'referees')
      expect(refereeRow, `referees was still not measurable: ${JSON.stringify(rows)}`).toBeTruthy()
      expect(refereeRow?.deltaPt).toBe(0)
      cleanupFixtureDirs()
    }, 30000)

    // The EIGHT-referee, 580.36pt block is the single measurement that drives
    // both of C3a's page-count regressions (pw-12, risk-tall-sidebar-short-main):
    // atomic, taller than most of a page, and dominated by the per-entry ruled
    // separator (dividerHeight + 2 x sectionGap). Nothing in the committed suite
    // differenced it before — referees is last in the built-in flow, so it was
    // always the undifferenceable page tail. Same reordering trick, many entries.
    it("referees with EIGHT entries — the ~580pt block driving C3a's page-count regressions — matches the render exactly", () => {
      const spec = buildFixturePlan().fixtures.find((f) => f.id === 'edge-one-entry-sections')
      const content = {
        ...buildContent(spec),
        referees: Array.from({ length: 8 }, (_, i) => ({
          name: `Referee ${i}`,
          title: `Title ${i}`,
          company: `Company ${i}`,
          email: `referee${i}@example.com`,
          phone: '+1 (555) 010-0200'
        }))
      }
      const dir = mkFixtureDir('sidebar-diff-referees-many')
      writeFixtureContent(dir, content)

      // referees early, with a section after it so differencing has a following
      // title; the rest pushed onto the third page kind so page 2 stays feasible.
      const rawLayout = {
        template: 'two-column',
        pages: {
          first: {
            sidebar: ['identity-photo', 'contact'],
            main: ['summary', { spacer: 27 }, 'experience']
          },
          // `languages` (one item, ~60pt) is small enough to share page 2 with
          // the ~580pt referees block, which is what gives referees a following
          // title to be differenced against.
          continuation: {
            sidebar: ['identity-compact', 'referees', 'languages'],
            main: ['experience:continued']
          },
          last: {
            sidebar: [
              'identity-compact',
              'education',
              'certifications',
              'competencies',
              'publications',
              'achievements'
            ],
            main: ['experience:continued']
          }
        }
      }
      mkdirSync(path.join(dir, 'cv-content', 'layouts'), { recursive: true })
      writeFileSync(
        path.join(dir, 'cv-content', 'layouts', 'two-column.yaml'),
        dump(rawLayout, { lineWidth: -1 })
      )

      const { rows } = check('referees-x8', dir, content, {
        layout: normalizeLayout(rawLayout)
      })
      const row = rows.find((r) => r.key === 'referees')
      expect(row, `referees x8 not measurable: ${JSON.stringify(rows)}`).toBeTruthy()
      expect(row?.deltaPt).toBe(0)
      // ...and it really is the big atomic block the regressions are about.
      expect(Number(row?.observed)).toBeGreaterThan(500)
      cleanupFixtureDirs()
    }, 30000)
  }
)
