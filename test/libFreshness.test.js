// The stale-build guard (scripts/libFreshness.js), tested against synthetic
// trees rather than only against the repo it guards — so every way lib/ can
// go stale is exercised, including the ones this checkout is not currently in.
//
// Why this matters enough to test: `bin/cvx.js` imports `lib/`, the harness
// predicts from `src/`, and `npx vitest` (unlike `npm test`) does not rebuild
// one from the other. A guard that quietly returned "fresh" would restore
// exactly the false pass both C3 reviewers hit, so each check below is written
// as a mutation: change one thing, the guard must notice.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BUILD_MANIFEST,
  esbuildVersion,
  hashBuildInputs,
  libBuiltAt,
  libStaleReason
} from '../scripts/libFreshness.js'
import { ROOT } from './layout-harness/scaffold.js'

/** @type {string[]} */
const dirs = []

/** A miniature repo: the two source trees build-lib.js reads, a font, and a matching lib/. */
function fakeRepo() {
  const root = mkdtempSync(path.join(tmpdir(), 'cvx-freshness-'))
  dirs.push(root)
  const write = (rel, body) => {
    const file = path.join(root, rel)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, body)
    return file
  }
  write('src/pdf/layout.js', 'export const a = 1\n')
  write('src/pdf/CVDocument.jsx', 'export default () => null\n')
  write('src/pdf/layout.test.js', 'it("x", () => {})\n')
  write('src/mcp/tools.js', 'export const t = []\n')
  write('src/fonts/Lato-Regular.ttf', 'not-really-a-font')
  write('src/fonts/README.md', 'ignored\n')
  write('scripts/build-lib.js', '// target: node18, jsx: automatic\n')
  write('lib/pdf/layout.js', 'export const a = 1\n')
  build(root)
  return { root, write }
}

/** What build-lib.js does at the end of a build. */
function build(root) {
  writeFileSync(
    path.join(root, 'lib', BUILD_MANIFEST),
    JSON.stringify({ srcHash: hashBuildInputs(root), modules: 3, fonts: 1 })
  )
}

describe('stale-build guard', () => {
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('passes when lib/ was built from exactly this src/', () => {
    const { root } = fakeRepo()
    expect(libStaleReason(root)).toBeNull()
  })

  it('catches an EDITED source file', () => {
    const { root, write } = fakeRepo()
    write('src/pdf/layout.js', 'export const a = 2\n')
    expect(libStaleReason(root)).toMatch(/built from different inputs/)
  })

  it('catches a NEW source file that was never compiled', () => {
    const { root, write } = fakeRepo()
    write('src/pdf/newModule.js', 'export const n = 1\n')
    expect(libStaleReason(root)).toMatch(/built from different inputs/)
  })

  it('catches a DELETED source file', () => {
    const { root } = fakeRepo()
    rmSync(path.join(root, 'src', 'mcp', 'tools.js'))
    expect(libStaleReason(root)).toMatch(/built from different inputs/)
  })

  it('catches a RENAME even though every byte of content is unchanged', () => {
    // Path is hashed alongside the bytes precisely for this: a moved module
    // changes every importer's specifier while the content hash alone would
    // not move.
    const { root, write } = fakeRepo()
    rmSync(path.join(root, 'src', 'pdf', 'layout.js'))
    write('src/pdf/packing.js', 'export const a = 1\n')
    expect(libStaleReason(root)).toMatch(/built from different inputs/)
  })

  it('catches a FONT swap (it changes every measurement, so it is a build input)', () => {
    const { root, write } = fakeRepo()
    write('src/fonts/Lato-Regular.ttf', 'a-different-font')
    expect(libStaleReason(root)).toMatch(/built from different inputs/)
  })

  it('ignores files build-lib.js never reads (tests, non-Lato font-dir files)', () => {
    const { root, write } = fakeRepo()
    write('src/pdf/layout.test.js', 'it("y", () => { expect(1).toBe(1) })\n')
    write('src/fonts/README.md', 'edited\n')
    write('src/pdf/notes.md', 'not a build input\n')
    expect(libStaleReason(root)).toBeNull()
  })

  it('reports a MISSING lib/ rather than treating it as fresh', () => {
    const { root } = fakeRepo()
    rmSync(path.join(root, 'lib'), { recursive: true })
    expect(libStaleReason(root)).toMatch(/lib\/ does not exist/)
    expect(libBuiltAt(root)).toBeNull()
  })

  it('reports a lib/ built by a pre-guard build-lib.js (no manifest)', () => {
    const { root } = fakeRepo()
    rmSync(path.join(root, 'lib', BUILD_MANIFEST))
    expect(libStaleReason(root)).toMatch(/is missing/)
  })

  it('reports an unreadable manifest rather than throwing', () => {
    const { root } = fakeRepo()
    writeFileSync(path.join(root, 'lib', BUILD_MANIFEST), '{not json')
    expect(libStaleReason(root)).toMatch(/unreadable/)
  })

  it('goes green again after a rebuild', () => {
    const { root, write } = fakeRepo()
    write('src/pdf/layout.js', 'export const a = 3\n')
    expect(libStaleReason(root)).not.toBeNull()
    build(root)
    expect(libStaleReason(root)).toBeNull()
  })

  it('catches a change to the TRANSFORM itself (build-lib.js), not just its inputs', () => {
    // The inputs can be byte-identical and lib/ still stale: flip the esbuild
    // target or the .jsx specifier rewrite and every emitted file changes.
    const { root, write } = fakeRepo()
    write('scripts/build-lib.js', '// target: node22, jsx: automatic\n')
    expect(libStaleReason(root)).toMatch(/built from different inputs/)
  })

  it('catches an esbuild version bump (the transform is a dependency, too)', () => {
    // A dependabot bump changes the emitted bytes with src/ untouched, so the
    // resolved version is part of the digest. Proven by giving the fake repo
    // its own node_modules/esbuild and moving its version.
    const { root, write } = fakeRepo()
    write(
      'node_modules/esbuild/package.json',
      JSON.stringify({ name: 'esbuild', version: '0.28.1' })
    )
    expect(esbuildVersion(root)).toBe('0.28.1')
    build(root)
    expect(libStaleReason(root)).toBeNull()

    write(
      'node_modules/esbuild/package.json',
      JSON.stringify({ name: 'esbuild', version: '0.29.0' })
    )
    expect(esbuildVersion(root)).toBe('0.29.0')
    expect(libStaleReason(root)).toMatch(/built from different inputs/)
  })

  it('reads the real esbuild version in this repo, and copes where there is none', () => {
    expect(esbuildVersion(ROOT)).toMatch(/^\d+\.\d+\.\d+/)
    expect(esbuildVersion('/nonexistent-root-for-cvx-test')).toBe('unknown')
  })

  it('is order-stable: the same tree hashes the same twice', () => {
    const { root } = fakeRepo()
    expect(hashBuildInputs(root)).toBe(hashBuildInputs(root))
  })

  it("THIS repo's lib/ matches THIS repo's src/ (the guard the render suites run behind)", () => {
    // Fails on a bare `npx vitest` over an edited src/ — deliberately. That is
    // the whole point: `npm test` (pretest -> build:lib) is the supported way
    // to run the render-dependent suites.
    expect(libStaleReason(ROOT)).toBeNull()
    expect(libBuiltAt(ROOT)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
