import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) => StyleSheet.create({
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  headerText:  { flex: 1, paddingRight: 12 },
  name:        { fontSize: 16, fontWeight: 700, color: t.palette.textDark },
  titleLine:   { fontSize: 10, color: t.palette.textBody, marginTop: 2, marginBottom: 3 },
  contactLine: { fontSize: 8.5, color: t.palette.textMuted },
  photo:       { width: t.chrome.atsPhotoSize, height: t.chrome.atsPhotoSize, objectFit: 'cover', borderRadius: t.chrome.atsPhotoBorderRadius },
})

export default function HeaderATS({ data }) {
  const s = useStyles(makeStyles)
  const { personal, profilePhoto } = data
  const linkParts = (personal.links ?? []).map((l) => (l.label ? `${l.label}: ${l.href}` : l.href))
  const contactParts = [personal.phone, personal.email, personal.linkedin, personal.location, ...linkParts].filter(Boolean)

  return (
    <View style={s.headerRow}>
      <View style={s.headerText}>
        <Text style={s.name}>{personal.name}</Text>
        <Text style={s.titleLine}>
          {personal.title}{personal.company ? `  |  ${personal.company}` : ''}
        </Text>
        <Text style={s.contactLine}>{contactParts.join('  |  ')}</Text>
      </View>
      {profilePhoto && <Image src={profilePhoto} style={s.photo} />}
    </View>
  )
}
