// ── Independent sidebar budget/height oracle ───────────────────────────────
//
// DELIBERATE DUPLICATION. Every other harness module goes out of its way NOT
// to restate layout.js's formulas (C0's mirror-drift finding). This one does
// the opposite, on purpose, because it is the only way the no-poppler tier can
// have any defect-detection power at all.
//
// Review found the first cut of C3a's sidebar assertions unfalsifiable: they
// read `used` and `budget` out of the packer's own output and re-derived block
// heights by calling the packer's own `sidebarSectionH`, so they restated
// `packBlocks`' break condition instead of checking it. A 2x budget error left
// them all green. The fix is a *second, independent* route to the same numbers:
// arithmetic over the theme's raw tokens, written out here in test-land, with
// no call into layout.js.
//
// The cost is real and accepted: change a theme token or a component's box
// model and this file must change too. That is a loud test failure, never a
// silent drift — and the *authoritative* cross-check that both routes match
// reality is layoutSidebarMeasureDiff.test.js, which reads the true offsets
// out of a rendered PDF (0.00pt on every section, poppler-gated). This module
// is the cheap, always-runs sentinel; that one is the ground truth.
//
// SCOPE: single-line assumption. Every derivation here assumes the name,
// title, company and per-item label rows wrap to ONE line. That holds for the
// fixture corpus and the shipped scaffold; `singleLineRowsFor()` +
// `multiLineRows()` below make the assumption assertable rather than silent, and
// a test does assert it, so a corpus change that breaks it fails loudly instead
// of quietly invalidating every expected number in this file.
// ─────────────────────────────────────────────────────────────────────────

import { tealTheme as T } from '../../src/pdf/themes/teal.js'

/** Lato's natural line box, re-stated as a literal — layout.js reads it from the font; measure.test.js pins the two together. */
const LH = 1.2

const G = T.geometry
const CH = T.chrome
const TY = T.typography
const SP = T.spacing

/** pageHeight - topBar, re-derived rather than imported from bodyHeight(). */
const BODY_H = G.pageHeight - G.topBar

/** The sidebar content column's own paddings + the packer's safety backstop. */
const COLUMN_OVERHEAD = G.sidebarPad.top + G.sidebarPad.bottom + SP.safety

/** Wrap width of a section body inside the padded content container. */
const INNER_W = G.pageWidth * G.sidebarFraction - G.sidebarPad.left - G.sidebarPad.right

/** Wrap width inside the identity block, which pads itself. */
const IDENTITY_W = G.pageWidth * G.sidebarFraction - CH.identityPl - CH.identityPr

/** Name / rule / title / company, one line each — shared by both identity variants. */
const NAME_BLOCK_H =
  TY.name.size * LH +
  CH.dividerHeight +
  CH.identityDividerMy * 2 +
  TY.title.size * 1.5 +
  SP.entryMetaMt +
  TY.company.size * LH

/**
 * Height of the identity block injected at the top of a page's sidebar.
 * @param {'identity-photo'|'identity-compact'} kind
 * @param {{ photo?: boolean }} [opts]
 */
export function expectedIdentityH(kind, { photo = false } = {}) {
  if (kind === 'identity-compact') return CH.identityPt * 2 + NAME_BLOCK_H
  return CH.identityPt + CH.identityPb + NAME_BLOCK_H + (photo ? CH.photoHeight + CH.photoPb : 0)
}

/**
 * The usable sidebar height on a given page — the number `packSidebar`'s
 * `budgetFn` must produce. Independent of it by construction.
 *
 * @param {number} pageIndex
 * @param {{ photo?: boolean }} [opts]
 */
export function expectedSidebarBudget(pageIndex, { photo = false } = {}) {
  const identity =
    pageIndex === 0
      ? expectedIdentityH('identity-photo', { photo })
      : expectedIdentityH('identity-compact')
  return BODY_H - identity - COLUMN_OVERHEAD
}

/** A sidebar section title: one letter-spaced uppercase line, bottom-ruled. */
const SIDEBAR_TITLE_H =
  TY.sidebarSection.size * LH + SP.sectionTitlePb + CH.sidebarBorderWidth + SP.sidebarTitleMb

/** buildSidebar's rule between two sections on the same page. */
export const SECTION_DIVIDER_H = CH.dividerHeight + SP.sectionGap

/**
 * The label each sidebar section's SectionTitle renders — restated here (like
 * everything else in this file) rather than imported, and paired with the
 * continuation marker C3b appends when a section is split across pages. The
 * single-line assumption covers these too: `continuedTitleRows()` feeds them to
 * a real measurer and a test asserts none of them wraps, which is what lets
 * `expectedSliceH` charge one `SIDEBAR_TITLE_H` for a continued slice as well
 * as for a first one.
 */
const SECTION_LABELS = {
  contact: 'Contact',
  achievements: 'Achievements',
  education: 'Education',
  certifications: 'Certifications',
  publications: 'Publications',
  languages: 'Languages',
  competencies: 'Core Competencies',
  referees: 'Referees'
}

/** layout.js's CONTINUED_SUFFIX, re-stated (this file never imports from layout.js — see the docblock). */
const CONTINUED_SUFFIX = '(cont.)'

/**
 * @internal
 * How much ONE more item adds to a section's height — the per-item increment,
 * item by item, derived from each component's own box model. This is what makes
 * "every item is measured, none silently skipped" an item-level fact the
 * no-poppler tier can check.
 *
 * @type {Record<string, number>}
 */
const PER_ITEM_H = {
  // EducationSection: degree(1.3) + institution(mt entryMetaMt) + period(mt .75) + item mb 15
  education:
    TY.degree.size * 1.3 +
    SP.entryMetaMt +
    TY.institution.size * LH +
    0.75 +
    TY.caption.size * LH +
    15,
  // CertificationsSection: name + issuer + year + item mb 12
  certifications:
    TY.degree.size * 1.3 +
    SP.entryMetaMt +
    TY.institution.size * LH +
    0.75 +
    TY.caption.size * LH +
    12,
  // PublicationsSection: title + "venue · year" meta + item mb 12
  publications: TY.degree.size * 1.3 + SP.entryMetaMt + TY.institution.size * LH + 12,
  // LanguagesSection: language + proficiency + item mb 7
  languages: TY.degree.size * 1.3 + 0.75 + TY.caption.size * LH + 7,
  // AchievementsSection: year(1.3) + text(mt .75, leading achieveText) + item mb sectionGap
  achievements:
    TY.achieveYear.size * 1.3 + 0.75 + TY.achieveText.size * TY.achieveText.leading + SP.sectionGap,
  // ContactSection: max(icon+mt, value row) + row mb
  contact:
    Math.max(SP.iconWidth + SP.iconMt, TY.sidebarContact.size * TY.sidebarContact.leading) +
    SP.contactRowMb
}

/**
 * How much ONE more item adds to a section, straight from the token arithmetic
 * above — the number the split-maximality check uses to say "one more item
 * would not have fitted". `undefined` for a section this oracle cannot derive
 * from tokens alone (competencies: its height depends on how the tag pills wrap,
 * which needs glyph widths; referees: non-uniform, see `expectedRefereeH`).
 *
 * @param {string} key
 * @returns {number | undefined}
 */
export function perItemH(key) {
  return PER_ITEM_H[key]
}

/**
 * Full expected height of a section whose every row is one line, for the
 * sections whose per-item increment is uniform.
 *
 * @param {keyof typeof PER_ITEM_H} key
 * @param {number} itemCount
 */
export function expectedSectionH(key, itemCount) {
  return SIDEBAR_TITLE_H + PER_ITEM_H[key] * itemCount + (SECTION_WRAP_MB[key] ? SP.sectionGap : 0)
}

/**
 * Sections whose root View carries a marginBottom of sectionGap; the two that
 * do not (achievements, competencies) are absent by construction.
 * @type {Record<string, true>}
 */
const SECTION_WRAP_MB = {
  education: true,
  certifications: true,
  publications: true,
  languages: true,
  contact: true
}

/**
 * Expected height of ONE SLICE of a section — items `[start, end)` under the
 * section's title (C3b). Identical arithmetic to `expectedSectionH` bar the
 * item count, because that is exactly what the renderer does: a slice is the
 * same component fed a sliced array. `continued` costs nothing extra only
 * because the "(cont.)" title still measures one line, which
 * `continuedTitleRows()` makes an asserted fact rather than an assumption.
 *
 * @param {keyof typeof PER_ITEM_H} key
 * @param {number} itemsInSlice
 */
export function expectedSliceH(key, itemsInSlice) {
  return expectedSectionH(key, itemsInSlice)
}

/**
 * The title rows the "(cont.)" marker adds to this oracle's single-line
 * assumption, for `multiLineRows()` to check against a real measurer. Content-
 * independent: the labels are the components' own literals, and the marker is
 * appended to every one of them because any section can be split.
 */
export function continuedTitleRows() {
  return Object.values(SECTION_LABELS).flatMap((label) =>
    [label, `${label} ${CONTINUED_SUFFIX}`].map((text) => ({
      text: text.toUpperCase(),
      size: TY.sidebarSection.size,
      width: INNER_W,
      weight: TY.sidebarSection.weight,
      letterSpacing: TY.sidebarSection.spacing
    }))
  )
}

/**
 * One referee entry's height, plus the ruled separator that precedes every
 * entry after the first. Split out because RefereesSection's box model is the
 * only non-uniform one (optional title line, optional email/phone rows) and it
 * is the 580pt block that drives C3a's two page-count regressions.
 *
 * @param {{ title?: boolean, company?: boolean, email?: boolean, phone?: boolean }} shape
 */
export function expectedRefereeH({ title = false, email = false, phone = false } = {}) {
  const labelRowH = Math.max(7 * LH, TY.refContact.size * LH) // label fontSize 7, width 9
  return (
    TY.refName.size * LH +
    (title ? 0.75 + TY.refDetail.size * LH : 0) +
    SP.descMt +
    (email ? SP.entryMetaMt + labelRowH : 0) +
    (phone ? SP.entryMetaMt + labelRowH : 0)
  )
}

/** The rule + margins between two referee entries. */
const REFEREE_SEPARATOR_H = CH.dividerHeight + SP.sectionGap * 2

/** Referees section total for `n` identically-shaped entries (n === 0 => the italic placeholder line). */
export function expectedRefereesH(n, shape) {
  if (n === 0) return SIDEBAR_TITLE_H + TY.meta.size * LH
  return SIDEBAR_TITLE_H + n * expectedRefereeH(shape) + (n - 1) * REFEREE_SEPARATOR_H
}

/** Which optional rows one referee entry actually renders — the input `expectedRefereeH` varies by. */
const refereeShape = (r) => ({
  title: Boolean(r.title),
  email: Boolean(r.email),
  phone: Boolean(r.phone)
})

/** Referees SLICE total for a concrete (possibly heterogeneous) list of entries. */
function expectedRefereesSliceH(entries) {
  if (entries.length === 0) return SIDEBAR_TITLE_H + TY.meta.size * LH
  return (
    SIDEBAR_TITLE_H +
    entries.reduce((a, r) => a + expectedRefereeH(refereeShape(r)), 0) +
    (entries.length - 1) * REFEREE_SEPARATOR_H
  )
}

/** What moving ONE more referee onto the previous page would have cost: its own height plus the ruled separator. */
export function expectedRefereeIncrement(entry) {
  return REFEREE_SEPARATOR_H + expectedRefereeH(refereeShape(entry))
}

/**
 * Sections this oracle can derive from theme tokens alone. `contact` and
 * `competencies` are deliberately absent: a contact row's height depends on
 * whether its value wraps (the label-less-long-URL fixture makes that real) and
 * a competencies block's on how its tag pills flow, both of which need glyph
 * widths — i.e. the very measurement under test. Pages containing them are
 * reported as un-derivable rather than approximated.
 */
const TOKEN_DERIVABLE = new Set([
  'education',
  'certifications',
  'publications',
  'languages',
  'achievements',
  'referees'
])

/**
 * The SMALLEST piece of a section that can legally be placed: its title plus
 * one item, because cutting to zero items would orphan the heading. This is the
 * unit `frontLoadMaximal` asks about — "could the next page's first section
 * have started here?" — and the floor that makes C3b's rule 1b necessary at
 * all. Token-derived, so the answer does not come from the packer.
 *
 * `null` for a section this oracle cannot derive (see TOKEN_DERIVABLE).
 *
 * @param {string} key
 * @param {object} content
 */
export function expectedMinUnitH(key, content) {
  if (!TOKEN_DERIVABLE.has(key)) return null
  if (key === 'referees') {
    const first = (content.referees ?? [])[0]
    return first ? SIDEBAR_TITLE_H + expectedRefereeH(refereeShape(first)) : null
  }
  return expectedSliceH(/** @type {keyof typeof PER_ITEM_H} */ (key), 1)
}

/** The content array one sidebar section iterates — mirrored, like everything else here. */
const SECTION_ITEMS = {
  education: (c) => c.education ?? [],
  certifications: (c) => c.certifications ?? [],
  publications: (c) => c.publications ?? [],
  languages: (c) => c.languages ?? [],
  achievements: (c) => c.achievements ?? [],
  referees: (c) => c.referees ?? []
}

/**
 * The height one planned SLICE should have, derived from tokens + the content
 * bag, or `null` when the section is not token-derivable (see TOKEN_DERIVABLE).
 *
 * @param {{ key: string, start: number, end: number }} slice
 * @param {object} content
 */
export function expectedSliceHFor(slice, content) {
  if (!TOKEN_DERIVABLE.has(slice.key)) return null
  const items = SECTION_ITEMS[slice.key](content).slice(slice.start, slice.end)
  if (slice.key === 'referees') return expectedRefereesSliceH(items)
  return expectedSliceH(/** @type {keyof typeof PER_ITEM_H} */ (slice.key), items.length)
}

/**
 * How full one page's sidebar column should be — every slice's own height plus
 * `buildSidebar`'s rule between consecutive ones — or `null` when any slice on
 * the page is not token-derivable. This is the fully-independent counterpart of
 * the packer's `sidebarFill.used`: where it returns a number, "the packer filled
 * this page to exactly the height the theme says" is checkable without calling
 * layout.js at all.
 *
 * @param {{ key: string, start: number, end: number }[]} slices
 * @param {object} content
 */
export function expectedPageUsedH(slices, content) {
  let total = 0
  for (let i = 0; i < slices.length; i++) {
    const h = expectedSliceHFor(slices[i], content)
    if (h === null) return null
    total += (i > 0 ? SECTION_DIVIDER_H : 0) + h
  }
  return total
}

/**
 * The rows this oracle's single-line assumption covers, for a given content bag:
 * the identity name/title/company at the identity width, and each section's item
 * label at the section body width. Fed to a measurer by the caller so the
 * assumption is ASSERTED rather than assumed.
 *
 * @param {object} content
 */
export function singleLineRowsFor(content) {
  const p = content.personal ?? {}
  const rows = [
    {
      text: p.name ?? '',
      size: TY.name.size,
      width: IDENTITY_W,
      weight: TY.name.weight,
      letterSpacing: TY.name.spacing
    },
    { text: p.title ?? '', size: TY.title.size, width: IDENTITY_W },
    { text: p.company ?? '', size: TY.company.size, width: IDENTITY_W, weight: TY.company.weight }
  ]
  for (const e of content.education ?? [])
    rows.push({ text: e.degree, size: TY.degree.size, width: INNER_W, weight: TY.degree.weight })
  for (const c of content.certifications ?? [])
    rows.push({ text: c.name, size: TY.degree.size, width: INNER_W, weight: TY.degree.weight })
  for (const x of content.publications ?? [])
    rows.push({ text: x.title, size: TY.degree.size, width: INNER_W, weight: TY.degree.weight })
  for (const l of content.languages ?? [])
    rows.push({ text: l.language, size: TY.degree.size, width: INNER_W, weight: TY.degree.weight })
  return rows
}

/**
 * Does this oracle's arithmetic apply to a given content bag at all?
 *
 * Everything here assumes one line per identity row and per item label. Most
 * fixtures satisfy that; the ones C3b's review added deliberately do not — a
 * page-tall certification name and a six-fold-repeated personal.title exist
 * precisely to break the single-line world. Rather than weaken every expected
 * number to accommodate them, the token-derived checks SKIP those fixtures and
 * say so, and `multiLineRows` stays an exact assertion for the rest.
 *
 * @param {import('../../src/pdf/types.js').Measurer} measure
 * @param {object} content
 */
export function oracleApplies(measure, content) {
  return multiLineRows(measure, singleLineRowsFor(content)).length === 0
}

/**
 * Guard for the single-line assumption above: every string this oracle treats
 * as one line must actually measure as one line at its real size/width.
 *
 * @param {import('../../src/pdf/types.js').Measurer} measure
 * @param {{ text: string, size: number, width: number, weight?: number, letterSpacing?: number }[]} rows
 * @returns {{ text: string, lines: number }[]} rows that are NOT one line
 */
export function multiLineRows(measure, rows) {
  return rows
    .map((r) => ({
      text: r.text,
      lines: measure.lineCount(r.text, r.size, r.width, {
        weight: r.weight,
        letterSpacing: r.letterSpacing
      })
    }))
    .filter((r) => r.lines !== 1)
}
