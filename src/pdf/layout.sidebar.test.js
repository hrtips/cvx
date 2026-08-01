// C3a — the two-flow engine: the generic front-load packer, the sidebar
// measurement layer, and the coordinator that takes P = max(P_main, P_sidebar).
//
// Two tiers, deliberately:
//   1. `packBlocks` on synthetic blocks — pure arithmetic, no fonts, so the
//      contract (placed exactly once / in order / gap only for non-first /
//      never dropped even when it cannot fit) is pinned independently of any
//      measurement.
//   2. the sidebar measurement + coordinator with the REAL fontkit measurer.
//      The absolute pt values asserted here were read off a real render with
//      `pdftotext -bbox` (see test/layout-harness/sidebarMeasureDiff.js, which
//      re-derives them from a rendered PDF end to end) — they are ground
//      truth, not self-consistent regression snapshots of this same code.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TWO_COLUMN_LAYOUT } from './defaultLayouts.js'
import {
  bodyHeight,
  deriveMetrics,
  deriveSidebarMetrics,
  identityH,
  packBlocks,
  packSidebar,
  planTwoColumn,
  sidebarFlowKeys,
  sidebarSectionH,
  summaryH
} from './layout.js'
import { createMeasurer } from './measure.js'
import { tealTheme } from './themes/teal.js'

const FONTS = path.join(
  path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
  'src',
  'fonts'
)
const measure = createMeasurer(FONTS)
const sm = deriveSidebarMetrics(tealTheme)

/** Six wrapping bullets — enough that a dozen entries need continuation pages. */
const BULLETS = Array.from(
  { length: 6 },
  (_, j) => `A reasonably long bullet number ${j} describing the work in some detail.`
)

// ── Tier 1: the generic engine ──────────────────────────────────────────────

describe('packBlocks (front-load first-fit)', () => {
  const blocks = (/** @type {number[]} */ heights, gapBefore = 0) =>
    heights.map((height, i) => ({ id: `b${i}`, height, gapBefore }))

  it('fills each page with as many leading blocks as fit, then starts a new one', () => {
    const pages = packBlocks(blocks([40, 40, 40, 40]), () => 100)
    expect(pages.map((p) => p.blocks.map((b) => b.id))).toEqual([
      ['b0', 'b1'],
      ['b2', 'b3']
    ])
    expect(pages.map((p) => p.used)).toEqual([80, 80])
    expect(pages.map((p) => p.budget)).toEqual([100, 100])
  })

  it('charges gapBefore only to non-first blocks on a page', () => {
    // 3 x 30 + 2 gaps of 10 = 110 > 100, so only two fit (30 + 10 + 30 = 70).
    const pages = packBlocks(blocks([30, 30, 30], 10), () => 100)
    expect(pages.map((p) => p.blocks.length)).toEqual([2, 1])
    expect(pages.map((p) => p.used)).toEqual([70, 30])
  })

  it('honours a per-page budget function (page 1 tighter than the rest)', () => {
    const pages = packBlocks(blocks([50, 50, 50]), (i) => (i === 0 ? 60 : 200))
    expect(pages.map((p) => p.blocks.map((b) => b.id))).toEqual([['b0'], ['b1', 'b2']])
  })

  it('places a block too tall for any page rather than dropping it (Invariant 0), and terminates', () => {
    const pages = packBlocks(blocks([500, 20]), () => 100)
    expect(pages.map((p) => p.blocks.map((b) => b.id))).toEqual([['b0'], ['b1']])
    // The over-tall page reports the truth: used > budget. It FLOWS in the
    // render (react-pdf's wrap:true), it is never clipped.
    expect(pages[0].used).toBe(500)
    expect(pages[0].budget).toBe(100)
  })

  it('places every block exactly once, in order, across a long ragged flow', () => {
    const heights = [10, 90, 15, 15, 70, 5, 200, 12]
    const pages = packBlocks(blocks(heights, 5), (i) => (i === 0 ? 50 : 100))
    const placed = pages.flatMap((p) => p.blocks.map((b) => b.id))
    expect(placed).toEqual(heights.map((_, i) => `b${i}`))
  })

  it('returns no pages at all for an empty flow', () => {
    expect(packBlocks([], () => 100)).toEqual([])
  })

  it('rejects a policy it does not implement rather than silently front-loading', () => {
    expect(() =>
      packBlocks(blocks([10]), () => 100, /** @type {'frontload'} */ ('balance'))
    ).toThrow(/unsupported policy "balance"/)
  })
})

describe('bodyHeight — the single box both columns are budgeted against', () => {
  it('is pageHeight - topBar, and is the same number deriveMetrics reports', () => {
    expect(bodyHeight(tealTheme)).toBe(tealTheme.geometry.pageHeight - tealTheme.geometry.topBar)
    expect(deriveMetrics(tealTheme).bodyH).toBe(bodyHeight(tealTheme))
  })

  it('defaults to the teal theme when none is given (isomorphic browser path)', () => {
    expect(bodyHeight(undefined)).toBe(bodyHeight(tealTheme))
  })
})

// ── Tier 2: sidebar measurement, against render-verified pt values ──────────

const PERSONAL = {
  name: 'Jordan Rivera',
  title: 'Senior Programme Lead',
  company: 'Example Holdings',
  phone: '+1 (555) 010-0100',
  email: 'jordan.rivera@example.com',
  linkedin: 'linkedin.com/in/jordanrivera',
  location: 'Springfield'
}

/** The exact content of the pw-09 fixture's sidebar, whose real render was measured with `pdftotext -bbox`. */
const CONTENT = {
  personal: PERSONAL,
  summary: [],
  experience: [],
  achievements: [{ year: 'Award 0', text: '— Example Body 0' }],
  education: Array.from({ length: 3 }, (_, i) => ({
    degree: `Degree ${i}`,
    institution: `Institution ${i}`,
    period: `19${90 + i} – 19${94 + i}`
  })),
  certifications: [{ name: 'Certification 0', issuer: 'Issuer 0', year: '2000' }],
  competencies: Array.from({ length: 8 }, (_, i) => `Competency ${i}`),
  languages: Array.from({ length: 8 }, (_, i) => ({
    language: `Language ${i}`,
    proficiency: ['Native', 'Professional', 'Conversational', 'Basic'][i % 4]
  })),
  publications: [{ title: 'Publication 0', venue: 'Venue 0', year: '2000' }],
  referees: []
}

describe('sidebar geometry', () => {
  it('derives the column, content and identity widths from the theme', () => {
    const g = tealTheme.geometry
    expect(sm.colW).toBeCloseTo(g.pageWidth * g.sidebarFraction, 10)
    expect(sm.innerW).toBeCloseTo(sm.colW - g.sidebarPad.left - g.sidebarPad.right, 10)
    expect(sm.identityW).toBeCloseTo(
      sm.colW - tealTheme.chrome.identityPl - tealTheme.chrome.identityPr,
      10
    )
    // buildSidebar's inter-section rule: dividerHeight + sectionGap
    expect(sm.sectionDividerH).toBe(tealTheme.chrome.dividerHeight + tealTheme.spacing.sectionGap)
  })

  it('defaults to the teal theme when none is given', () => {
    expect(deriveSidebarMetrics(undefined)).toEqual(sm)
  })
})

describe('sidebarSectionH — matches the pt offsets read out of a real render', () => {
  // Ground truth (pw-09, `pdftotext -bbox`): consecutive sidebar section titles
  // sit exactly sectionHeight + 14.25 (the divider) apart. E.g. EDUCATION at
  // y=115.95 and CERTIFICATIONS at y=303.55 => education is 173.35pt tall.
  const cases = [
    ['contact', 101.65],
    ['achievements', 54.3],
    ['education', 173.35],
    ['certifications', 76.55],
    ['competencies', 85.15],
    ['languages', 255.05],
    ['publications', 66.8]
  ]
  for (const [key, expected] of cases) {
    it(`${key} = ${expected}pt`, () => {
      expect(sidebarSectionH(String(key), CONTENT, sm, measure)).toBe(expected)
    })
  }

  it('referees renders the "available upon request" line when there are none (28.75pt)', () => {
    expect(sidebarSectionH('referees', CONTENT, sm, measure)).toBe(28.75)
  })

  it('referees grows with real entries and their ruled separators', () => {
    const one = sidebarSectionH(
      'referees',
      { ...CONTENT, referees: [{ name: 'A B', title: 'T', company: 'C', email: 'a@b.co' }] },
      sm,
      measure
    )
    const two = sidebarSectionH(
      'referees',
      {
        ...CONTENT,
        referees: [
          { name: 'A B', title: 'T', company: 'C', email: 'a@b.co' },
          { name: 'C D', title: 'T', company: 'C', phone: '+1' }
        ]
      },
      sm,
      measure
    )
    expect(Number(two)).toBeGreaterThan(Number(one))
    // exactly one separator between two entries
    expect(Number(two) - Number(one)).toBeGreaterThan(tealTheme.spacing.sectionGap * 2)
  })

  it('returns null — not 0 — for a section that renders nothing, so it earns no divider', () => {
    for (const key of [
      'achievements',
      'education',
      'certifications',
      'publications',
      'languages',
      'competencies'
    ]) {
      expect(
        sidebarSectionH(key, { personal: PERSONAL, summary: [], experience: [] }, sm, measure)
      ).toBe(null)
    }
  })

  it('returns null for an unknown slot key (registry.js renders nothing for it)', () => {
    expect(sidebarSectionH('not-a-section', CONTENT, sm, measure)).toBe(null)
  })

  it('contact counts one row per present field, including personal.links', () => {
    const base = sidebarSectionH('contact', CONTENT, sm, measure)
    const withLink = sidebarSectionH(
      'contact',
      { ...CONTENT, personal: { ...PERSONAL, links: [{ href: 'https://x.example', label: 'X' }] } },
      sm,
      measure
    )
    const withFacebook = sidebarSectionH(
      'contact',
      { ...CONTENT, personal: { ...PERSONAL, facebook: 'fb.com/x' } },
      sm,
      measure
    )
    // one extra 7.5pt/1.4 row + its 6.75 marginBottom = 17.25
    expect(Number(withLink) - Number(base)).toBeCloseTo(17.25, 6)
    expect(Number(withFacebook) - Number(base)).toBeCloseTo(17.25, 6)
  })

  it('a competency pill wider than the whole column takes a row of its own and wraps its label', () => {
    const long = 'Enterprise Security Architecture and Regulatory Compliance Programme Leadership'
    const h = sidebarSectionH('competencies', { ...CONTENT, competencies: [long] }, sm, measure)
    const oneShort = sidebarSectionH(
      'competencies',
      { ...CONTENT, competencies: ['A'] },
      sm,
      measure
    )
    expect(Number(h)).toBeGreaterThan(Number(oneShort))
  })

  it('a competency pill that EXACTLY fills the remaining width stays on the row (the knife-edge the quantized wrap comparison protects)', () => {
    // Construct a second pill whose width lands exactly on the remaining space:
    // remaining = innerW - firstTagW - tagGap, and tagW = textWidth + 2*tagPx.
    const first = 'Alpha'
    const pad = tealTheme.chrome.tagPx * 2
    const firstW =
      measure.widthOf(first, tealTheme.typography.tag.size, {
        weight: tealTheme.typography.tag.weight
      }) + pad
    const remaining = sm.innerW - firstW - tealTheme.chrome.tagGap
    // Grow a label until it just exceeds the remaining space, then step back one
    // character: `exact` is the widest label that still fits on row 1.
    let label = 'B'
    while (
      measure.widthOf(label, tealTheme.typography.tag.size, {
        weight: tealTheme.typography.tag.weight
      }) +
        pad <=
      remaining
    ) {
      label += 'i'
    }
    const exact = label.slice(0, -1)
    const oneRow = sidebarSectionH(
      'competencies',
      { ...CONTENT, competencies: [first, exact] },
      sm,
      measure
    )
    const twoRows = sidebarSectionH(
      'competencies',
      { ...CONTENT, competencies: [first, `${label}i`] },
      sm,
      measure
    )
    // Same title, same pills — the only difference is whether the second pill
    // wrapped, i.e. exactly one tag row height + one rowGap.
    expect(Number(twoRows) - Number(oneRow)).toBeCloseTo(
      tealTheme.typography.tag.size * 1.2 + tealTheme.chrome.tagPy * 2 + tealTheme.chrome.tagGap,
      6
    )
  })

  it('a single unbreakable token wider than the column stays one line (hyphenation is disabled app-wide — it overflows, it is never cut)', () => {
    const h = sidebarSectionH(
      'competencies',
      { ...CONTENT, competencies: ['A'.repeat(400)] },
      sm,
      measure
    )
    expect(h).toBe(
      sidebarSectionH('competencies', { ...CONTENT, competencies: ['A'] }, sm, measure)
    )
  })

  it('works with no measurer at all (isomorphic browser fallback) — looser, still finite and ordered', () => {
    const approx = sidebarSectionH('education', CONTENT, sm, undefined)
    expect(approx).toBeGreaterThan(0)
    expect(sidebarSectionH('languages', CONTENT, sm, undefined)).toBeGreaterThan(Number(approx))
    // the tag path's width fallback is exercised too
    expect(sidebarSectionH('competencies', CONTENT, sm, undefined)).toBeGreaterThan(0)
  })
})

describe('identityH — matches the pt offsets read out of a real render', () => {
  it('identity-photo without a photo is 67.95pt (nameBlock only)', () => {
    expect(identityH(['identity-photo'], CONTENT, sm, measure)).toBe(67.95)
  })

  it('identity-photo with a photo adds photoHeight + photoPb', () => {
    expect(identityH(['identity-photo'], { ...CONTENT, profilePhoto: 'x' }, sm, measure)).toBe(
      67.95 + tealTheme.chrome.photoHeight + tealTheme.chrome.photoPb
    )
  })

  it('identity-compact is 72.45pt (symmetric identityPt padding)', () => {
    expect(identityH(['identity-compact'], CONTENT, sm, measure)).toBe(72.45)
  })

  it('ignores non-identity keys and an empty key list', () => {
    expect(identityH([], CONTENT, sm, measure)).toBe(0)
    expect(identityH(['contact'], CONTENT, sm, measure)).toBe(0)
  })

  it('still measures the title/company lines when personal omits them (an empty Text still occupies a line)', () => {
    expect(
      identityH(['identity-compact'], { ...CONTENT, personal: { name: 'X' } }, sm, measure)
    ).toBe(72.45)
  })

  it('tolerates a content bag with no personal block at all', () => {
    expect(
      identityH(
        ['identity-compact'],
        /** @type {import('./types.js').CVContent} */ (
          /** @type {unknown} */ ({ summary: [], experience: [] })
        ),
        sm,
        measure
      )
    ).toBe(72.45)
  })
})

// ── Tier 2: packSidebar + the coordinator ───────────────────────────────────

describe('sidebarFlowKeys', () => {
  it('is every sidebar section in layout reading order, identity slots removed, deduplicated', () => {
    expect(sidebarFlowKeys(TWO_COLUMN_LAYOUT)).toEqual([
      'contact',
      'achievements',
      'education',
      'certifications',
      'competencies',
      'languages',
      'publications',
      'referees'
    ])
  })

  it('is empty for a layout with no sidebar at all', () => {
    expect(sidebarFlowKeys({ first: { main: ['summary'] } })).toEqual([])
    expect(sidebarFlowKeys(undefined)).toEqual([])
  })
})

describe('packSidebar', () => {
  const keys = sidebarFlowKeys(TWO_COLUMN_LAYOUT)

  it('budgets page 1 against identity-photo and later pages against identity-compact', () => {
    const noPhoto = packSidebar(keys, CONTENT, TWO_COLUMN_LAYOUT, tealTheme, measure)
    const withPhoto = packSidebar(
      keys,
      { ...CONTENT, profilePhoto: 'x' },
      TWO_COLUMN_LAYOUT,
      tealTheme,
      measure
    )
    const b = bodyHeight(tealTheme)
    const pad = tealTheme.geometry.sidebarPad.top + tealTheme.geometry.sidebarPad.bottom
    expect(noPhoto.pageMetrics[0].budget).toBeCloseTo(b - 67.95 - pad - tealTheme.spacing.safety, 6)
    expect(withPhoto.pageMetrics[0].budget).toBeCloseTo(
      b -
        (67.95 + tealTheme.chrome.photoHeight + tealTheme.chrome.photoPb) -
        pad -
        tealTheme.spacing.safety,
      6
    )
    // continuation pages get the (much smaller) compact identity
    expect(noPhoto.pageMetrics[1].budget).toBeCloseTo(b - 72.45 - pad - tealTheme.spacing.safety, 6)
    // ...so the photo page holds strictly fewer sections
    expect(withPhoto.pages[0].length).toBeLessThan(noPhoto.pages[0].length)
  })

  it('never places a section twice and never drops one', () => {
    const packed = packSidebar(keys, CONTENT, TWO_COLUMN_LAYOUT, tealTheme, measure)
    const placed = packed.pages.flat()
    expect(placed).toEqual([
      'contact',
      'achievements',
      'education',
      'certifications',
      'competencies',
      'languages',
      'publications',
      'referees'
    ])
  })

  it('keeps no page over budget while sections still fit', () => {
    const packed = packSidebar(keys, CONTENT, TWO_COLUMN_LAYOUT, tealTheme, measure)
    for (const { used, budget } of packed.pageMetrics) expect(used).toBeLessThanOrEqual(budget)
  })

  it('places a single over-tall section alone, over budget, rather than dropping it (Invariant 0)', () => {
    const huge = {
      ...CONTENT,
      certifications: Array.from({ length: 60 }, (_, i) => ({
        name: `Certification ${i}`,
        issuer: `Issuer ${i}`,
        year: `${2000 + i}`
      }))
    }
    const packed = packSidebar(keys, huge, TWO_COLUMN_LAYOUT, tealTheme, measure)
    const page = packed.pages.findIndex((p) => p.includes('certifications'))
    expect(packed.pages[page]).toEqual(['certifications'])
    expect(packed.pageMetrics[page].used).toBeGreaterThan(packed.pageMetrics[page].budget)
    // and every other section is still placed exactly once
    expect(packed.pages.flat().filter((k) => k === 'certifications')).toHaveLength(1)
    expect(new Set(packed.pages.flat()).size).toBe(packed.pages.flat().length)
  })

  it('produces no pages when the flow is empty', () => {
    const packed = packSidebar([], CONTENT, TWO_COLUMN_LAYOUT, tealTheme, measure)
    expect(packed).toEqual({ pages: [], pageMetrics: [], totalPages: 0 })
  })
})

describe('planTwoColumn — P = max(P_main, P_sidebar)', () => {
  const experience = (/** @type {number} */ n) =>
    Array.from({ length: n }, (_, i) => ({
      role: `Role ${i}`,
      company: `Company ${i}`,
      period: 'p',
      bullets: BULLETS.map((b) => `${b} (role ${i})`)
    }))

  it('takes the sidebar page count when the sidebar is the longer flow', () => {
    const plan = planTwoColumn({
      content: { ...CONTENT, summary: ['One line.'], experience: experience(1) },
      layout: TWO_COLUMN_LAYOUT,
      theme: tealTheme,
      measure
    })
    expect(plan.mainPageCount).toBe(1)
    expect(plan.sidebarPageCount).toBeGreaterThan(1)
    expect(plan.totalPages).toBe(plan.sidebarPageCount)
    expect(plan.pages).toHaveLength(plan.totalPages)
  })

  it('takes the main page count when the main column is the longer flow, leaving the sidebar tail empty (the G1 residual)', () => {
    const plan = planTwoColumn({
      content: { ...CONTENT, summary: ['One line.'], experience: experience(8) },
      layout: TWO_COLUMN_LAYOUT,
      theme: tealTheme,
      measure
    })
    expect(plan.mainPageCount).toBeGreaterThan(plan.sidebarPageCount)
    expect(plan.totalPages).toBe(plan.mainPageCount)
    for (const page of plan.pages.slice(plan.sidebarPageCount)) {
      expect(page.sidebarKeys).toEqual([])
      expect(page.sidebarFill).toBe(null)
      // identity is still injected on every page — that is not "empty column"
      expect(page.identity).toEqual(['identity-compact'])
    }
  })

  it('injects identity-photo on page 1 and identity-compact after', () => {
    const plan = planTwoColumn({
      content: { ...CONTENT, summary: ['One line.'], experience: experience(4) },
      layout: TWO_COLUMN_LAYOUT,
      theme: tealTheme,
      measure
    })
    expect(plan.pages[0].identity).toEqual(['identity-photo'])
    for (const page of plan.pages.slice(1)) expect(page.identity).toEqual(['identity-compact'])
  })

  it('always plans at least one page, even for a CV with no experience and no sidebar', () => {
    const plan = planTwoColumn({
      content: { personal: PERSONAL, summary: [], experience: [] },
      layout: { first: { main: ['summary'] } },
      theme: tealTheme,
      measure
    })
    expect(plan.totalPages).toBe(1)
    expect(plan.pages[0].mainBlocks).toEqual([])
    expect(plan.pages[0].sidebarKeys).toEqual([])
    expect(plan.pages[0].mainFill).toBe(null)
  })

  it('defaults to the built-in two-column layout rather than planning an empty sidebar', () => {
    const plan = planTwoColumn({ content: CONTENT, theme: tealTheme, measure })
    expect(plan.pages[0].sidebarKeys.length).toBeGreaterThan(0)
    expect(plan.pages[0].identity).toEqual(['identity-photo'])
  })

  it("falls back to the last page kind's identity slot when a layout defines no continuation", () => {
    const plan = planTwoColumn({
      content: { ...CONTENT, summary: ['One line.'], experience: experience(6) },
      layout: {
        first: { sidebar: ['identity-photo', 'contact'], main: ['summary', 'experience'] },
        last: { sidebar: ['identity-compact', 'referees'], main: ['experience:continued'] }
      },
      theme: tealTheme,
      measure
    })
    expect(plan.pages[1].identity).toEqual(['identity-compact'])
  })

  it("falls back to page 1's identity slot when no later page kind defines one", () => {
    const plan = planTwoColumn({
      content: { ...CONTENT, summary: ['One line.'], experience: experience(6) },
      layout: {
        first: { sidebar: ['identity-photo', 'contact'], main: ['summary', 'experience'] }
      },
      theme: tealTheme,
      measure
    })
    expect(plan.pages[1].identity).toEqual(['identity-photo'])
  })

  it('reports per-page fill for both columns (the C0 front-load / over-budget signal)', () => {
    const plan = planTwoColumn({
      content: { ...CONTENT, summary: ['One line.'], experience: experience(4) },
      layout: TWO_COLUMN_LAYOUT,
      theme: tealTheme,
      measure
    })
    expect(plan.pages[0].mainFill).toMatchObject({
      used: expect.any(Number),
      budget: expect.any(Number)
    })
    expect(plan.pages[0].sidebarFill).toMatchObject({
      used: expect.any(Number),
      budget: expect.any(Number)
    })
  })

  it('honours a config-forced page-1 split and reports its (legitimately exceeded) page-1 budget', () => {
    const content = { ...CONTENT, summary: ['One line.'], experience: experience(6) }
    const within = planTwoColumn({
      content,
      layout: TWO_COLUMN_LAYOUT,
      config: { page1ExperienceCount: 3, page1SplitBullets: null },
      theme: tealTheme,
      measure
    })
    expect(within.pages[0].mainBlocks).toHaveLength(3)
    expect(within.pages[0].mainFill?.used).toBeLessThanOrEqual(
      Number(within.pages[0].mainFill?.budget)
    )

    // Forcing more than fits is the user's call — the packer reports it (and
    // render.js warns) instead of silently dropping an entry.
    const forced = planTwoColumn({
      content,
      layout: TWO_COLUMN_LAYOUT,
      config: { page1ExperienceCount: 6, page1SplitBullets: null },
      theme: tealTheme,
      measure
    })
    expect(forced.pages[0].mainBlocks).toHaveLength(6)
    expect(forced.pages[0].mainFill?.used).toBeGreaterThan(Number(forced.pages[0].mainFill?.budget))
  })
})

describe('main-column budget accounts for the page-number badge', () => {
  // Review caught the first version of this test as an algebraic identity:
  // `budget + X + (bodyHeight - X - budget)` collapses to `bodyHeight` for ANY
  // input, so `toBeCloseTo(bodyHeight)` could not fail. Replaced with an
  // independently computed expected number: the summary block's height comes
  // from summaryH() (a different function from the budget under test), and the
  // rest is theme arithmetic written out here.
  const SUMMARY = ['One line of summary.']
  const CONTENT_1 = {
    personal: PERSONAL,
    summary: SUMMARY,
    experience: [{ role: 'R', company: 'C', period: 'p', bullets: ['b'] }]
  }
  const TITLE_H =
    tealTheme.typography.sectionTitle.size * tealTheme.typography.sectionTitle.leading +
    tealTheme.spacing.sectionTitlePb +
    tealTheme.chrome.sectionBorderWidth +
    tealTheme.spacing.sectionTitleMb

  it("page 1's experience budget equals bodyHeight minus padding, badge, safety, the spacer, the section title and the measured summary", () => {
    const m = deriveMetrics(tealTheme)
    const plan = planTwoColumn({ content: CONTENT_1, theme: tealTheme, measure })
    const expected =
      bodyHeight(tealTheme) -
      tealTheme.chrome.cornerHeight -
      tealTheme.geometry.mainPad.top -
      tealTheme.geometry.mainPad.bottom -
      summaryH(SUMMARY, m, measure) -
      tealTheme.spacing.spacer -
      TITLE_H -
      tealTheme.spacing.safety
    expect(plan.pages[0].mainFill?.budget).toBe(Math.round(expected * 100) / 100)
  })

  it('a continuation page gets exactly cornerHeight less than the same arithmetic without the badge — the term this slice added', () => {
    const plan = planTwoColumn({
      content: {
        ...CONTENT_1,
        experience: Array.from({ length: 12 }, (_, i) => ({
          role: `R${i}`,
          company: 'C',
          period: 'p',
          bullets: BULLETS
        }))
      },
      theme: tealTheme,
      measure
    })
    const withoutBadge =
      bodyHeight(tealTheme) -
      tealTheme.geometry.contPad.top -
      tealTheme.geometry.contPad.bottom -
      TITLE_H -
      tealTheme.spacing.safety
    const contBudget = Number(plan.pages[1].mainFill?.budget)
    expect(contBudget).toBe(Math.round((withoutBadge - tealTheme.chrome.cornerHeight) * 100) / 100)
    // and the badge really is 34pt of it, so this cannot pass with cornerH = 0
    expect(withoutBadge - contBudget).toBe(tealTheme.chrome.cornerHeight)
  })
})
