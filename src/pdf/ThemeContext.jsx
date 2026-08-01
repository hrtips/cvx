import { createContext, useContext, useMemo } from 'react'
import { tealTheme } from './themes/teal.js'

export const ThemeContext = createContext(/** @type {import('./types.js').Theme} */ (tealTheme))

export function useTheme() {
  return useContext(ThemeContext)
}

/**
 * Memoised style factory — calls `makeStyles(theme)` once per theme identity.
 * Use in components:  const s = useStyles(makeStyles)
 *
 * @template T
 * @param {(theme: import('./types.js').Theme) => T} makeStylesFn
 * @returns {T}
 */
export function useStyles(makeStylesFn) {
  const theme = useTheme()
  return useMemo(() => makeStylesFn(theme), [theme, makeStylesFn])
}
