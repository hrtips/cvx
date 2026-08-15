// I3 — R-F: warning messages name conditions and prices, never edits (RED FIRST).
//
// The ruling (ARCHITECTURE §7.1 R-F, recorded in §7.2 as overturning the v2
// wording): a diagnostic states what is true and what it costs. What to DO
// about it is judgement, and judgement belongs to the LLM and the user — the
// skill teaches the moves, the instrument prices them. A message that says
// "shorten the summary" is CVX holding an opinion about someone's CV.
//
// This is not a style rule. The same sentence appears in two places with two
// different authorities behind it: SKILL.md saying "shorten the summary" is a
// designer advising a client; layoutDiagnostics saying it is a ruler telling
// you what to cut. The numbers survive the sweep — `shortByPt` is a fact, and
// the whole point of publishing it is that it converts a condition into an
// exact quantity the caller can act on however they choose.
//
// Scope (every message-bearing surface the engine owns):
//   · layoutDiagnostics warnings — page1-ends-early, page1-no-experience,
//     experience-empty, main-slot-unmeasured, main-column-empty (new in I3)
//   · layout.js overflowWarnings — both regimes, incl. the fixedTooTall one
//     that I2 made newly reachable on student CVs
//   · validateContent's overflow suggestion, which restates the same advice
//
// The new fact this increment adds is asserted in mainColumnEmpty.test.js;
// this file is the policy net across all of them.

import { describe, expect, it } from 'vitest'
import { overflowWarnings, planTwoColumn } from './layout.js'
import { layoutDiagnostics } from './layoutDiagnostics.js'

/**
 * Imperative edit advice: a verb telling the reader to change their content.
 *
 * Deliberately NOT matched: the same words as NOUNS ("shortening it by 12pt
 * would start it on page 1" is a price, "shorten it" is an instruction), and
 * every number — prices are the point.
 */
const IMPERATIVE_VERB =
  '(shorten|shortening|trim|cut|delete|remove|drop|move|add|rewrite|reword|check|fix|report)'
const IMPERATIVES = new RegExp(
  [
    // A bare verb opening a sentence or clause — the imperative mood itself.
    // "Shorten the summary" matches; "no pagination can move it" does not,
    // because there the verb is a claim about the engine, addressed to nobody.
    `(?:^|[.;:—-]\\s+|\\b(?:so|then|and)\\s+)${IMPERATIVE_VERB}\\b`,
    // Second-person direction, however it is phrased.
    '\\byou (?:should|can|could|need to|will want)\\b',
    '\\braise it with\\b',
    '\\bmake the edit\\b',
    '\\bthe fix is\\b',
    '\\bis a content decision\\b'
  ].join('|'),
  'i'
)

const PERSONAL = { name: 'Alpha Tester', title: 'Engineer' }
const SIDEBAR = {
  personal: PERSONAL,
  competencies: ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'],
  education: [{ degree: 'BSc Testing', institution: 'Harness University', period: '2010 – 2014' }]
}

const line = (/** @type {number} */ n, /** @type {number} */ words = 12) =>
  Array.from({ length: words }, (_, i) => `word${i}${n}`).join(' ')

/** Bullets long enough to wrap, so heights are realistic. */
const bullets = (/** @type {number} */ n) =>
  Array.from({ length: n }, (_, i) => `Delivered subsystem ${i + 1}: ${line(i, 14)}.`)

const ROLE = (/** @type {number} */ i = 0) => ({
  role: `Alpha Engineer ${i}`,
  company: `Bravo Systems ${i}`,
  period: '2020 – 2024',
  bullets: bullets(4)
})

/** Content shapes that between them reach every message regime in the engine. */
const SHAPES = {
  'page1-ends-early / actionable': {
    experience: [ROLE(1), ROLE(2), ROLE(3)],
    summary: Array.from({ length: 6 }, (_, i) => `Summary line ${i}: ${line(i, 16)}.`),
    ...SIDEBAR
  },
  'page1-ends-early / not actionable': {
    experience: [ROLE(1), ROLE(2), ROLE(3)],
    summary: [`Summary: ${line(1, 10)}.`],
    ...SIDEBAR
  },
  'page1-no-experience': {
    experience: [ROLE(1), ROLE(2)],
    summary: Array.from({ length: 22 }, (_, i) => `Summary line ${i}: ${line(i, 16)}.`),
    ...SIDEBAR
  },
  'experience-empty': { experience: [], summary: [`Summary: ${line(1, 16)}.`], ...SIDEBAR },
  'overflow / fixedTooTall (student shape)': {
    experience: [],
    summary: Array.from({ length: 40 }, (_, i) => `Summary line ${i}: ${line(i, 16)}.`),
    ...SIDEBAR
  },
  'overflow / one oversized block': {
    // ONE bullet taller than a whole page: the irreducible residual (G7). 60
    // ordinary bullets split cleanly and warn about nothing, which is the
    // packer working — the shape that overflows is a block with no legal cut.
    experience: [{ ...ROLE(1), bullets: [`Monolith: ${line(9, 1400)}.`] }],
    summary: [`Summary: ${line(1, 10)}.`],
    ...SIDEBAR
  },
  'main-slot-unmeasured': {
    experience: [],
    summary: [`Summary: ${line(1, 16)}.`],
    ...SIDEBAR
  }
}

const LAYOUT_WITH_MAIN_SECTION = {
  first: { sidebar: ['identity-photo', 'contact'], main: ['summary', 'education'] },
  continuation: { sidebar: ['identity-compact'], main: ['experience:continued'] },
  last: { sidebar: ['identity-compact'], main: ['experience:continued'] }
}

describe('R-F — every engine warning names its condition and price, never an edit', () => {
  for (const [name, content] of Object.entries(SHAPES)) {
    it(`${name}: no imperative advice`, () => {
      const layout = name === 'main-slot-unmeasured' ? LAYOUT_WITH_MAIN_SECTION : undefined
      const plan = planTwoColumn({ content, layout })
      const d = layoutDiagnostics(plan)
      // overflowWarnings returns its own inline shape (no `code`); both are
      // message-bearing surfaces, which is what this policy is about.
      const all = /** @type {{code?: string, message: string}[]} */ ([
        ...(d?.warnings ?? []),
        ...overflowWarnings(plan).map((w) => ({ ...w, code: 'overflow' }))
      ])
      // The shape must actually produce something, or this is vacuous.
      expect(
        all.length,
        `${name} produced no warnings — the fixture stopped reaching the shape`
      ).toBeGreaterThan(0)
      for (const w of all) {
        expect(w.message, `${w.code}: "${w.message}"`).not.toMatch(IMPERATIVES)
      }
    })
  }

  it('the prices survive the sweep — they are the reason the facts are worth having', () => {
    const plan = planTwoColumn({ content: SHAPES['page1-ends-early / actionable'] })
    const w = layoutDiagnostics(plan)?.warnings.find((x) => x.code === 'page1-ends-early')
    expect(w).toBeDefined()
    // Structured numbers: untouched by the wording change.
    expect(w?.shortByPt).toBeGreaterThan(0)
    expect(w?.fixedPt).toBeGreaterThan(0)
    // And the message still QUOTES the number — a fact without its price is
    // not more honest, just less useful.
    expect(w?.message).toContain(String(w?.shortByPt))
  })

  it('the messages still say WHAT is true, not merely that something is', () => {
    const plan = planTwoColumn({ content: SHAPES['page1-no-experience'] })
    const w = layoutDiagnostics(plan)?.warnings.find((x) => x.code === 'page1-no-experience')
    expect(w).toBeDefined()
    // The condition, named. (This is the half R-F keeps.)
    expect(w?.message).toMatch(/no experience entries|no work history/i)
    expect(w?.message.length).toBeGreaterThan(60)
  })
})

describe('R-F — validate restates the diagnostics without adding advice', () => {
  it('the overflow suggestion prices the condition rather than prescribing a cut', async () => {
    const { validateContent } = await import('./validateContent.js')
    // Reached through the real validate path in test/validateContent.test.js;
    // here we only pin the SUGGESTION TEXT, which is the R-F surface.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./validateContent.js', import.meta.url), 'utf8')
    )
    const suggestions = [...src.matchAll(/suggestion:\s*`([^`]*)`/g)].map((m) => m[1])
    const overflowOnes = suggestions.filter((s) => /page \$\{w\.page\}|render/.test(s))
    expect(overflowOnes.length).toBeGreaterThan(0)
    for (const s of overflowOnes) {
      expect(s, `validate suggestion: "${s}"`).not.toMatch(IMPERATIVES)
    }
    expect(typeof validateContent).toBe('function')
  })
})
