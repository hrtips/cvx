import { StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) =>
  StyleSheet.create({
    wrap: { marginBottom: t.spacing.sectionGap },
    item: { marginBottom: 12 },
    name: {
      fontSize: t.typography.degree.size,
      fontWeight: t.typography.degree.weight,
      color: t.palette.accent,
      lineHeight: 1.3
    },
    issuer: {
      fontSize: t.typography.institution.size,
      color: t.palette.textBody,
      marginTop: t.spacing.entryMetaMt,
      paddingLeft: t.spacing.itemPl
    },
    year: {
      fontSize: t.typography.caption.size,
      color: t.palette.textMuted,
      marginTop: 0.75,
      paddingLeft: t.spacing.itemPl
    }
  })

export default function CertificationsSection({ data }) {
  const s = useStyles(makeStyles)
  if (!data.certifications?.length) return null
  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">Certifications</SectionTitle>
      {data.certifications.map((c) => (
        <View key={c.name} style={s.item}>
          <Text style={s.name}>{c.name}</Text>
          {c.issuer && <Text style={s.issuer}>{c.issuer}</Text>}
          {c.year && <Text style={s.year}>{c.year}</Text>}
        </View>
      ))}
    </View>
  )
}
