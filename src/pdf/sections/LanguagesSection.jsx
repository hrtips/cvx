import { StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    wrap: { marginBottom: t.spacing.sectionGap },
    item: { marginBottom: 7 },
    lang: {
      fontSize: t.typography.degree.size,
      fontWeight: t.typography.degree.weight,
      color: t.palette.accent,
      lineHeight: 1.3
    },
    prof: {
      fontSize: t.typography.caption.size,
      color: t.palette.textMuted,
      marginTop: 0.75,
      paddingLeft: t.spacing.itemPl
    }
  })

/** @param {{ data: import('../types.js').CVContent }} props */
export default function LanguagesSection({ data }) {
  const s = useStyles(makeStyles)
  if (!data.languages?.length) return null
  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">Languages</SectionTitle>
      {data.languages.map((l) => (
        <View key={l.language} style={s.item}>
          <Text style={s.lang}>{l.language}</Text>
          {l.proficiency && <Text style={s.prof}>{l.proficiency}</Text>}
        </View>
      ))}
    </View>
  )
}
