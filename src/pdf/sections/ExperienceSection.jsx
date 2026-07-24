// ── Experience section (main column) ────────────────────────────────────────
import { View, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'
import SectionTitle from '../components/SectionTitle.jsx'
import ExpItem from '../components/ExpItem.jsx'

const makeStyles = (t) => StyleSheet.create({
  divider: { height: t.chrome.dividerHeight, backgroundColor: t.palette.divider, marginVertical: 16.5 },
})

export default function ExperienceSection({ data, entries, continued = false }) {
  const s = useStyles(makeStyles)
  const label = continued ? 'Experience (continued)' : 'Experience'
  if (!entries?.length) return null
  return (
    <View>
      <SectionTitle>{label}</SectionTitle>
      {entries.map((e, i) => (
        <View key={`${e.role}-${e.company}`}>
          <ExpItem {...e} />
          {i < entries.length - 1 && <View style={s.divider} />}
        </View>
      ))}
    </View>
  )
}
