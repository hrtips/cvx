import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'
import SectionTitle from '../components/SectionTitle.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) => StyleSheet.create({
  item: { marginBottom: t.spacing.sectionGap },
  year: { fontSize: t.typography.achieveYear.size, fontWeight: t.typography.achieveYear.weight, color: t.palette.accent, lineHeight: 1.3 },
  text: { fontSize: t.typography.achieveText.size, color: t.palette.textMuted, lineHeight: t.typography.achieveText.leading, marginTop: 0.75, paddingLeft: t.spacing.itemPl },
})

/** @param {{ data: import('../types.js').CVContent }} props */
export default function AchievementsSection({ data }) {
  const s = useStyles(makeStyles)
  if (!data.achievements?.length) return null
  return (
    <View>
      <SectionTitle variant="sidebar">Achievements</SectionTitle>
      {data.achievements.map((item) => (
        <View key={item.year} style={s.item}>
          <Text style={s.year}>{item.year}</Text>
          <Text style={s.text}>{item.text}</Text>
        </View>
      ))}
    </View>
  )
}
