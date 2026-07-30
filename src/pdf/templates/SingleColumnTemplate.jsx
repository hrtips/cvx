import { Page, StyleSheet } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

const makeStyles = (t) =>
  StyleSheet.create({
    page: {
      fontFamily: t.typography.fontFamily,
      backgroundColor: t.palette.white,
      paddingHorizontal: t.geometry.singleColumnMargin,
      paddingTop: t.geometry.singleColumnMargin,
      paddingBottom: t.geometry.singleColumnMargin
    }
  })

export default function SingleColumnTemplate({ mainSlot }) {
  const s = useStyles(makeStyles)
  return (
    <Page size="A4" style={s.page}>
      {mainSlot}
    </Page>
  )
}
