// ── The stale-build guard ───────────────────────────────────────────────────
//
// `bin/cvx.js` imports from `lib/` — the esbuild transform of `src/` produced
// by `scripts/build-lib.js`. Every render-dependent test suite
// (layoutRenderOracle, layoutMeasureDiff, layoutSidebarMeasureDiff,
// layoutRepro, buildCli, ...) shells out to that binary and compares what it
// renders against predictions computed from `src/`. Those are two different
// copies of the engine, and only `npm test`'s `pretest` hook keeps them in
// sync: **`npx vitest` does not run it**, so an ad-hoc run can compare today's
// `src/` against whatever `lib/` was last built from. Both C3 reviewers hit
// exactly that and got false passes — a green suite proving nothing, which is
// worse than a red one.
//
// So `build-lib.js` records the hash of the sources it consumed
// (`lib/.build-manifest.json`) and `test/layout-harness/scaffold.js` re-derives
// that hash before the first CLI invocation of a run. Mismatch = a named
// failure telling you to rebuild, never a silent comparison.
//
// WHAT IS HASHED: exactly what `build-lib.js` reads — every `.js`/`.jsx` under
// `src/pdf` and `src/mcp` that is not a `*.test.js`, plus the `Lato-*` font
// files it copies — AND the transform itself: `build-lib.js`'s own bytes and
// esbuild's resolved version. The inputs alone are not enough; changing the
// esbuild target, the jsx mode or the `.jsx` specifier rewrite (or taking a
// dependabot esbuild bump) makes `lib/` stale from an unchanged `src/`, which
// is the same false pass one level up. Hashing the emitted `lib/` instead would
// be the wrong direction (it cannot notice a src file that was never compiled);
// hashing mtimes would be weaker still (a checkout, a `touch`, or a coarse
// filesystem clock all lie). Content hashes make "same input" mean it.
//
// Kept in `scripts/` rather than in the harness because the writer
// (build-lib.js, a build script) and the reader (the harness) must agree on
// the definition, and a second copy of a hashing rule is how the two come to
// disagree.
// ────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/** Where `build-lib.js` writes the record, relative to `lib/`. */
export const BUILD_MANIFEST = '.build-manifest.json'

/** The source trees `build-lib.js` transforms, relative to the repo root. */
const SOURCE_TREES = [
  ['src', 'pdf'],
  ['src', 'mcp']
]

/** Fonts are copied verbatim; a font swap changes every measurement, so it belongs in the hash. */
const FONT_DIR = ['src', 'fonts']
const FONT_PREFIX = 'Lato-'

/**
 * The TRANSFORM is an input too — hashing only what build-lib.js reads leaves
 * the same false-pass one level up. Change its esbuild `target`, its `jsx`
 * mode or the `.jsx` specifier rewrite, or take a dependabot esbuild bump, and
 * `lib/` is genuinely stale from an unchanged `src/`. So the script's own bytes
 * are hashed alongside the sources, and esbuild's RESOLVED version is stamped
 * into the manifest and folded into the same digest.
 */
const BUILD_SCRIPT = ['scripts', 'build-lib.js']

/**
 * esbuild's resolved version, read from its package.json rather than by
 * importing it (the guard runs in every render-dependent test file; loading the
 * platform binary for a version string would be pure cost). `unknown` if it
 * cannot be resolved — which still participates in the hash, so a build made
 * with a resolvable esbuild and a check made without one disagree loudly rather
 * than quietly.
 *
 * @param {string} root
 */
export function esbuildVersion(root) {
  try {
    const req = createRequire(join(root, 'package.json'))
    return JSON.parse(readFileSync(req.resolve('esbuild/package.json'), 'utf8')).version
  } catch {
    return 'unknown'
  }
}

/** Same filter `build-lib.js` applies when choosing what to transform. */
function isBuildInput(/** @type {string} */ name) {
  return (name.endsWith('.js') || name.endsWith('.jsx')) && !name.endsWith('.test.js')
}

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1
  )) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

/**
 * Content hash of everything a build depends on, in a stable order: what
 * `build-lib.js` reads, `build-lib.js` ITSELF, and esbuild's resolved version.
 *
 * @param {string} root  repo root
 * @returns {string} sha256 hex
 */
export function hashBuildInputs(root) {
  const h = createHash('sha256')
  /** @type {string[]} */
  const files = []
  for (const tree of SOURCE_TREES) {
    const dir = join(root, ...tree)
    if (!existsSync(dir)) continue
    for (const file of walk(dir)) if (isBuildInput(file)) files.push(file)
  }
  const fontDir = join(root, ...FONT_DIR)
  if (existsSync(fontDir)) {
    for (const name of readdirSync(fontDir).sort()) {
      if (name.startsWith(FONT_PREFIX)) files.push(join(fontDir, name))
    }
  }
  const buildScript = join(root, ...BUILD_SCRIPT)
  if (existsSync(buildScript)) files.push(buildScript)
  for (const file of files.sort()) {
    // The path is hashed alongside the bytes so a RENAME (same content, new
    // module specifier) is a change too.
    h.update(file.slice(root.length))
    h.update('\0')
    h.update(readFileSync(file))
    h.update('\0')
  }
  h.update(`esbuild@${esbuildVersion(root)}`)
  return h.digest('hex')
}

/**
 * Why `lib/` cannot be trusted to represent `src/` — or `null` when it can.
 *
 * Pure and root-relative so it is testable against a synthetic tree rather
 * than only against the repo it guards.
 *
 * @param {string} root  repo root (must contain `src/` and, when built, `lib/`)
 * @returns {string | null} a human-readable reason, or null when lib/ is fresh
 */
export function libStaleReason(root) {
  const libDir = join(root, 'lib')
  if (!existsSync(libDir)) {
    return `lib/ does not exist. bin/cvx.js imports it, so nothing can render. Run \`npm run build:lib\`.`
  }
  const manifestPath = join(libDir, BUILD_MANIFEST)
  if (!existsSync(manifestPath)) {
    return (
      `lib/${BUILD_MANIFEST} is missing, so lib/ was built by a build-lib.js older than the ` +
      `stale-build guard and its provenance is unknown. Run \`npm run build:lib\`.`
    )
  }
  /** @type {{ srcHash?: string }} */
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    return `lib/${BUILD_MANIFEST} is unreadable (${/** @type {Error} */ (err).message}). Run \`npm run build:lib\`.`
  }
  const actual = hashBuildInputs(root)
  if (manifest.srcHash !== actual) {
    return (
      `lib/ was built from different inputs (manifest ${String(manifest.srcHash).slice(0, 12)}…, ` +
      `src/ + build-lib.js + esbuild@${esbuildVersion(root)} now hash to ${actual.slice(0, 12)}…). ` +
      `The render-dependent suites shell out to bin/cvx.js, ` +
      `which imports lib/, so they would be comparing fresh predictions against a stale engine — ` +
      `the exact false pass this guard exists to stop. Run \`npm run build:lib\` (or \`npm test\`, ` +
      `whose pretest hook does it for you) instead of a bare \`npx vitest\`.`
    )
  }
  return null
}

/** Best-effort build timestamp, for a failure message that says how old the stale build is. */
export function libBuiltAt(/** @type {string} */ root) {
  const manifestPath = join(root, 'lib', BUILD_MANIFEST)
  return existsSync(manifestPath) ? statSync(manifestPath).mtime.toISOString() : null
}
