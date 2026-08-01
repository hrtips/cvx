import { Link, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import SectionTitle from '../components/SectionTitle.jsx'
import { useStyles, useTheme } from '../ThemeContext.jsx'

const ICONS = {
  phone: {
    viewBox: '0 0 512 512',
    d: 'M493.4 24.6l-104-24c-11.3-2.6-22.9 3.3-27.5 13.9l-48 112c-4.2 9.8-1.4 21.3 6.9 28l60.6 49.6c-36 76.7-98.9 140.5-177.2 177.2l-49.6-60.6c-6.8-8.3-18.2-11.1-28-6.9l-112 48C3.9 366.5-2 378.1.6 389.4l24 104C27.1 504.2 36.7 512 48 512c256.1 0 464-207.5 464-464 0-11.2-7.7-20.9-18.6-23.4z'
  },
  envelope: {
    viewBox: '0 0 512 512',
    d: 'M502.3 190.8c3.9-3.1 9.7-.2 9.7 4.7V400c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V195.6c0-5 5.7-7.8 9.7-4.7 22.4 17.4 52.1 39.5 154.1 113.6 21.1 15.4 56.7 47.8 92.2 47.6 35.7.3 72-32.8 92.3-47.6 102-74.1 131.6-96.3 154-113.7zM256 320c23.2.4 56.6-29.2 73.4-41.4 132.7-96.3 142.8-104.7 173.4-128.7 5.8-4.5 9.2-11.5 9.2-18.9v-19c0-26.5-21.5-48-48-48H48C21.5 64 0 85.5 0 112v19c0 7.4 3.4 14.3 9.2 18.9 30.6 23.9 40.7 32.4 173.4 128.7 16.8 12.2 50.2 41.8 73.4 41.4z'
  },
  linkedin: {
    viewBox: '0 0 448 512',
    d: 'M100.28 448H7.4V148.9h92.88zM53.79 108.1C24.09 108.1 0 83.5 0 53.8a53.79 53.79 0 0 1 107.58 0c0 29.7-24.1 54.3-53.79 54.3zM447.9 448h-92.68V302.4c0-34.7-.7-79.2-48.29-79.2-48.29 0-55.69 37.7-55.69 76.7V448h-92.78V148.9h89.08v40.8h1.3c12.4-23.5 42.69-48.3 87.88-48.3 94 0 111.28 61.9 111.28 142.3V448z'
  },
  facebook: {
    viewBox: '0 0 320 512',
    d: 'M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z'
  },
  location: {
    viewBox: '0 0 384 512',
    d: 'M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0zM192 272c44.183 0 80-35.817 80-80s-35.817-80-80-80-80 35.817-80 80 35.817 80 80 80z'
  },
  link: {
    viewBox: '0 0 512 512',
    d: 'M326.612 185.391c59.747 59.809 58.927 155.698.36 214.59-.11.12-.24.25-.36.37l-67.2 67.2c-59.27 59.27-155.699 59.262-214.96 0-59.27-59.26-59.27-155.7 0-214.96l37.106-37.106c9.84-9.84 26.786-3.3 27.294 10.606.648 17.722 3.826 35.527 9.69 52.721 1.986 5.822.567 12.262-3.783 16.612l-13.087 13.087c-28.026 28.026-28.905 73.66-1.155 101.96 28.024 28.579 74.086 28.749 102.325.51l67.2-67.19c28.191-28.191 28.073-73.757 0-101.83-3.701-3.694-7.429-6.564-10.341-8.569a16.037 16.037 0 0 1-6.947-12.606c-.396-10.567 3.348-21.456 11.698-29.806l21.054-21.055c5.521-5.521 14.182-6.199 20.583-1.582a152.475 152.475 0 0 1 20.522 17.72zM467.547 44.449c-59.261-59.262-155.69-59.27-214.96 0l-67.2 67.2c-.12.12-.25.25-.36.37-58.566 58.892-59.387 154.781.36 214.59a152.454 152.454 0 0 0 20.521 17.72c6.402 4.617 15.064 3.939 20.583-1.583l21.054-21.054c8.35-8.35 12.094-19.239 11.698-29.806a16.037 16.037 0 0 0-6.947-12.606c-2.912-2.005-6.64-4.875-10.341-8.569-28.073-28.073-28.191-73.639 0-101.83l67.2-67.19c28.239-28.239 74.3-28.069 102.325.51 27.75 28.3 26.872 73.934-1.155 101.96l-13.087 13.087c-4.35 4.35-5.769 10.79-3.783 16.612 5.864 17.194 9.042 34.999 9.69 52.721.509 13.906 17.456 20.446 27.294 10.606l37.106-37.106c59.271-59.259 59.271-155.699.001-214.959z'
  }
}

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    wrap: { marginBottom: t.spacing.sectionGap },
    row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: t.spacing.contactRowMb },
    icon: {
      width: t.spacing.iconWidth,
      marginRight: t.spacing.iconMr,
      marginTop: t.spacing.iconMt
    },
    text: {
      flex: 1,
      fontSize: t.typography.sidebarContact.size,
      color: t.palette.textBody,
      lineHeight: t.typography.sidebarContact.leading
    },
    link: {
      flex: 1,
      fontSize: t.typography.sidebarContact.size,
      color: t.palette.textBody,
      lineHeight: t.typography.sidebarContact.leading,
      textDecoration: 'none'
    }
  })

/** @param {{ name: string, color: string, spacing: import('../types.js').Theme['spacing'] }} props */
function Icon({ name, color, spacing }) {
  const icon = ICONS[/** @type {keyof typeof ICONS} */ (name)]
  if (!icon) return null
  return (
    <Svg
      width={spacing.iconWidth}
      height={spacing.iconWidth}
      viewBox={icon.viewBox}
      style={{ width: spacing.iconWidth, marginRight: spacing.iconMr, marginTop: spacing.iconMt }}
    >
      <Path d={icon.d} fill={color} />
    </Svg>
  )
}

/** @param {{ data: import('../types.js').CVContent }} props */
export default function ContactSection({ data }) {
  const theme = useTheme()
  const s = useStyles(makeStyles)
  const { personal } = data

  const rows = [
    { icon: 'phone', value: personal.phone, href: personal.phoneHref },
    {
      icon: 'envelope',
      value: personal.email,
      href: personal.email ? `mailto:${personal.email}` : null
    },
    { icon: 'linkedin', value: personal.linkedin, href: personal.linkedinHref },
    { icon: 'facebook', value: personal.facebook, href: personal.facebookHref },
    { icon: 'location', value: personal.location },
    ...(personal.links ?? []).map((l) => ({ icon: 'link', value: l.label || l.href, href: l.href }))
  ].filter((r) => r.value)

  return (
    <View style={s.wrap}>
      <SectionTitle variant="sidebar">Contact</SectionTitle>
      {rows.map(({ icon, value, href }) => (
        <View key={value} style={s.row}>
          <Icon name={icon} color={theme.palette.accent} spacing={theme.spacing} />
          {href ? (
            <Link src={href} style={s.link}>
              {value}
            </Link>
          ) : (
            <Text style={s.text}>{value}</Text>
          )}
        </View>
      ))}
    </View>
  )
}
