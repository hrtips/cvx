// ── Fixture spec → cv-content ───────────────────────────────────────────────
// Turns a small declarative spec into a full, schema-valid set of cv-content
// YAML documents (as plain JS objects — dumped to YAML by scaffold.js).
// Deterministic: same spec in, byte-identical content out (textPool.js has
// no RNG), which is what lets the render-oracle baseline stay stable.
// ─────────────────────────────────────────────────────────────────────────

import { bulletsFor, sentencesFor } from './textPool.js'

const LEVEL_COUNT = { absent: 0, one: 1, many: 8 }

// ── personal / summary / experience ─────────────────────────────────────────

/**
 * `tallIdentity` repeats the title/company until the injected identity block —
 * which every page's sidebar budget is reduced by, and which is never packed —
 * is several hundred pt tall. The curated corpus tops out at 67.95pt against a
 * ~762pt budget, so the identity term was effectively a constant and no fixture
 * could exercise a sidebar page whose budget the identity had eaten (C3b review).
 */
function buildPersonal(spec) {
  const personal = {
    name: spec.personalName ?? 'Jordan Rivera',
    title: spec.tallIdentity
      ? 'Senior Programme Lead and Field Commander of Continental Operations '.repeat(6).trim()
      : 'Senior Programme Lead',
    company: spec.tallIdentity
      ? 'Example Holdings International Group and Subsidiaries Worldwide '.repeat(6).trim()
      : 'Example Holdings',
    phone: '+1 (555) 010-0100',
    phoneHref: 'tel:+15550100100',
    email: 'jordan.rivera@example.com',
    linkedin: 'linkedin.com/in/jordanrivera',
    linkedinHref: 'https://www.linkedin.com/in/jordanrivera',
    location: 'Springfield'
  }
  if (spec.extraLink) personal.links = [spec.extraLink]
  return personal
}

/**
 * Summary length. `summaryBullets` overrides the per-textLength default, which
 * is what lets a fixture cross the page-1 CLIFF (C3b review): the summary is
 * subtracted from page 1's experience budget before anything is packed, so
 * `summaryH` past ~452pt leaves less room than the smallest legal piece of an
 * experience entry (its head plus one bullet, 177.75pt), and past ~630pt it
 * makes the budget NEGATIVE. Both were unreachable before — every curated
 * fixture's summary measured exactly 422.4pt, 29.6pt short of the cliff,
 * because this function had no length axis at all.
 */
function buildSummary(spec) {
  const n =
    spec.summaryBullets ?? { short: 2, typical: 5, long: 4, overflowing: 5 }[spec.textLength] ?? 3
  const lines = sentencesFor(spec.textLength, 'summary', n)
  // RV14, second site: the SUMMARY also accepts the `{ text, link, suffix }`
  // object form, and it renders through a different component in each variant.
  // The experience half was fixed while this one stayed broken, because no
  // fixture had an object-form summary bullet — a real CV found it, not the
  // suite. Same axis, so the corpus now reaches both.
  if (spec.linkedBullet && lines.length > 0) {
    const last = lines.length - 1
    lines[last] = {
      text: `${lines[last]} Described in `,
      link: { href: 'https://example.com/summary-note', label: 'the published design note' },
      suffix: ', which covers the reasoning in full.'
    }
  }
  return lines
}

// ── Head-row shapes (S2a) ───────────────────────────────────────────────────
//
// `entryH()` composes six kinds of row above an entry's bullets — role,
// company/period, location, description, progression, and the bullet list's own
// margin — and until S2 the corpus could reach only three of them: `grep -rn
// progression test/` found nothing and no fixture set `location`
// (design-layout-fidelity.md §5.2). These literals are the missing shapes, kept
// here (not in the harness that measures them) so the four S2a edge fixtures
// below and the main-column diff's own shape corpus share ONE copy of each
// string — the numbers in that harness's expectation table are widths, and two
// copies of a width drift silently.
//
// The three "wrapping" strings are deliberately well past the column, not
// just over it: `measure.js`'s `lineCount` is pure greedy while textkit shrinks
// inter-word glue by up to a third of a space before it breaks (§3.5), so a
// string that only just overflows can be modelled at two lines and rendered at
// one. Every one of these clears the column by more than its own shrink
// allowance, so model and render agree on the line COUNT and the only thing
// under test is the HEIGHT that count is multiplied by.
export const HEAD_SHAPES = {
  /** one rendered line at `typography.meta.size` */
  shortLocation: 'Springfield, Elsewhere',
  /** appended to a role to push it to exactly two rendered lines */
  wrappingRoleTail:
    'Coordinator of Strategic Partnerships and Cross Functional Delivery Programmes',
  /** appended to a company to push the meta row to exactly two rendered lines */
  wrappingCompanyTail:
    'Advanced Systems and Continental Logistics Holdings Group Limited Worldwide',
  /** two rendered lines at `typography.meta.size` */
  wrappingLocation:
    'Springfield Metropolitan District, Northern Riverlands Province, Republic of Elsewhere Islands'
}

/**
 * `n` progression steps for entry `i`. Titles carry the entry ordinal so a
 * step's text can never be confused with another entry's, and periods are
 * literal strings (never `new Date()`) so the same spec dumps byte-identical
 * YAML.
 */
export function progressionSteps(n, i) {
  return Array.from({ length: n }, (_, j) => ({
    title: `Programme Lead ${i}.${j}`,
    period: `20${10 + j} – 20${11 + j}`
  }))
}

/**
 * `pageTallBullet` makes ONE bullet taller than a whole page. That is design
 * doc G7's irreducible residual — the one shape no packer can paginate, since
 * the smallest legal unit is already too big — and the corpus could not express
 * it, so the branch that force-places and records `overflowPt` was never
 * exercised end to end.
 *
 * `entryLocation` / `entryProgression` / `wrappingRole` / `wrappingCompany` are
 * the S2a head axes. All four are OPT-IN and absent by default: every fixture
 * that predates them keeps byte-identical content, which is what makes the
 * `baseline.json` diff for S2a four new keys and zero moved rows.
 *
 * `entryShapes[i]` overrides those two axes for ONE entry. Every knob above
 * applies the same shape to every entry, which is right for the S2a fixtures
 * (the axis under test is the entry) and wrong for a fixture whose whole point
 * is that entries DIFFER — `edge-page1-blocked` (design-layout-fidelity.md
 * §5.5) needs a first entry that fills about half of page 1 and a SECOND entry
 * whose smallest legal piece does not fit what is left. Also opt-in and absent
 * by default, for the same baseline reason.
 */
function buildExperienceEntry(i, spec) {
  const shape = spec.entryShapes?.[i] ?? {}
  const bulletsN =
    shape.bullets ?? { short: 2, typical: 4, long: 5, overflowing: 7 }[spec.textLength] ?? 3
  const bullets = bulletsFor(spec.textLength, `exp${i}`, bulletsN)
  if (spec.pageTallBullet && i === 0) {
    bullets[0] = `${bullets[0]} ${'One more clause of the same delivery, spelled out at length. '.repeat(30).trim()}`
  }
  // RV4: the OBJECT bullet form (`{ text, link, suffix }`), which the schema
  // documents and no fixture reached. BulletList.jsx draws the three parts as
  // one continuous run, and every height formula measured `text` alone — a
  // 27pt under-measure on the shipped theme, against a 15pt safety margin,
  // invisible because the render-diff harness's own helper stripped the same
  // two fields. The corpus could not express the shape, so the suite was green
  // about a document it could not build (doctrine 6).
  //
  // Deliberately placed on the LAST bullet and sized to push the combined
  // string past a wrap boundary — a short label on a short bullet measures the
  // same either way and would prove nothing.
  if (spec.linkedBullet) {
    const i0 = bullets.length - 1
    bullets[i0] = {
      text: `${bullets[i0]} Written up in `,
      link: { href: 'https://example.com/write-up', label: 'the full engineering write-up' },
      suffix: ', which covers the rollout and what it cost.'
    }
  }
  const entry = {
    // The ordinal stays in front of the wrapping tail so every role is still
    // unique — ExperienceSection.jsx keys its rows on `role`-`company`.
    role: spec.wrappingRole ? `Role Title ${i} ${HEAD_SHAPES.wrappingRoleTail}` : `Role Title ${i}`,
    company: spec.wrappingCompany
      ? `Company ${i} ${HEAD_SHAPES.wrappingCompanyTail}`
      : `Company ${i}`,
    period: `20${10 + i} – 20${11 + i}`,
    description: sentencesFor(spec.textLength, `desc${i}`, 1)[0],
    bullets
  }
  if (spec.entryLocation)
    entry.location =
      spec.entryLocation === 'wrapping' ? HEAD_SHAPES.wrappingLocation : HEAD_SHAPES.shortLocation
  const progression = shape.progression ?? spec.entryProgression
  if (progression) entry.progression = progressionSteps(progression, i)
  return entry
}

function buildExperience(spec) {
  const n = spec.experienceCount ?? (spec.volume === 'multi-page' ? 5 : 2)
  return Array.from({ length: n }, (_, i) => buildExperienceEntry(i, spec))
}

// ── education / competencies (baseline sidebar content, not on the 5-axis sweep) ──

function buildEducation(spec) {
  const n = spec.minimal ? 0 : (spec.educationCount ?? 3)
  return Array.from({ length: n }, (_, i) => ({
    degree: `Degree ${i}`,
    institution: `Institution ${i}`,
    period: `19${90 + i} – 19${94 + i}`
  }))
}

function buildCompetencies(spec) {
  const n = spec.minimal ? 0 : (spec.competenciesCount ?? 8)
  return Array.from({ length: n }, (_, i) => `Competency ${i}`)
}

// ── the five {absent,one,many} optional sections ────────────────────────────
// Each builder takes an item COUNT (not a level string) so the "single
// oversized section" edge case can ask for an arbitrary count (e.g. 60)
// without a special case per section.

const ITEM_BUILDERS = {
  certifications: (n) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Certification ${i}`,
      issuer: `Issuer ${i}`,
      year: `${2000 + i}`
    })),
  publications: (n) =>
    Array.from({ length: n }, (_, i) => ({
      title: `Publication ${i}`,
      venue: `Venue ${i}`,
      year: `${2000 + i}`
    })),
  languages: (n) =>
    Array.from({ length: n }, (_, i) => ({
      language: `Language ${i}`,
      proficiency: ['Native', 'Professional', 'Conversational', 'Basic'][i % 4]
    })),
  referees: (n) =>
    Array.from({ length: n }, (_, i) => ({
      name: `Referee ${i}`,
      title: `Title ${i}`,
      company: `Company ${i}`,
      email: `referee${i}@example.com`,
      phone: '+1 (555) 010-0200'
    })),
  achievements: (n) =>
    Array.from({ length: n }, (_, i) => ({ year: `Award ${i}`, text: `— Example Body ${i}` }))
}

export const SECTION_KEYS = Object.keys(ITEM_BUILDERS)

// ── config ───────────────────────────────────────────────────────────────

function buildConfig(spec) {
  const config = { schemaVersion: 1, theme: spec.theme ?? 'teal', layout: 'two-column' }
  if (spec.page1ExperienceCount != null) config.page1ExperienceCount = spec.page1ExperienceCount
  if (spec.page1SplitBullets != null) config.page1SplitBullets = spec.page1SplitBullets
  return config
}

/**
 * Build the full content bag for a fixture spec.
 *
 * spec: {
 *   id, description,
 *   sections: { certifications, publications, languages, referees, achievements } // each 'absent'|'one'|'many'
 *   textLength: 'short'|'typical'|'long'|'overflowing',
 *   volume: 'fits-1-page'|'multi-page',
 *   minimal?: boolean,                 // drop education/competencies too (all-optional-absent edge case)
 *   personalName?: string,
 *   extraLink?: { href, label? },
 *   experienceCount?, educationCount?, competenciesCount?,   // overrides for named edge cases
 *   entryLocation?: 'short'|'wrapping',  // S2a head axes — every experience entry
 *   entryProgression?: number,           // gets the same shape; absent by default so
 *   wrappingRole?: boolean,              // no pre-existing fixture's content moves.
 *   wrappingCompany?: boolean,
 *   entryShapes?: { bullets?: number, progression?: number }[],  // per-ENTRY override of the two above
 *   linkedBullet?: boolean,       // RV4: last bullet uses the { text, link, suffix } object form

 *   page1ExperienceCount?, page1SplitBullets?, theme?,
 *   oversizedSection?: keyof ITEM_BUILDERS, oversizedCount?: number,
 * }
 *
 * Returns a map of { filename (without .yaml) -> content }, ready for
 * scaffold.js to YAML-dump. A section is entirely OMITTED (no key at all)
 * for 'absent' rather than written as `[]` — the more common real-world
 * "absent" shape (no file), and distinct from the schema's own "referees: []"
 * special case (which we exercise deliberately in the oracle test's
 * `emptyReferees` fixture instead — see layoutRenderOracle.test.js).
 */
export function buildContent(spec) {
  const sections = spec.sections ?? {}
  const files = {
    personal: buildPersonal(spec),
    summary: buildSummary(spec),
    experience: buildExperience(spec),
    config: buildConfig(spec)
  }

  const education = buildEducation(spec)
  if (education.length) files.education = education
  const competencies = buildCompetencies(spec)
  if (competencies.length) files.competencies = competencies

  for (const key of SECTION_KEYS) {
    if (spec.oversizedSection === key) {
      files[key] = ITEM_BUILDERS[key](spec.oversizedCount ?? 60)
      // A section whose SINGLE item is taller than a page: G7's residual on the
      // sidebar side. `oversizedCount: 1` alone is not enough — the item has to
      // be long, and a 60-item section splits cleanly, so it never reaches the
      // force-place branch.
      if (spec.oversizedItemPageTall) {
        files[key] = [
          {
            ...files[key][0],
            name: `${'Certification of Extended Professional Standing '.repeat(60).trim()}`
          }
        ]
      }
      continue
    }
    const level = spec.minimal ? 'absent' : (sections[key] ?? 'one')
    const count = LEVEL_COUNT[level] ?? 0
    if (count > 0) files[key] = ITEM_BUILDERS[key](count)
  }

  // explicit-empty-list form for a section (distinct from "absent" = no
  // file at all) — used by the dedicated emptyReferees named edge case.
  for (const key of spec.explicitEmptySections ?? []) files[key] = []

  return files
}
