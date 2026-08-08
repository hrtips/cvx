// MCP tool layer: same behavior as the CLI's JSON envelopes, driven as
// plain functions with an explicit workspace dir.

import { existsSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPdf, getSchema, initCv, planLayout, TOOLS, validateCv } from '../src/mcp/tools.js'

const scratch = () => mkdtempSync(path.join(tmpdir(), 'cvx-mcp-'))

describe('TOOLS metadata', () => {
  it('exposes exactly the five sprint tools with model-facing descriptions', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'get_schema',
      'init_cv',
      'validate_cv',
      'build_pdf',
      'plan_layout'
    ])
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(80)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(typeof tool.handler).toBe('function')
    }
  })

  it('plan_layout takes only a dir — this slice exposes no layout levers at all', () => {
    // C6a is read-only. The day a lever is added it must arrive with the three
    // things resolveDocument.js records (plumbed through resolveDocument, added
    // to the config schema, given a fixture axis) — and this assertion is what
    // makes "we added an arg and shipped" impossible to do quietly.
    const plan = TOOLS.find((t) => t.name === 'plan_layout')
    expect(Object.keys(plan.inputSchema.properties)).toEqual(['dir'])
    expect(plan.inputSchema.required).toBeUndefined()
  })

  it('the tools that report emptyColumn say plainly it is not a target', () => {
    // The C4 finding this whole slice is fenced by: driving "planned pages with
    // an empty column" toward zero produces measurably worse CVs. The number is
    // reported because hiding a real property would be worse — but the model
    // reading the description must be told, and it must be told never to drop
    // content to fit.
    const plan = TOOLS.find((t) => t.name === 'plan_layout')
    expect(plan.description).toMatch(/NOT TARGETS/)
    expect(plan.description).toMatch(/never drop content/i)
    expect(plan.description).toMatch(/no layout levers/i)
  })
})

describe('get_schema', () => {
  it('returns the canonical schema, themes, and layouts', async () => {
    const result = await getSchema({ dir: scratch() })
    expect(result.schemaVersion).toBe(1)
    expect(Object.keys(result.schema.$defs)).toContain('personal')
    expect(result.themes.map((t) => t.name)).toEqual(
      expect.arrayContaining(['teal', 'coral', 'mono'])
    )
    expect(result.layouts.map((l) => l.name)).toEqual(
      expect.arrayContaining(['two-column', 'single-column'])
    )
  })
})

describe('init_cv → validate_cv → build_pdf loop', () => {
  it('scaffolds, validates strict-clean, and renders a PDF', async () => {
    const dir = scratch()

    const init = await initCv({ dir })
    expect(init.ok).toBe(true)
    expect(existsSync(path.join(dir, 'cv-content', 'personal.yaml'))).toBe(true)
    expect(existsSync(path.join(dir, 'cv-content', 'AGENTS.md'))).toBe(true)

    const again = await initCv({ dir })
    expect(again.ok).toBe(false)
    expect(again.error.code).toBe('already-exists')

    const validation = await validateCv({ dir })
    expect(validation.strict).toBe(true)
    expect(validation.errors).toEqual([])
    expect(validation.ok).toBe(true)

    const build = await buildPdf({ dir })
    expect(build.ok).toBe(true)
    expect(build.filename).toBe('bruce-wayne.pdf')
    expect(build.theme).toBe('teal')
    expect(statSync(build.path).size).toBe(build.bytes)
    expect(build.bytes).toBeGreaterThan(10_000)

    // The build reports how it paginated, so an assistant does not need a
    // second call to tell the user what it just produced.
    expect(build.diagnostics.totalPages).toBe(3)
    expect(build.diagnostics.pages).toHaveLength(3)
    expect(build.diagnostics.warnings).toEqual([])
  }, 30_000)

  it('plan_layout answers the same questions without writing a PDF', async () => {
    const dir = scratch()
    await initCv({ dir })

    const plan = await planLayout({ dir })
    expect(plan.ok).toBe(true)
    expect(plan.rendered).toBe(false)
    expect(existsSync(path.join(dir, 'bruce-wayne.pdf'))).toBe(false)
    expect(plan.theme).toBe('teal')
    expect(plan.layout).toBe('two-column')
    expect(plan.diagnostics.totalPages).toBe(3)

    // Every page reports both columns, 1-based, with fills in [0,1].
    expect(plan.diagnostics.pages.map((p) => p.page)).toEqual([1, 2, 3])
    for (const page of plan.diagnostics.pages) {
      for (const col of [page.main, page.sidebar]) {
        if (col.fill === null) continue
        expect(col.fill).toBeGreaterThan(0)
        expect(col.fill).toBeLessThanOrEqual(1)
        expect(col.usedPt).toBeGreaterThan(0)
      }
    }
    // The scaffold's known shape: one role on page 1, and page 3 is the tail of
    // the sidebar flow (an empty main column — the deliberate G1 residual).
    expect(plan.diagnostics.pages[0].main.entries).toHaveLength(1)
    expect(plan.diagnostics.pages[2].emptyColumn).toBe('main')
    expect(plan.diagnostics.totals.emptyColumnPages).toBe(1)
    expect(plan.diagnostics.totals.overflowPages).toBe(0)
  }, 30_000)

  it('plan_layout on a missing workspace fails like every other tool', async () => {
    await expect(planLayout({ dir: scratch() })).rejects.toThrow(/Content directory not found/)
  })

  it('validate_cv reports findings on broken content and strict=false downgrades unknown keys', async () => {
    const dir = scratch()
    await initCv({ dir })
    writeFileSync(path.join(dir, 'cv-content', 'personal.yaml'), 'name: Jane\nlinkdin: typo\n')

    const strict = await validateCv({ dir })
    expect(strict.ok).toBe(false)
    expect(strict.errors.some((f) => f.code === 'unknown-key')).toBe(true)

    const lax = await validateCv({ dir, strict: false })
    expect(lax.ok).toBe(true)
    expect(lax.warnings.some((f) => f.code === 'unknown-key')).toBe(true)
  })

  it('validate_cv on a missing workspace suggests init', async () => {
    const result = await validateCv({ dir: scratch() })
    expect(result.ok).toBe(false)
    expect(result.errors[0].code).toBe('missing-content-dir')
  })
})
