// ── Shared CVX type model ────────────────────────────────────────────────────
// Hand-written from schema/v1/cvx.schema.json ($defs) plus the runtime shapes
// the packer/renderer add. Imported from JS via JSDoc:
//   /** @param {import('./types.js').CVContent} content */
// (TS resolves `./types.js` to this adjacent declaration file.)
// ─────────────────────────────────────────────────────────────────────────────

/** A labelled hyperlink used by personal.links (schema: linkEntry). */
export interface LinkEntry {
  href: string
  label?: string
}

/** Inline hyperlink inside a bullet line. */
export interface BulletLink {
  href: string
  label: string
}

/** Object form of a bullet line: text + optional inline link + suffix. */
export interface BulletObject {
  text: string
  link?: BulletLink
  suffix?: string
}

/** A bullet line — a plain string or the object form (schema: bulletItem). */
export type BulletItem = string | BulletObject

/** A list of bullet lines (schema: summary). */
export type Summary = BulletItem[]

/** Identity and contact details (schema: personal). */
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

/** A promotion / role change within one company (schema: progressionStep). */
export interface ProgressionStep {
  title: string
  period?: string
}

/**
 * One work-history entry (schema: experienceEntry) plus the pagination fields
 * the packer (layout.js) injects when it slices an entry across pages.
 */
export interface ExperienceEntry {
  role: string
  company?: string
  period?: string
  location?: string
  description?: string
  progression?: ProgressionStep[]
  bullets?: BulletItem[]
  /** Set by packExperiences() on a continuation slice. */
  isContinuation?: boolean
  /** First bullet index rendered on this slice. */
  startBullet?: number
  /** One-past-the-last bullet index rendered on this slice. */
  endBullet?: number
}

/** One education entry (schema: educationEntry). */
export interface EducationEntry {
  degree: string
  institution: string
  period?: string
}

/** One certification entry (schema: certificationEntry). */
export interface CertificationEntry {
  name: string
  issuer?: string
  year?: string
}

/** One publication entry (schema: publicationEntry). */
export interface PublicationEntry {
  title: string
  venue?: string
  year?: string
}

/** One language entry (schema: languageEntry). */
export interface LanguageEntry {
  language: string
  proficiency?: string
}

/** One award / recognition entry (schema: achievementEntry). */
export interface AchievementEntry {
  year: string
  text: string
}

/** One referee entry (schema: refereeEntry). */
export interface RefereeEntry {
  name: string
  title?: string
  company?: string
  email?: string
  phone?: string
}

/** A named group of keywords (schema: keywordGroup). */
export interface KeywordGroup {
  [group: string]: string | string[]
}

/** ATS keyword source (schema: keywords). */
export type Keywords = string | KeywordGroup | Array<string | KeywordGroup>

/** ATS keyword metadata behaviour (schema: config.atsKeywords). */
export interface AtsKeywords {
  enabled?: boolean
  autoDerive?: boolean
  max?: number
}

/** Build configuration (schema: config). */
export interface CVConfig {
  schemaVersion?: number
  theme?: string
  layout?: string
  /** null is the in-memory "unset" the renderer normalises to. */
  page1ExperienceCount?: number | null
  page1SplitBullets?: number | null
  atsKeywords?: AtsKeywords
}

/**
 * The full content bag — one field per cv-content/*.yaml file, keyed by
 * filename. personal is required in practice (drives filename + metadata and
 * the sidebar/header components read it unconditionally); everything else is
 * optional (a missing file just drops its section).
 */
export interface CVContent {
  personal: Personal
  summary: Summary
  experience: ExperienceEntry[]
  education?: EducationEntry[]
  certifications?: CertificationEntry[]
  publications?: PublicationEntry[]
  languages?: LanguageEntry[]
  competencies?: string[]
  achievements?: AchievementEntry[]
  referees?: RefereeEntry[]
  keywords?: Keywords
  profilePhoto?: string | null
}

/**
 * The content bag as the two document components (CVDocument, ATSDocument)
 * consume it: every list is treated as present. The components guard each
 * section with `x?.length > 0 && x.map(...)`, an inline pattern strict-null
 * flow analysis cannot narrow through; modelling the lists as required here
 * keeps those render bodies cast-free. render.js asserts a CVContent bag to
 * this at the single createElement boundary.
 */
export interface RenderContent {
  personal: Personal
  summary: Summary
  experience: ExperienceEntry[]
  education: EducationEntry[]
  certifications: CertificationEntry[]
  publications: PublicationEntry[]
  languages: LanguageEntry[]
  competencies: string[]
  achievements: AchievementEntry[]
  referees: RefereeEntry[]
  keywords?: Keywords
  profilePhoto?: string | null
}

/** A raw (pre-normalisation) slot as parsed from a layout YAML (schema: layoutSlot). */
export type RawLayoutSlot =
  | string
  | { spacer?: number; [section: string]: number | { continued?: boolean } | undefined }

/** A raw (pre-normalisation) page region as parsed from a layout YAML. */
export interface RawLayoutPage {
  sidebar?: unknown
  main?: unknown
}

/** A raw layout document as parsed from a layout YAML (schema: layout). */
export interface RawLayout {
  template?: string
  pages?: { first?: RawLayoutPage; continuation?: RawLayoutPage; last?: RawLayoutPage }
  first?: RawLayoutPage
  continuation?: RawLayoutPage
  last?: RawLayoutPage
  geometry?: unknown
}

/** A normalised page region: section-key strings per column (schema: layoutPage). */
export interface LayoutPage {
  sidebar?: string[]
  main?: string[]
}

/** A layout after normalizeLayout(): string slot keys, flat page kinds. */
export interface NormalizedLayout {
  template?: string
  first?: LayoutPage
  continuation?: LayoutPage
  last?: LayoutPage
}

/**
 * The layout actually handed to the renderer for a build. The two-column
 * document assumes the page kinds it walks are present (they are for every
 * built-in and well-formed layout); modelling them as required here keeps the
 * render components cast-free without changing any runtime guard.
 */
export interface ResolvedLayoutPage {
  sidebar: string[]
  main: string[]
}
export interface ResolvedLayout {
  template?: string
  first: ResolvedLayoutPage
  continuation: ResolvedLayoutPage
  last: ResolvedLayoutPage
}

/** Every theme is a structural variant of the reference teal theme. */
type TealTheme = typeof import('./themes/teal.js').tealTheme
/** Palette keys only the two-column identity chrome needs; the mono (ATS) theme omits them. */
type AccentTextKeys = 'accentText' | 'accentTextSecondary' | 'accentTextTertiary' | 'accentDivider'

/**
 * A theme — every visual token. Derived structurally from teal so the type
 * can never drift from the object components read. The accent-on-accent
 * palette keys are optional because the mono theme (ATS, single-column) drops
 * them; only two-column identity chrome reads them, and only under teal/coral.
 */
export interface Theme extends Omit<TealTheme, 'palette'> {
  palette: Omit<TealTheme['palette'], AccentTextKeys> & Partial<Pick<TealTheme['palette'], AccentTextKeys>>
}

/** Text run style the measurer varies its metrics by (measure.js). */
export interface MeasureOpts {
  weight?: number
  italic?: boolean
  /** react-pdf `letterSpacing` / textkit `characterSpacing`, in pt per glyph. */
  letterSpacing?: number
}

/** Optional real-font measurer injected into the packer (measure.js). */
export interface Measurer {
  lineCount(text: string, size: number, maxWidth: number, opts?: MeasureOpts): number
  widthOf(text: string, size: number, opts?: MeasureOpts): number
  /** Line height (as a multiple of font size) for text with no explicit `lineHeight` style. */
  naturalLineHeight(opts?: MeasureOpts): number
  unsupportedChars(text: string): string[]
}

/** How full one column of one page is, in pt (layout.js). */
export interface ColumnFill {
  used: number
  budget: number
}

/**
 * A contiguous run of one sidebar section's items, as placed on one page
 * (layout.js packSidebar, C3b). A section that fits whole is a single slice
 * spanning `[0, itemCount)`; a section too tall for the remaining room is cut
 * at an item boundary into two or more slices on consecutive pages, every one
 * of them repeating the section title (the later ones with the `(cont.)`
 * marker — see layout.js `sectionTitleLabel`).
 */
export interface SidebarSlice {
  /** Sidebar slot key (registry.js). */
  key: string
  /**
   * First item index rendered on this page — and, therefore, whether this
   * slice is a continuation: `start > 0` IS that fact. Ask it through
   * layout.js's `isContinuedSlice()`, which both the measured title and the
   * rendered title go through. (C3b also carried a derived `continued`
   * boolean here; C4 removed it — one fact, one field, one predicate.)
   */
  start: number
  /** One-past-the-last item index rendered on this page. */
  end: number
  /**
   * Total items in the section — the denominator `end - start` is a fraction
   * of, i.e. "items 6–8 of 8".
   *
   * WHY IT STAYS, when C4 deleted two other fields for being derived (C6a).
   * `itemCount` is NOT derivable from the plan: recovering it means calling
   * `sidebarSectionItems(key, content)`, which is `@internal` (harness-only, no
   * compatibility promise) and needs the content bag, which a diagnostics
   * consumer holding only the plan does not have. Without it the plan is not
   * self-describing — a reader could see `[0, 6)` and be unable to tell a whole
   * section from the head of a split one. `continued` and `sidebarKeys` were
   * different: both were derivable from fields sitting right next to them
   * (`start > 0`, `slices.map(s => s.key)`) with nothing but the plan in hand,
   * which is what made a second carrier of the same fact pure drift risk.
   */
  itemCount: number
  /**
   * Measured height of THIS slice, pt — the number `packSidebar` used to decide
   * the page break, not a re-measurement (C6a).
   */
  height: number
  /**
   * The separator charged to this slice ON THIS PAGE: 0 for the page's first
   * slice (nothing precedes it, so `buildSidebar` draws no rule above it), the
   * section divider for every later one.
   *
   * So `page.sidebarFill.used === Σ (slice.height + slice.gapBefore)` over the
   * page's slices, exactly (to quantization). That identity is what makes the
   * per-page fill decomposable by a consumer that has only the plan.
   */
  gapBefore: number
}

/**
 * One page of a pagination plan. Deliberately symmetric across the two flows —
 * `mainBlocks`/`sidebarSlices` are what each flow packs (the main column packs
 * measured experience blocks, the sidebar packs runs of section items) and
 * `mainFill`/`sidebarFill` are the matching per-column numbers. This shape is
 * the contract a later chunk's `plan_layout` diagnostics is built from
 * (layout-packing-design.md §7.2), so it is named for that from the start.
 */
export interface LayoutPlanPage {
  index: number
  /** Identity slot keys injected at the top of this page's sidebar (never packed). */
  identity: string[]
  mainBlocks: ExperienceEntry[]
  /**
   * Which sections this page shows, in order, with their item ranges — the one
   * per-page sidebar field. "Just the keys" is `sidebarSlices.map(s => s.key)`.
   */
  sidebarSlices: SidebarSlice[]
  mainFill: ColumnFill | null
  sidebarFill: ColumnFill | null
  /** pt past budget on this page across both columns; 0 unless Invariant 0 forced an over-tall block. */
  overflowPt: number
  emptyColumn: 'main' | 'sidebar' | 'both' | null
}

/** The two-flow pagination plan (layout.js planTwoColumn). */
export interface LayoutPlan {
  totalPages: number
  /** Pages the main flow alone needed. */
  mainPageCount: number
  /** Pages the sidebar flow alone needed. */
  sidebarPageCount: number
  pages: LayoutPlanPage[]
}

// ── Layout diagnostics (C6a — layout-packing-design.md §7.2) ─────────────────
// The plan, re-expressed for a reader that is not the renderer: ratios instead
// of raw points, 1-based page numbers that match the badge on the sheet, and
// the item ranges spelled out. Derived from `LayoutPlan` and NOTHING ELSE —
// never from CV body text (design doc G-c: content is data, never commands).

/** One column of one page, as diagnostics report it (layoutDiagnostics.js). */
export interface ColumnDiagnostics {
  /**
   * `used / budget`, 0..1, rounded to 3dp. `null` in two cases, both meaning
   * "there is no ratio to report": this flow ended on an earlier page (the
   * column is structurally empty — see `LayoutPageDiagnostics.emptyColumn`), or
   * the budget is <= 0 because the page's FIXED content (an over-tall summary)
   * is already taller than the column, which `warnings` reports by name.
   */
  fill: number | null
  /** Measured content height on this page, pt. `null` when the flow ended earlier. */
  usedPt: number | null
  /** Usable height for this column on this page, pt. `null` when the flow ended earlier. */
  budgetPt: number | null
}

/** The main column's diagnostics: the experience entries placed on this page. */
export interface MainColumnDiagnostics extends ColumnDiagnostics {
  entries: {
    role: string
    /** Bullets of that entry rendered on THIS page (an entry may be split across pages). */
    bullets: number
    /** True when this is the tail of an entry that started on an earlier page. */
    continued: boolean
  }[]
}

/** The sidebar column's diagnostics: the section slices placed on this page. */
export interface SidebarColumnDiagnostics extends ColumnDiagnostics {
  sections: {
    key: string
    /** Items rendered on this page, and the section's total. */
    items: number
    of: number
    /** `[start, end)` into the section's item list. */
    range: [number, number]
    /** True when this slice continues a section an earlier page began. */
    continued: boolean
    /** This slice's measured height, pt (`SidebarSlice.height`). */
    heightPt: number
  }[]
}

/** One page of the plan, as diagnostics report it. */
export interface LayoutPageDiagnostics {
  /** 1-based — the number printed on the sheet, not the plan's 0-based index. */
  page: number
  main: MainColumnDiagnostics
  sidebar: SidebarColumnDiagnostics
  /**
   * pt past budget across both columns. Non-zero means react-pdf will flow the
   * surplus onto a physical sheet the page numbering does not count — the one
   * genuine layout defect CVX can currently report. Always accompanied by a
   * `warnings` entry naming the cause.
   */
  overflowPt: number
  /**
   * Which column has no content on this page.
   *
   * A DIAGNOSTIC, NOT A TARGET. It is the deliberate residual of one flow being
   * genuinely longer than the other (design doc G1) and it is *expected* on a CV
   * whose sidebar outlasts its experience list. Measured evidence (sprint C4,
   * finding 3b): tuning a packer to drive this number down 42 -> 8 produced
   * continued headings with one bullet over ~90% white space and a section
   * fragmented across five pages. The proxy is anti-correlated with quality —
   * report it, do not optimise it, and never drop content to remove one.
   */
  emptyColumn: 'main' | 'sidebar' | 'both' | null
}

/** A layout problem worth telling the user about, phrased as an action. */
export interface LayoutDiagnosticWarning {
  code: 'overflow'
  /** 1-based page number. */
  page: number
  overflowPt: number
  /** True when the user's own page1ExperienceCount/page1SplitBullets forced it. */
  forcedByConfig: boolean
  message: string
}

/**
 * Everything `plan_layout` reports and `build_pdf` returns alongside its
 * `warnings` — see layoutDiagnostics.js for why there is no aggregate
 * "layout score".
 */
export interface LayoutDiagnostics {
  totalPages: number
  /** Pages the main flow alone needed (`totalPages` is the max of the two). */
  mainPageCount: number
  /** Pages the sidebar flow alone needed. */
  sidebarPageCount: number
  pages: LayoutPageDiagnostics[]
  totals: {
    /** Pages whose content reaches past budget (each has a `warnings` entry). */
    overflowPages: number
    /** Total pt past budget across the document. */
    overflowPt: number
    /** Pages with a structurally empty column — a diagnostic, not a target (see `emptyColumn`). */
    emptyColumnPages: number
    /** Sidebar sections cut across a page break (each still renders every item). */
    splitSections: number
    /** Experience entries cut across a page break. */
    splitEntries: number
  }
  warnings: LayoutDiagnosticWarning[]
}

/** Extra per-slot render props (registry.js renderSlot). */
export interface SlotExtra {
  entries?: ExperienceEntry[]
  /** Which items of a sidebar section this slot renders (C3b); absent = all of them. */
  slice?: SidebarSlice
}

/** Options for validateContent(). */
export interface ValidateOptions {
  contentDir: string
  strict?: boolean
  fontsDir?: string
}
