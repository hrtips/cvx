// MCP tool layer: same behavior as the CLI's JSON envelopes, driven as
// plain functions with an explicit workspace dir.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getSchema, initCv, validateCv, buildPdf, TOOLS } from '../src/mcp/tools.js'

const scratch = () => mkdtempSync(path.join(tmpdir(), 'cvx-mcp-'))

describe('TOOLS metadata', () => {
  it('exposes exactly the four sprint tools with model-facing descriptions', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['get_schema', 'init_cv', 'validate_cv', 'build_pdf'])
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(80)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(typeof tool.handler).toBe('function')
    }
  })
})

describe('get_schema', () => {
  it('returns the canonical schema, themes, and layouts', async () => {
    const result = await getSchema({ dir: scratch() })
    expect(result.schemaVersion).toBe(1)
    expect(Object.keys(result.schema.$defs)).toContain('personal')
    expect(result.themes.map((t) => t.name)).toEqual(expect.arrayContaining(['teal', 'coral', 'mono']))
    expect(result.layouts.map((l) => l.name)).toEqual(expect.arrayContaining(['two-column', 'single-column']))
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
  }, 30_000)

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
