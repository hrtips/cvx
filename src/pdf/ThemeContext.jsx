import { createContext, useContext, useMemo } from 'react'
import { tealTheme } from './themes/teal.js'

export const ThemeContext = createContext(tealTheme)

export function useTheme() {
  return useContext(ThemeContext)
}

/**
 * Memoised style factory — calls `makeStyles(theme)` once per theme identity.
 * Use in components:  const s = useStyles(makeStyles)
 */
export function useStyles(makeStylesFn) {
  const theme = useTheme()
  return useMemo(() => makeStylesFn(theme), [theme, makeStylesFn])
}
