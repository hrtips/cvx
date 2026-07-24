import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) => StyleSheet.create({
  identity:    { backgroundColor: t.palette.accent, paddingLeft: t.chrome.identityPl, paddingRight: t.chrome.identityPr, paddingVertical: t.chrome.identityPt, alignItems: 'center' },
  name:        { fontSize: t.typography.name.size, fontWeight: t.typography.name.weight, color: t.palette.white, lineHeight: 1.2, letterSpacing: t.typography.name.spacing, textAlign: 'center' },
  divider:     { width: t.chrome.identityDividerWidth, height: t.chrome.dividerHeight, backgroundColor: t.palette.accentDivider, marginVertical: t.chrome.identityDividerMy },
  titleText:   { fontSize: t.typography.title.size, color: t.palette.accentTextSecondary, lineHeight: 1.5, textAlign: 'center' },
  companyText: { fontSize: t.typography.company.size, fontWeight: t.typography.company.weight, color: t.palette.accentTextTertiary, marginTop: t.spacing.entryMetaMt, textAlign: 'center' },
})

export default function IdentityCompact({ data }) {
  const s = useStyles(makeStyles)
  const { personal } = data
  return (
    <View style={s.identity}>
      <Text style={s.name}>{personal.name}</Text>
      <View style={s.divider} />
      <Text style={s.titleText}>{personal.title}</Text>
      <Text style={s.companyText}>{personal.company}</Text>
    </View>
  )
}
