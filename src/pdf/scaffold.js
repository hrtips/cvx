/**
 * scaffold.js — the one implementation of "copy template/cv-content into a
 * workspace", shared by `cvx init` (bin/cvx.js) and the `init_cv` MCP tool.
 *
 * It exists because the copy is no longer verbatim: every scaffolded file that
 * links back to this repo gets its `main` ref rewritten to the release that
 * wrote it. `template/cv-content/*.yaml` carry
 *
 *   # yaml-language-server: $schema=https://raw.githubusercontent.com/hrtips/cvx/main/schema/v1/personal.schema.json
 *
 * and README.md / AGENTS.md link to `github.com/hrtips/cvx/blob/main/docs/…`.
 * Copied verbatim, a CV scaffolded by 1.7.0 has its editor validating against
 * whatever `main` says next year — which is exactly what the "content files
 * never break within a major" promise is supposed to rule out. Pinning makes
 * that promise structural instead of a matter of discipline.
 *
 * The version is derived HERE, at scaffold time, from package.json — never
 * baked into the template. A baked string is wrong in both directions: a bump
 * between writing the template and tagging leaves a URL pointing at a release
 * that never shipped that file, and a dev checkout emits a 404.
 *
 * Lives under src/pdf/ (with validateContent.js, which is not "pdf" either)
 * because that is the tree build-lib.js transforms into lib/pdf — the only
 * place both bin/cvx.js and src/mcp/tools.js already import from.
 */

import { cpSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repo root in a checkout, package root in an install — same two levels up. */
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** @type {string} The template every scaffold is a copy of. */
export const TEMPLATE_DIR = join(pkgRoot, 'template', 'cv-content')

/** Scaffolded file types that can carry a repo link. Images are copied untouched. */
const REWRITABLE = new Set(['.yaml', '.yml', '.md'])

/**
 * Every `hrtips/cvx` URL shape the template uses, with the branch/tag ref as
 * the one capturing gap: `raw.githubusercontent.com/hrtips/cvx/<ref>/…` (the
 * `$schema` headers) and `github.com/hrtips/cvx/blob/<ref>/…` (the doc links).
 * Anchored on `main/` so nothing already pinned is rewritten twice, and so
 * plain `github.com/hrtips/cvx` / `#readme` links — which have no ref in them
 * and must keep pointing at the project, not a tag — are left alone.
 */
const MAIN_REF_RE =
  /(https:\/\/(?:raw\.githubusercontent\.com\/hrtips\/cvx|github\.com\/hrtips\/cvx\/blob)\/)main\//g

/** A plain `x.y.z` release — no prerelease suffix, no build metadata. */
const STABLE_SEMVER = /^\d+\.\d+\.\d+$/

/**
 * The git ref a scaffolded file should point at, for a given running version.
 *
 * THE RULE: a plain `x.y.z` version pins to the tag `vx.y.z`; anything else
 * falls back to `main`.
 *
 * It has to be decidable offline, from the version string alone — `init` must
 * not make a network call to find out whether a tag exists. That is sound here
 * because `.github/workflows/publish.yml` publishes stable releases from
 * `on: push: tags: ['v*.*.*']`: a plain `x.y.z` on npm came from a `vx.y.z`
 * tag by construction, so the tag exists whenever a user is running one.
 *
 * Everything else is unreleased and gets `main`, which always resolves:
 *   - a repo checkout between releases (this file's own version is 1.7.0 until
 *     the next bump — that tag exists, so a checkout still pins correctly);
 *   - the canary channel, which stamps `1.7.0-next.abc1234` (workflow_dispatch,
 *     never tagged);
 *   - an `npm version prerelease` working tree, e.g. `1.8.0-rc.1`.
 *
 * A pinned-but-404 link is strictly worse than `main`, so the fallback is the
 * safe side of the only judgement call this function makes.
 *
 * @param {string | undefined | null} version  the running package version
 * @returns {string} a git ref: `v1.7.0`, or `main` when unreleased
 */
export function schemaRefFor(version) {
  return STABLE_SEMVER.test(String(version ?? '')) ? `v${version}` : 'main'
}

/** The running package's version, read from the package.json next to this code. */
export function packageVersion() {
  return /** @type {string} */ (
    JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')).version
  )
}

/**
 * Rewrite `main` repo refs in `text` to `ref`. Exported for the tripwire tests.
 *
 * @param {string} text
 * @param {string} ref  a git ref, e.g. `v1.7.0`
 */
export function pinRepoRefs(text, ref) {
  return text.replace(MAIN_REF_RE, `$1${ref}/`)
}

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

/**
 * Copy the starter cv-content/ to `dest`, pinning its repo links to the
 * running release. Callers guarantee `dest` does not already exist.
 *
 * @param {string} dest  absolute path of the cv-content/ directory to create
 * @param {{ version?: string }} [options]  `version` overrides the running one (tests)
 * @returns {{ dest: string, ref: string, pinned: string[] }}
 *   `ref` is the git ref written into the copies; `pinned` lists the files
 *   actually rewritten (empty when `ref` is `main` — then the copy is verbatim).
 */
export function scaffoldContent(dest, { version = packageVersion() } = {}) {
  cpSync(TEMPLATE_DIR, dest, { recursive: true })
  const ref = schemaRefFor(version)
  /** @type {string[]} */
  const pinned = []
  if (ref === 'main') return { dest, ref, pinned }
  for (const file of walk(dest)) {
    if (!REWRITABLE.has(extname(file))) continue
    const before = readFileSync(file, 'utf8')
    const after = pinRepoRefs(before, ref)
    if (after === before) continue
    writeFileSync(file, after)
    pinned.push(file.slice(dest.length + 1))
  }
  return { dest, ref, pinned }
}
