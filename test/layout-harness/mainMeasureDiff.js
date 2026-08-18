// ── Main-column measure-vs-render diff (S2) ────────────────────────────────
//
// The main-column twin of sidebarMeasureDiff.js, and the reason `entryH()` can
// finally be argued about with numbers. It renders a CV through the real CLI,
// reads the TRUE vertical position of every role heading, bullet row and
// section title out of the PDF with `pdftotext -bbox`, and compares what the
// render did against what `entryH()`/`summaryH()` predicted.
//
// Read design-layout-fidelity.md §5.1 alongside this file. Three independent
// families of measurement come out of ONE render:
//
//   1. `entryRows`  — consecutive role-line tops within a page, minus
//      `calcDividerH()`, is one INTERIOR entry's rendered height. The exact
//      analogue of the sidebar's title-to-title differencing, and the family
//      that validates the whole §3.6 composition at once.
//   2. `headRows`   — a role's top to the top of that entry's FIRST BULLET TEXT
//      row is the head's rendered height (role + meta + location + description
//      + progression + the bullet list's `descMt`). This closes the structural
//      gap family 1 shares with the sidebar harness: the last block on a page is
//      never differenceable, and a SPLIT head is always its page's last block —
//      that is why the page ended. Family 2 reaches every entry on every page.
//   3. `fixedRows`  — page 1's "SUMMARY" title top to its "EXPERIENCE" title top
//      must equal `summaryH + spacer`. One measurement validates `summaryH`,
//      `calcTitleH` and the spacer together.
//
// Plus a fourth, cheap check that is not a height at all: no main-column ink may
// extend past the content box (`pageWidth - mainPad.right`). §2.4 found a long
// company wrapping at the full container width and pushing the period 24.19pt
// into the 33pt right padding; a longer pair would run off the sheet. Nothing in
// the suite could see that class of defect before.
//
// FOUR MECHANICS, each of which cost the design's author a debugging session.
// They are commented at their call sites too, because every one of them is the
// kind of thing a later reader deletes as redundant:
//
//   a. Locate role rows by TEXT and X-POSITION and DOCUMENT ORDER. A progression
//      step can repeat the role string verbatim (the motivating CV has a "Head
//      of People" step inside the "Head of People" entry); matching on text
//      alone silently measures the wrong row and reports a 286pt delta.
//      Progression rows are indented by `progPl + sectionBorderWidth` = 9pt, so
//      the content-left-edge test is what tells them apart.
//   b. Decode XML entities before comparing. `pdftotext -bbox` emits XML, so
//      `&` and `'` arrive as `&amp;`/`&apos;` — invisible in the sidebar (no
//      section title has one) and fatal here, where "Chairman & Chief Executive
//      Officer" would never match the role it came from. `rowsByPage` already
//      does this with the sidebar's own `decodeXml`; the shape corpus below
//      carries both entities so the mechanic is exercised, not merely present.
//   c. Never merge the bullet dash into its text row. `BulletList.jsx`'s dash
//      carries `marginTop: iconMt` (1pt), so it sits on its own `yMin`, 1pt
//      below the text it belongs to. Rows are grouped by EXACT `yMin` and the
//      bullet is matched on its TEXT, never on the dash — a proximity-grouped
//      row would move every head measurement by that 1pt.
//   d. Coverage is asserted, not assumed. Every skipped page and every
//      undifferenceable page-tail entry is returned next to what WAS measured,
//      so the sample a "0.00pt" claim rests on is visible. The skip reason
//      `role-not-on-planned-page` means the render has drifted from the plan and
//      must never occur.
//
// THEME (risk RV2 in the design). Every number here is Lato at the shipped sizes,
// and six harness modules still hardcode `tealTheme`. This one takes the theme
// as a parameter from day one — not because a second theme is exercised today,
// but because P3 makes the type scale variable and owes a re-derivation, and a
// harness that plans against one theme while rendering another passes while
// measuring the wrong document (that precedent is real — see the layout-vs-plan
// bug fixed in a5e1029). A caller passing a non-default theme must also set
// `config.theme` in the fixture content, or the CLI renders something else.
// ─────────────────────────────────────────────────────────────────────────

import path from 'node:path'
import { TWO_COLUMN_LAYOUT } from '../../src/pdf/defaultLayouts.js'
import {
  deriveMetrics,
  deriveSidebarMetrics,
  entryH,
  planTwoColumn,
  summaryH
} from '../../src/pdf/layout.js'
import { tealTheme } from '../../src/pdf/themes/teal.js'
import { HEAD_SHAPES, progressionSteps } from './contentSpecs.js'
import { buildAll } from './scaffold.js'
import { rowsByPage } from './sidebarMeasureDiff.js'
import { harnessMeasurer } from './structuralFacts.js'

/** Round to hundredths, normalizing -0 to 0 so an exact match reads as `0`. */
const round2 = (/** @type {number} */ n) => {
  const r = Math.round(n * 100) / 100
  return r === 0 ? 0 : r
}

/** Every rendered row's text arrives with its spaces gone (see `rowsByPage`), so compare like for like. */
const squash = (/** @type {string} */ s) => s.replace(/\s+/g, '')

/** A bullet is either a plain string or `{ text, link, suffix }` (BulletList.jsx). */
const bulletText = (/** @type {string | {text?: string}} */ b) =>
  typeof b === 'string' ? b : (b?.text ?? '')

/**
 * The entry margin `entryH()` CHARGES, which is not the one `ExpItem.jsx`
 * renders: `layout.js` lines 406/433 apply `entryMb * (15 / 11)` against a
 * component that renders `marginBottom: entryMb`. That 4.00pt is defect A
 * (§3.1) and family 1 measures it directly.
 *
 * It has to be mirrored here because family 2 predicts a HEAD — everything above
 * the bullets — and the only way to get that out of `entryH()` is to ask it for
 * a zero-bullet slice and subtract the trailing margin it charged. When §3.1
 * lands, this becomes `m.entryMb` and every `headRows` delta below drops by
 * 4.00pt in step with the `entryRows` ones. It is deliberately written as "what
 * the model charges" rather than as a literal, so the two cannot disagree
 * about which defect they are describing. Since S3 the model charges the token
 * itself — the 15/11 fudge is gone from `entryH` and from here in the same
 * commit.
 */
const chargedEntryMb = (/** @type {ReturnType<typeof deriveMetrics>} */ m) => m.entryMb

/**
 * What the render puts between a role's top and its first bullet's text top:
 * the head rows plus `BulletList.jsx`'s own `marginTop: descMt`.
 *
 * Derived from `entryH()` itself (a zero-bullet slice of the very block the
 * packer placed), never re-composed from theme tokens — a second copy of the
 * composition would agree with a wrong model for exactly the same reason the
 * model is wrong.
 */
function predictedHeadH(block, m, measure) {
  const start = block.startBullet ?? 0
  const zeroBullets = { ...block, startBullet: start, endBullet: start }
  return round2(entryH(zeroBullets, m, measure) - chargedEntryMb(m) + m.descMt)
}

// ── The shape corpus (§5.2) ────────────────────────────────────────────────
//
// One purpose-built CV whose entries isolate ONE term of §3.6 each, so a single
// render covers the whole composition and a non-zero delta names the term that
// caused it. Deterministic in the contentSpecs.js sense: fixed literals, no RNG,
// no dates, byte-identical YAML on every run.
//
// ROLE NAMES ARE UNIQUE SINGLE TOKENS. The post-mortem's own probe matched on
// shared words and measured the wrong rows; here each entry's role opens with a
// coined token that appears nowhere else in the document, so "which entry is
// this row?" has exactly one answer. `plain` additionally carries `&` and `'`
// so mechanic (b) — XML entity decoding — is exercised by the corpus rather
// than merely described in a comment: without `decodeXml` its role arrives as
// `Alphaquant&amp;Partners&apos;Lead` and the entry is skipped, which the
// coverage floor then fails on.
//
// EVERY WRAP IS DELIBERATE AND UNAMBIGUOUS. The three wrapping strings clear
// the column by far more than their own glue-shrink allowance, and the bullets
// sit far below it, so model and render agree on every line COUNT here. The one
// place this corpus deliberately puts a string INSIDE the shrink window is the
// near-boundary summary bullet (see `SUMMARY_TEXT`), which is the §3.5 probe.
const SHAPE_BULLET = 'Delivered the migration on schedule and under the agreed budget.'
const SHAPE_BULLET_ALT = 'Rebuilt the reporting pipeline for the regional operations desk.'
const SHAPE_DESCRIPTION = 'Programme leadership across three regional delivery teams.'

/**
 * The nine shapes §5.2 asks for. `shape` is the key the expectation table is
 * written against; `role` is the unique token the diff matches on.
 */
export const SHAPE_ENTRIES = [
  { shape: 'plain', role: "Alphaquant & Partners' Lead" },
  { shape: 'description', role: 'Bravoquant', description: SHAPE_DESCRIPTION },
  { shape: 'located', role: 'Charliequant', location: HEAD_SHAPES.shortLocation },
  { shape: 'progression2', role: 'Deltaquant', progression: progressionSteps(2, 3) },
  {
    shape: 'progression4',
    role: 'Echoquant',
    // MECHANIC (a), made real: the first step's title is the role string
    // VERBATIM, exactly like the motivating CV's "Head of People" step inside
    // its "Head of People" entry. Text alone cannot tell the two rows apart;
    // the step is indented by `progPl + sectionBorderWidth` = 9pt, so the
    // content-left-edge test is what does.
    progression: [{ title: 'Echoquant', period: '2010 – 2011' }, ...progressionSteps(4, 4).slice(1)]
  },
  { shape: 'wrapping-role', role: `Foxtrotquant ${HEAD_SHAPES.wrappingRoleTail}` },
  {
    shape: 'wrapping-company',
    role: 'Golfquant',
    company: `Northwind ${HEAD_SHAPES.wrappingCompanyTail}`
  },
  { shape: 'wrapping-location', role: 'Hotelquant', location: HEAD_SHAPES.wrappingLocation },
  // 22 short bullets: taller than a continuation page's residual wherever it
  // lands, so the packer must cut it and the render must produce a `(cont'd)`
  // slice — the only way family 1 can ever see the continuation branch of
  // `entryH` (its `+4.00` margin-only delta).
  {
    shape: 'many-bullets-split',
    role: 'Indiaquant',
    bullets: Array.from({ length: 22 }, (_, i) => (i % 2 ? SHAPE_BULLET_ALT : SHAPE_BULLET))
  }
]

/**
 * Plain entries appended after the nine shapes. They are not measured for their
 * own sake: family 1 structurally cannot difference the LAST entry on a page,
 * and without a tail of throwaway entries the split entry's continuation slice
 * — which opens the final page — would be that page's only block and therefore
 * unreachable. Three of them is what it takes for the continuation to be
 * followed by something.
 */
const FILLER_ENTRIES = [
  { shape: 'filler', role: 'Julietquant' },
  { shape: 'filler', role: 'Kiloquant' },
  { shape: 'filler', role: 'Limaquant' }
]

/**
 * Summary variants for family 3.
 *
 * `short` is one comfortably-short bullet: `summaryH + spacer` should predict
 * the Summary→Experience distance exactly.
 *
 * `near-boundary` is the §3.5 probe, and its width is the whole point. Its
 * natural width (309.12pt for shipped Lato) is WIDER than the rendered column
 * (301.91pt = `bulletWidth()`), so a no-shrink greedy breaker would wrap it —
 * and NARROWER than the column plus textkit's glue shrink
 * (301.91 + spaces x spaceWidth / 3 = 311.75pt), so the renderer squeezes the
 * inter-word spaces and keeps it on one line. Before S3 that mismatch cost
 * 13.50pt of page-1 budget; since S3 `lineCount` mirrors the shrink rule, and
 * this string is the first thing to fail if either side of the mirror drifts.
 * Both margins are >2.6pt, so it is a stable fact about Lato at 9pt, not a
 * knife-edge — and the width-window is asserted from glyph advances in the
 * test, not assumed.
 */
const SUMMARY_TEXT = {
  short: ['A single short summary bullet, one rendered line long.'],
  'near-boundary': [
    'Led the small team that ran the cost model and the risk log for the new site plan.'
  ]
}

/**
 * Build the shape corpus as a cv-content bag.
 *
 * @param {{ order?: 'forward'|'reversed', summary?: keyof typeof SUMMARY_TEXT, entries?: typeof SHAPE_ENTRIES }} [opts]
 *   `order` exists for one reason: family 1 cannot reach a page's LAST entry, so
 *   whichever shapes land at a page foot in one ordering are invisible to it.
 *   Rendering the same nine shapes forward and reversed moves the page
 *   boundaries and makes the union of the two runs cover all of them. The two
 *   orderings are independent measurements of the same nine heights, so where
 *   they overlap they must agree.
 */
export function shapeCorpusContent({ order = 'forward', summary = 'short' } = {}) {
  const shapes = order === 'reversed' ? [...SHAPE_ENTRIES].reverse() : SHAPE_ENTRIES
  const entries = [...shapes, ...FILLER_ENTRIES]
  return {
    personal: {
      name: 'Jordan Rivera',
      title: 'Senior Programme Lead',
      company: 'Example Holdings',
      email: 'jordan.rivera@example.com',
      location: 'Springfield'
    },
    summary: SUMMARY_TEXT[summary],
    experience: entries.map((s, i) => ({
      role: s.role,
      company: s.company ?? `Company ${i}`,
      period: `20${10 + i} – 20${11 + i}`,
      ...(s.location ? { location: s.location } : {}),
      ...(s.description ? { description: s.description } : {}),
      ...(s.progression ? { progression: s.progression } : {}),
      bullets: s.bullets ?? [SHAPE_BULLET]
    })),
    config: { schemaVersion: 1, theme: 'teal', layout: 'two-column' }
  }
}

/** Which shape a measured row belongs to. A continuation slice is its own shape — `entryH` takes a different branch for it. */
export function shapeForRole(/** @type {string} */ role, /** @type {boolean} */ isContinuation) {
  if (isContinuation) return 'continuation'
  const hit = [...SHAPE_ENTRIES, ...FILLER_ENTRIES].find((s) => s.role === role)
  return hit?.shape ?? 'unknown'
}

/** Every shape key the corpus can produce, for a coverage assertion that needs no poppler. */
export const SHAPE_KEYS = [...SHAPE_ENTRIES.map((s) => s.shape), 'continuation']

// ── The diff ───────────────────────────────────────────────────────────────

/** Tolerance on the "is this row at the content left edge?" test, in pt. Progression rows sit 9pt in, so anything under ~4 is unambiguous. */
const LEFT_EDGE_EPSILON_PT = 0.5

/** Tolerance on the content-box check. `pdftotext` prints 6dp; a row that lands exactly ON the edge (a glue-shrunk full-width line does) is not a violation. */
const INK_EPSILON_PT = 0.01

/** The page-number badge, as it comes back out of the PDF once a row's words are joined: "1 of 3" -> "1of3". */
const BADGE_RE = /^\d+of\d+$/

/**
 * The spacer the layout puts between the summary and the experience title, in
 * pt. Read out of the layout the PLAN used (`'spacer:27'` after
 * `normalizeLayout`), never assumed to be `spacing.spacer` — a fixture may write
 * its own `layouts/two-column.yaml`, and family 3's whole claim is that the
 * predicted and rendered distances are the same distance.
 */
function layoutSpacerPt(layout, m) {
  const slots = (layout ?? TWO_COLUMN_LAYOUT).first?.main ?? []
  for (const slot of slots) {
    const hit = /^spacer:([\d.]+)$/.exec(String(slot))
    if (hit) return Number(hit[1])
  }
  return m.spacer
}

/**
 * MECHANIC (a). Find the row a block's role heading landed on, scanning forward
 * from `from` so DOCUMENT ORDER is part of the identity — two entries may share
 * a role prefix, and the k-th block on a page is the k-th matching row on it.
 *
 * Three conditions, all necessary:
 *   - the row starts at the content left edge (progression steps are indented
 *     by `progPl + sectionBorderWidth`, bullet text by the dash column, so this
 *     is what stops a step titled exactly like its parent role from matching);
 *   - the row's text is a PREFIX of the role with its spaces removed (a role
 *     that wraps puts only its first line on this row, and a continuation's
 *     `(cont'd)` tag renders at the meta size and lands on its own `yMin`, so
 *     the role row is the bare role either way);
 *   - the row is not empty.
 *
 * @returns {{ top: number, index: number } | null}
 */
function findRoleRow(rows, from, role, contentLeft) {
  const wanted = squash(role)
  for (let k = from; k < rows.length; k++) {
    const r = rows[k]
    if (Math.abs(r.xMin - contentLeft) > LEFT_EDGE_EPSILON_PT) continue
    if (r.text.length === 0) continue
    if (wanted.startsWith(r.text)) return { top: r.yMin, index: k }
  }
  return null
}

/**
 * MECHANIC (c). Find the row the block's first visible bullet's TEXT landed on.
 *
 * Matched on the bullet's text and on being INDENTED past the content left
 * edge, never on the dash: `BulletList.jsx` gives the dash `marginTop: iconMt`
 * (1pt), so it sits on its own `yMin` one point below the text it belongs to.
 * Take the dash's row instead and every head in the corpus measures 1.00pt too
 * tall — a delta small enough to look like a rounding argument and large enough
 * to be wrong.
 *
 * @returns {{ top: number } | null}
 */
function findFirstBulletRow(rows, from, bullet, contentLeft) {
  const wanted = squash(bulletText(bullet))
  if (wanted.length === 0) return null
  for (let k = from; k < rows.length; k++) {
    const r = rows[k]
    if (r.xMin <= contentLeft + LEFT_EDGE_EPSILON_PT) continue
    if (r.text.length === 0) continue
    if (wanted.startsWith(r.text)) return { top: r.yMin }
  }
  return null
}

/**
 * Build `fixtureDir`'s designed PDF and diff predicted vs rendered main-column
 * geometry. One render, four checks.
 *
 * @param {string} fixtureDir  a directory holding cv-content/ (see writeFixtureContent)
 * @param {object} content     the same content bag, for planning
 * @param {{ layout?: object, theme?: object }} [opts]
 * @returns {{
 *   entryRows: {page: number, role: string, shape: string, isContinuation: boolean, predicted: number, observed: number, deltaPt: number}[],
 *   headRows: {page: number, role: string, shape: string, isContinuation: boolean, predicted: number, observed: number, deltaPt: number}[],
 *   fixedRows: {page: number, predicted: number, observed: number, deltaPt: number}[],
 *   inkPastBox: {page: number, xMax: number, overshootPt: number, text: string}[],
 *   skipped: {page: number, reason: string, roles: string[]}[],
 *   unmeasuredTail: {page: number, role: string}[],
 *   shapesMeasured: string[],
 *   entriesMeasured: number, headsMeasured: number,
 *   planPages: number, physicalPages: number
 * }}
 */
export function runMainDiff(fixtureDir, content, { layout = undefined, theme = tealTheme } = {}) {
  const { code, result, stderr } = buildAll(fixtureDir)
  if (code !== 0 || !result?.ok) {
    throw new Error(`build failed (code ${code}): ${stderr?.slice(0, 1000)}`)
  }
  const designed = result.outputs.find((o) => !o.ats)
  const pdfPath = path.join(fixtureDir, designed.filename)

  const measure = harnessMeasurer()
  const m = deriveMetrics(theme)
  const sm = deriveSidebarMetrics(theme)
  const plan = planTwoColumn({ content, layout, theme, measure })
  const dividerH = m.dividerHeight + m.dividerMargin * 2

  // The main column is everything right of the sidebar. One band, no per-page
  // variation: the sidebar's width is a fraction of the sheet, not of the flow.
  const pages = rowsByPage(pdfPath, (xMin) => xMin >= sm.colW)

  /** Page 1 is padded by `mainPad`, every continuation page by `contPad` — read per page so a theme that differs between them cannot be measured against the wrong one. */
  const padFor = (/** @type {number} */ i) => (i === 0 ? m.mainPad : m.contPad)

  const entryRows = []
  const headRows = []
  const fixedRows = []
  const inkPastBox = []
  /** Pages the diff could NOT measure, with the reason — surfaced, never swallowed. */
  const skipped = []
  /** The last entry of each page: structurally undifferenceable by family 1 (no role after it). */
  const unmeasuredTail = []

  plan.pages.forEach((planPage, i) => {
    const pageRows = pages[i]
    const blocks = planPage.mainBlocks ?? []
    const roles = blocks.map((b) => b.role)
    if (!pageRows) {
      skipped.push({ page: i, reason: 'no-physical-page', roles })
      return
    }
    const pad = padFor(i)
    const contentLeft = sm.colW + pad.left
    const rightEdge = theme.geometry.pageWidth - pad.right

    // ── check 4: no main-column ink past the content box ───────────────────
    // The page-number badge is excluded by construction, not by fudge: it is a
    // flex SIBLING of the padded content View (TwoColumnTemplate's cornerWrap),
    // so it lives outside the padding on purpose. Identified by both its text
    // and its position inside the corner's own width, so a stray "2 of 3" in
    // body copy could not silence a real violation.
    for (const r of pageRows) {
      if (r.xMax <= rightEdge + INK_EPSILON_PT) continue
      const isBadge =
        BADGE_RE.test(r.text) && r.xMin >= theme.geometry.pageWidth - theme.chrome.cornerWidth
      if (isBadge) continue
      inkPastBox.push({
        page: i,
        xMax: round2(r.xMax),
        overshootPt: round2(r.xMax - rightEdge),
        text: r.text
      })
    }

    // ── family 3: the fixed page-1 block ───────────────────────────────────
    if (i === 0 && (content.summary?.length ?? 0) > 0) {
      const summaryTop = pageRows.find((r) => r.text === 'SUMMARY')?.yMin
      const experienceTop = pageRows.find((r) => r.text === 'EXPERIENCE')?.yMin
      if (summaryTop === undefined || experienceTop === undefined) {
        skipped.push({ page: i, reason: 'summary-or-experience-title-not-found', roles: [] })
      } else {
        const predicted = summaryH(content.summary, m, measure) + layoutSpacerPt(layout, m)
        const observed = experienceTop - summaryTop
        fixedRows.push({
          page: i,
          predicted: round2(predicted),
          observed: round2(observed),
          deltaPt: round2(predicted - observed)
        })
      }
    }

    if (blocks.length === 0) {
      skipped.push({ page: i, reason: 'no-entries-on-page', roles })
      return
    }

    // Where each planned block's role heading actually landed, in order.
    let cursor = 0
    const tops = blocks.map((b) => {
      const hit = findRoleRow(pageRows, cursor, b.role, contentLeft)
      if (hit) cursor = hit.index + 1
      return { block: b, top: hit?.top, rowIndex: hit?.index }
    })
    const notFound = tops.filter((t) => t.top === undefined).map((t) => t.block.role)
    if (notFound.length > 0) {
      // A planned entry whose role is not on its planned physical page: the
      // column overflowed and react-pdf carried it onto a continuation sheet, so
      // plan index no longer maps to physical index. Recorded, NOT silently
      // dropped — the sidebar harness's lesson: quietly skipping these turns the
      // statistic into "0.00pt on the pages that already fit".
      skipped.push({ page: i, reason: 'role-not-on-planned-page', roles: notFound })
      return
    }

    unmeasuredTail.push({ page: i, role: blocks[blocks.length - 1].role })
    if (blocks.length === 1) {
      skipped.push({ page: i, reason: 'single-entry-no-following-role', roles })
    }

    // ── family 1: consecutive role tops, minus the divider between them ────
    for (let k = 0; k < tops.length - 1; k++) {
      const b = tops[k].block
      const predicted = Number(entryH(b, m, measure))
      const observed = Number(tops[k + 1].top) - Number(tops[k].top) - dividerH
      entryRows.push({
        page: i,
        role: b.role,
        shape: shapeForRole(b.role, Boolean(b.isContinuation)),
        isContinuation: Boolean(b.isContinuation),
        predicted,
        observed: round2(observed),
        deltaPt: round2(predicted - observed)
      })
    }

    // ── family 2: role top -> first bullet text top, for EVERY entry ───────
    for (const { block, top, rowIndex } of tops) {
      const start = block.startBullet ?? 0
      const first = (block.bullets ?? []).slice(start, block.endBullet)[0]
      if (first === undefined) {
        skipped.push({ page: i, reason: 'entry-has-no-visible-bullet', roles: [block.role] })
        continue
      }
      const bulletRow = findFirstBulletRow(pageRows, Number(rowIndex) + 1, first, contentLeft)
      if (!bulletRow) {
        skipped.push({ page: i, reason: 'first-bullet-row-not-found', roles: [block.role] })
        continue
      }
      const predicted = predictedHeadH(block, m, measure)
      const observed = bulletRow.top - Number(top)
      headRows.push({
        page: i,
        role: block.role,
        shape: shapeForRole(block.role, Boolean(block.isContinuation)),
        isContinuation: Boolean(block.isContinuation),
        predicted,
        observed: round2(observed),
        deltaPt: round2(predicted - observed)
      })
    }
  })

  return {
    entryRows,
    headRows,
    fixedRows,
    inkPastBox,
    skipped,
    unmeasuredTail,
    /** Shapes this run actually differenced with family 1 — the entry-height diff's real coverage. */
    shapesMeasured: [...new Set(entryRows.map((r) => r.shape))].sort(),
    entriesMeasured: entryRows.length,
    headsMeasured: headRows.length,
    planPages: plan.totalPages,
    physicalPages: pages.length
  }
}
