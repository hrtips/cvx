// ── Built-in layouts ────────────────────────────────────────────────────────
// The two layouts CVX ships with, as plain data: which section slot keys each
// column of each page kind renders, in designer-intent order. A cv-content
// layouts/*.yaml of the same shape overrides them (loadLayout.js).
//
// These live in their own module — not inside CVDocument.jsx — because they
// are data that BOTH the renderer and the packer need: layout.js derives the
// sidebar's section flow order from `first`/`continuation`/`last` (see
// sidebarFlowKeys) and must be importable under plain `node`, with no
// Vite/JSX transform, by anything that packs without rendering (the C0
// harness's generateBaseline.js, and later C6's `plan_layout`).
// ────────────────────────────────────────────────────────────────────────────

/** @type {import('./types.js').NormalizedLayout} */
export const TWO_COLUMN_LAYOUT = {
  template: 'two-column',
  first: {
    sidebar: ['identity-photo', 'contact', 'achievements'],
    main: ['summary', 'spacer:27', 'experience']
  },
  continuation: {
    sidebar: [
      'identity-compact',
      'education',
      'certifications',
      'competencies',
      'languages',
      'publications'
    ],
    main: ['experience:continued']
  },
  last: {
    sidebar: ['identity-compact', 'referees'],
    main: ['experience:continued']
  }
}

/** @type {import('./types.js').NormalizedLayout} */
const SINGLE_COLUMN_LAYOUT = {
  template: 'single-column',
  first: {
    main: [
      'header-ats',
      'summary',
      'experience',
      'education',
      'certifications',
      'publications',
      'competencies',
      'languages',
      'achievements',
      'referees'
    ]
  }
}

/** @type {Record<string, import('./types.js').NormalizedLayout>} */
export const LAYOUTS = {
  'two-column': TWO_COLUMN_LAYOUT,
  'single-column': SINGLE_COLUMN_LAYOUT
}
