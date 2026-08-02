import { StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'
import { sliceItems, sliceTitle } from './sectionSlice.js'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      rowGap: t.chrome.tagGap,
      columnGap: t.chrome.tagGap
    },
    tag: {
      backgroundColor: t.palette.tagBg,
      paddingVertical: t.chrome.tagPy,
      paddingHorizontal: t.chrome.tagPx,
      borderRadius: t.chrome.tagBorderRadius
    },
    text: {
      fontSize: t.typography.tag.size,
      fontWeight: t.typography.tag.weight,
      color: t.palette.tagText
    }
  })

/** @param {{ data: import('../types.js').CVContent, slice?: import('../types.js').SidebarSlice }} props */
export default function CompetenciesSection({ data, slice }) {
  const s = useStyles(makeStyles)
  const items = sliceItems(data.competencies, slice)
  if (!items.length) return null
  return (
    <View>
      <SectionTitle variant="sidebar">{sliceTitle('Core Competencies', slice)}</SectionTitle>
      <View style={s.wrap}>
        {items.map((tag) => (
          <View key={tag} style={s.tag}>
            <Text style={s.text}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
