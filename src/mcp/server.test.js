// Drives the real MCP server in-process over the SDK's in-memory transport: a
// Client on one end, runMcpServer() on the other. Exercises the initialize
// handshake, tools/list, and tools/call (success, tool-level error, unknown
// tool, and a handler that throws) — covering server.js without touching stdio.

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runMcpServer } from './server.js'

const RENDER_TIMEOUT = 30000
/** @type {import('@modelcontextprotocol/sdk/client/index.js').Client} */
let client
/** @type {import('vitest').MockInstance} */
let consoleErr
/** @type {string[]} */
const dirs = []

function freshDir() {
  const d = mkdtempSync(join(tmpdir(), 'cvx-mcp-'))
  dirs.push(d)
  return d
}

const parse = (/** @type {any} */ res) => JSON.parse(res.content[0].text)

beforeAll(async () => {
  // The server logs a human-facing "ready" banner to stderr on connect.
  consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'cvx-test-client', version: '0.0.0' }, { capabilities: {} })
  await Promise.all([client.connect(clientTransport), runMcpServer(serverTransport)])
})

afterAll(async () => {
  await client.close()
  consoleErr.mockRestore()
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

describe('tools/list', () => {
  it('advertises the five cvx tools with metadata', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual([
      'get_schema',
      'init_cv',
      'validate_cv',
      'build_pdf',
      'plan_layout'
    ])
    for (const t of tools) {
      expect(t.title).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.inputSchema.type).toBe('object')
    }
  })
})

describe('tools/call', () => {
  it('get_schema works with no arguments', async () => {
    const res = await client.callTool({ name: 'get_schema' })
    expect(res.isError).toBeFalsy()
    expect(parse(res).schemaVersion).toBe(1)
  })

  it('init_cv scaffolds, then reports already-exists as a tool error', async () => {
    const dir = freshDir()
    const ok = await client.callTool({ name: 'init_cv', arguments: { dir } })
    expect(ok.isError).toBeFalsy()
    expect(parse(ok).ok).toBe(true)

    const again = await client.callTool({ name: 'init_cv', arguments: { dir } })
    expect(again.isError).toBe(true)
    expect(parse(again)).toMatchObject({ ok: false, error: { code: 'already-exists' } })
  })

  it(
    'validate_cv returns ok for a scaffolded folder',
    async () => {
      const dir = freshDir()
      await client.callTool({ name: 'init_cv', arguments: { dir } })
      const res = await client.callTool({ name: 'validate_cv', arguments: { dir, strict: true } })
      expect(res.isError).toBeFalsy()
      expect(parse(res)).toMatchObject({ ok: true, schemaVersion: 1 })
    },
    RENDER_TIMEOUT
  )

  it(
    'build_pdf renders a PDF for a scaffolded folder',
    async () => {
      const dir = freshDir()
      await client.callTool({ name: 'init_cv', arguments: { dir } })
      const res = await client.callTool({ name: 'build_pdf', arguments: { dir } })
      expect(res.isError).toBeFalsy()
      expect(parse(res)).toMatchObject({ ok: true, filename: 'bruce-wayne.pdf' })
    },
    RENDER_TIMEOUT
  )

  it(
    'plan_layout returns diagnostics over the protocol, writing no PDF',
    async () => {
      const dir = freshDir()
      await client.callTool({ name: 'init_cv', arguments: { dir } })
      const res = await client.callTool({ name: 'plan_layout', arguments: { dir } })
      expect(res.isError).toBeFalsy()
      expect(parse(res)).toMatchObject({ ok: true, rendered: false })
      expect(parse(res).diagnostics.pages.length).toBeGreaterThan(0)
      expect(existsSync(join(dir, 'bruce-wayne.pdf'))).toBe(false)
    },
    RENDER_TIMEOUT
  )

  it('reports an unknown tool as an error result', async () => {
    const res = await client.callTool({ name: 'does_not_exist' })
    expect(res.isError).toBe(true)
    expect(parse(res)).toMatchObject({ ok: false, error: { code: 'unknown-tool' } })
  })

  it('wraps a handler that throws as a tool-failed error', async () => {
    const dir = freshDir() // has no cv-content/ → renderCV throws
    const res = await client.callTool({ name: 'build_pdf', arguments: { dir } })
    expect(res.isError).toBe(true)
    expect(parse(res)).toMatchObject({ ok: false, error: { code: 'tool-failed' } })
  })
})

describe('tool arguments are validated against the schema the tool advertises', () => {
  // Every tool declares `additionalProperties: false`; until this existed
  // nothing enforced it, so an invented layout lever (`fill`, `targetPages`,
  // `density`) was silently dropped and the caller got `ok: true` — a lever that
  // appears to work. See the note in server.js and the lever rule recorded in
  // src/pdf/resolveDocument.js.
  it('refuses an argument the tool never declared, and names it', async () => {
    const dir = freshDir()
    await client.callTool({ name: 'init_cv', arguments: { dir } })
    const res = await client.callTool({
      name: 'plan_layout',
      arguments: { dir, fill: 'balance' }
    })
    expect(res.isError).toBe(true)
    expect(parse(res)).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } })
    expect(parse(res).error.message).toMatch(/unknown argument "fill"/)
    expect(parse(res).error.message).toMatch(/no hidden layout levers/)
  })

  it('refuses a declared argument of the wrong type, saying what was wrong', async () => {
    const dir = freshDir()
    await client.callTool({ name: 'init_cv', arguments: { dir } })
    const res = await client.callTool({ name: 'validate_cv', arguments: { dir, strict: 'yes' } })
    expect(res.isError).toBe(true)
    expect(parse(res)).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } })
    expect(parse(res).error.message).toMatch(/strict.*boolean/)
  })

  it('still accepts every argument the tool DOES declare', async () => {
    const dir = freshDir()
    const res = await client.callTool({ name: 'init_cv', arguments: { dir } })
    expect(res.isError).toBeFalsy()
    const strict = await client.callTool({ name: 'validate_cv', arguments: { dir, strict: false } })
    expect(strict.isError).toBeFalsy()
    expect(parse(strict).strict).toBe(false)
  })
})
