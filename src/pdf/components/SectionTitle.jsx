import { StyleSheet, Text } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) => {
  const main = {
    fontSize: t.typography.sectionTitle.size,
    fontWeight: t.typography.sectionTitle.weight,
    fontFamily: t.typography.fontFamily,
    letterSpacing: t.typography.sectionTitle.spacing,
    color: t.palette.accent,
    borderBottomWidth: t.chrome.sectionBorderWidth,
    borderBottomColor: t.palette.accent,
    paddingBottom: t.spacing.sectionTitlePb,
    marginBottom: t.spacing.sectionTitleMb
  }
  const sidebar = {
    fontSize: t.typography.sidebarSection.size,
    fontWeight: t.typography.sidebarSection.weight,
    fontFamily: t.typography.fontFamily,
    letterSpacing: t.typography.sidebarSection.spacing,
    color: t.palette.textMuted,
    borderBottomWidth: t.chrome.sidebarBorderWidth,
    borderBottomColor: t.palette.divider,
    paddingBottom: t.spacing.sectionTitlePb,
    marginBottom: t.spacing.sidebarTitleMb
  }
  return StyleSheet.create({
    main: { ...main, textTransform: 'uppercase' },
    sidebar: { ...sidebar, textTransform: 'uppercase' },
    // A heading the user typed in headings.yaml: the same box and type with NO
    // case transform. INV-0 forbids changing the case of supplied text, so it
    // reaches the page exactly as written — and layout.js's
    // `sidebarSectionTitle` tells the measurer the same thing, so the string
    // priced is the string drawn.
    mainVerbatim: main,
    sidebarVerbatim: sidebar
  })
}

/**
 * A section heading. `verbatim` draws the text exactly as given — set only for
 * a user's own heading from headings.yaml; CVX's built-in labels keep the
 * theme's capitals.
 *
 * @param {{ children?: import('react').ReactNode, variant?: string, verbatim?: boolean }} props
 */
export default function SectionTitle({ children, variant = 'main', verbatim = false }) {
  const s = useStyles(makeStyles)
  const sidebar = variant === 'sidebar'
  const style = verbatim
    ? sidebar
      ? s.sidebarVerbatim
      : s.mainVerbatim
    : sidebar
      ? s.sidebar
      : s.main
  return <Text style={style}>{children}</Text>
}
