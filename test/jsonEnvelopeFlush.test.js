// RV10: `--json` must deliver its whole envelope, however large.
//
// Every command printed the envelope with `console.log` and then called
// `process.exit()`. `process.stdout` is ASYNCHRONOUS when stdout is a pipe —
// which is what it is whenever an agent or a script consumes the output — so
// `exit()` discarded whatever had not yet drained. Measured before the fix:
// the payload arrived truncated at exactly 65536 bytes, the pipe buffer, and
// the JSON was unparseable, with nothing in the output or the exit code
// saying so.
//
// The contract this defends is stated in bin/cvx.js's own header: "with
// --json, stdout carries exactly one JSON object". Half an object is not one
// object, and the consumer is a machine that cannot notice.
//
// Reachability, measured rather than assumed: the scaffold's `validate --json`
// is ~470 bytes and a 12-role CV's `build --json` ~20 KB, so the ceiling sits
// about 3x a large real CV. But `validate`'s findings are unbounded
// (`allErrors: true`), and a content directory full of unknown keys is an
// ordinary way for an assistant-written CV to fail — which is exactly when the
// caller most needs to read the findings.

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLI = path.join(ROOT, 'bin', 'cvx.js')
/** @type {string[]} */
const dirs = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** A workspace whose findings list is far larger than one pipe buffer. */
function hugeFindingsWorkspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvx-json-flush-'))
  dirs.push(dir)
  const content = path.join(dir, 'cv-content')
  mkdirSync(content, { recursive: true })
  // Unknown keys are the cheapest way to generate a very long findings array,
  // and they are also the realistic one: it is what an assistant that invented
  // a field produces.
  const noise = Array.from({ length: 4000 }, (_, i) => `bogusKeyNumber${i}: "${'x'.repeat(60)}"`)
  writeFileSync(
    path.join(content, 'personal.yaml'),
    ['name: Flush Test', 'title: Engineer', 'email: f@t.z', ...noise].join('\n')
  )
  writeFileSync(path.join(content, 'summary.yaml'), '- A summary line.\n')
  writeFileSync(
    path.join(content, 'experience.yaml'),
    '- role: Engineer\n  company: Acme\n  period: "2020"\n  bullets:\n    - A bullet.\n'
  )
  return dir
}

describe('--json delivers the whole envelope over a pipe (RV10)', () => {
  it('is not truncated at the pipe buffer, and parses', () => {
    const dir = hugeFindingsWorkspace()
    let stdout = ''
    try {
      // stdio 'pipe' is the point: an inherited TTY would write synchronously
      // and hide the defect entirely, which is why no existing test saw it.
      stdout = execFileSync('node', [CLI, 'validate', '--json'], {
        cwd: dir,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (e) {
      // `validate` exits 2 when it finds problems, which this workspace does.
      stdout = /** @type {{ stdout?: Buffer | string }} */ (e).stdout?.toString() ?? ''
    }

    expect(
      stdout.length,
      'the payload must exceed one 64KiB pipe buffer or this test proves nothing'
    ).toBeGreaterThan(65536)
    const parsed = JSON.parse(stdout)
    expect(parsed.command).toBe('validate')
    // The tail is what a truncating write loses first.
    expect(Array.isArray(parsed.warnings) || Array.isArray(parsed.errors)).toBe(true)
    expect(parsed.checked).toBeDefined()
  }, 60000)
})
