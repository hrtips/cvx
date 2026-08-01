// Protocol-level test: spawn the real `cvx mcp` stdio server (bin → lib) and
// speak JSON-RPC 2.0 to it — initialize handshake, tools/list, tools/call.
// Requires lib/ (built by the pretest hook).

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

let proc
let nextId = 1
const pending = new Map()

function send(method, params, { notification = false } = {}) {
  const msg = { jsonrpc: '2.0', method, ...(params ? { params } : {}) }
  if (notification) {
    proc.stdin.write(`${JSON.stringify(msg)}\n`)
    return Promise.resolve(null)
  }
  msg.id = nextId++
  const promise = new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject })
    setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 15_000)
  })
  proc.stdin.write(`${JSON.stringify(msg)}\n`)
  return promise
}

beforeAll(() => {
  proc = spawn(process.execPath, [path.join(ROOT, 'bin', 'cvx.js'), 'mcp'], {
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let buffer = ''
  proc.stdout.on('data', (chunk) => {
    buffer += chunk.toString()
    for (let idx = buffer.indexOf('\n'); idx !== -1; idx = buffer.indexOf('\n')) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      const msg = JSON.parse(line) // protocol guarantee: stdout is JSON-RPC only
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) reject(new Error(msg.error.message))
        else resolve(msg.result)
      }
    }
  })
})

afterAll(() => {
  proc?.kill()
})

describe('cvx mcp over stdio', () => {
  it('completes the initialize handshake', async () => {
    const result = await send('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'cvx-test-client', version: '0.0.0' }
    })
    expect(result.serverInfo.name).toBe('cvx')
    expect(result.capabilities.tools).toBeDefined()
    expect(result.instructions).toMatch(/validate_cv/)
    await send('notifications/initialized', undefined, { notification: true })
  })

  it('lists exactly the four tools with schemas', async () => {
    const result = await send('tools/list')
    expect(result.tools.map((t) => t.name)).toEqual([
      'get_schema',
      'init_cv',
      'validate_cv',
      'build_pdf'
    ])
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.description).toBeTruthy()
    }
  })

  it('runs the full loop: init_cv → validate_cv → build_pdf in a temp workspace', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvx-mcp-e2e-'))

    const init = await send('tools/call', { name: 'init_cv', arguments: { dir } })
    expect(init.isError ?? false).toBe(false)
    expect(JSON.parse(init.content[0].text).ok).toBe(true)

    const validate = await send('tools/call', { name: 'validate_cv', arguments: { dir } })
    const validation = JSON.parse(validate.content[0].text)
    expect(validation.ok).toBe(true)
    expect(validation.strict).toBe(true)

    const build = await send('tools/call', { name: 'build_pdf', arguments: { dir } })
    const built = JSON.parse(build.content[0].text)
    expect(built.ok).toBe(true)
    expect(built.filename).toBe('bruce-wayne.pdf')
  }, 30_000)

  it('surfaces tool errors as isError with a structured payload', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cvx-mcp-err-'))
    const result = await send('tools/call', { name: 'validate_cv', arguments: { dir } })
    expect(result.isError).toBe(true)
    const payload = JSON.parse(result.content[0].text)
    expect(payload.ok).toBe(false)
    expect(payload.errors[0].code).toBe('missing-content-dir')
  })

  it('rejects unknown tools without crashing', async () => {
    const result = await send('tools/call', { name: 'frobnicate', arguments: {} })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0].text).error.code).toBe('unknown-tool')
  })
})
