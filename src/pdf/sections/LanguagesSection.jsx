import { StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'
import { sliceItems, sliceTitle } from './sectionSlice.js'

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

/** @param {{ data: import('../types.js').CVContent, slice?: import('../types.js').SidebarSlice }} props */
export default function LanguagesSection({ data, slice }) {
  const s = useStyles(makeStyles)
  const items = sliceItems(data.languages, slice)
  if (!items.length) return null
  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">{sliceTitle('Languages', slice)}</SectionTitle>
      {items.map((l, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: N6 — the content field alone is not unique by schema (two stints at one company, two awards in one year); this is a single-shot renderToBuffer with no reconciliation, so position is the stable identity
        <View key={`${i}-${l.language}`} style={s.item}>
          <Text style={s.lang}>{l.language}</Text>
          {l.proficiency && <Text style={s.prof}>{l.proficiency}</Text>}
        </View>
      ))}
    </View>
  )
}
