import { View, Text, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'
import SectionTitle from '../components/SectionTitle.jsx'

const makeStyles = (t) => StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', rowGap: t.chrome.tagGap, columnGap: t.chrome.tagGap },
  tag:  { backgroundColor: t.palette.tagBg, paddingVertical: t.chrome.tagPy, paddingHorizontal: t.chrome.tagPx, borderRadius: t.chrome.tagBorderRadius },
  text: { fontSize: t.typography.tag.size, fontWeight: t.typography.tag.weight, color: t.palette.tagText },
})

export default function CompetenciesSection({ data }) {
  const s = useStyles(makeStyles)
  if (!data.competencies?.length) return null
  return (
    <View>
      <SectionTitle variant="sidebar">Core Competencies</SectionTitle>
      <View style={s.wrap}>
        {data.competencies.map((tag) => (
          <View key={tag} style={s.tag}>
            <Text style={s.text}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
