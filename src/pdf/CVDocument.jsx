// ── Unified CV Document ─────────────────────────────────────────────────────
// Config-driven: reads theme + layout from props (resolved from config.yaml).
// Supports both two-column (designed) and single-column (ATS) via templates.
// ────────────────────────────────────────────────────────────────────────────

import { Document, View } from '@react-pdf/renderer'
import { ThemeContext } from './ThemeContext.jsx'
import { tealTheme } from './themes/teal.js'
import { monoTheme } from './themes/mono.js'
import { packExperiences, resolveFirstSidebar } from './layout.js'
import { buildKeywords } from './keywords.js'
import { renderSlot } from './sections/registry.js'
import TwoColumnTemplate from './templates/TwoColumnTemplate.jsx'
import SingleColumnTemplate from './templates/SingleColumnTemplate.jsx'

// ── Default layout configs ──────────────────────────────────────────────────
// TWO_COLUMN_LAYOUT is exported (in addition to the default export below)
// purely so the C0 test harness (test/layout-harness/sidebarPlan.js) can
// read the real sidebar section->page-kind assignment instead of a
// hand-copied duplicate — no behavior change.

export const TWO_COLUMN_LAYOUT = {
  template: 'two-column',
  first: {
    sidebar: ['identity-photo', 'contact', 'achievements'],
    main:    ['summary', 'spacer:27', 'experience'],
  },
  continuation: {
    sidebar: ['identity-compact', 'education', 'certifications', 'competencies', 'languages', 'publications'],
    main:    ['experience:continued'],
  },
  last: {
    sidebar: ['identity-compact', 'referees'],
    main:    ['experience:continued'],
  },
}

const SINGLE_COLUMN_LAYOUT = {
  template: 'single-column',
  first: {
    main: ['header-ats', 'summary', 'experience', 'education', 'certifications', 'publications', 'competencies', 'languages', 'achievements', 'referees'],
  },
}

/** @type {Record<string, import('./types.js').NormalizedLayout>} */
const LAYOUTS = {
  'two-column':    TWO_COLUMN_LAYOUT,
  'single-column': SINGLE_COLUMN_LAYOUT,
}

// ── Default themes per layout ───────────────────────────────────────────────

/** @type {Record<string, import('./types.js').Theme>} */
const LAYOUT_DEFAULT_THEME = {
  'two-column':    tealTheme,
  'single-column': monoTheme,
}

// ── Sidebar builder ─────────────────────────────────────────────────────────

/**
 * @param {string[]} keys
 * @param {import('./types.js').CVContent} data
 * @param {import('./types.js').Theme} theme
 */
function buildSidebar(keys, data, theme) {
  const identityKeys = keys.filter(k => k.startsWith('identity-'))
  const contentKeys  = keys.filter(k => !k.startsWith('identity-'))
  const g = theme.geometry.sidebarPad

  const dividerStyle = {
    height: theme.chrome.dividerHeight,
    backgroundColor: theme.palette.divider,
    marginBottom: theme.spacing.sectionGap,
  }

  return (
    <View style={{ flex: 1 }}>
      {renderSlot(identityKeys, data)}
      {contentKeys.length > 0 && (
        <View style={{ flex: 1, paddingTop: g.top, paddingLeft: g.left, paddingRight: g.right, paddingBottom: g.bottom }}>
          {contentKeys.map((key, i) => (
            <View key={key}>
              {i > 0 && <View style={dividerStyle} />}
              {renderSlot([key], data)}
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ── Two-column renderer ─────────────────────────────────────────────────────

/**
 * @param {{
 *   data: import('./types.js').CVContent,
 *   activeLayout: import('./types.js').ResolvedLayout,
 *   activeTheme: import('./types.js').Theme,
 *   packing: import('./types.js').CVConfig,
 *   measure?: import('./types.js').Measurer,
 * }} props
 */
function TwoColumnDocument({ data, activeLayout, activeTheme, packing, measure }) {
  const { page1Experiences, continuationChunks, totalPages } =
    packExperiences(data.experience, data.summary, packing, activeTheme, measure)

  // On a single-page CV, fold the continuation/last sidebar sections
  // (education, competencies, referees) into page 1 so they never silently drop.
  const firstSidebar = resolveFirstSidebar(activeLayout, continuationChunks.length === 0)

  /** @param {number} pageIndex */
  function contLayout(pageIndex) {
    const isFirst = pageIndex === 0
    const isLast  = pageIndex === continuationChunks.length - 1
    const cont = activeLayout.continuation
    const last = activeLayout.last

    // Single continuation page: merge continuation + last sidebar sections
    if (isFirst && isLast && cont && last) {
      const mergedSidebar = [...new Set([...(cont.sidebar ?? []), ...(last.sidebar ?? [])])]
      return { sidebar: mergedSidebar, main: cont.main ?? last.main }
    }
    if (isLast && last) return last
    return cont
  }

  return (
    <>
      <TwoColumnTemplate
        isFirst
        pageNum={1}
        totalPages={totalPages}
        sidebarSlot={buildSidebar(firstSidebar, data, activeTheme)}
        mainSlot={renderSlot(activeLayout.first.main, data, { entries: page1Experiences })}
      />
      {continuationChunks.map((chunk, i) => {
        const pg = contLayout(i)
        return (
          <TwoColumnTemplate
            key={i}
            pageNum={i + 2}
            totalPages={totalPages}
            sidebarSlot={buildSidebar(pg.sidebar, data, activeTheme)}
            mainSlot={renderSlot(pg.main, data, { entries: chunk })}
          />
        )
      })}
    </>
  )
}

// ── Single-column renderer ──────────────────────────────────────────────────

/**
 * @param {{
 *   data: import('./types.js').CVContent,
 *   activeLayout: import('./types.js').ResolvedLayout,
 * }} props
 */
function SingleColumnDocument({ data, activeLayout }) {
  return (
    <SingleColumnTemplate
      mainSlot={renderSlot(activeLayout.first.main, data, { entries: data.experience })}
    />
  )
}

// ── Main document ───────────────────────────────────────────────────────────

/**
 * @param {import('./types.js').CVContent & {
 *   config?: import('./types.js').CVConfig,
 *   theme?: import('./types.js').Theme,
 *   layout?: import('./types.js').NormalizedLayout,
 *   creationDate?: Date,
 *   measure?: import('./types.js').Measurer,
 * }} props
 */
export default function CVDocument({
  personal, summary, experience, achievements,
  education, certifications, publications, languages,
  competencies, referees, keywords, profilePhoto, config,
  theme, layout, creationDate, measure,
}) {
  const layoutName   = config?.layout ?? 'two-column'
  const activeLayout = /** @type {import('./types.js').ResolvedLayout} */ (layout ?? LAYOUTS[layoutName] ?? TWO_COLUMN_LAYOUT)
  const activeTheme  = theme ?? LAYOUT_DEFAULT_THEME[activeLayout.template ?? layoutName] ?? tealTheme

  const packing = {
    page1ExperienceCount: config?.page1ExperienceCount ?? null,
    page1SplitBullets:    config?.page1SplitBullets ?? null,
  }

  const data = { personal, summary, experience, achievements, education, certifications, publications, languages, competencies, referees, profilePhoto }

  const isSingleColumn = (activeLayout.template ?? layoutName) === 'single-column'

  // ATS / AI-parser keywords embedded in the PDF's Keywords metadata field.
  const keywordString = buildKeywords({ keywords, competencies, experience, personal }, config)

  return (
    <ThemeContext.Provider value={activeTheme}>
      <Document
        title={personal.name}
        author={personal.name}
        subject={personal.title ?? 'Curriculum Vitae'}
        keywords={keywordString}
        creator="cvx"
        producer="cvx"
        language="en"
        creationDate={creationDate}
      >
        {isSingleColumn
          ? <SingleColumnDocument data={data} activeLayout={activeLayout} />
          : <TwoColumnDocument data={data} activeLayout={activeLayout} activeTheme={activeTheme} packing={packing} measure={measure} />
        }
      </Document>
    </ThemeContext.Provider>
  )
}
