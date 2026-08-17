// ── The plan/render mirror: does the renderer draw the items the packer measured? ──
//
// C3b makes `SidebarSlice.[start, end)` an INDEX into a section's item list, so
// the packer and the eight sidebar components must agree on what that list is —
// its membership AND its order. Nothing enforced that before this file, and
// adversarial review demonstrated the hole: permuting `ContactSection`'s rows
// (moving `location` above `linkedin`/`facebook` — a pure reorder, membership
// unchanged) left the whole 455-test suite green while the packer measured
// `contact[0,k)` as one order and the renderer drew another. Nothing caught it
// because every other check is membership-only:
//   - contentOracle.js proves each item's text reaches the PDF *somewhere*,
//     which a permutation survives;
//   - sidebarItems.js and sidebarBudget.js are harness-side mirrors of the
//     ENGINE, so they permute with it, not with the component.
//
// The fix has two halves. `contact` no longer has a second list at all — the
// component consumes `layout.js`'s `contactRows()` (see its docblock). This
// file is the general guard for all eight, and it is deliberately generic: it
// asserts nothing about which fields a component chooses to draw, only that the
// item drawn at index `i` is the item the ENGINE holds at index `i`.
//
// How: `SidebarSlice` is itself the probe. Rendering a section with
// `slice = [i, i+1)` makes the component draw exactly one item, whichever one it
// thinks is at `i`. Every string of the engine's item `i` must then be on the
// page, and no string unique to any other item may be. A permutation fails both
// directions at once.
//
// WHAT THIS DOES NOT CATCH (recorded here because this file owns the property):
// a POST-slice reorder. The probe hands each component a one-item slice, so it
// proves the component slices the same list the engine indexed. A component
// that slices correctly and then draws ITS OWN page's items out of order —
// `items.slice(start, end).reverse()`, say — passes every assertion below,
// because with one item there is no order to get wrong. That is a strictly
// lesser defect than the one this file exists for: it cannot move an item to
// another page, drop one, or duplicate one, and the page still carries exactly
// the items the packer measured (so every height, budget and page break stays
// correct). Closing it would need a multi-item slice plus per-item positional
// extraction from the render. Not done; not planned.
//
// Fast and poppler-free: `View`/`Text` are plain string tags in react-pdf
// (`View === 'VIEW'`), so `react-dom/server` renders these components exactly as
// written — real hooks, real ThemeContext, real slicing — in milliseconds.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import BulletList from './components/BulletList.jsx'
import ExpItem from './components/ExpItem.jsx'
import {
  deriveMetrics,
  entryH,
  packExperiences,
  SIDEBAR_SECTION_KEYS,
  sidebarSectionItems,
  summaryH
} from './layout.js'
import { createMeasurer } from './measure.js'
import AchievementsSection from './sections/AchievementsSection.jsx'
import CertificationsSection from './sections/CertificationsSection.jsx'
import CompetenciesSection from './sections/CompetenciesSection.jsx'
import ContactSection from './sections/ContactSection.jsx'
import EducationSection from './sections/EducationSection.jsx'
import ExperienceSection from './sections/ExperienceSection.jsx'
import LanguagesSection from './sections/LanguagesSection.jsx'
import PublicationsSection from './sections/PublicationsSection.jsx'
import RefereesSection from './sections/RefereesSection.jsx'
import SummarySection from './sections/SummarySection.jsx'
import { ThemeContext } from './ThemeContext.jsx'
import { tealTheme } from './themes/teal.js'

// ── The style probe the token-perturbation block at the foot of this file needs ──
//
// `View`/`Text` being plain strings is what makes this file fast, and it is also
// the one thing that hides a number: react-dom serializes an ARRAY style —
// `BulletList.jsx`'s `[s.item, i > 0 && { marginTop: gap }]`, which is exactly
// where the inter-bullet gap lives — as `style="0:[object Object];1:[object
// Object]"`. The tag survives the round trip and the number does not.
//
// So the two host tags are replaced by function components that FLATTEN the
// style before handing it on: left to right, falsy entries skipped, later keys
// winning — which is what react-pdf's own style resolver does with an array, and
// the only behaviour this adds. A plain-object style flattens to itself, so
// every render in this file is byte-identical to an unmocked one apart from the
// array case (verify by deleting the mock: only the perturbation block fails).
// The rest of the module — `StyleSheet`, `Link`, `Image`, `Svg`, `Path` — is
// passed through untouched.
vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const actual = /** @type {Record<string, unknown>} */ (await importOriginal())
  /** @param {unknown} style @returns {Record<string, unknown>} */
  const flatten = (style) =>
    Array.isArray(style)
      ? style.filter(Boolean).reduce((acc, s) => Object.assign(acc, flatten(s)), {})
      : { .../** @type {object} */ (style ?? {}) }
  /** @param {string} tag */
  const host = (tag) => {
    /** @param {{ style?: unknown, children?: unknown }} props */
    const Host = ({ style, children }) =>
      createElement(tag, { style: flatten(style) }, /** @type {never} */ (children))
    return Host
  }
  return { ...actual, View: host('VIEW'), Text: host('TEXT') }
})

/** The component each packable sidebar key renders through (registry.js's map, for the sections that slice). */
const COMPONENTS = {
  contact: ContactSection,
  achievements: AchievementsSection,
  education: EducationSection,
  certifications: CertificationsSection,
  publications: PublicationsSection,
  languages: LanguagesSection,
  competencies: CompetenciesSection,
  referees: RefereesSection
}

/**
 * Content whose every item string is unique and index-tagged, so "the renderer
 * drew item 3" is a decidable question. Four items per section: enough for a
 * permutation of any two to be visible.
 */
const DATA = {
  personal: {
    name: 'Nn',
    title: 'Tt',
    company: 'Cc',
    phone: 'phone-v0',
    email: 'email-v1@x.example',
    linkedin: 'linkedin-v2',
    facebook: 'facebook-v3',
    location: 'location-v4',
    links: [{ href: 'https://link-v5.example', label: 'link-v5' }]
  },
  summary: [],
  experience: [],
  achievements: Array.from({ length: 4 }, (_, i) => ({
    year: `achieveyear-${i}`,
    text: `achievetext-${i}`
  })),
  education: Array.from({ length: 4 }, (_, i) => ({
    degree: `degree-${i}`,
    institution: `institution-${i}`,
    period: `period-${i}`
  })),
  certifications: Array.from({ length: 4 }, (_, i) => ({
    name: `certname-${i}`,
    issuer: `certissuer-${i}`,
    year: `certyear-${i}`
  })),
  publications: Array.from({ length: 4 }, (_, i) => ({
    title: `pubtitle-${i}`,
    venue: `pubvenue-${i}`,
    year: `pubyear-${i}`
  })),
  languages: Array.from({ length: 4 }, (_, i) => ({
    language: `lang-${i}`,
    proficiency: `prof-${i}`
  })),
  competencies: Array.from({ length: 4 }, (_, i) => `tag-${i}`),
  referees: Array.from({ length: 4 }, (_, i) => ({
    name: `refname-${i}`,
    title: `reftitle-${i}`,
    company: `refcompany-${i}`,
    email: `refemail-${i}@x.example`,
    phone: `refphone-${i}`
  }))
}

/**
 * Render one section (optionally sliced) and return its text content, in document order.
 * @param {string} key
 * @param {import('./types.js').SidebarSlice} [sliceArg]
 */
function renderSection(key, sliceArg) {
  const markup = renderToStaticMarkup(
    createElement(
      ThemeContext.Provider,
      { value: tealTheme },
      createElement(COMPONENTS[/** @type {keyof typeof COMPONENTS} */ (key)], {
        data: DATA,
        slice: sliceArg
      })
    )
  )
  // Strip tags and attributes; what is left is the text the reader sees.
  return markup.replace(/<[^>]*>/g, '\u0000')
}

/**
 * Every distinct string an engine item is made of — a plain string item is itself.
 * @param {unknown} item
 * @returns {string[]}
 */
function itemStrings(item) {
  if (typeof item === 'string') return [item]
  return Object.values(/** @type {Record<string, unknown>} */ (item)).flatMap((v) =>
    typeof v === 'string' && v.length > 0 ? [v] : []
  )
}

/** The engine's item list for a key, asserted non-null (every key here is a real section). */
function engineItems(/** @type {string} */ key) {
  const items = sidebarSectionItems(key, DATA)
  if (items === null) throw new Error(`no engine item list for "${key}"`)
  return items
}

/**
 * @param {string} key
 * @param {number} start
 * @param {number} end
 * @returns {import('./types.js').SidebarSlice}
 */
const slice = (key, start, end) => ({
  key,
  start,
  end,
  itemCount: engineItems(key).length,
  // Plan-side geometry (C6a). This file asserts WHICH item is drawn where, not
  // how tall it is, and the components read neither field — so they are
  // placeholders, not measurements.
  height: 0,
  gapBefore: 0
})

describe('plan/render mirror — the component draws the item the packer measured', () => {
  it('covers every packable sidebar section (a new section cannot skip this file)', () => {
    expect(Object.keys(COMPONENTS).sort()).toEqual([...SIDEBAR_SECTION_KEYS].sort())
  })

  for (const key of Object.keys(COMPONENTS)) {
    it(`${key}: item i drawn == item i measured, for every i (order, not just membership)`, () => {
      const items = engineItems(key)
      expect(items.length).toBeGreaterThan(1) // a one-item section cannot express a permutation

      /** Strings that belong to exactly one item — the ones that can identify it. @type {Map<string, number>} */
      const counts = new Map()
      for (const item of items) {
        for (const s of itemStrings(item)) counts.set(s, (counts.get(s) ?? 0) + 1)
      }

      /** @type {object[]} */
      const wrong = []
      items.forEach((item, i) => {
        const text = renderSection(key, slice(key, i, i + 1))
        for (const s of itemStrings(item)) {
          if (!text.includes(s)) wrong.push({ i, missing: s, text })
        }
        items.forEach((other, j) => {
          if (j === i) return
          for (const s of itemStrings(other)) {
            if (counts.get(s) !== 1) continue // shared string: proves nothing
            if (itemStrings(item).includes(s)) continue
            if (text.includes(s)) wrong.push({ i, leaked: s, from: j, text })
          }
        })
      })
      expect(wrong).toEqual([])
    })
  }

  it('the probe is not vacuous: a deliberately permuted item list is caught', () => {
    // Same check, run against a re-ordered view of the engine's own list. This
    // is exactly the mutation review used (a pure reorder, membership intact),
    // and it must fail — otherwise the tests above prove nothing.
    const key = 'education'
    const items = engineItems(key)
    const permuted = [items[1], items[0], ...items.slice(2)]
    const text = renderSection(key, slice(key, 0, 1))
    // The renderer draws the ENGINE's item 0; the permuted list claims item 0 is
    // the engine's item 1, whose strings are absent.
    expect(itemStrings(permuted[0]).every((s) => text.includes(s))).toBe(false)
    expect(itemStrings(items[0]).every((s) => text.includes(s))).toBe(true)
  })

  it('a slice covering the whole section renders exactly what an unsliced render does', () => {
    for (const key of Object.keys(COMPONENTS)) {
      const n = engineItems(key).length
      expect(renderSection(key, slice(key, 0, n))).toBe(renderSection(key, undefined))
    }
  })

  it('two complementary slices render every item exactly once between them', () => {
    /** @type {{ key: string, item: number, text: string, problem: string }[]} */
    const wrong = []
    for (const key of Object.keys(COMPONENTS)) {
      const items = engineItems(key)
      const cut = 2
      const head = renderSection(key, slice(key, 0, cut))
      const tail = renderSection(key, slice(key, cut, items.length))
      items.forEach((item, i) => {
        const where = i < cut ? head : tail
        const notWhere = i < cut ? tail : head
        for (const s of itemStrings(item)) {
          if (!where.includes(s))
            wrong.push({ key, item: i, text: s, problem: 'missing-from-own-slice' })
          // Only strings unique to this item can prove absence elsewhere.
          const unique = items.filter((o) => itemStrings(o).includes(s)).length === 1
          if (unique && notWhere.includes(s)) {
            wrong.push({ key, item: i, text: s, problem: 'leaked-into-other-slice' })
          }
        }
      })
    }
    expect(wrong).toEqual([])
  })

  it('a continued slice carries the "(cont.)" marker and a first slice does not', () => {
    for (const key of Object.keys(COMPONENTS)) {
      const n = engineItems(key).length
      expect(renderSection(key, slice(key, 0, 1))).not.toContain('(cont.)')
      expect(renderSection(key, slice(key, 1, n))).toContain('(cont.)')
    }
  })
})

// ── Token perturbation: make the write-only-token class un-recurrable (§3.7) ──
//
// The same mirror question as the block above, asked of NUMBERS instead of item
// order: does the renderer space things the way the packer measured them?
//
// Three spacing tokens were WRITE-ONLY until S1 — `spacing.bulletGap`,
// `spacing.summaryBulletGap` and `chrome.dividerMargin` were read by
// `entryH`/`summaryH`/`calcDividerH` and hardcoded (4.5 / 7.5 / 16.5) in
// `ExpItem.jsx`, `SummarySection.jsx` and `ExperienceSection.jsx`. The theme said
// one number and the render did another; because the literals happened to EQUAL
// the tokens, the PDF was byte-identical and nothing failed. That is the defect
// class this file exists to make un-recurrable: every spacing edit moved the plan
// while changing zero pixels, and every "wire it up" fix is invisible to a test
// that only compares the shipped theme against itself.
//
// So the theme is PERTURBED. Doubling a token must move the render by exactly
// the perturbation AND move the model by exactly the same amount:
//
//   bulletGap        4.5 -> 9     n bullets    render +delta per gap, entryH   +(n-1)*delta
//   summaryBulletGap 7.5 -> 15    n bullets    render +delta per gap, summaryH +(n-1)*delta
//   dividerMargin   16.5 -> 33    2 entries    render +delta per margin (there are two,
//                                              marginVertical), packExperiences' `used` +2*delta
//
// A literal put back into any of the three components pins the render while the
// model moves, and fails. A literal put into the MODEL pins the model while the
// render moves, and fails the same test from the other side. One test, three
// tokens, both directions.
//
// Deliberately not asserted: the absolute pixel values under the shipped theme.
// That would be a second copy of the theme file, and P3 is going to make these
// tokens variable — the invariant is that the two sides move TOGETHER, not what
// they currently are.

const FONTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts')
const measure = createMeasurer(FONTS)

/**
 * A theme with exactly ONE token changed. Deep-cloned rather than spread, so a
 * perturbation cannot leak into `tealTheme` and quietly change what the tests
 * above render.
 *
 * @param {'spacing'|'chrome'} group
 * @param {string} key
 * @param {number} value
 */
function perturbedTheme(group, key, value) {
  const theme = structuredClone(tealTheme)
  Object.assign(theme[group], { [key]: value })
  return /** @type {import('./types.js').Theme} */ (theme)
}

/**
 * Render `element` under `theme` and return every host element's style, as the
 * CSS-property map react-dom serialized it to, in document order.
 *
 * @param {import('./types.js').Theme} theme
 * @param {import('react').ReactElement} element
 * @returns {Record<string, string>[]}
 */
function renderedStyles(theme, element) {
  const markup = renderToStaticMarkup(
    createElement(ThemeContext.Provider, { value: theme }, element)
  )
  return [...markup.matchAll(/<(?:VIEW|TEXT)\b([^>]*)>/g)].map(([, attrs]) => {
    const declarations = /style="([^"]*)"/.exec(attrs)?.[1] ?? ''
    return Object.fromEntries(
      declarations
        .split(';')
        .filter(Boolean)
        .map(
          (d) =>
            /** @type {[string, string]} */ ([
              d.slice(0, d.indexOf(':')),
              d.slice(d.indexOf(':') + 1)
            ])
        )
    )
  })
}

/** `"9px"` -> 9; a property the render did not emit is 0, which is what an absent margin means. */
const px = (/** @type {string | undefined} */ v) => (v === undefined ? 0 : Number.parseFloat(v))

/** Round to hundredths, the grain layout.js quantizes heights to. */
const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100

/**
 * The gap the render puts BETWEEN consecutive bullet rows, one entry per gap.
 *
 * A bullet row is identified by `align-items:flex-start` — `BulletList.jsx`'s
 * `item` style, and the only row in either component that uses it (the meta and
 * progression rows are `baseline`). The first row is excluded on purpose: the
 * gap is charged `n-1` times in the render, which is exactly how `entryH` and
 * `summaryH` charge it, and a component that gapped the first row too would show
 * up here as an extra element rather than as a wrong number.
 *
 * @param {Record<string, string>[]} styles
 */
function bulletGaps(styles) {
  const rows = styles.filter((s) => s['align-items'] === 'flex-start')
  expect(px(rows[0]?.['margin-top'])).toBe(0) // n-1 gaps, not n
  return rows.slice(1).map((s) => px(s['margin-top']))
}

describe('token perturbation — the render and the model read the same theme token', () => {
  /** Four bullets: three gaps, so an off-by-one in "n-1" is visible rather than cancelling. */
  const BULLETS = ['First bullet.', 'Second bullet.', 'Third bullet.', 'Fourth bullet.']
  /** @type {import('./types.js').ExperienceEntry} */
  const ENTRY = {
    role: 'Role Title',
    company: 'Example Holdings',
    period: '2010 – 2011',
    bullets: BULLETS
  }

  it('bulletGap, summaryBulletGap and dividerMargin all move the render and the model together', () => {
    /** Every finding collected, so one run reports all three tokens rather than the first to break. */
    const wrong = []
    const checked = []

    // ── spacing.bulletGap — ExpItem.jsx -> BulletList, mirrored by entryH ──
    {
      const delta = tealTheme.spacing.bulletGap
      const after = perturbedTheme('spacing', 'bulletGap', tealTheme.spacing.bulletGap + delta)
      const base = bulletGaps(renderedStyles(tealTheme, createElement(ExpItem, ENTRY)))
      const moved = bulletGaps(renderedStyles(after, createElement(ExpItem, ENTRY)))
      const renderDelta = moved.map((g, i) => g - base[i])
      const modelDelta =
        entryH(ENTRY, deriveMetrics(after), measure) -
        entryH(ENTRY, deriveMetrics(tealTheme), measure)
      // Every gap moved by the perturbation, and the model moved by all of them
      // at once — `n-1` gaps, the count the render just demonstrated.
      if (
        renderDelta.some((d) => d !== delta) ||
        base.some((g) => g !== tealTheme.spacing.bulletGap)
      )
        wrong.push({ token: 'spacing.bulletGap', base, moved, expectedDelta: delta })
      if (round2(modelDelta) !== round2(renderDelta.reduce((a, b) => a + b, 0)))
        wrong.push({ token: 'spacing.bulletGap', modelDelta, renderDelta })
      checked.push(
        `bulletGap: ${renderDelta.length} rendered gaps x ${delta}pt == entryH +${round2(modelDelta)}pt`
      )
    }

    // ── spacing.summaryBulletGap — SummarySection.jsx, mirrored by summaryH ──
    {
      const delta = tealTheme.spacing.summaryBulletGap
      const after = perturbedTheme(
        'spacing',
        'summaryBulletGap',
        tealTheme.spacing.summaryBulletGap + delta
      )
      const element = createElement(SummarySection, {
        data: /** @type {import('./types.js').CVContent} */ ({ summary: BULLETS })
      })
      const base = bulletGaps(renderedStyles(tealTheme, element))
      const moved = bulletGaps(renderedStyles(after, element))
      const renderDelta = moved.map((g, i) => g - base[i])
      const modelDelta =
        summaryH(BULLETS, deriveMetrics(after), measure) -
        summaryH(BULLETS, deriveMetrics(tealTheme), measure)
      if (
        renderDelta.some((d) => d !== delta) ||
        base.some((g) => g !== tealTheme.spacing.summaryBulletGap)
      )
        wrong.push({ token: 'spacing.summaryBulletGap', base, moved, expectedDelta: delta })
      if (round2(modelDelta) !== round2(renderDelta.reduce((a, b) => a + b, 0)))
        wrong.push({ token: 'spacing.summaryBulletGap', modelDelta, renderDelta })
      checked.push(
        `summaryBulletGap: ${renderDelta.length} rendered gaps x ${delta}pt == summaryH +${round2(modelDelta)}pt`
      )
    }

    // ── chrome.dividerMargin — ExperienceSection.jsx, mirrored by calcDividerH ──
    //
    // The divider is the one term of the three that is not a bullet gap and not
    // reachable through `entryH` at all: it is the packer's `gapBefore`, so the
    // model side is read where the packer publishes it — the `used` height of a
    // page holding two entries, which is `h0 + divider + h1`. `marginVertical`
    // renders ABOVE and BELOW, hence the factor of two on both sides.
    {
      const delta = tealTheme.chrome.dividerMargin
      const after = perturbedTheme(
        'chrome',
        'dividerMargin',
        tealTheme.chrome.dividerMargin + delta
      )
      const element = createElement(ExperienceSection, {
        entries: [ENTRY, { ...ENTRY, role: 'Second Role', company: 'Another Employer' }]
      })
      const dividerMargins = (/** @type {Record<string, string>[]} */ styles) =>
        styles
          .filter((s) => s['margin-vertical'] !== undefined)
          .map((s) => px(s['margin-vertical']))
      const base = dividerMargins(renderedStyles(tealTheme, element))
      const moved = dividerMargins(renderedStyles(after, element))
      // Two entries, one divider between them — ExperienceSection draws it after
      // every entry but the last.
      expect(base).toHaveLength(1)
      const usedWith = (/** @type {import('./types.js').Theme} */ t) =>
        packExperiences([ENTRY, { ...ENTRY, role: 'Second Role' }], ['One line.'], t, measure)
          .pageMetrics[0].used
      const modelDelta = usedWith(after) - usedWith(tealTheme)
      if (moved[0] - base[0] !== delta || base[0] !== tealTheme.chrome.dividerMargin)
        wrong.push({ token: 'chrome.dividerMargin', base, moved, expectedDelta: delta })
      // marginVertical is charged twice per divider, and `calcDividerH` is
      // `dividerHeight + 2*dividerMargin` — the same two.
      if (round2(modelDelta) !== round2(2 * (moved[0] - base[0])))
        wrong.push({ token: 'chrome.dividerMargin', modelDelta, renderDelta: moved[0] - base[0] })
      checked.push(
        `dividerMargin: 2 x ${delta}pt of rendered margin == packed used +${round2(modelDelta)}pt`
      )
    }

    expect(
      wrong,
      'a theme token moved the render and the model by different amounts — one of the two is a literal again'
    ).toEqual([])
    // All three tokens were actually reached — a token whose block threw its
    // finding away, or whose render produced no gaps to compare, would leave a
    // hole here rather than a green tick. The strings themselves are the record
    // of what was measured, printed by vitest when this assertion fails.
    expect(checked).toEqual([
      `bulletGap: 3 rendered gaps x ${tealTheme.spacing.bulletGap}pt == entryH +${round2(3 * tealTheme.spacing.bulletGap)}pt`,
      `summaryBulletGap: 3 rendered gaps x ${tealTheme.spacing.summaryBulletGap}pt == summaryH +${round2(3 * tealTheme.spacing.summaryBulletGap)}pt`,
      `dividerMargin: 2 x ${tealTheme.chrome.dividerMargin}pt of rendered margin == packed used +${round2(2 * tealTheme.chrome.dividerMargin)}pt`
    ])
  })

  it('the probe is not vacuous: the pre-S1 hardcoded gap is caught by the same comparison', () => {
    // The seeded mutation, and it is the ORIGINAL defect rather than an
    // invention: `ExpItem.jsx` used to read `<BulletList gap={4.5} />`. Passing
    // that literal reproduces it exactly, through the real component, and its
    // rendered gap must then be FROZEN while the theme moves — which is what the
    // sweep above reports as a finding. Without this, "the gaps moved together"
    // could just as well mean the probe cannot see gaps at all.
    const delta = tealTheme.spacing.bulletGap
    const after = perturbedTheme('spacing', 'bulletGap', tealTheme.spacing.bulletGap + delta)
    const gapsUnder = (/** @type {import('react').ReactElement} */ el) => [
      bulletGaps(renderedStyles(tealTheme, el))[0],
      bulletGaps(renderedStyles(after, el))[0]
    ]

    const [wiredBase, wiredMoved] = gapsUnder(createElement(ExpItem, ENTRY))
    expect(wiredMoved - wiredBase).toBe(delta) // the shipped component: wired

    const [literalBase, literalMoved] = gapsUnder(
      createElement(BulletList, { items: BULLETS, gap: 4.5 })
    )
    expect(literalMoved - literalBase).toBe(0) // the pre-S1 component: write-only token
    expect(literalMoved - literalBase).not.toBe(delta)
  })
})
