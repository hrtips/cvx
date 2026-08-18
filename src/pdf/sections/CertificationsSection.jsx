import { StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'
import { sliceItems, sliceTitle } from './sectionSlice.js'

/** @param {import('../types.js').Theme} t */
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

/** @param {{ data: import('../types.js').CVContent, slice?: import('../types.js').SidebarSlice }} props */
export default function CertificationsSection({ data, slice }) {
  const s = useStyles(makeStyles)
  const items = sliceItems(data.certifications, slice)
  if (!items.length) return null
  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">{sliceTitle('Certifications', slice)}</SectionTitle>
      {items.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: N6 — the content field alone is not unique by schema (two stints at one company, two awards in one year); this is a single-shot renderToBuffer with no reconciliation, so position is the stable identity
        <View key={`${i}-${c.name}`} style={s.item}>
          <Text style={s.name}>{c.name}</Text>
          {c.issuer && <Text style={s.issuer}>{c.issuer}</Text>}
          {c.year && <Text style={s.year}>{c.year}</Text>}
        </View>
      ))}
    </View>
  )
}
