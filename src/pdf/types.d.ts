/**
 * Shared type model for cvx, derived from the canonical JSON Schema
 * (schema/v1/cvx.schema.json). Referenced from JSDoc via
 * `import('./types.js').CVContent` etc. Declaration-only; emits nothing.
 *
 * Sections are optional because not every CV supplies every section — the
 * renderer and validator both tolerate missing ones.
 */

export type BulletItem = string | { text: string; sub?: BulletItem[] }

export interface LinkEntry {
  label?: string
  url?: string
  href?: string
}

export interface Personal {
  name: string
  title?: string
  company?: string
  phone?: string
  phoneHref?: string
  email?: string
  linkedin?: string
  linkedinHref?: string
  facebook?: string
  facebookHref?: string
  location?: string
  links?: LinkEntry[]
}

export interface ProgressionStep {
  title?: string
  period?: string
}

export interface ExperienceEntry {
  role: string
  company?: string
  period?: string
  location?: string
  description?: string
  progression?: ProgressionStep[]
  bullets?: BulletItem[]
}

export interface EducationEntry {
  degree: string
  institution: string
  period?: string
}

export interface CertificationEntry {
  name: string
  issuer?: string
  year?: string
}

export interface PublicationEntry {
  title: string
  venue?: string
  year?: string
}

export interface LanguageEntry {
  language: string
  proficiency?: string
}

export interface AchievementEntry {
  year: string
  text: string
}

export interface RefereeEntry {
  name: string
  title?: string
  company?: string
  email?: string
  phone?: string
}

export interface KeywordGroup {
  group?: string
  items?: string[]
}

export interface AtsKeywords {
  enabled?: boolean
  autoDerive?: boolean
  manual?: string[]
  max?: number
}

export interface CVConfig {
  schemaVersion?: number
  theme?: string
  layout?: string
  page1ExperienceCount?: number
  page1SplitBullets?: number
  atsKeywords?: AtsKeywords
}

export interface LayoutPage {
  sidebar?: string[]
  main?: string[]
}

export interface NormalizedLayout {
  template?: string
  pages?: Record<string, unknown>
  geometry?: Record<string, unknown>
  first?: LayoutPage
  continuation?: LayoutPage
  last?: LayoutPage
}

/** The parsed cv-content bag, plus fields the render pipeline attaches. */
export interface CVContent {
  personal?: Personal
  summary?: BulletItem[] | string
  experience?: ExperienceEntry[]
  education?: EducationEntry[]
  certifications?: CertificationEntry[]
  publications?: PublicationEntry[]
  languages?: LanguageEntry[]
  competencies?: string[] | KeywordGroup[]
  achievements?: AchievementEntry[]
  referees?: RefereeEntry[]
  keywords?: string[] | KeywordGroup[]
  links?: LinkEntry[]
  config?: CVConfig
  profilePhoto?: string
}

export interface ValidateOptions {
  contentDir?: string
  strict?: boolean
  fontsDir?: string
}

/** Extra props threaded into renderSlot for slot-specific data. */
export interface SlotExtra {
  entries?: ExperienceEntry[]
}

/** A real-font measurer — the return value of measure.js's createMeasurer(). */
export type Measurer = ReturnType<typeof import('./measure.js').createMeasurer>
