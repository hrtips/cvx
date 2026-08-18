// RV10: the synchronous writer behind every `--json` envelope.
//
// It exists because `console.log` + `process.exit()` truncated the payload at
// the 64KiB pipe buffer whenever a caller consumed stdout through a pipe —
// which is every agent and every script. `test/jsonEnvelopeFlush.test.js`
// proves the end-to-end behaviour through a real subprocess; this covers the
// write loop itself, which every other test necessarily stubs out (it is the
// seam they capture the envelope through).

import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { stdoutJson } from './cvx.js'

/** @type {string[]} */
const dirs = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

function tmpFd() {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvx-stdout-'))
  dirs.push(dir)
  const file = path.join(dir, 'out.json')
  return { fd: openSync(file, 'w'), file }
}

describe('stdoutJson.write (RV10)', () => {
  it('writes the whole payload, including one far larger than a pipe buffer', () => {
    const { fd, file } = tmpFd()
    // 512KiB — eight times the buffer that used to truncate the envelope.
    const payload = `${JSON.stringify({ pad: 'x'.repeat(512 * 1024) })}\n`
    stdoutJson.write(payload, fd)
    closeSync(fd)
    const written = readFileSync(file, 'utf8')
    expect(written.length).toBe(payload.length)
    expect(written).toBe(payload)
    expect(JSON.parse(written).pad.length).toBe(512 * 1024)
  })

  it('writes multi-byte characters without splitting them', () => {
    // The loop advances by BYTES, not characters, which is why it works on a
    // Buffer rather than a string — a name like José is where a naive
    // character-offset loop corrupts the output.
    const { fd, file } = tmpFd()
    const payload = `${JSON.stringify({ name: 'José Álvarez', note: '— em dash, ✓ check' })}\n`
    stdoutJson.write(payload, fd)
    closeSync(fd)
    expect(readFileSync(file, 'utf8')).toBe(payload)
  })

  it('rethrows a real write error rather than looping forever', () => {
    // Only EAGAIN is retried. Anything else — a closed or invalid fd — must
    // propagate: silently spinning on it would hang the CLI.
    const { fd } = tmpFd()
    closeSync(fd)
    expect(() => stdoutJson.write('{}\n', fd)).toThrow(/EBADF|bad file/i)
  })
})
