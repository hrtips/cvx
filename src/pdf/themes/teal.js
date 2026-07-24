// ── Teal Theme ──────────────────────────────────────────────────────────────
// Default theme for the designed CV. All visual tokens live here.
// To create a variant, spread this object and override only what changes.
// ────────────────────────────────────────────────────────────────────────────

export const tealTheme = {
  name: 'teal',

  // ── Colours ─────────────────────────────────────────────────────────────
  palette: {
    accent:      '#1a6070',
    sidebarBg:   '#edf3f5',
    textDark:    '#111111',
    textBody:    '#4a4a4a',
    textMuted:   '#888888',
    textContact: '#333333',
    tagBg:       '#d4e8ed',
    tagText:     '#124d5c',
    divider:     '#c2cdd1',
    white:       '#ffffff',
    // Semantic colours for text on accent backgrounds
    accentText:          'rgba(255,255,255,0.85)',
    accentTextSecondary: 'rgba(255,255,255,0.72)',
    accentTextTertiary:  'rgba(255,255,255,0.45)',
    accentDivider:       'rgba(255,255,255,0.35)',
  },

  // ── Typography ──────────────────────────────────────────────────────────
  typography: {
    fontFamily: 'Lato',
    // Main column
    sectionTitle:  { size: 9.5, weight: 700, spacing: 1, leading: 1.2 },
    role:          { size: 10,  weight: 600, leading: 1.3 },
    body:          { size: 9,   leading: 1.5 },
    meta:          { size: 8,   leading: 1.5 },
    caption:       { size: 7.5 },
    description:   { size: 8.5, leading: 1.45 },
    // Sidebar
    sidebarSection: { size: 7,  weight: 600, spacing: 1.2 },
    sidebarBody:    { size: 7.5 },
    sidebarContact: { size: 7.5, leading: 1.4 },
    // Identity block
    name:     { size: 11,  weight: 700, spacing: 0.3 },
    title:    { size: 8 },
    company:  { size: 7.5, weight: 500 },
    // Tags
    tag:      { size: 7.5, weight: 500 },
    // Achievements
    achieveYear: { size: 8,   weight: 500 },
    achieveText: { size: 7.5, leading: 1.4 },
    // Education
    degree:      { size: 8.5, weight: 500 },
    institution: { size: 8 },
    // Referee
    refName:     { size: 9,   weight: 700 },
    refDetail:   { size: 8 },
    refContact:  { size: 7.8 },
    // Corner badge
    corner:      { size: 7,   weight: 700, spacing: 0.5 },
    // Layout estimation
    charWidthFraction: 0.58,
  },

  // ── Spacing ─────────────────────────────────────────────────────────────
  spacing: {
    sectionGap:       13.5,   // gap between sidebar sections
    sectionTitlePb:   3,      // section title padding-bottom
    sectionTitleMb:   9,      // section title margin-bottom (main)
    sidebarTitleMb:   7,      // section title margin-bottom (sidebar)
    bulletGap:        4.5,    // gap between bullet items
    summaryBulletGap: 7.5,    // gap between summary bullets
    bulletIndent:     9,      // dash + gap offset for bullet width calc
    entryMb:          11,     // experience entry margin-bottom
    entryMetaMt:      1.5,    // margin-top for company/period row
    locationMb:       3,      // location margin-bottom
    descMt:           3,      // description margin-top
    descMb:           7.5,    // description margin-bottom
    progMt:           6,      // progression block margin-top
    progMb:           7.5,    // progression block margin-bottom
    progPy:           1.5,    // progression row padding-vertical
    progPl:           7.5,    // progression block padding-left
    itemPl:           7.5,    // indented item padding-left (edu, achievements)
    iconWidth:        8,      // contact icon width
    iconMr:           6.75,   // contact icon margin-right
    iconMt:           1,      // contact icon margin-top
    contactRowMb:     6.75,   // contact row margin-bottom
    spacer:           27,     // default spacer height between sections
    safety:           15,     // page-packing safety buffer
  },

  // ── Chrome (decorative / structural) ────────────────────────────────────
  chrome: {
    mainColumnTopRadius:  7,
    cornerBadgeRadius:    7,
    cornerWidth:         52,
    cornerHeight:        34,
    photoHeight:        255,
    photoBorderRadius:    4,
    atsPhotoSize:        72,
    atsPhotoBorderRadius: 3,
    sectionBorderWidth:   1.5,
    sidebarBorderWidth:   0.75,
    tagBorderRadius:      2.5,
    tagPy:                2.25,
    tagPx:                6,
    tagGap:               4,
    dividerHeight:        0.75,
    dividerMargin:       16.5,
    identityDividerWidth: 21,
    identityDividerMy:    4.5,
    identityPt:          13.5,
    identityPb:           9,
    identityPl:          24,
    identityPr:          15,
    photoPx:              6,
    photoPb:              6,
  },

  // ── Page geometry ───────────────────────────────────────────────────────
  geometry: {
    pageWidth:        595.28,
    pageHeight:       841.89,
    topBar:           30,
    sidebarFraction:  0.37,
    singleColumnMargin: 42,
    mainPad:  { top: 27, right: 33, bottom: 54, left: 30 },
    contPad:  { top: 24, right: 33, bottom: 54, left: 30 },
    sidebarPad: { top: 13.5, right: 16.5, bottom: 21, left: 24 },
  },
}
