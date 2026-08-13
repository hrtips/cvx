// ── One place that resolves theme + layout for a build ─────────────────────
//
// Both the renderer and (as of C3a) anything that wants the pagination PLAN
// without rendering need the same answers to "which layout object?" and "which
// theme object?". They used to be answered twice — render.js resolved the theme
// and passed `layout: undefined` when the file was missing, leaving CVDocument
// to apply `layout ?? LAYOUTS[name] ?? TWO_COLUMN_LAYOUT`, while layout.js
// applied its own default. Three fallback chains for one decision means a
// second `planTwoColumn()` call can measure a document that is not the one
// rendered. This module is the single chain; every caller goes through it.
// ────────────────────────────────────────────────────────────────────────────

import { LAYOUTS, TWO_COLUMN_LAYOUT } from './defaultLayouts.js'
import { monoTheme } from './themes/mono.js'
import { tealTheme } from './themes/teal.js'

/** Default theme per layout template — the designed layout is teal, the ATS one mono. */
/** @type {Record<string, import('./types.js').Theme>} */
const LAYOUT_DEFAULT_THEME = {
  'two-column': tealTheme,
  'single-column': monoTheme
}

/**
 * @param {object} args
 * @param {import('./types.js').CVConfig} [args.config]
 * @param {import('./types.js').Theme} [args.theme]   already-loaded theme object, if the caller has one
 * @param {import('./types.js').NormalizedLayout} [args.layout]  already-loaded layout object, if the caller has one
 * @returns {{
 *   layoutName: string,
 *   activeLayout: import('./types.js').ResolvedLayout,
 *   activeTheme: import('./types.js').Theme,
 *   isSingleColumn: boolean,
 * }}
 */
export function resolveDocument({ config, theme, layout } = {}) {
  const layoutName = config?.layout ?? 'two-column'
  const activeLayout = /** @type {import('./types.js').ResolvedLayout} */ (
    layout ?? LAYOUTS[layoutName] ?? TWO_COLUMN_LAYOUT
  )
  const activeTheme =
    theme ?? LAYOUT_DEFAULT_THEME[activeLayout.template ?? layoutName] ?? tealTheme

  return {
    layoutName,
    activeLayout,
    activeTheme,
    isSingleColumn: (activeLayout.template ?? layoutName) === 'single-column'
    // Normalised to the shape the packer reads: explicit nulls, never undefined,
    // so "unset" is one value rather than two.
    //
    // THIS IS A WHITELIST, and a future layout lever has to be added here or it
    // does not exist. C4 learned it the expensive way: a `fill: 'balance'`
    // prototype was gated on `config.fill` inside `planTwoColumn`, and because
    // this object never carried `fill`, the gate was DEAD on the real render
    // path — the evaluation only reached it by calling `planTwoColumn` directly
    // and passing a hand-built config. So the rule for any C6 lever
    // (`fill`, `density`, `weights`, `targetPages`, `order`, `buckets`) is
    // three things in ONE commit: the key plumbed through here, the key added
    // to `schema/v1/cvx.schema.json` (config is `additionalProperties: false`,
    // so an un-schema'd key fails `cvx validate`), and a lever axis in
    // `test/layout-harness/fixtures.js`. Miss the first and the lever silently
    // does nothing; miss the third and every invariant in the C0 suite passes
    // without ever executing the new code path (demonstrated in C4: a `balance`
    // mode seeded to DROP a block left the whole suite green).
    //
    // (Kept after S5 removed the packing field this once documented: the
    // three-places-in-one-commit rule below is the standing contract for ANY
    // future lever, and C4 is the measured reason.)
    //
    // FOURTH: the MCP tools' `inputSchema`s (src/mcp/tools.js) — `plan_layout`'s,
    // which today accepts `dir` and nothing else (a lever an agent cannot pass to
    // the dry run cannot be tuned in the loop the tool exists for), and
    // `build_pdf`'s, which is the same argument list one step later.
    // `test/mcpTools.test.js` fails if either grows silently, and src/mcp/
    // server.js now validates arguments against those schemas, so an un-declared
    // lever is refused rather than ignored.
    //
    // FIFTH, and it is a pre-existing hole rather than something C6a added:
    // `validateContent.js` packs with `planTwoColumn(content, layout, config)`
    // using the RAW config and no layout — it never goes through this function.
    // So `cvx validate` and `cvx build` can describe different documents
    // whenever a custom layout is in play, and a lever added to the schema but
    // missed in this whitelist would be honoured by validate and ignored by
    // build (or the reverse). Whoever adds the next lever fixes that seam or
    // states plainly why it is safe.
    //
    // The warning: `fill: 'balance'` specifically must NOT be the first lever
    // exposed to an agent. C4 measured it — driving "planned pages with an empty
    // column" from 42 to 8 produced continued headings with one bullet over ~90%
    // white space and a section fragmented across five pages. The diagnostics
    // C6a publishes deliberately carry no score for an agent to optimise there
    // (see layoutDiagnostics.js), and a `balance` lever would hand it one anyway.
  }
}
