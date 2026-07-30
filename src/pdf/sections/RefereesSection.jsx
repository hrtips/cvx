import { Link, StyleSheet, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) =>
  StyleSheet.create({
    divider: {
      height: t.chrome.dividerHeight,
      backgroundColor: t.palette.divider,
      marginVertical: t.spacing.sectionGap
    },
    name: {
      fontSize: t.typography.refName.size,
      fontWeight: t.typography.refName.weight,
      color: t.palette.textDark
    },
    title: { fontSize: t.typography.refDetail.size, color: t.palette.textBody, marginTop: 0.75 },
    company: { fontSize: t.typography.refContact.size, color: t.palette.textBody },
    contact: { marginTop: t.spacing.descMt },
    row: { flexDirection: 'row', alignItems: 'center', marginTop: t.spacing.entryMetaMt },
    label: { fontSize: 7, color: t.palette.textMuted, width: 9 },
    value: { fontSize: t.typography.refContact.size, color: t.palette.textContact },
    link: {
      fontSize: t.typography.refContact.size,
      color: t.palette.textContact,
      textDecoration: 'none'
    },
    empty: { fontSize: t.typography.meta.size, fontStyle: 'italic', color: t.palette.textMuted }
  })

function Referee({ r, s }) {
  return (
    <View>
      <Text style={s.name}>{r.name}</Text>
      {r.title && (
        <Text style={s.title}>
          {r.title}
          {r.company ? `, ${r.company}` : ''}
        </Text>
      )}
      <View style={s.contact}>
        {r.email && (
          <View style={s.row}>
            <Text style={s.label}>@</Text>
            <Link src={`mailto:${r.email}`} style={s.link}>
              {r.email}
            </Link>
          </View>
        )}
        {r.phone && (
          <View style={s.row}>
            <Text style={s.label}>T</Text>
            <Text style={s.value}>{r.phone}</Text>
          </View>
        )}
      </View>
    </View>
  )
}

export default function RefereesSection({ data }) {
  const s = useStyles(makeStyles)
  const { referees } = data
  return (
    <View>
      <SectionTitle variant="sidebar">Referees</SectionTitle>
      {referees?.length > 0 ? (
        referees.map((r, i) => (
          <View key={r.name}>
            <Referee r={r} s={s} />
            {i < referees.length - 1 && <View style={s.divider} />}
          </View>
        ))
      ) : (
        <Text style={s.empty}>References available upon request.</Text>
      )}
    </View>
  )
}
