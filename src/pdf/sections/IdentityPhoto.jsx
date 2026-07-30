import { View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) => StyleSheet.create({
  identity:    { backgroundColor: t.palette.accent, overflow: 'hidden' },
  nameBlock:   { alignItems: 'center', paddingLeft: t.chrome.identityPl, paddingRight: t.chrome.identityPr, paddingTop: t.chrome.identityPt, paddingBottom: t.chrome.identityPb },
  name:        { fontSize: t.typography.name.size, fontWeight: t.typography.name.weight, color: t.palette.white, lineHeight: 1.2, letterSpacing: t.typography.name.spacing, textAlign: 'center' },
  divider:     { width: t.chrome.identityDividerWidth, height: t.chrome.dividerHeight, backgroundColor: t.palette.accentDivider, marginVertical: t.chrome.identityDividerMy, alignSelf: 'center' },
  titleText:   { fontSize: t.typography.title.size, color: t.palette.accentTextSecondary, lineHeight: 1.5, textAlign: 'center' },
  companyText: { fontSize: t.typography.company.size, fontWeight: t.typography.company.weight, color: t.palette.accentTextTertiary, marginTop: t.spacing.entryMetaMt, textAlign: 'center' },
  photoWrap:   { paddingHorizontal: t.chrome.photoPx, paddingBottom: t.chrome.photoPb },
  photo:       { width: '100%', height: t.chrome.photoHeight, objectFit: 'cover', borderRadius: t.chrome.photoBorderRadius },
})

/** @param {{ data: import('../types.js').CVContent }} props */
export default function IdentityPhoto({ data }) {
  const s = useStyles(makeStyles)
  const { personal, profilePhoto } = data
  return (
    <View style={s.identity}>
      <View style={s.nameBlock}>
        <Text style={s.name}>{personal.name}</Text>
        <View style={s.divider} />
        <Text style={s.titleText}>{personal.title}</Text>
        <Text style={s.companyText}>{personal.company}</Text>
      </View>
      {profilePhoto && (
        <View style={s.photoWrap}>
          <Image src={profilePhoto} style={s.photo} />
        </View>
      )}
    </View>
  )
}
