// ── Fixture scaffolding + CLI/pdftoppm process helpers ─────────────────────
// Everything here touches the filesystem or spawns a process; kept separate
// from the pure modules (invariants.js, blocks.js, pgm.js) so those stay
// trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump } from 'js-yaml'
import { libBuiltAt, libStaleReason } from '../../scripts/libFreshness.js'
import { pickProfilePhoto } from '../../src/pdf/profilePhoto.js'

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
export const CLI = path.join(ROOT, 'bin', 'cvx.js')

/** Has this process already verified lib/ against src/? One hash per run, not one per fixture. */
let libChecked = false

/**
 * STALE-BUILD GUARD (C4). `CLI` imports `lib/`, every prediction in this
 * harness comes from `src/`, and only `npm test`'s `pretest` hook rebuilds one
 * from the other — `npx vitest` does not. Comparing a fresh prediction against
 * a stale engine is a FALSE PASS, and both C3 reviewers hit it by accident, so
 * the first CLI invocation of a run refuses to proceed when the two disagree.
 * See scripts/libFreshness.js for what "disagree" means (a content hash of
 * exactly build-lib.js's inputs, not an mtime).
 *
 * @returns {void}
 */
export function assertLibMatchesSrc() {
  if (libChecked) return
  const reason = libStaleReason(ROOT)
  if (reason !== null) {
    const built = libBuiltAt(ROOT)
    throw new Error(
      `STALE BUILD — refusing to run a render test against it.\n  ${reason}` +
        (built === null ? '' : `\n  (lib/ was last built ${built}.)`)
    )
  }
  libChecked = true
}

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

/**
 * Does `contentDir` carry a profile photo (cv-content/images/profile.<ext>)?
 * Returns a truthy sentinel rather than the image itself: the only thing the
 * packer needs to know is whether `identity-photo` reserves `chrome.photoHeight`
 * on page 1 (see layout.js's identityH), and loading/base64-ing the real file
 * would be pure overhead for a boolean. Mirrors loadContent.js's discovery via
 * the shared PHOTO_EXTENSIONS list, so a new supported extension can't drift.
 */
export function detectProfilePhoto(contentDir) {
  const imagesDir = path.join(contentDir, 'images')
  if (!existsSync(imagesDir)) return null
  return pickProfilePhoto(readdirSync(imagesDir)) ? '(profile-photo-present)' : null
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
  assertLibMatchesSrc()
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
 * `renderCV` twice) corrupted the SECOND document. It was described here as
 * a ToUnicode/text-layer problem ("the glyphs still rasterize correctly");
 * that was half right — the same leak also removes glyphs from the PAGE,
 * which is how it resurfaced in the MCP server for v1.6.0. Diagnosed and
 * fixed at the source in v1.6.1: @react-pdf's process-global font registry
 * shared one fontkit instance across renders, fontkit's per-font glyph cache
 * kept the code points of the first lookup, and subset embedding cached
 * glyphs with none — see src/pdf/fonts.js for the full chain, and
 * test/renderIsolation.test.js + src/pdf/fonts.test.js for the regression.
 *
 * Two independent `node` processes are kept here anyway: they are the
 * strongest available statement of "each PDF was built from nothing", and
 * this harness is the thing that has to notice if cross-render isolation
 * ever breaks again.
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
