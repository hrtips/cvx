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
  /**
   * The whole column this page offers, before ANY content — fixed or packed —
   * is charged: body box minus badge (main only), pads, and the safety
   * backstop. `capacity − budget` is the page's fixed content (summary +
   * spacer + section title on the main column's page 1; the identity block in
   * the sidebar), which is what makes v2 fills comparable across pages (§3.9).
   */
  capacity: number
}

/**
 * Why the next block did NOT start on a page: the price of that page break,
 * recorded by packBlocks at the decline (§3.8). Data, not judgement — it is
 * true at nearly every break. `null` on a flow's last page and on any page
 * where the next block did start (whole, or split).
 */
export interface BlockedBy {
  /** Flow index of the block that could not start here. */
  index: number
  /** The block's smallest legal piece (head + one item), or its whole height when it has no legal cut. */
  smallestPiecePt: number
  /** Room left on the page before the gap the block would have charged. */
  residualPt: number
  gapBeforePt: number
  /** Main column: the declined entry (packExperiences). */
  entry?: ExperienceEntry | null
  /** Sidebar: the declined section's key (packSidebar). */
  key?: string | null
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
  /** Why the next main block did not start on this page (§3.8). `null` when it did, or this is the flow's last page. */
  mainBlockedBy: BlockedBy | null
  sidebarBlockedBy: BlockedBy | null
  /** pt past budget on this page across both columns; 0 unless Invariant 0 forced an over-tall block. */
  overflowPt: number
  emptyColumn: 'main' | 'sidebar' | 'both' | null
}

/** The two-flow pagination plan (layout.js planTwoColumn). */
export interface LayoutPlan {
  totalPages: number
  /**
   * Sections a `main` slot names that the packer does not measure (I1). Empty
   * for every shipped layout; non-empty means `totalPages` and `overflowPt`
   * describe less ink than the pages carry, which `layoutDiagnostics` states
   * as the `main-slot-unmeasured` fact. Retired by I4/I6.
   */
  unmeasuredMainKeys?: string[]
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
   * COLUMN OCCUPANCY, v2 (§3.9): `(fixedPt + usedPt) / capacityPt`, rounded
   * to 3dp — the same measurement on every page, so page 1 and page 2 can be
   * compared. (v1 divided by the residual `budget`, which made page 1 read
   * 0.595 while the column was ~0.80 occupied; `LayoutDiagnostics.version`
   * is how a consumer knows which semantics it is reading.)
   *
   * It goes ABOVE 1 exactly when the page is over budget — the surplus is real
   * content react-pdf flows onto an extra physical sheet. The invariant
   * survives the redefinition: fill > 1 ⟺ fixed + used > capacity ⟺
   * used > budget ⟺ overflowPt > 0. Never clamp it. A fixed block taller than
   * the whole column (an over-tall summary) is a number above 1 too, not null.
   *
   * `null` means exactly one thing: this flow ended on an earlier page (see
   * `LayoutPageDiagnostics.emptyColumn`).
   *
   * FILL DESCRIBES A PAGE; IT IS NOT A PROGRESS SIGNAL. Shortening content
   * LOWERS it until a block moves up, then it jumps — measured on a real CV,
   * six of eight shortening edits lowered it before one crossed the threshold.
   * The number that moves monotonically with an edit is `blockedBy.shortByPt`.
   */
  fill: number | null
  /**
   * Content height on this page, pt. `null` when the flow ended earlier.
   *
   * Both columns' numbers are verified against a real rendered PDF to within
   * 0.01pt — the sidebar by `layoutSidebarMeasureDiff.test.js` (since C3a),
   * the main column by `layoutMainMeasureDiff.test.js` (since S3, which
   * corrected an entry model that previously ran 6.7–13.1pt per entry above
   * the render and under-counted wrapped head rows). What the packer
   * paginates with and what the page shows are the same number.
   */
  usedPt: number | null
  /** Usable height for this column's PACKED content on this page, pt. `null` when the flow ended earlier. */
  budgetPt: number | null
  /** The whole column on this page, pt (§3.9) — the fill's denominator. `null` when the flow ended earlier. */
  capacityPt: number | null
  /** `capacityPt − budgetPt`: this page's fixed content, pt. `null` when the flow ended earlier. */
  fixedPt: number | null
  /**
   * Why the next block did not start on this page (§3.8): identity, its
   * smallest legal piece, the room that was left, and `shortByPt` — the ONE
   * number that falls monotonically as the user shortens what is above.
   * `null` when the next block did start, or this is the flow's last page.
   * Never aggregated across pages, deliberately (risk R1).
   */
  blockedBy: {
    /** Main column: the declined entry's role. Sidebar: null (see `key`). */
    role: string | null
    /** Sidebar only: the declined section's key. */
    key?: string | null
    entryIndex: number
    residualPt: number
    gapBeforePt: number
    smallestPiecePt: number
    /** `smallestPiecePt − (residualPt − gapBeforePt)`: what would have to be freed for the block to start here. */
    shortByPt: number
  } | null
}

/** The main column's diagnostics: the experience entries placed on this page. */
export interface MainColumnDiagnostics extends ColumnDiagnostics {
  entries: {
    role: string
    /** Employer, so two identically-titled roles stay distinguishable. `null` if the entry has none. */
    company: string | null
    /** Free-text date range, same purpose. `null` if the entry has none. */
    period: string | null
    /**
     * `[start, end)` into the entry's bullet list — 0-BASED and END-EXCLUSIVE,
     * the same convention as `SidebarSlice`. `[2, 5)` of `ofBullets: 7` is
     * "bullets 3–5 of 7" when spoken to a human.
     */
    bulletRange: [number, number]
    /** Bullets of that entry rendered on THIS page (`end - start`; an entry may be split across pages). */
    bullets: number
    /** Bullets the entry has in total, across every page. */
    ofBullets: number
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
    /**
     * `[start, end)` into the section's item list — 0-BASED and END-EXCLUSIVE.
     * `[6, 8)` of `of: 8` is two items: "items 7–8 of 8" in the 1-based way a
     * human counts them. (`items` is already `end - start`, so there is never a
     * need to do that arithmetic to get the count.)
     */
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
   * Which column has NO INK on this page (v3).
   *
   * Content is content, whether or not the packer placed it: a page 1 carrying
   * a summary is not empty, even though the summary is fixed content rather
   * than a flow block. Before v3 this field meant "no flow blocks", so that
   * page reported `emptyColumn: 'main'` and every doc had to explain why an
   * "empty" column was full — `edge-summary-crosses-cliff` was the shape that
   * made the discrepancy visible, and it now reports `null`.
   *
   * Two things deliberately do NOT count as ink. Chrome — the identity block
   * and the page badge — appears on every page by construction, so counting it
   * would make this field unreachable and delete the G1 residual signal below.
   * And unrendered fixed content: the layout spacer is blank space, and the
   * section title is drawn only when entries accompany it, so a page whose
   * budget charges both while drawing neither is still empty.
   *
   * A DIAGNOSTIC, NOT A TARGET — with one exception, and it is a different
   * animal. On a LATER page this is the deliberate residual of one flow being
   * genuinely longer than the other (design doc G1), *expected* on a CV whose
   * sidebar outlasts its experience list; measured evidence (sprint C4, finding
   * 3b) says tuning a packer to drive the count down 42 -> 8 produced continued
   * headings with one bullet over ~90% white space and a section fragmented
   * across five pages. Report it, do not optimise it, never drop content to
   * remove one. On PAGE 1, an empty main column means the reader's first page
   * shows no roles at all — that one is a real defect, and it arrives with its
   * own `page1-no-experience` warning rather than leaving you to tell the two
   * cases apart from this field.
   */
  emptyColumn: 'main' | 'sidebar' | 'both' | null
}

/**
 * A layout problem worth telling the user about, phrased as an action.
 *
 * `overflow` — the page's content reaches past its budget, so the surplus flows
 * onto a physical sheet the page numbering does not count. Emitted by the same
 * predicate `cvx build` and `cvx validate` warn through (layout.js
 * `overflowWarnings`).
 *
 * `page1-no-experience` — page 1 carries no experience entry at all, because
 * its fixed content (summary + identity block) left less room than the smallest
 * legal piece of the first role. Diagnostics-only: the CLI's stderr warnings
 * stay overflow-only. See `LayoutPageDiagnostics.emptyColumn` for why this one
 * is not the empty column an agent is told to ignore.
 *
 * Match on `code`, never on `message`: the wording is for humans and will change.
 */
export interface LayoutDiagnosticWarning {
  /**
   * `overflow` — real content flows onto an unnumbered extra sheet; always a
   * defect. `page1-no-experience` — roles exist and page 1 shows none; worth
   * raising. `page1-ends-early` (§3.8) — page 1 has roles but the next one
   * could not start there; a PRICED FACT, not necessarily a defect: it fires
   * on well-packed CVs too, and its numbers say what shortening the summary
   * would buy. Mutually exclusive with `page1-no-experience` by construction.
   * `main-slot-unmeasured` (I1) — the layout puts a section other than the
   * summary/experience in a main slot; it renders but is not measured, so the
   * plan's numbers exclude it. `physical-pages-exceed-plan` (I1) — the
   * rendered PDF has more sheets than the plan numbered; a build-only defect
   * (it is merged into the envelope by the CLI/MCP layer from the produced
   * bytes, so `plan_layout` can never carry it).
   * `experience-empty` (I2) — the CV has no experience entries at all (a
   * student or first-job CV); mutually exclusive with `page1-no-experience`,
   * which requires roles to exist. `main-column-empty` (I3) — a
   * multi-page CV whose main column renders nothing on ANY page. Not "the
   * last page's blank column": one flow ending before the other is the
   * ordinary residual, normal, and never reported. Suppressed where a layout
   * puts unmeasured sections in a main slot, because the plan cannot then see
   * that column's ink.
   */
  code:
    | 'overflow'
    | 'page1-no-experience'
    | 'page1-ends-early'
    | 'main-slot-unmeasured'
    | 'physical-pages-exceed-plan'
    | 'experience-empty'
    | 'main-column-empty'
  /**
   * CVX classifying its own message (architecture review 4a): 'defect' =
   * something is wrong, act on it; 'fact' = true and priced, act only if the
   * user wants what it prices (`page1-ends-early` fires on well-packed CVs
   * too). Lets a consumer filter without hardcoding the code list.
   */
  kind: 'defect' | 'fact'
  /**
   * 1-based page number — present on every PAGE-SCOPED code. Absent on the two
   * codes whose subject is not a page (I1): `main-slot-unmeasured` describes
   * the layout, and `physical-pages-exceed-plan` describes the document. A
   * consumer that groups by page must therefore skip warnings without one
   * rather than assume `0`.
   */
  page?: number
  /** Page-scoped codes only (`overflow`). */
  overflowPt?: number
  /**
   * DEPRECATED, permanently `false`: the page1ExperienceCount /
   * page1SplitBullets levers that could force an overflow were removed
   * (maintainer ruling). The field stays so consumers that match on it keep
   * working. `overflow` only.
   */
  forcedByConfig?: boolean
  message: string
  /** page1-ends-early only: what would have to be freed on page 1 for the next role's smallest piece to start there. Falls monotonically as the user shortens the summary. */
  shortByPt?: number
  /** page1-ends-early only. */
  residualPt?: number
  smallestPiecePt?: number
  gapBeforePt?: number
  /** main-column-empty only: the pages carrying no main-column ink, 1-based (all of them, by construction). */
  pages?: number[]
  /** experience-empty only: page 1's fixed content — what the main column does carry. */
  fixedPt?: number
  /** main-slot-unmeasured only: the unmeasured section keys, in layout order. */
  keys?: string[]
  /** physical-pages-exceed-plan only: pages the plan numbered. */
  planned?: number
  /** physical-pages-exceed-plan only: sheets the rendered PDF actually has. */
  physical?: number
  /** page1-ends-early only: page 1's fixed content (summary + spacer + section title) — the lever. */
  fixedPt?: number
  nextRole?: string | null
}

/**
 * Everything `plan_layout` reports and `build_pdf` returns alongside its
 * `notices` — see layoutDiagnostics.js for why there is no aggregate
 * "layout score".
 *
 * ALWAYS THE DESIGNED (two-column) VARIANT. The ATS/single-column document is
 * auto-flowed by react-pdf and never packed, so it has no plan at all: `build_pdf`
 * with `ats: true` returns `null` here, `plan_layout` has no `ats` argument, and
 * the ATS PDF's sheet count can differ from `totalPages`.
 */
export interface LayoutDiagnostics {
  /**
   * Diagnostics-shape version. Key on it before interpreting `fill`.
   *
   * 2 = §3.9's comparable fill (occupancy over capacity) + §3.8's blockedBy +
   * this field itself; v1's denominator was the residual budget.
   *
   * 3 (I2) = three fields changed MEANING on a CV with no experience entries:
   * `mainPageCount` counts the page a summary renders on (was 0), page-1
   * `main.*` are numbers there (were nulls), and `emptyColumn` means "no ink
   * in the column" rather than "no packed blocks", so a summary-bearing page 1
   * is no longer reported empty. Warning `page`/`overflowPt`/`forcedByConfig`
   * also became optional, for the two codes that are not page-scoped.
   *
   * The envelope's `schemaVersion: 1` is unchanged — its fields are only
   * added to.
   */
  version: 3
  /**
   * PLANNED pages — the numbered sheets the packer laid out, and the number
   * printed on the page. It is NOT the sheet count of the PDF when anything
   * overflows: react-pdf flows surplus content onto extra, unnumbered physical
   * sheets (reachable only through content no pagination can help — e.g. a
   * summary taller than the whole column; the config lever that used to force
   * it was removed). Check `totals.overflowPt` / `totals.overflowPages`
   * before quoting this to a user as "your CV is N pages".
   */
  totalPages: number
  /** Pages the main flow alone needed (`totalPages` is the max of the two). */
  mainPageCount: number
  /** Pages the sidebar flow alone needed. */
  sidebarPageCount: number
  pages: LayoutPageDiagnostics[]
  totals: {
    /** Pages whose content reaches past budget (each has an `overflow` warning). */
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
