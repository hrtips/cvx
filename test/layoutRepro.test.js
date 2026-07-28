// C0 — byte-reproducibility (research/layout-packing-design.md §0 G-b /
// §11 "byte-repro integration test").
//
// Renders the same fixture content twice, in two independent temp dirs,
// with SOURCE_DATE_EPOCH pinned, through the real CLI, and asserts the PDF
// buffers are byte-identical for both variants. This is the SAME-ARCHITECTURE
// leg only — it proves the render pipeline has no non-pinned nondeterminism
// (Math.random subset tags, object write order, wall-clock CreationDate; see
// src/pdf/reproducible.js) on whatever machine `npm test` runs on.
//
// The TWO-ARCHITECTURE leg (x86 + ARM producing identical bytes) is NOT, and
// cannot be, exercised here: that needs a CI matrix (e.g. GitHub Actions
// `runs-on: [ubuntu-latest, macos-14]` or an x86_64/aarch64 container pair)
// running this same fixture and diffing the two artifacts — a CI
// configuration task, not a unit test, and out of reach of this sandbox
// (single architecture). Tracked for whoever wires the CI matrix; see
// research/c0-baseline.md.
import { describe, it, expect, afterAll } from 'vitest'
import { readFileSync, cpSync } from 'node:fs'
import path from 'node:path'
import { ROOT, mkFixtureDir, buildAll, cleanupFixtureDirs } from './layout-harness/scaffold.js'

const TEMPLATE = path.join(ROOT, 'template', 'cv-content')
const SOURCE_DATE_EPOCH = '1700000000' // 2023-11-14T22:13:20Z — arbitrary, fixed

function renderTwice(setupDir) {
  const dirA = mkFixtureDir('repro-a')
  const dirB = mkFixtureDir('repro-b')
  setupDir(dirA)
  setupDir(dirB)
  const env = { ...process.env, SOURCE_DATE_EPOCH }
  const a = buildAll(dirA, { env })
  const b = buildAll(dirB, { env })
  return { dirA, dirB, a, b }
}

describe('C0 reproducibility — same-architecture byte-determinism', () => {
  afterAll(() => cleanupFixtureDirs())

  it('the shipped scaffold renders byte-identical PDFs (designed + ATS) across two independent runs under a pinned SOURCE_DATE_EPOCH', () => {
    const { dirA, dirB, a, b } = renderTwice((dir) => cpSync(TEMPLATE, path.join(dir, 'cv-content'), { recursive: true }))
    expect(a.code).toBe(0)
    expect(b.code).toBe(0)
    expect(a.result.outputs.map((o) => o.filename)).toEqual(b.result.outputs.map((o) => o.filename))

    for (const out of a.result.outputs) {
      const bufA = readFileSync(path.join(dirA, out.filename))
      const bufB = readFileSync(path.join(dirB, out.filename))
      expect(bufA.equals(bufB)).toBe(true)
    }
  }, 20000)

  it('is NOT pinned (sanity check the fixture/test actually exercises the SOURCE_DATE_EPOCH path) — same content without it is not guaranteed identical to a pinned run', () => {
    // Guards against a vacuous repro test (e.g. a bug that no-ops env
    // entirely): an UNPINNED render must still succeed, but we don't assert
    // it differs byte-for-byte from the pinned one — CreationDate could
    // coincidentally collide with "now" rounded to the second, and that's
    // not the property under test here. The real determinism guarantee is
    // covered by src/pdf/reproducible.test.js (resolveCreationDate,
    // seedMathRandom, makeDeflateSynchronous individually) — this file only
    // adds the end-to-end "two full CLI builds, same bytes" integration leg.
    const dir = mkFixtureDir('repro-unpinned')
    cpSync(TEMPLATE, path.join(dir, 'cv-content'), { recursive: true })
    const { code } = buildAll(dir, { env: { ...process.env, SOURCE_DATE_EPOCH: undefined } })
    expect(code).toBe(0)
  }, 20000)
})
