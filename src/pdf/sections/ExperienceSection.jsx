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
      {/* N6: keys are index-qualified. `role`-`company` alone is the exact
          collision the harness hardened its OWN block identity against — two
          stints at the same company in the same role are legal content, and
          React's duplicate-key message says children "may be duplicated and/or
          omitted". Harmless on today's single-shot renderToBuffer; the fix costs
          nothing and stops that being load-bearing. */}
      {entries.map((e, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: N6 — the content field alone is not unique by schema (two stints at one company, two awards in one year); this is a single-shot renderToBuffer with no reconciliation, so position is the stable identity
        <View key={`${i}-${e.role}-${e.company}`}>
          <ExpItem {...e} />
          {i < entries.length - 1 && <View style={s.divider} />}
        </View>
      ))}
    </View>
  )
}
