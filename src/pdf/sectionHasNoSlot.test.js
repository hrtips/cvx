// The 1.8.0 dogfood's headline defect: a populated section that no layout slot
// renders is dropped from the designed PDF in silence.
//
// Reproduced on the SHIPPED DEFAULT before it was fixed: `referees.yaml` with a
// real referee in it gave `validate --strict` ok / 0 errors / 0 warnings, a
// build with no warning, one hit in the ATS PDF and zero in the designed one.
// `layouts/two-column.yaml` omits the `referees` slot deliberately (~231pt), so
// every user of the shipped layout who fills that file in lost it.
//
// Why it evaded everything: each existing content guard watches text that
// reached the packer. INV-0's oracles check that placed blocks render;
// `slot-not-renderable` (D2) checks a key IN a slot that cannot draw it. Nothing
// watched content the layout never handed the packer at all.
//
// The fix is disclosure, not placement: a section with no slot has no position,
// and inventing one would override the designer (§7.3). What is unacceptable is
// the user not knowing the two deliverables differ.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import { planTwoColumn, SIDEBAR_SECTION_KEYS } from './layout.js'
import { layoutDiagnostics } from './layoutDiagnostics.js'
import { normalizeLayout } from './loadLayout.js'

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))

/** The layout the scaffold actually ships — the one that omits `referees`. */
const shippedLayout = () =>
  /** @type {any} */ (
    normalizeLayout(
      /** @type {any} */ (
        load(
          readFileSync(
            path.join(ROOT, 'template', 'cv-content', 'layouts', 'two-column.yaml'),
            'utf8'
          )
        )
      )
    )
  )

const REFEREE = { name: 'Alpha Referee', title: 'Director', company: 'Bravo Institute' }
const base = (extra = {}) => ({
  personal: { name: 'Alpha Tester', title: 'Engineer' },
  summary: ['A summary line long enough to occupy a little of the column.'],
  experience: [],
  ...extra
})

const codesOf = (/** @type {any} */ d) => (d?.warnings ?? []).map((/** @type {any} */ w) => w.code)
const factOf = (/** @type {any} */ d) =>
  (d?.warnings ?? []).find((/** @type {any} */ w) => w.code === 'section-has-no-slot')

describe('section-has-no-slot — the shipped-default silent drop', () => {
  it('fires on the exact reported shape: a populated referees.yaml on the shipped layout', () => {
    const plan = planTwoColumn({ content: base({ referees: [REFEREE] }), layout: shippedLayout() })
    expect(plan.unplacedSections).toEqual(['referees'])
    const w = factOf(layoutDiagnostics(plan))
    expect(w).toBeDefined()
    expect(w.kind).toBe('defect')
    expect(w.keys).toEqual(['referees'])
    // It names where the content DID go, which is the actionable half: the two
    // deliverables differ, and that is the thing a user cannot otherwise see.
    expect(w.message).toMatch(/ATS/)
    expect(w.message).toMatch(/designed/)
  })

  it('stays silent when the file is empty — dropping the fallback line is documented intent', () => {
    const plan = planTwoColumn({ content: base({ referees: [] }), layout: shippedLayout() })
    expect(plan.unplacedSections).toEqual([])
    expect(codesOf(layoutDiagnostics(plan))).not.toContain('section-has-no-slot')
  })

  it('stays silent when the section IS slotted', () => {
    const layout = shippedLayout()
    layout.first.sidebar = [...layout.first.sidebar, 'referees']
    const plan = planTwoColumn({ content: base({ referees: [REFEREE] }), layout })
    expect(plan.unplacedSections).toEqual([])
  })

  it('is not referees-specific — any populated section with no slot reports', () => {
    // The dogfood proved the generality by deleting the `languages` slot; this
    // asserts it over every renderable sidebar section at once.
    const layout = shippedLayout()
    layout.first.sidebar = ['identity-photo', 'contact']
    layout.continuation.sidebar = ['identity-compact']
    layout.last.sidebar = ['identity-compact']
    const content = base({
      referees: [REFEREE],
      languages: [{ name: 'Sinhala', level: 'Native' }],
      certifications: [{ name: 'A certification', issuer: 'Body' }],
      publications: [{ title: 'A paper' }],
      achievements: [{ title: 'An award' }],
      education: [{ degree: 'BSc', institution: 'University' }],
      competencies: ['Alpha', 'Bravo']
    })
    const plan = planTwoColumn({ content, layout })
    // Every populated section is reported, and `contact` is not — it has a slot,
    // and its content comes from personal.yaml.
    // Order follows the packer's own key list, not the content file order —
    // it is the list the fact is derived from, so it is the list to assert.
    expect(plan.unplacedSections).toEqual([
      'achievements',
      'education',
      'certifications',
      'publications',
      'languages',
      'competencies',
      'referees'
    ])
    expect(plan.unplacedSections).not.toContain('contact')
  })

  it('never reports the main flow, identity, or metadata', () => {
    // summary/experience are placed by the main slots; personal is drawn by the
    // identity and contact slots; keywords is metadata that is never drawn.
    const layout = shippedLayout()
    const plan = planTwoColumn({
      content: base({
        experience: [{ role: 'R', company: 'C', period: '2020', bullets: ['b'] }],
        keywords: ['alpha']
      }),
      layout
    })
    for (const k of ['summary', 'experience', 'personal', 'keywords', 'config']) {
      expect(plan.unplacedSections).not.toContain(k)
    }
  })

  it('reports defects before facts', () => {
    const plan = planTwoColumn({ content: base({ referees: [REFEREE] }), layout: shippedLayout() })
    const ws = layoutDiagnostics(plan)?.warnings ?? []
    const firstFact = ws.findIndex((w) => w.kind === 'fact')
    const thisOne = ws.findIndex((w) => w.code === 'section-has-no-slot')
    expect(thisOne).toBeGreaterThanOrEqual(0)
    expect(firstFact).toBeGreaterThanOrEqual(0) // the fixture reaches both kinds
    expect(thisOne).toBeLessThan(firstFact)
  })

  it('covers every renderable sidebar section — the list cannot drift from the packer', () => {
    // Derived from the packer's own key list, so a new section type is covered
    // the day it exists rather than the day someone remembers this test.
    const layout = shippedLayout()
    layout.first.sidebar = ['identity-photo']
    layout.continuation.sidebar = ['identity-compact']
    layout.last.sidebar = ['identity-compact']
    for (const key of SIDEBAR_SECTION_KEYS) {
      if (key === 'contact') continue // drawn from personal.yaml by its own slot
      const plan = planTwoColumn({
        content: base({ [key]: [{ name: 'x', title: 'y', degree: 'z', level: 'w' }] }),
        layout
      })
      expect(plan.unplacedSections, `${key} went unreported`).toContain(key)
    }
  })
})
