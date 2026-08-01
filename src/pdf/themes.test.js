// Theme auto-discovery. The dynamic-scan path (a .js file in themes/ that is
// not one of the eager static imports) and the fs-failure fallback are
// otherwise unreachable, so we drive them with a transient probe theme file and
// a mocked readdirSync. resetModules() gives each case a fresh module so the
// discoverThemes() memo does not leak between them.

import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const THEMES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'themes')
const PROBE = join(THEMES_DIR, '__cvx_discovery_probe_theme__.js')

afterEach(() => {
  rmSync(PROBE, { force: true })
  vi.doUnmock('fs')
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('discoverThemes', () => {
  it('discovers the built-in themes and memoizes the result', async () => {
    vi.resetModules()
    const { discoverThemes, THEMES } = await import('./themes/index.js')
    const first = await discoverThemes()
    expect(Object.keys(first)).toEqual(expect.arrayContaining(['teal', 'coral', 'mono']))
    expect(await discoverThemes()).toBe(first) // second call is memoized
    expect(THEMES.teal.name).toBe('teal')
  })

  it('dynamically discovers a new theme file dropped into themes/', async () => {
    writeFileSync(PROBE, "export const probeTheme = { name: '__cvx_probe__', palette: {} }\n")
    vi.resetModules()
    const { discoverThemes } = await import('./themes/index.js')
    const themes = await discoverThemes()
    expect(themes.__cvx_probe__).toBeTruthy()
    expect(themes.__cvx_probe__.name).toBe('__cvx_probe__')
  })

  it('falls back to the static themes when the directory cannot be scanned', async () => {
    vi.resetModules()
    vi.doMock('fs', () => ({
      readdirSync: () => {
        throw new Error('scan failed')
      }
    }))
    const { discoverThemes, THEMES } = await import('./themes/index.js')
    expect(await discoverThemes()).toBe(THEMES)
  })

  it('re-exports the built-in theme objects for convenience', async () => {
    vi.resetModules()
    const mod = await import('./themes/index.js')
    expect(mod.tealTheme.name).toBe('teal')
    expect(mod.coralTheme.name).toBe('coral')
    expect(mod.monoTheme.name).toBe('mono')
  })
})
