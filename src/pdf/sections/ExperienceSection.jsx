// ── Experience section (main column) ────────────────────────────────────────
import { StyleSheet, View } from '@react-pdf/renderer'
import ExpItem from '../components/ExpItem.jsx'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    divider: {
      height: t.chrome.dividerHeight,
      backgroundColor: t.palette.divider,
      marginVertical: t.chrome.dividerMargin
    }
  })

/**
 * `data` is accepted (the generic slot renderer passes it to every section)
 * but unused here — this section reads only `entries`. Declared in the type,
 * not destructured, so the section-registry union stays homogeneous.
 *
 * @param {{
 *   data?: import('../types.js').CVContent,
 *   entries?: import('../types.js').ExperienceEntry[],
 *   continued?: boolean,
 * }} props
 */
export default function ExperienceSection({ entries, continued = false }) {
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
