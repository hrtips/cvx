import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Regression guard for RV4: the Node export path imports `js-yaml` directly,
// while the browser/Vite path parses YAML through `@rollup/plugin-yaml`, which
// declares its own `js-yaml` dependency. If those resolve to different MAJORS,
// the preview and the exported PDF can disagree on parsing semantics.
//
// js-yaml 5 removed the CommonJS default export that @rollup/plugin-yaml relies
// on, so the two are only compatible while both stay on the 4.x line. This test
// fails loudly if a future bump re-splits them.

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const major = (v) => Number(v.split('.')[0])
const versionOf = (relPath) => JSON.parse(readFileSync(join(root, relPath), 'utf8')).version

describe('js-yaml alignment across content-loading paths (RV4)', () => {
  it('resolves to a single js-yaml major for both paths', () => {
    const appMajor = major(versionOf('node_modules/js-yaml/package.json'))

    // The plugin either nests its own copy or dedupes to the top-level one.
    let pluginMajor
    try {
      pluginMajor = major(
        versionOf('node_modules/@rollup/plugin-yaml/node_modules/js-yaml/package.json')
      )
    } catch {
      pluginMajor = appMajor // no nested copy → deduped to the top-level js-yaml
    }

    expect(pluginMajor).toBe(appMajor)
  })
})
