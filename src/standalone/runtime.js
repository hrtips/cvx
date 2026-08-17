/**
 * Standalone-bundle prelude — runs BEFORE the CLI, by static import order.
 *
 * The single-file bundle (`dist/cvx.bundle.js`) carries CVX's non-JavaScript
 * assets — package.json, the JSON schema, the `init` template tree, the Lato
 * TTFs — gzipped and base64'd inside itself. None of them can be `import`ed as
 * code: the schema is read with readFileSync, the template is copied with
 * cpSync, and the fonts are opened by PATH twice over (fontkit's openSync in
 * src/pdf/measure.js, and @react-pdf's Font.register in src/pdf/fonts.js).
 * fontkit needs a real file descriptor, so embedding them as data: URLs would
 * still leave measure.js without a path to open.
 *
 * So instead of rewriting four call sites to take buffers, this module writes
 * the assets back out to a cache directory once and points CVX_ASSET_ROOT at
 * it. Every existing fs lookup then works unchanged, and the normal npm
 * package is completely unaffected (CVX_ASSET_ROOT is unset there).
 *
 * Ordering matters and is guaranteed: src/standalone/entry.js imports this
 * module before bin/cvx.js, and ESM evaluates a static import graph
 * depth-first in source order — so the env vars are set before bin/cvx.js's
 * module body computes pkgRoot and reads package.json from it.
 *
 * Extraction is idempotent and content-addressed: the directory name carries
 * the asset digest, and a stamp file marks a complete write. `build --all`
 * re-invokes the bundle in a child process, which inherits CVX_ASSET_ROOT
 * through the environment and skips the work entirely.
 */

// Virtual module supplied by scripts/build-standalone.js: pure data, no logic.
import { DIGEST, FILES, VERSION } from 'cvx:assets'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const STAMP = '.cvx-assets-complete'

/**
 * Write the embedded assets to a cache directory and return its path.
 *
 * Writes to a sibling temp directory and renames into place, so a concurrent
 * or interrupted run can never leave a half-populated tree that a later run
 * would trust on the strength of its stamp file.
 *
 * Exported for src/standalone/runtime.test.js: the cache-hit, stale-digest and
 * lost-race branches are the ones that would silently serve a wrong or partial
 * asset tree, and they are not reachable through the bundle's own end-to-end
 * tests (which only ever see a first, clean extraction).
 *
 * @returns {string} absolute path to the populated asset root
 */
export function materializeAssets() {
  const dir =
    process.env.CVX_STANDALONE_DIR || join(tmpdir(), `cvx-standalone-${VERSION}-${DIGEST}`)

  // Trust an existing tree only when the stamp records THIS digest.
  try {
    if (readFileSync(join(dir, STAMP), 'utf8') === DIGEST) return dir
  } catch {
    /* absent, unreadable, or stale — fall through and rewrite */
  }

  const staging = `${dir}.tmp-${process.pid}`
  rmSync(staging, { recursive: true, force: true })
  for (const [rel, packed] of Object.entries(FILES)) {
    const out = join(staging, rel)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, gunzipSync(Buffer.from(packed, 'base64')))
  }
  writeFileSync(join(staging, STAMP), DIGEST)

  rmSync(dir, { recursive: true, force: true })
  try {
    renameSync(staging, dir)
  } catch {
    // Lost a race with another process that populated it first — its tree is
    // content-identical (same digest in the name), so use it and drop ours.
    rmSync(staging, { recursive: true, force: true })
    if (!existsSync(join(dir, STAMP))) throw new Error(`could not populate asset root at ${dir}`)
  }
  return dir
}

// Marks "this code is running from the single-file bundle", independent of
// where its assets ended up. src/pdf/themes/index.js reads it to skip
// directory-scanning for themes beside the bundle.
process.env.CVX_STANDALONE = '1'

// Respect a pre-set root (a child process from `build --all`, or a caller
// pointing at their own extracted copy) rather than extracting again.
if (!process.env.CVX_ASSET_ROOT) process.env.CVX_ASSET_ROOT = materializeAssets()
