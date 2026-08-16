import { StyleSheet, Text, View } from '@react-pdf/renderer'
import { useStyles, useTheme } from '../ThemeContext.jsx'
import BulletList from './BulletList.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    wrap: { marginBottom: t.spacing.entryMb },
    role: {
      fontSize: t.typography.role.size,
      fontWeight: t.typography.role.weight,
      color: t.palette.textDark,
      lineHeight: t.typography.role.leading
    },
    contRole: {
      fontSize: t.typography.role.size,
      fontWeight: t.typography.role.weight,
      color: t.palette.textDark,
      lineHeight: t.typography.role.leading
    },
    contTag: { fontSize: t.typography.meta.size, fontWeight: 400, color: t.palette.textMuted },
    meta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: t.spacing.entryMetaMt
    },
    company: { fontSize: t.typography.body.size, color: t.palette.textBody },
    period: { fontSize: t.typography.meta.size, color: t.palette.textMuted },
    location: {
      fontSize: t.typography.meta.size,
      color: t.palette.textMuted,
      marginBottom: t.spacing.locationMb
    },
    desc: {
      fontSize: t.typography.description.size,
      fontStyle: 'italic',
      color: t.palette.textMuted,
      lineHeight: t.typography.description.leading,
      marginTop: t.spacing.descMt,
      marginBottom: t.spacing.descMb
    },
    progBlock: {
      marginTop: t.spacing.progMt,
      marginBottom: t.spacing.progMb,
      paddingLeft: t.spacing.progPl,
      borderLeftWidth: t.chrome.sectionBorderWidth,
      borderLeftColor: t.palette.divider
    },
    progRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingVertical: t.spacing.progPy
    },
    progTitle: { fontSize: t.typography.meta.size, color: t.palette.textBody },
    progPeriod: { fontSize: t.typography.caption.size, color: t.palette.textMuted }
  })

/** @param {import('../types.js').ExperienceEntry} props */
export default function ExpItem({
  role,
  company,
  period,
  location,
  description,
  progression,
  bullets,
  startProg = 0,
  endProg,
  startBullet = 0,
  endBullet,
  isContinuation = false
}) {
  const s = useStyles(makeStyles)
  const t = useTheme()
  const visibleBullets = (bullets ?? []).slice(startBullet, endBullet)
  // D7 `prog-split`: the promotion table is a slice, on BOTH kinds of piece.
  // `layout.js`'s `progressionSlice` is the same arithmetic — the two must
  // agree row for row or the model measures something the page does not draw.
  const visibleProg = /** @type {import('../types.js').ProgressionStep[]} */ (
    progression ?? []
  ).slice(startProg, endProg)

  const progTable = visibleProg.length > 0 && (
    <View style={s.progBlock}>
      {visibleProg.map((p) => (
        <View key={p.title} style={s.progRow}>
          <Text style={s.progTitle}>{p.title}</Text>
          <Text style={s.progPeriod}>{p.period}</Text>
        </View>
      ))}
    </View>
  )

  if (isContinuation) {
    return (
      <View style={s.wrap}>
        <Text style={s.contRole}>
          {role} <Text style={s.contTag}>(cont'd)</Text>
        </Text>
        {progTable}
        {visibleBullets.length > 0 && (
          <BulletList items={visibleBullets} gap={t.spacing.bulletGap} />
        )}
      </View>
    )
  }

  return (
    <View style={s.wrap}>
      <Text style={s.role}>{role}</Text>
      <View style={s.meta}>
        <Text style={s.company}>{company}</Text>
        <Text style={s.period}>{period}</Text>
      </View>
      {location && <Text style={s.location}>{location}</Text>}
      {description && <Text style={s.desc}>{description}</Text>}
      {progTable}
      {visibleBullets.length > 0 && <BulletList items={visibleBullets} gap={t.spacing.bulletGap} />}
    </View>
  )
}
