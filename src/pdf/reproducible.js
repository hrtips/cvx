// ── Reproducible builds ─────────────────────────────────────────────────────
// Honors the reproducible-builds convention: when SOURCE_DATE_EPOCH is set
// (integer seconds since the Unix epoch), PDF output becomes byte-identical
// across runs.
//
// What makes a render nondeterministic, and who handles it, as of
// @react-pdf/renderer 4.9 (which renders through upstream pdfkit 0.21 rather
// than the @react-pdf/pdfkit fork earlier versions used):
//
//   1. CreationDate — @react-pdf/renderer defaults it to `new Date()`, and
//      pdfkit derives the trailer file ID by hashing the info dictionary, so
//      pinning CreationDate pins the file ID too. PINNED HERE.
//   2. Stray Math.random() — pdfkit itself draws none (checked below), but
//      fontkit's CFF charstring interpreter answers the `random` operator with
//      it. Lato is TrueType so that path is cold, and seeding is one line, so
//      the RNG is SEEDED HERE as defence in depth.
//   3. Font subset tags and object write order — handled UPSTREAM. pdfkit 0.21
//      derives each subset tag from the font's id, and compresses every object
//      with zlib.deflateSync. The fork drew six Math.random() letters per tag
//      and raced async createDeflate() streams for file position, which is why
//      this module used to seed the RNG for tags and swap deflate for a
//      synchronous shim. That shim is gone: nothing calls createDeflate now.
//
// Because (3) is an upstream property rather than something this module
// enforces, `verifyPdfkitDeterminism` re-checks it against the installed
// pdfkit and `setupReproducibility` warns loudly if a bump ever undoes it.
//
// See https://reproducible-builds.org/docs/source-date-epoch/
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require_ = createRequire(import.meta.url)

/**
 * Resolve the PDF creation date from the environment.
 *
 * @param {Record<string, string|undefined>} env  typically process.env
 * @returns {Date|undefined}  pinned date, or undefined for "now"
 */
export function resolveCreationDate(env = {}) {
  const raw = env.SOURCE_DATE_EPOCH
  if (raw === undefined || raw === '') return undefined

  const seconds = Number(raw)
  if (!Number.isInteger(seconds) || seconds < 0) {
    console.warn(
      `Ignoring invalid SOURCE_DATE_EPOCH: "${raw}" (expected non-negative integer seconds)`
    )
    return undefined
  }

  return new Date(seconds * 1000)
}

/**
 * Replace Math.random with a deterministic PRNG (mulberry32). Process-global —
 * intended for one-shot export scripts, never the browser preview.
 *
 * @param {number} seed
 */
export function seedMathRandom(seed) {
  let a = seed >>> 0
  Math.random = function mulberry32() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * One-stop setup for export scripts: resolve the pinned date and, when
 * reproducible mode is active, seed the global RNG from it.
 *
 * @param {Record<string, string|undefined>} env  typically process.env
 * @param {{ verify?: () => boolean | null }} [deps]  injectable for tests
 * @returns {{ creationDate: Date|undefined }}
 */
export function setupReproducibility(env = {}, { verify = verifyPdfkitDeterminism } = {}) {
  const creationDate = resolveCreationDate(env)
  if (creationDate) {
    if (verify() === false) {
      console.warn(
        '⚠ SOURCE_DATE_EPOCH is set, but the installed pdfkit no longer has the properties\n' +
          '  this version of cvx relies on for repeatable output — it may NOT be byte-identical\n' +
          '  across runs. Please report this: https://github.com/hrtips/cvx/issues'
      )
    }
    seedMathRandom(creationDate.getTime() / 1000)
  }
  return { creationDate }
}

/**
 * The upstream properties item (3) of the module header rests on, checked
 * against pdfkit's own source text:
 *
 *   - no `createDeflate` — every object is compressed synchronously, so objects
 *     land in finalize order;
 *   - subset tags built from the font id (`this.id.charCodeAt(i)`), not drawn
 *     at random;
 *   - no `Math.random` anywhere in pdfkit.
 *
 * Pure, so each way it can fail is testable without a different pdfkit.
 *
 * @param {string} src  pdfkit's node build, as text
 * @returns {boolean}
 */
export function pdfkitIsDeterministic(src) {
  return (
    !src.includes('createDeflate') &&
    src.includes('this.id.charCodeAt(i)') &&
    !src.includes('Math.random')
  )
}

/**
 * Check the pdfkit that @react-pdf/renderer actually loads: resolved from the
 * renderer's own directory, and the node ESM entry its `exports` map names
 * (that is the build an `import 'pdfkit'` gets in Node).
 *
 * @returns {boolean|null}  true = properties hold, false = internals changed,
 *   null = could not inspect (e.g. an isolated module layout)
 */
export function verifyPdfkitDeterminism() {
  try {
    const rendererDir = dirname(require_.resolve('@react-pdf/renderer'))
    // pdfkit's `exports` map does not expose package.json, so resolve its entry
    // and walk up to the directory that owns it.
    let dir = dirname(require_.resolve('pdfkit', { paths: [rendererDir] }))
    while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir)
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const entry = pkg.exports?.['.']?.node?.import ?? pkg.main
    return pdfkitIsDeterministic(readFileSync(join(dir, entry), 'utf8'))
  } catch {
    return null
  }
}
