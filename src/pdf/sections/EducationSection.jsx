import { StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'
import { sliceItems, sliceTitle } from './sectionSlice.js'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    wrap: { marginBottom: t.spacing.sectionGap },
    item: { marginBottom: 15 },
    degree: {
      fontSize: t.typography.degree.size,
      fontWeight: t.typography.degree.weight,
      color: t.palette.accent,
      lineHeight: 1.3
    },
    institution: {
      fontSize: t.typography.institution.size,
      color: t.palette.textBody,
      marginTop: t.spacing.entryMetaMt,
      paddingLeft: t.spacing.itemPl
    },
    period: {
      fontSize: t.typography.caption.size,
      color: t.palette.textMuted,
      marginTop: 0.75,
      paddingLeft: t.spacing.itemPl
    }
  })

/** @param {{ data: import('../types.js').CVContent, slice?: import('../types.js').SidebarSlice }} props */
export default function EducationSection({ data, slice }) {
  const s = useStyles(makeStyles)
  const items = sliceItems(data.education, slice)
  if (!items.length) return null
  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">{sliceTitle('Education', slice)}</SectionTitle>
      {items.map((edu) => (
        <View key={edu.degree} style={s.item}>
          <Text style={s.degree}>{edu.degree}</Text>
          <Text style={s.institution}>{edu.institution}</Text>
          {edu.period && <Text style={s.period}>{edu.period}</Text>}
        </View>
      ))}
    </View>
  )
}
