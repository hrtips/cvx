// ── Unified CV Document ─────────────────────────────────────────────────────
// Config-driven: reads theme + layout from props (resolved from config.yaml).
// Supports both two-column (designed) and single-column (ATS) via templates.
// ────────────────────────────────────────────────────────────────────────────

import { Document, View } from '@react-pdf/renderer'
import { buildKeywords } from './keywords.js'
import { isIdentityKey, planTwoColumn } from './layout.js'
import { resolveDocument } from './resolveDocument.js'
import { renderSlot } from './sections/registry.js'
import { ThemeContext } from './ThemeContext.jsx'
import SingleColumnTemplate from './templates/SingleColumnTemplate.jsx'
import TwoColumnTemplate from './templates/TwoColumnTemplate.jsx'

// ── Sidebar builder ─────────────────────────────────────────────────────────

/**
 * @param {string[]} keys
 * @param {import('./types.js').CVContent} data
 * @param {import('./types.js').Theme} theme
 */
function buildSidebar(keys, data, theme) {
  const identityKeys = keys.filter(isIdentityKey)
  const contentKeys = keys.filter((k) => !isIdentityKey(k))
  const g = theme.geometry.sidebarPad

  const dividerStyle = {
    height: theme.chrome.dividerHeight,
    backgroundColor: theme.palette.divider,
    marginBottom: theme.spacing.sectionGap
  }

  return (
    <View style={{ flex: 1 }}>
      {renderSlot(identityKeys, data)}
      {contentKeys.length > 0 && (
        <View
          style={{
            flex: 1,
            paddingTop: g.top,
            paddingLeft: g.left,
            paddingRight: g.right,
            paddingBottom: g.bottom
          }}
        >
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
 * Which MAIN-column slot keys a page renders. The sidebar is now packed
 * (layout.js), but the main column's slots are still a per-page-kind choice —
 * page 1 leads with the summary, every later page continues the experience —
 * and that is designer intent expressed in the layout YAML, not something to
 * pack.
 *
 * @param {import('./types.js').ResolvedLayout} layout
 * @param {number} index
 * @param {number} totalPages
 * @returns {string[]}
 */
function mainSlotKeys(layout, index, totalPages) {
  if (index === 0) return layout.first.main
  // Fall back the same way the plan's identity injection does
  // (continuation -> last -> first): a hand-written layouts/*.yaml may define
  // only `first`, and the renderer must not throw where the plan copes.
  const cont = layout.continuation?.main ?? layout.last?.main ?? layout.first.main
  if (index === totalPages - 1) return layout.last?.main ?? cont
  return cont
}

/**
 * @param {{
 *   data: import('./types.js').CVContent,
 *   activeLayout: import('./types.js').ResolvedLayout,
 *   activeTheme: import('./types.js').Theme,
 *   plan: import('./types.js').LayoutPlan,
 * }} props
 */
function TwoColumnDocument({ data, activeLayout, activeTheme, plan }) {
  // C3: both columns are measured and packed by layout.js's two-flow
  // coordinator (P = max(P_main, P_sidebar), front-loaded). This component no
  // longer decides which sidebar sections a page shows — it just renders the
  // per-page slice the plan hands it, with that page's identity block
  // injected at the top. The pre-C3 static "section -> page-kind" assignment
  // (repeated verbatim onto every continuation page, which duplicated
  // education/certifications/... on every one of them and overflowed whenever
  // the column was taller than the sheet) is gone.
  //
  // The plan itself is computed OUTSIDE this component (renderCV) and passed
  // in, so a caller can obtain the pagination + diagnostics without rendering
  // a single glyph. CVDocument falls back to computing it (see below) for the
  // browser preview, which has no renderCV.
  return (
    <>
      {plan.pages.map(({ index, identity, sidebarKeys, mainBlocks }) => (
        // A page is identified by its ordinal — that IS its stable identity,
        // not a positional proxy for one.
        <TwoColumnTemplate
          key={`page-${index + 1}`}
          isFirst={index === 0}
          pageNum={index + 1}
          totalPages={plan.totalPages}
          sidebarSlot={buildSidebar([...identity, ...sidebarKeys], data, activeTheme)}
          mainSlot={renderSlot(mainSlotKeys(activeLayout, index, plan.totalPages), data, {
            entries: mainBlocks
          })}
        />
      ))}
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
 *   plan?: import('./types.js').LayoutPlan,
 * }} props
 *   `plan` is the pagination renderCV already computed (so the plan is
 *   available to callers without rendering). When absent — the browser preview,
 *   which has no renderCV — it is computed here from the same resolved
 *   theme/layout, so both paths pack identically.
 */
export default function CVDocument({
  personal,
  summary,
  experience,
  achievements,
  education,
  certifications,
  publications,
  languages,
  competencies,
  referees,
  keywords,
  profilePhoto,
  config,
  theme,
  layout,
  creationDate,
  measure,
  plan
}) {
  const { activeLayout, activeTheme, isSingleColumn, packing } = resolveDocument({
    config,
    theme,
    layout
  })

  const data = {
    personal,
    summary,
    experience,
    achievements,
    education,
    certifications,
    publications,
    languages,
    competencies,
    referees,
    profilePhoto
  }

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
        {isSingleColumn ? (
          <SingleColumnDocument data={data} activeLayout={activeLayout} />
        ) : (
          <TwoColumnDocument
            data={data}
            activeLayout={activeLayout}
            activeTheme={activeTheme}
            plan={
              plan ??
              planTwoColumn({
                content: data,
                layout: activeLayout,
                config: packing,
                theme: activeTheme,
                measure
              })
            }
          />
        )}
      </Document>
    </ThemeContext.Provider>
  )
}
