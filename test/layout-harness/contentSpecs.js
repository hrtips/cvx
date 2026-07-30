// ── Fixture spec → cv-content ───────────────────────────────────────────────
// Turns a small declarative spec into a full, schema-valid set of cv-content
// YAML documents (as plain JS objects — dumped to YAML by scaffold.js).
// Deterministic: same spec in, byte-identical content out (textPool.js has
// no RNG), which is what lets the render-oracle baseline stay stable.
// ─────────────────────────────────────────────────────────────────────────

import { bulletsFor, sentencesFor } from './textPool.js'

const LEVEL_COUNT = { absent: 0, one: 1, many: 8 }

// ── personal / summary / experience ─────────────────────────────────────────

function buildPersonal(spec) {
  const personal = {
    name: spec.personalName ?? 'Jordan Rivera',
    title: 'Senior Programme Lead',
    company: 'Example Holdings',
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

function buildSummary(spec) {
  const n = { short: 2, typical: 5, long: 4, overflowing: 5 }[spec.textLength] ?? 3
  return sentencesFor(spec.textLength, 'summary', n)
}

function buildExperienceEntry(i, spec) {
  const bulletsN = { short: 2, typical: 4, long: 5, overflowing: 7 }[spec.textLength] ?? 3
  return {
    role: `Role Title ${i}`,
    company: `Company ${i}`,
    period: `20${10 + i} – 20${11 + i}`,
    description: sentencesFor(spec.textLength, `desc${i}`, 1)[0],
    bullets: bulletsFor(spec.textLength, `exp${i}`, bulletsN)
  }
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
