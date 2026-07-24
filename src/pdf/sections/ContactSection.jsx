import { View, Text, Link, Svg, Path, StyleSheet } from '@react-pdf/renderer'
import { useTheme, useStyles } from '../ThemeContext.jsx'
import SectionTitle from '../components/SectionTitle.jsx'

const ICONS = {
  phone:    { viewBox: '0 0 512 512', d: 'M493.4 24.6l-104-24c-11.3-2.6-22.9 3.3-27.5 13.9l-48 112c-4.2 9.8-1.4 21.3 6.9 28l60.6 49.6c-36 76.7-98.9 140.5-177.2 177.2l-49.6-60.6c-6.8-8.3-18.2-11.1-28-6.9l-112 48C3.9 366.5-2 378.1.6 389.4l24 104C27.1 504.2 36.7 512 48 512c256.1 0 464-207.5 464-464 0-11.2-7.7-20.9-18.6-23.4z' },
  envelope: { viewBox: '0 0 512 512', d: 'M502.3 190.8c3.9-3.1 9.7-.2 9.7 4.7V400c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V195.6c0-5 5.7-7.8 9.7-4.7 22.4 17.4 52.1 39.5 154.1 113.6 21.1 15.4 56.7 47.8 92.2 47.6 35.7.3 72-32.8 92.3-47.6 102-74.1 131.6-96.3 154-113.7zM256 320c23.2.4 56.6-29.2 73.4-41.4 132.7-96.3 142.8-104.7 173.4-128.7 5.8-4.5 9.2-11.5 9.2-18.9v-19c0-26.5-21.5-48-48-48H48C21.5 64 0 85.5 0 112v19c0 7.4 3.4 14.3 9.2 18.9 30.6 23.9 40.7 32.4 173.4 128.7 16.8 12.2 50.2 41.8 73.4 41.4z' },
  linkedin: { viewBox: '0 0 448 512', d: 'M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z' },
  facebook: { viewBox: '0 0 320 512', d: 'M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z' },
  location: { viewBox: '0 0 384 512', d: 'M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0zM192 272c44.183 0 80-35.817 80-80s-35.817-80-80-80-80 35.817-80 80 35.817 80 80 80z' },
}

const makeStyles = (t) => StyleSheet.create({
  wrap:  { marginBottom: t.spacing.sectionGap },
  row:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: t.spacing.contactRowMb },
  icon:  { width: t.spacing.iconWidth, marginRight: t.spacing.iconMr, marginTop: t.spacing.iconMt },
  text:  { flex: 1, fontSize: t.typography.sidebarContact.size, color: t.palette.textBody, lineHeight: t.typography.sidebarContact.leading },
  link:  { flex: 1, fontSize: t.typography.sidebarContact.size, color: t.palette.textBody, lineHeight: t.typography.sidebarContact.leading, textDecoration: 'none' },
})

function Icon({ name, color, spacing }) {
  const icon = ICONS[name]
  if (!icon) return null
  return (
    <Svg width={spacing.iconWidth} height={spacing.iconWidth} viewBox={icon.viewBox} style={{ width: spacing.iconWidth, marginRight: spacing.iconMr, marginTop: spacing.iconMt }}>
      <Path d={icon.d} fill={color} />
    </Svg>
  )
}

export default function ContactSection({ data }) {
  const theme = useTheme()
  const s = useStyles(makeStyles)
  const { personal } = data

  const rows = [
    { icon: 'phone',    value: personal.phone,    href: personal.phoneHref },
    { icon: 'envelope', value: personal.email,    href: personal.email ? `mailto:${personal.email}` : null },
    { icon: 'linkedin', value: personal.linkedin, href: personal.linkedinHref },
    { icon: 'facebook', value: personal.facebook, href: personal.facebookHref },
    { icon: 'location', value: personal.location },
  ].filter(r => r.value)

  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">Contact</SectionTitle>
      {rows.map(({ icon, value, href }) => (
        <View key={icon} style={s.row}>
          <Icon name={icon} color={theme.palette.accent} spacing={theme.spacing} />
          {href
            ? <Link src={href} style={s.link}>{value}</Link>
            : <Text style={s.text}>{value}</Text>
          }
        </View>
      ))}
    </View>
  )
}
