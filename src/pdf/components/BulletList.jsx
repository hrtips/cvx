import { Link, StyleSheet, Text, View } from '@react-pdf/renderer'
import { useStyles } from '../ThemeContext.jsx'

/** @param {import('../types.js').Theme} t */
const makeStyles = (t) =>
  StyleSheet.create({
    list: { marginTop: t.spacing.descMt },
    item: { flexDirection: 'row', alignItems: 'flex-start' },
    dash: {
      fontSize: t.typography.body.size,
      fontWeight: 600,
      color: t.palette.accent,
      marginRight: 5,
      marginTop: t.spacing.iconMt
    },
    text: {
      flex: 1,
      fontSize: t.typography.body.size,
      lineHeight: t.typography.body.leading,
      color: t.palette.textBody
    },
    link: { color: t.palette.textDark, textDecoration: 'underline' }
  })

/** @param {{ items: import('../types.js').BulletItem[], gap?: number }} props */
export default function BulletList({ items, gap = 4.5 }) {
  const s = useStyles(makeStyles)
  return (
    <View style={s.list}>
      {items.map((item, i) => {
        // Bullets have no identity beyond position; the ordinal IS the key.
        const itemKey = `bullet-${i}`
        return (
          <View
            key={itemKey}
            style={
              /** @type {import('@react-pdf/types').Style[]} */ ([
                s.item,
                i > 0 && { marginTop: gap }
              ])
            }
          >
            <Text style={s.dash}>–</Text>
            <Text style={s.text}>
              {typeof item === 'string' ? (
                item
              ) : (
                <>
                  {item.text ?? ''}
                  {item.link ? (
                    <Link src={item.link.href} style={s.link}>
                      {item.link.label}
                    </Link>
                  ) : null}
                  {item.suffix ?? ''}
                </>
              )}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
