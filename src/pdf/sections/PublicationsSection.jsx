import { StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) =>
  StyleSheet.create({
    wrap: { marginBottom: t.spacing.sectionGap },
    item: { marginBottom: 12 },
    title: {
      fontSize: t.typography.degree.size,
      fontWeight: t.typography.degree.weight,
      color: t.palette.accent,
      lineHeight: 1.3
    },
    meta: {
      fontSize: t.typography.institution.size,
      color: t.palette.textBody,
      marginTop: t.spacing.entryMetaMt,
      paddingLeft: t.spacing.itemPl
    }
  })

export default function PublicationsSection({ data }) {
  const s = useStyles(makeStyles)
  if (!data.publications?.length) return null
  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">Publications</SectionTitle>
      {data.publications.map((p) => {
        const meta = [p.venue, p.year].filter(Boolean).join('  ·  ')
        return (
          <View key={p.title} style={s.item}>
            <Text style={s.title}>{p.title}</Text>
            {meta && <Text style={s.meta}>{meta}</Text>}
          </View>
        )
      })}
    </View>
  )
}
