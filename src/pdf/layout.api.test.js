// ── layout.js's public surface, pinned (C4) ────────────────────────────────
//
// `layout.js` exports 25 names and only nine are API; the rest exist so the C0
// harness can measure the engine with the engine's own formulas rather than a
// hand-copied second implementation. Nothing enforced that distinction, so C7
// was on course to document nine accidental commitments — and any of the
// sixteen could quietly acquire a production consumer, turning a testing
// affordance into a shape the sprint has to keep.
//
// The mark lives in the source (`@internal` in each harness-only export's own
// docblock, plus the roll-call in the module docblock). This file is what makes
// the mark load-bearing:
//
//   1. every export is classified — a NEW export fails until it is marked;
//   2. the module docblock's roll-call matches the `@internal` tags, so the
//      human-readable list cannot drift from the machine-readable one;
//   3. no shipped (non-test) module imports an `@internal` name — the actual
//      invariant, checked against the real import graph off disk;
//   4. every PUBLIC name is really exported, and the ones with a shipped
//      importer are named alongside it, so "public" is a fact about the
//      codebase rather than an aspiration.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as layout from './layout.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.dirname(path.dirname(HERE))
const LAYOUT_JS = path.join(HERE, 'layout.js')

/**
 * The nine names shipped code and the plan contract depend on. Written out
 * here rather than derived: this is the commitment, and a commitment that
 * derives itself from the code it constrains constrains nothing.
 */
const PUBLIC_API = [
  'bodyHeight',
  'contactRows',
  'isContinuedSlice',
  'isIdentityKey',
  'overflowWarnings',
  'planTwoColumn',
  'sectionTitleLabel',
  'sidebarFlowKeys'
]

/**
 * Every export of layout.js with its OWN docblock and its parameter list.
 *
 * The docblock is found by scanning BACKWARDS from the export to the nearest
 * preceding `*​/` and its matching `/**`. A forward lazy regex
 * (`/\/\*\*([\s\S]*?)\*\/\s*export …/`) looks equivalent and is not: when a
 * docblock is followed by something other than an export, the engine extends
 * the capture to a LATER `*​/`, so one export inherits several unrelated
 * docblocks. That produced two false positives here on the first cut.
 *
 * @returns {{ name: string, doc: string, params: string }[]}
 */
function exportedDecls() {
  const src = readFileSync(LAYOUT_JS, 'utf8')
  const out = []
  for (const m of src.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)([^{=]*)/gm
  )) {
    const before = src.slice(0, m.index)
    const close = before.lastIndexOf('*/')
    const open = close === -1 ? -1 : before.lastIndexOf('/**', close)
    // Only count it as THIS export's docblock if nothing but whitespace
    // separates them.
    const attached = close !== -1 && open !== -1 && before.slice(close + 2).trim() === ''
    out.push({
      name: m[1],
      doc: attached ? before.slice(open, close) : '',
      params: m[2]
    })
  }
  return out
}

/** Names whose own docblock carries `@internal`. */
function internalExports() {
  return exportedDecls()
    .filter((d) => d.doc.includes('@internal'))
    .map((d) => d.name)
    .sort()
}

/** The `EXPORTED FOR THE HARNESS` roll-call in the module docblock. */
function rollCall() {
  const src = readFileSync(LAYOUT_JS, 'utf8')
  const block = src.slice(
    src.indexOf('//   EXPORTED FOR THE HARNESS'),
    src.indexOf('// `packBlocks`/`packExperiences`')
  )
  expect(block.length).toBeGreaterThan(100) // the docblock section still exists
  return [...block.matchAll(/\b([A-Za-z_$][\w$]{2,})\b(?=,|$|\n)/gm)]
    .map((m) => m[1])
    .filter((n) => Object.hasOwn(layout, n))
    .sort()
}

/**
 * The whole SHIPPED tree, not just `src/pdf/`. The invariant is about published
 * code, and `bin/` and `src/mcp/` are published too — today neither imports
 * layout.js directly, which is a fact this walk should be able to notice
 * changing rather than one it assumes.
 */
const SHIPPED_ROOTS = ['src', 'bin', 'scripts'].map((d) => path.join(ROOT, d))

/** Comments out, both kinds — a commented-out import is not an import. */
const stripComments = (/** @type {string} */ src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

/**
 * Every reference to layout.js from shipped (non-test) source: the named
 * imports, plus the two shapes that would otherwise walk straight past the
 * partition — `import * as layout` and dynamic `await import('./layout.js')`.
 * Both make the imported name set unknowable statically, so they are reported
 * as `opaque` and the partition test fails on them by name.
 */
function shippedImportersOfLayout() {
  /** @type {{ file: string, names: string[], opaque?: string }[]} */
  const found = []
  const walk = (/** @type {string} */ dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules') walk(full)
        continue
      }
      if (!/\.(js|jsx)$/.test(entry) || entry.includes('.test.')) continue
      const src = stripComments(readFileSync(full, 'utf8'))
      const file = path.relative(ROOT, full)
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*\blayout\.js['"]/g)) {
        found.push({
          file,
          names: m[1]
            .split(',')
            .map((s) => s.trim().split(/\s+as\s+/)[0])
            .filter(Boolean)
        })
      }
      for (const _ of src.matchAll(
        /import\s+\*\s+as\s+[\w$]+\s*from\s*['"][^'"]*\blayout\.js['"]/g
      )) {
        found.push({ file, names: [], opaque: 'namespace import (import * as …)' })
      }
      for (const _ of src.matchAll(/\bimport\(\s*['"][^'"]*\blayout\.js['"]\s*\)/g)) {
        found.push({ file, names: [], opaque: "dynamic import (await import('…'))" })
      }
    }
  }
  for (const root of SHIPPED_ROOTS) walk(root)
  return found
}

describe('layout.js public API', () => {
  const exported = Object.keys(layout).sort()
  const internal = internalExports()

  it('every export is classified as either public or harness-only', () => {
    // A NEW export must be added to PUBLIC_API above (a commitment) or marked
    // @internal in layout.js (a harness affordance). Leaving it unclassified is
    // how C7 ends up documenting an accident, so this fails until it is one or
    // the other.
    const classified = [...PUBLIC_API, ...internal].sort()
    expect(exported).toEqual(classified)
  })

  it('exports exactly the 25 names the module docblock claims', () => {
    expect(exported).toHaveLength(25)
    expect(PUBLIC_API).toHaveLength(8)
    expect(internal).toHaveLength(17)
  })

  it("the module docblock's harness roll-call matches the @internal tags", () => {
    expect(rollCall()).toEqual(internal)
  })

  it('no shipped module imports a harness-only export', () => {
    const violations = shippedImportersOfLayout().flatMap(({ file, names, opaque }) =>
      opaque
        ? [`${file}: ${opaque} — the imported names cannot be checked against the partition`]
        : names.filter((n) => internal.includes(n)).map((n) => `${file} imports ${n}`)
    )
    // A shipped module reaching for an @internal export must either promote it
    // to PUBLIC_API deliberately (accepting the compatibility promise) or route
    // through planTwoColumn(). A namespace or dynamic import is reported too:
    // it hands the module its whole surface, which is the partition defeated
    // rather than respected.
    expect(violations).toEqual([])
  })

  it('every name shipped code imports is public', () => {
    const imported = [...new Set(shippedImportersOfLayout().flatMap((i) => i.names))].sort()
    expect(imported.every((n) => PUBLIC_API.includes(n))).toBe(true)
    // Not vacuous: the walk must actually find the known importers.
    expect(imported).toEqual(
      [
        'bodyHeight',
        'contactRows',
        'isContinuedSlice',
        'isIdentityKey',
        'overflowWarnings',
        'planTwoColumn',
        'sectionTitleLabel'
      ].sort()
    )
  })

  it('the one public name with no shipped importer is the plan-shape API, and is callable with public types', () => {
    // `sidebarFlowKeys` is public because the sidebar flow it defines is what
    // C6's `order`/`buckets` levers are specified over, and it takes a
    // NormalizedLayout and returns strings — no unpromised type in its
    // signature. (`identityH` was public in C4's first cut and was DEMOTED:
    // it cannot be called without `deriveSidebarMetrics`, which is @internal.
    // The plan already carries `page.identity`, so C6 needs the keys, not the
    // height.) Recorded so the next reader does not "clean this up".
    const imported = new Set(shippedImportersOfLayout().flatMap((i) => i.names))
    expect(PUBLIC_API.filter((n) => !imported.has(n))).toEqual(['sidebarFlowKeys'])
    expect(typeof layout.sidebarFlowKeys).toBe('function')
    expect(layout.sidebarFlowKeys({ first: { sidebar: ['education'] } })).toEqual(['education'])
  })

  it('no public function needs an @internal type to call it', () => {
    // The rule identityH broke: a name is only public if a caller holding
    // nothing but the public surface can actually use it. `SidebarMetrics` is
    // `ReturnType<typeof deriveSidebarMetrics>` and that function is @internal,
    // so any public signature mentioning it is a promise nobody can keep.
    const src = readFileSync(LAYOUT_JS, 'utf8')
    /** Typedefs whose definition is derived from an @internal export. */
    const tainted = [...src.matchAll(/@typedef\s*\{([^}]*)\}\s*([A-Za-z_$][\w$]*)/g)]
      .filter(([, def]) => internal.some((n) => def.includes(n)))
      .map(([, , name]) => name)
    expect(tainted).toContain('SidebarMetrics') // the scan found the real case

    const violations = []
    for (const { name, doc, params } of exportedDecls()) {
      if (!PUBLIC_API.includes(name)) continue
      for (const t of tainted) {
        const used = new RegExp(`\\b${t}\\b`)
        if (used.test(doc) || used.test(params)) {
          violations.push(`${name} takes/returns ${t}, which is derived from an @internal export`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('the @internal scan has teeth (it can tell the two kinds apart)', () => {
    // If the regex silently stopped matching, `internal` would go empty and the
    // classification test would fail loudly — but the roll-call test would too,
    // for the same wrong reason. Pin one of each explicitly.
    expect(internal).toContain('packBlocks')
    expect(internal).not.toContain('planTwoColumn')
  })
})

describe('LayoutPlanPage carries each fact once (C4 collapse)', () => {
  const plan = layout.planTwoColumn({
    content: {
      personal: { name: 'Test Person', title: 'Role', company: 'Co' },
      summary: ['One line.'],
      experience: [{ role: 'R', company: 'C', period: '2020', bullets: ['a', 'b'] }],
      education: [{ degree: 'BSc', institution: 'Uni', period: '2000' }],
      certifications: Array.from({ length: 40 }, (_, i) => ({
        name: `Cert ${i}`,
        issuer: 'Issuer',
        year: '2020'
      }))
    }
  })

  it('has no sidebarKeys field — the keys are a projection of sidebarSlices', () => {
    expect(plan.pages.length).toBeGreaterThan(1) // the fixture spans pages, so this is not vacuous
    for (const page of plan.pages) {
      expect(Object.keys(page).sort()).toEqual(
        [
          'emptyColumn',
          'identity',
          'mainBlocks',
          'mainFill',
          'overflowPt',
          'index',
          'sidebarFill',
          'sidebarSlices'
        ].sort()
      )
    }
  })

  it('has no SidebarSlice.continued field — continuation is isContinuedSlice(slice)', () => {
    const slices = plan.pages.flatMap((p) => p.sidebarSlices)
    expect(slices.length).toBeGreaterThan(0)
    for (const slice of slices) {
      expect(Object.keys(slice).sort()).toEqual(['end', 'itemCount', 'key', 'start'])
      expect(layout.isContinuedSlice(slice)).toBe(slice.start > 0)
    }
    // The fixture genuinely splits a section, so both answers are exercised.
    expect(slices.some((s) => layout.isContinuedSlice(s))).toBe(true)
    expect(slices.some((s) => !layout.isContinuedSlice(s))).toBe(true)
  })

  it('isContinuedSlice copes with the absent slice the ATS/preview path passes', () => {
    expect(layout.isContinuedSlice(undefined)).toBe(false)
    expect(layout.isContinuedSlice(null)).toBe(false)
    expect(layout.isContinuedSlice({ start: 0 })).toBe(false)
    expect(layout.isContinuedSlice({ start: 1 })).toBe(true)
  })

  it('isContinuedSlice THROWS on a start index — the wrong-argument answer would be the silent one', () => {
    // It replaced a predicate that took `start` as a number. Under a
    // `slice?.start` implementation, `isContinuedSlice(2)` returns false: no
    // "(cont.)" marker on a continuation, i.e. exactly the measured-title /
    // rendered-title disagreement the collapse exists to prevent — and `test/`
    // is outside tsconfig's include, so the annotation would not catch it in
    // the harness, which is the heaviest caller.
    for (const wrong of [2, 0, '1', true]) {
      expect(() => layout.isContinuedSlice(/** @type {never} */ (wrong))).toThrow(/expects a slice/)
    }
    // An object without a numeric start is the same silent-false hazard.
    expect(() => layout.isContinuedSlice(/** @type {never} */ ({ key: 'referees' }))).toThrow(
      /expects a slice/
    )
  })
})
