import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'
import SectionTitle from '../components/SectionTitle.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) => StyleSheet.create({
  wrap:   { marginBottom: t.spacing.sectionGap },
  item:   { marginBottom: 12 },
  name:   { fontSize: t.typography.degree.size, fontWeight: t.typography.degree.weight, color: t.palette.accent, lineHeight: 1.3 },
  issuer: { fontSize: t.typography.institution.size, color: t.palette.textBody, marginTop: t.spacing.entryMetaMt, paddingLeft: t.spacing.itemPl },
  year:   { fontSize: t.typography.caption.size, color: t.palette.textMuted, marginTop: 0.75, paddingLeft: t.spacing.itemPl },
})

/** @param {{ data: import('../types.js').CVContent }} props */
export default function CertificationsSection({ data }) {
  const s = useStyles(makeStyles)
  if (!data.certifications?.length) return null
  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">Certifications</SectionTitle>
      {data.certifications.map((c, i) => (
        <View key={i} style={s.item}>
          <Text style={s.name}>{c.name}</Text>
          {c.issuer && <Text style={s.issuer}>{c.issuer}</Text>}
          {c.year && <Text style={s.year}>{c.year}</Text>}
        </View>
      ))}
    </View>
  )
}
