// ── Fixture scaffolding + CLI/pdftoppm process helpers ─────────────────────
// Everything here touches the filesystem or spawns a process; kept separate
// from the pure modules (invariants.js, blocks.js, pgm.js) so those stay
// trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump } from 'js-yaml'

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
export const CLI = path.join(ROOT, 'bin', 'cvx.js')

/**
 * Is `pdftoppm` on PATH? CI runs `npm test` on ubuntu/macOS/Windows with no
 * poppler installed by default (only one pinned CI leg installs it — see
 * .github/workflows/ci.yml and research/c0-baseline.md's "canonical
 * environment" note); every describe block that shells out to `pdftoppm`
 * (or `pdftotext`, shipped in the same poppler package) must be guarded
 * with `describe.skipIf(!hasPdftoppm())` so those legs SKIP cleanly instead
 * of erroring. Memoized — this is called at module-load time by every
 * guarded test file, not worth re-spawning per call.
 */
let _hasPdftoppm
export function hasPdftoppm() {
  if (_hasPdftoppm !== undefined) return _hasPdftoppm
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' })
    _hasPdftoppm = true
  } catch {
    _hasPdftoppm = false
  }
  return _hasPdftoppm
}

// ── temp-dir hygiene ────────────────────────────────────────────────────────
// Every fixture directory this module hands out is tracked here so callers
// can clean up in bulk (generateBaseline.js does, at the end of a run; test
// files do in an `afterAll`) rather than leaving hundreds of small dirs
// behind in the OS temp dir across repeated runs.
const createdDirs = []

/** Fresh temp dir for one fixture (never inside the repo — nothing here is committed). */
export function mkFixtureDir(id) {
  const dir = mkdtempSync(path.join(tmpdir(), `cvx-c0-${id.replace(/[^a-z0-9-]/gi, '_')}-`))
  createdDirs.push(dir)
  return dir
}

/** Remove every temp dir handed out by mkFixtureDir() since the last cleanup. Safe to call repeatedly. */
export function cleanupFixtureDirs() {
  const dirs = createdDirs.splice(0, createdDirs.length)
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort — never fail a test run on cleanup */
    }
  }
}

/** Dump a { filename -> content } bag (contentSpecs.js's buildContent() output) to <dir>/cv-content/*.yaml. */
export function writeFixtureContent(dir, content) {
  const contentDir = path.join(dir, 'cv-content')
  mkdirSync(contentDir, { recursive: true })
  for (const [name, doc] of Object.entries(content)) {
    writeFileSync(path.join(contentDir, `${name}.yaml`), dump(doc, { lineWidth: -1 }))
  }
  return contentDir
}

/**
 * Run `node bin/cvx.js <args>` in `dir`, returning a structured result
 * instead of throwing — mirrors test/buildCli.test.js's own `run()` helper
 * so process failures (non-zero exit) become data, not a thrown exception.
 */
export function runCli(dir, args, { env } = {}) {
  try {
    // stdio: pipe stderr too (default would inherit it into the test
    // runner's own stderr) — our fixtures deliberately omit cv-content/
    // layouts/, so every run logs a harmless "layout not found, using
    // built-in default" warning that would otherwise spam `npm test` output.
    const stdout = execFileSync('node', [CLI, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { code: 0, stdout }
  } catch (e) {
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? ''
    }
  }
}

/**
 * Build BOTH the designed and ATS PDFs from the same cv-content, via TWO
 * SEPARATE `node bin/cvx.js build [--ats] --json` processes — deliberately
 * NOT the batched `cvx build --all` (one process, both renders).
 *
 * Found while building the content-completeness oracle (fix #2): rendering
 * two documents back-to-back in one process (`build --all`'s own
 * implementation — a `for (const ats of [false, true])` loop calling
 * `renderCV` twice) can corrupt the SECOND document's embedded ToUnicode
 * CMap — the glyphs still rasterize correctly (pdftoppm/visual inspection
 * looks fine), but text-extraction (`pdftotext`, and presumably copy-paste
 * in a real PDF viewer, and possibly ATS parsers) recovers garbled text for
 * some letters. Reproduced directly against `renderCV()` (bypassing the
 * CLI/oracle entirely): designed-then-ats in one process corrupts the ats
 * output; the same ats content built alone (fresh process) is fine.
 * Rendering the SAME variant twice in one process does not reproduce it —
 * it appears specifically tied to switching between the two themes/document
 * shapes (both register the same 'Lato' family — likely a state leak in
 * @react-pdf/renderer's font-subsetting cache across renderCV() calls, not
 * anything in src/pdf/layout.js or CVDocument.jsx). This is a genuine,
 * previously-unknown finding about `cvx build --all` — see
 * research/c0-baseline.md's "engine finding" section — reported, NOT fixed
 * here (out of C0's scope; needs its own investigation in render.js/
 * fonts.js, neither of which C0 is sanctioned to touch). Two independent
 * `node` processes route around it completely: each starts with a clean,
 * unregistered font state.
 *
 * Returns the same `{ code, result: { ok, outputs: [...] } }` shape
 * `build --all` would have, so callers (renderOracle.js) don't need to
 * know which strategy built it.
 */
export function buildAll(dir, { env } = {}) {
  const designed = runCli(dir, ['build', '--json'], { env })
  if (designed.code !== 0)
    return { code: designed.code, result: null, stdout: designed.stdout, stderr: designed.stderr }
  const ats = runCli(dir, ['build', '--ats', '--json'], { env })
  if (ats.code !== 0)
    return { code: ats.code, result: null, stdout: ats.stdout, stderr: ats.stderr }

  let designedResult, atsResult
  try {
    designedResult = JSON.parse(designed.stdout)
    atsResult = JSON.parse(ats.stdout)
  } catch {
    return {
      code: 1,
      result: null,
      stdout: `${designed.stdout}\n${ats.stdout}`,
      stderr: 'failed to parse build --json stdout'
    }
  }
  if (!designedResult.ok || !atsResult.ok) {
    return {
      code: 1,
      result: { ok: false, outputs: [designedResult, atsResult] },
      stdout: '',
      stderr: ''
    }
  }
  return {
    code: 0,
    result: { ok: true, all: true, outputs: [designedResult, atsResult] },
    stdout: '',
    stderr: ''
  }
}

function numericSuffix(filename) {
  const m = filename.match(/-(\d+)\.\w+$/)
  return m ? Number(m[1]) : 0
}

/** Sorted (by page number) file list matching `${outPrefix}-<n>.<ext>`. */
function listPages(outPrefix, ext) {
  const base = path.basename(outPrefix)
  const parent = path.dirname(outPrefix)
  return readdirSync(parent)
    .filter((f) => f.startsWith(`${base}-`) && f.endsWith(`.${ext}`))
    .sort((a, b) => numericSuffix(a) - numericSuffix(b))
    .map((f) => path.join(parent, f))
}

/**
 * Rasterize every page of `pdfPath` to grayscale PGM (uncompressed — see
 * pgm.js for why: no image-decoding dependency needed, and it sidesteps
 * PNG-compression-level/library-version-dependent file sizes entirely) at
 * `dpi`. Used for both the empty-column (ink-band presence) and blank-page
 * (whole-page ink ratio) signals — see renderOracle.js.
 */
export function pdftoppmGray(pdfPath, outPrefix, dpi = 50) {
  mkdirSync(path.dirname(outPrefix), { recursive: true })
  execFileSync('pdftoppm', ['-gray', '-r', String(dpi), pdfPath, outPrefix])
  return listPages(outPrefix, 'pgm')
}

/**
 * Extract all text from `pdfPath` (every page, concatenated) via
 * `pdftotext` — shipped in the same poppler package as `pdftoppm`, gated by
 * the same `hasPdftoppm()` guard. Used by contentOracle.js's per-item
 * sentinel completeness check.
 */
export function extractText(pdfPath) {
  return execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
}
