// The CLI's build envelope, driven IN-PROCESS.
//
// `bin/cvx.js` exports its commands (that is why they are exported), and the
// subprocess legs in physicalPages.test.js cannot reach the coverage gate:
// child processes are not instrumented, so every branch inside `build()` was
// invisible to it. These drive the same code directly.
//
// Scope: the envelope's own decisions — what goes in `diagnostics`, what
// reaches stderr, what `--strict` does. The rendering itself is covered
// everywhere else.

import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build } from '../bin/cvx.js'
import { assertLibMatchesSrc, ROOT } from './layout-harness/scaffold.js'

const TEMPLATE = path.join(ROOT, 'template', 'cv-content')

/** A workspace with the shipped scaffold, plus any overridden content files. */
function workspace(id, files = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), `cvx-env-${id}-`))
  cpSync(TEMPLATE, path.join(dir, 'cv-content'), { recursive: true })
  for (const [rel, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, 'cv-content', rel), text)
  }
  return dir
}

/** The 30-bullet summary that plans 2 pages and renders 3 (see physicalPages.test.js). */
const SPILLING_SUMMARY = `${Array.from(
  { length: 30 },
  (_, i) =>
    `- "Probe sentence number ${i + 1} for the tall summary overflow experiment, deliberately long enough to wrap onto a second line in the main column of the page."`
).join('\n')}\n`

/** Run `build` in `dir`, capturing the JSON envelope, stderr and any exit. */
async function run(dir, opts) {
  const cwd = process.cwd()
  const out = []
  const err = []
  const log = vi.spyOn(console, 'log').mockImplementation((m) => out.push(String(m)))
  const error = vi.spyOn(console, 'error').mockImplementation((m) => err.push(String(m)))
  /** @type {number | null} */
  let exited = null
  const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
    exited = code ?? 0
    // `build` calls exit as its LAST act, so returning is safe here and keeps
    // the assertions in this process.
    return /** @type {never} */ (undefined)
  })
  try {
    process.chdir(dir)
    await build(opts)
  } finally {
    process.chdir(cwd)
    log.mockRestore()
    error.mockRestore()
    exit.mockRestore()
  }
  const json = opts.json ? JSON.parse(out.join('\n')) : null
  return { json, stderr: err.join('\n'), stdout: out.join('\n'), exited }
}

beforeEach(() => assertLibMatchesSrc())
afterEach(() => vi.restoreAllMocks())

describe('build envelope — the designed variant', () => {
  it('carries plan diagnostics and no physical defect on a clean CV', async () => {
    const { json, stderr, exited } = await run(workspace('clean'), { json: true })
    expect(exited).toBeNull()
    expect(json.ok).toBe(true)
    expect(json.diagnostics.warnings.map((w) => w.code)).not.toContain('physical-pages-exceed-plan')
    expect(stderr).not.toContain('sheets')
  }, 60000)

  it('reports the defect first, on stderr, and still exits 0', async () => {
    const dir = workspace('spill', { 'experience.yaml': '[]\n', 'summary.yaml': SPILLING_SUMMARY })
    const { json, stderr, exited } = await run(dir, { json: true })
    // R-D: the PDF exists and is content-complete, so this is not a failure.
    expect(exited).toBeNull()
    const codes = json.diagnostics.warnings.map((w) => w.code)
    expect(codes[0]).toBe('physical-pages-exceed-plan')
    const w = json.diagnostics.warnings[0]
    expect(w.kind).toBe('defect')
    expect(w.physical).toBeGreaterThan(w.planned)
    // Audible without --json, and repeated in the plain-text notices list.
    expect(stderr).toContain(w.message)
    expect(json.notices.join('\n')).toContain(w.message)
  }, 60000)

  it('exits with the validation code under --strict when the defect is present', async () => {
    const dir = workspace('spill-strict', {
      'experience.yaml': '[]\n',
      'summary.yaml': SPILLING_SUMMARY
    })
    const { exited, json } = await run(dir, { json: true, strict: true })
    expect(exited).toBe(2)
    // The envelope is still emitted — a scripted caller gets both the failure
    // signal and the reason.
    expect(json.diagnostics.warnings[0].code).toBe('physical-pages-exceed-plan')
  }, 60000)

  it('does not exit under --strict when nothing is wrong', async () => {
    const { exited } = await run(workspace('clean-strict'), { json: true, strict: true })
    expect(exited).toBeNull()
  }, 60000)

  it('prints a human line instead of JSON when --json is absent', async () => {
    const { stdout, json } = await run(workspace('human'), {})
    expect(json).toBeNull()
    expect(stdout).toMatch(/✅ .*\.pdf/)
    expect(stdout).toMatch(/theme:/)
  }, 60000)
})

describe('build envelope — the ATS variant has no plan to check', () => {
  it('reports null diagnostics and never claims a sheet mismatch', async () => {
    const dir = workspace('ats', { 'experience.yaml': '[]\n', 'summary.yaml': SPILLING_SUMMARY })
    const { json, stderr } = await run(dir, { json: true, ats: true })
    expect(json.ok).toBe(true)
    expect(json.ats).toBe(true)
    expect(json.diagnostics).toBeNull()
    expect(stderr).not.toContain('physical-pages-exceed-plan')
  }, 60000)

  it('writes the -ats filename and stays quiet under --strict', async () => {
    const dir = workspace('ats-strict', {
      'experience.yaml': '[]\n',
      'summary.yaml': SPILLING_SUMMARY
    })
    const { json, exited } = await run(dir, { json: true, ats: true, strict: true })
    expect(json.filename).toMatch(/-ats\.pdf$/)
    expect(exited).toBeNull()
    expect(readFileSync(path.join(dir, json.filename)).length).toBeGreaterThan(0)
  }, 60000)
})
