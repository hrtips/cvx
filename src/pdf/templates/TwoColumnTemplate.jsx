import { Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) => {
  const g = t.geometry
  const bodyH = g.pageHeight - g.topBar
  const sidebarPct = `${g.sidebarFraction * 100}%`

  return StyleSheet.create({
    page:       { fontFamily: t.typography.fontFamily, backgroundColor: t.palette.white },
    topBar:     { height: g.topBar, backgroundColor: t.palette.accent },
    body:       { flexDirection: 'row', height: bodyH, backgroundColor: t.palette.accent },
    sidebar:    { width: sidebarPct, backgroundColor: t.palette.sidebarBg },
    mainFirst:  { flex: 1, flexDirection: 'column', backgroundColor: t.palette.white, borderTopLeftRadius: t.chrome.mainColumnTopRadius },
    mainCont:   { flex: 1, flexDirection: 'column', backgroundColor: t.palette.white },
    contentFirst: { flex: 1, paddingTop: g.mainPad.top, paddingRight: g.mainPad.right, paddingLeft: g.mainPad.left, paddingBottom: g.mainPad.bottom },
    contentCont:  { flex: 1, paddingTop: g.contPad.top, paddingRight: g.contPad.right, paddingLeft: g.contPad.left, paddingBottom: g.contPad.bottom },
    cornerWrap: { alignItems: 'flex-end' },
    corner:     { width: t.chrome.cornerWidth, height: t.chrome.cornerHeight, backgroundColor: t.palette.accent, borderTopLeftRadius: t.chrome.cornerBadgeRadius, justifyContent: 'center', alignItems: 'center' },
    cornerText: { fontSize: t.typography.corner.size, fontWeight: t.typography.corner.weight, color: t.palette.accentText, letterSpacing: t.typography.corner.spacing },
  })
}

export default function TwoColumnTemplate({ sidebarSlot, mainSlot, pageNum, totalPages, isFirst = false }) {
  const s = useStyles(makeStyles)
  return (
    <Page size="A4" style={s.page}>
      <View style={s.topBar} />
      <View style={s.body}>
        <View style={s.sidebar}>{sidebarSlot}</View>
        <View style={isFirst ? s.mainFirst : s.mainCont}>
          <View style={isFirst ? s.contentFirst : s.contentCont}>{mainSlot}</View>
          <View style={s.cornerWrap}>
            <View style={s.corner}>
              <Text style={s.cornerText}>{pageNum} of {totalPages}</Text>
            </View>
          </View>
        </View>
      </View>
    </Page>
  )
}
