// cvx build --all: validate first, then render BOTH variants in one command,
// emitting exactly one JSON object. Spawns the real bin so the CLI wiring
// (arg parsing → validate gate → renderCV twice) is covered end to end.
// Requires lib/ (the pretest build:lib step produces it before vitest runs).

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const TEMPLATE = path.join(ROOT, 'template', 'cv-content')
const CLI = path.join(ROOT, 'bin', 'cvx.js')

function scaffold(mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvx-buildall-'))
  cpSync(TEMPLATE, path.join(dir, 'cv-content'), { recursive: true })
  mutate?.(path.join(dir, 'cv-content'))
  return dir
}

function run(dir, args) {
  try {
    return { code: 0, stdout: execFileSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' }) }
  } catch (e) {
    return { code: e.status, stdout: e.stdout?.toString() ?? '' }
  }
}

// pdftotext ships with poppler (same package as the harness's pdftoppm).
function hasPdftotext() {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const extractText = (pdfPath) => execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })

describe('cvx build --all', () => {
  it('validates then builds both variants, emitting one JSON object', () => {
    const dir = scaffold()
    const { code, stdout } = run(dir, ['build', '--all', '--json'])
    expect(code).toBe(0)
    const result = JSON.parse(stdout)
    expect(result.ok).toBe(true)
    expect(result.all).toBe(true)
    expect(result.outputs).toHaveLength(2)
    const designed = result.outputs.find((o) => !o.ats)
    const ats = result.outputs.find((o) => o.ats)
    expect(designed.filename).toBe('bruce-wayne.pdf')
    expect(ats.filename).toBe('bruce-wayne-ats.pdf')
    expect(existsSync(path.join(dir, 'bruce-wayne.pdf'))).toBe(true)
    expect(existsSync(path.join(dir, 'bruce-wayne-ats.pdf'))).toBe(true)
  }, 30000)

  it('exits 2 without building when validation fails', () => {
    const dir = scaffold((c) =>
      writeFileSync(path.join(c, 'personal.yaml'), 'title: No Name Here\n')
    )
    const { code, stdout } = run(dir, ['build', '--all', '--json'])
    expect(code).toBe(2)
    const result = JSON.parse(stdout)
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('validation-failed')
    expect(existsSync(path.join(dir, 'no-name-here.pdf'))).toBe(false)
  }, 30000)
})

// Regression guard for the render-state-leak bug: @react-pdf/renderer corrupts
// the ToUnicode/text layer of the 2nd PDF rendered in one process, so building
// both variants in-process gave a visually-fine but text-garbled ATS PDF
// ("First Place" -> "ir t Place", "Gotham" unrecoverable). build --all now
// renders each variant in its own process; this asserts the ATS text is clean.
// The harness's own oracle can't catch this — it builds variants separately.
describe.skipIf(!hasPdftotext())('cvx build --all — ATS text layer not corrupted', () => {
  it('the ATS variant (2nd render) extracts clean, un-garbled text', () => {
    const dir = scaffold()
    const { code } = run(dir, ['build', '--all', '--json'])
    expect(code).toBe(0)
    const atsText = extractText(path.join(dir, 'bruce-wayne-ats.pdf'))
    expect(atsText).toContain('First Place') // was "ir t Place" under the bug
    expect(atsText).toContain('CERTIFICATIONS') // was "CERTI ICATIONS"
    expect((atsText.match(/Gotham/g) ?? []).length).toBeGreaterThanOrEqual(5) // was 0
  }, 30000)
})
