import { Text, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) => StyleSheet.create({
  main: {
    fontSize: t.typography.sectionTitle.size, fontWeight: t.typography.sectionTitle.weight, fontFamily: t.typography.fontFamily,
    textTransform: 'uppercase', letterSpacing: t.typography.sectionTitle.spacing,
    color: t.palette.accent,
    borderBottomWidth: t.chrome.sectionBorderWidth, borderBottomColor: t.palette.accent,
    paddingBottom: t.spacing.sectionTitlePb, marginBottom: t.spacing.sectionTitleMb,
  },
  sidebar: {
    fontSize: t.typography.sidebarSection.size, fontWeight: t.typography.sidebarSection.weight, fontFamily: t.typography.fontFamily,
    textTransform: 'uppercase', letterSpacing: t.typography.sidebarSection.spacing,
    color: t.palette.textMuted,
    borderBottomWidth: t.chrome.sidebarBorderWidth, borderBottomColor: t.palette.divider,
    paddingBottom: t.spacing.sectionTitlePb, marginBottom: t.spacing.sidebarTitleMb,
  },
})

export default function SectionTitle({ children, variant = 'main' }) {
  const s = useStyles(makeStyles)
  return <Text style={variant === 'sidebar' ? s.sidebar : s.main}>{children}</Text>
}
