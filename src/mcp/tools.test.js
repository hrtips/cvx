// Direct unit tests for the MCP tool implementations (transport-agnostic).

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { packageVersion, schemaRefFor } from '../pdf/scaffold.js'
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

  // An MCP client knows the workspace `dir` and nothing else — not where the
  // server is installed, and frequently without any way to read a file there
  // (an `npx`-launched server unpacks into the npm cache). So the packaged
  // docs are advertised by path AND retrievable as text through the tool.
  it('advertises the packaged guides without their text by default', async () => {
    const res = await getSchema()
    expect(res.guides.map((g) => g.id)).toEqual(['ai-guide', 'cv-schema'])
    for (const g of res.guides) {
      expect(isAbsolute(g.path)).toBe(true)
      expect(existsSync(g.path)).toBe(true)
      expect(g.bytes).toBeGreaterThan(1000)
      expect(g).not.toHaveProperty('content')
    }
  })

  it('returns only the requested guide inline, verbatim', async () => {
    const res = await getSchema({ dir: tmp, guides: ['ai-guide'] })
    const [aiGuide, cvSchema] = res.guides
    const content = /** @type {string} */ (aiGuide.content)
    expect(content).toBe(readFileSync(aiGuide.path, 'utf8'))
    expect(content).toContain('# ')
    // `bytes` is the file size on disk (UTF-8), not JS string length — the
    // guides carry non-ASCII, so the two genuinely differ.
    expect(Buffer.byteLength(content, 'utf8')).toBe(aiGuide.bytes)
    expect(cvSchema).not.toHaveProperty('content')
  })

  it('returns both when both are asked for', async () => {
    const res = await getSchema({ guides: ['ai-guide', 'cv-schema'] })
    for (const g of res.guides) expect(typeof g.content).toBe('string')
  })
})

describe('initCv', () => {
  it('scaffolds cv-content/ and returns next steps', async () => {
    const res = await initCv({ dir: tmp })
    expect(res.ok).toBe(true)
    expect(existsSync(join(tmp, 'cv-content', 'personal.yaml'))).toBe(true)
    expect(Array.isArray(res.nextSteps)).toBe(true)
  })

  it('pins the scaffold to the running release and reports the ref', async () => {
    const res = await initCv({ dir: tmp })
    expect(res.schemaRef).toBe(schemaRefFor(packageVersion()))
    const header = readFileSync(join(tmp, 'cv-content', 'config.yaml'), 'utf8').split('\n')[0]
    expect(header).toContain(`/hrtips/cvx/${res.schemaRef}/schema/v1/config.schema.json`)
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
