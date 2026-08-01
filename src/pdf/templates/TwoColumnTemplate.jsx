import { Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) => {
  const g = t.geometry
  const bodyH = g.pageHeight - g.topBar
  const sidebarPct = `${g.sidebarFraction * 100}%`

  return StyleSheet.create({
    page: { fontFamily: t.typography.fontFamily, backgroundColor: t.palette.white },
    topBar: { height: g.topBar, backgroundColor: t.palette.accent },
    // minHeight, NOT height: a fixed height authorizes yoga to compress the
    // columns' children when content overflows (glyphs overprint — see
    // dogfood report 2026-07-26). With a minimum, short content still fills
    // the page and long content FLOWS onto extra physical pages — react-pdf
    // does not clip it (verified by render 2026-08-01). The cost of overflow
    // is unplanned pages and wasted space, never lost text; the packer +
    // page1-overflow warning keep content within budget, and this is the
    // last line of defense against compression.
    //
    // Known (C1, folded into C3): topBar (30) + this minHeight (pageHeight −
    // topBar) sums to exactly pageHeight, leaving zero slack, so rounding can
    // spill a blank sliver page. C3 fixes this properly by measuring and
    // packing the sidebar; masking it here would only trade the sliver for a
    // visible bottom gap.
    body: { flexDirection: 'row', minHeight: bodyH, backgroundColor: t.palette.accent },
    sidebar: { width: sidebarPct, backgroundColor: t.palette.sidebarBg },
    mainFirst: {
      flex: 1,
      flexDirection: 'column',
      backgroundColor: t.palette.white,
      borderTopLeftRadius: t.chrome.mainColumnTopRadius
    },
    mainCont: { flex: 1, flexDirection: 'column', backgroundColor: t.palette.white },
    contentFirst: {
      flex: 1,
      paddingTop: g.mainPad.top,
      paddingRight: g.mainPad.right,
      paddingLeft: g.mainPad.left,
      paddingBottom: g.mainPad.bottom
    },
    contentCont: {
      flex: 1,
      paddingTop: g.contPad.top,
      paddingRight: g.contPad.right,
      paddingLeft: g.contPad.left,
      paddingBottom: g.contPad.bottom
    },
    cornerWrap: { alignItems: 'flex-end' },
    corner: {
      width: t.chrome.cornerWidth,
      height: t.chrome.cornerHeight,
      backgroundColor: t.palette.accent,
      borderTopLeftRadius: t.chrome.cornerBadgeRadius,
      justifyContent: 'center',
      alignItems: 'center'
    },
    cornerText: {
      fontSize: t.typography.corner.size,
      fontWeight: t.typography.corner.weight,
      color: t.palette.accentText,
      letterSpacing: t.typography.corner.spacing
    }
  })
}

/**
 * @param {{
 *   sidebarSlot?: import('react').ReactNode,
 *   mainSlot?: import('react').ReactNode,
 *   pageNum: number,
 *   totalPages: number,
 *   isFirst?: boolean,
 * }} props
 */
export default function TwoColumnTemplate({
  sidebarSlot,
  mainSlot,
  pageNum,
  totalPages,
  isFirst = false
}) {
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
              <Text style={s.cornerText}>
                {pageNum} of {totalPages}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Page>
  )
}
