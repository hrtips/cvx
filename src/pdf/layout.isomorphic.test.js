// ── layout.js must stay isomorphic ─────────────────────────────────────────
//
// `layout.js` ships in the Vite browser bundle (the in-app preview), so it and
// everything it imports must run without Node built-ins — that is why the font
// measurer is INJECTED rather than imported (design doc §5, and the module's
// own docblock). The constraint has been real since C2 and enforced by nothing:
// Vite only warns when a `node:` specifier reaches the browser graph, and a
// warning in a build log is not a gate.
//
// C3b makes it sharper, because the render side now imports FROM layout.js
// (`sections/sectionSlice.js` takes `sectionTitleLabel`, `ContactSection.jsx`
// takes `contactRows`), so a stray `node:fs` here would break the preview from
// a file nobody thinks of as browser code.
//
// Walks the real import graph off disk — no bundler, no network.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Every runtime import specifier in a source file.
 *
 * Comments are stripped first, which is not incidental: this codebase types
 * itself with JSDoc, so `import('./types.js')` appears all over the place as a
 * TYPE reference. Those are erased by tsc and never reach the bundler, and
 * `types.js` has no runtime file behind it at all — counting them would make
 * the walk both wrong and crash-prone.
 *
 * @param {string} file
 */
function importsOf(file) {
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  /** @type {string[]} */
  const specifiers = []
  for (const m of src.matchAll(/^\s*(?:import|export)\b[^'"\n]*?from\s*['"]([^'"]+)['"]/gm)) {
    specifiers.push(m[1])
  }
  // `import 'x'` (side-effect only) and dynamic `import('x')`
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specifiers.push(m[1])
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specifiers.push(m[1])
  return specifiers
}

/**
 * The transitive closure of a module's LOCAL imports, plus every bare/`node:`
 * specifier reached along the way.
 *
 * @param {string} entry
 */
function closureOf(entry) {
  /** @type {Set<string>} */
  const seen = new Set()
  /** @type {Map<string, string>} */
  const external = new Map() // specifier -> importing file
  const queue = [entry]
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop())
    if (seen.has(file)) continue
    seen.add(file)
    for (const spec of importsOf(file)) {
      if (spec.startsWith('.')) {
        queue.push(path.resolve(path.dirname(file), spec))
      } else if (!external.has(spec)) {
        external.set(spec, path.relative(HERE, file))
      }
    }
  }
  return { files: [...seen].map((f) => path.relative(HERE, f)), external }
}

describe('layout.js is isomorphic — it must run in the browser preview', () => {
  const { files, external } = closureOf(path.join(HERE, 'layout.js'))

  it('imports no Node built-in, anywhere in its transitive closure', () => {
    const nodeBuiltins = [...external].filter(([spec]) => spec.startsWith('node:'))
    expect(
      nodeBuiltins,
      `layout.js's import graph reaches a Node built-in, which breaks the Vite preview:\n  ${nodeBuiltins
        .map(([spec, from]) => `${spec} (from ${from})`)
        .join(
          '\n  '
        )}\nInject the capability through an argument instead, the way measure.js is injected.`
    ).toEqual([])
  })

  it('imports no third-party package either (fontkit in particular is Node-only here)', () => {
    expect([...external.keys()]).toEqual([])
  })

  it('the walk actually reached the modules it should have — not vacuous', () => {
    // If the specifier regex ever stops matching, `external` goes empty and the
    // two assertions above pass for the wrong reason.
    expect(files).toContain('defaultLayouts.js')
    expect(files).toContain(path.join('themes', 'teal.js'))
    expect(files.length).toBeGreaterThanOrEqual(3)
  })

  it('detects a Node import when there is one (the walk has teeth)', () => {
    // measure.js is the Node-only sibling layout.js is deliberately NOT allowed
    // to import; walking it must surface `node:fs`.
    const { external: nodeSide } = closureOf(path.join(HERE, 'measure.js'))
    expect([...nodeSide.keys()].some((s) => s.startsWith('node:'))).toBe(true)
  })
})
