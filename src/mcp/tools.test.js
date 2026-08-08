// Direct unit tests for the MCP tool implementations (transport-agnostic).

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPdf, getSchema, initCv, planLayout, TOOLS, validateCv } from './tools.js'

const RENDER_TIMEOUT = 30000
/** @type {string} */
let tmp

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cvx-tools-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('getSchema', () => {
  it('returns the schema, themes, and built-in layouts (no dir)', async () => {
    const res = await getSchema()
    expect(res.schemaVersion).toBe(1)
    expect(res.schema).toBeTruthy()
    expect(res.themes.map((t) => t.name)).toEqual(expect.arrayContaining(['teal', 'coral', 'mono']))
    expect(res.layouts.map((l) => l.name)).toEqual(
      expect.arrayContaining(['two-column', 'single-column'])
    )
  })

  it('includes user layouts discovered under cv-content/layouts', async () => {
    mkdirSync(join(tmp, 'cv-content', 'layouts'), { recursive: true })
    writeFileSync(join(tmp, 'cv-content', 'layouts', 'wide.yaml'), 'template: two-column\n')
    const res = await getSchema({ dir: tmp })
    const wide = res.layouts.find((l) => l.name === 'wide')
    expect(wide).toMatchObject({ name: 'wide', default: false, source: 'cv-content/layouts' })
  })
})

describe('initCv', () => {
  it('scaffolds cv-content/ and returns next steps', async () => {
    const res = await initCv({ dir: tmp })
    expect(res.ok).toBe(true)
    expect(existsSync(join(tmp, 'cv-content', 'personal.yaml'))).toBe(true)
    expect(Array.isArray(res.nextSteps)).toBe(true)
  })

  it('refuses to overwrite an existing folder', async () => {
    await initCv({ dir: tmp })
    const res = await initCv({ dir: tmp })
    expect(res).toMatchObject({ ok: false, error: { code: 'already-exists' } })
  })
})

describe('validateCv', () => {
  it('validates the scaffold as ok (strict by default)', async () => {
    await initCv({ dir: tmp })
    const res = await validateCv({ dir: tmp })
    expect(res).toMatchObject({ ok: true, schemaVersion: 1, strict: true })
    expect(res.errors).toEqual([])
  })

  it('reports a missing content directory as not ok', async () => {
    const res = await validateCv({ dir: tmp, strict: false })
    expect(res.ok).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
  })
})

describe('buildPdf', () => {
  it(
    'renders the designed PDF',
    async () => {
      await initCv({ dir: tmp })
      const res = await buildPdf({ dir: tmp })
      expect(res).toMatchObject({
        ok: true,
        filename: 'bruce-wayne.pdf',
        ats: false,
        theme: 'teal',
        layout: 'two-column'
      })
      expect(res.bytes).toBeGreaterThan(0)
      expect(existsSync(res.path)).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'renders the ATS PDF with null theme/layout',
    async () => {
      await initCv({ dir: tmp })
      const res = await buildPdf({ dir: tmp, ats: true })
      expect(res).toMatchObject({
        ok: true,
        filename: 'bruce-wayne-ats.pdf',
        ats: true,
        theme: null,
        layout: null
      })
    },
    RENDER_TIMEOUT
  )
})

describe('planLayout', () => {
  it(
    'reports the pagination of a scaffolded folder without writing anything',
    async () => {
      await initCv({ dir: tmp })
      const res = await planLayout({ dir: tmp })
      expect(res).toMatchObject({ ok: true, rendered: false, theme: 'teal', layout: 'two-column' })
      expect(res.diagnostics?.totalPages).toBeGreaterThan(1)
      expect(existsSync(join(tmp, 'bruce-wayne.pdf'))).toBe(false)
    },
    RENDER_TIMEOUT
  )

  it(
    'agrees with what buildPdf renders from the same folder',
    async () => {
      await initCv({ dir: tmp })
      const planned = await planLayout({ dir: tmp })
      const built = await buildPdf({ dir: tmp })
      expect(built.diagnostics).toEqual(planned.diagnostics)
    },
    RENDER_TIMEOUT
  )
})

describe('TOOLS metadata', () => {
  it('exposes exactly the five documented tools', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'get_schema',
      'init_cv',
      'validate_cv',
      'build_pdf',
      'plan_layout'
    ])
    for (const tool of TOOLS) {
      expect(typeof tool.handler).toBe('function')
      expect(tool.inputSchema.type).toBe('object')
      expect(typeof tool.description).toBe('string')
    }
  })
})
