// ── Reproducible builds ─────────────────────────────────────────────────────
// Honors the reproducible-builds convention: when SOURCE_DATE_EPOCH is set
// (integer seconds since the Unix epoch), PDF output becomes byte-identical
// across runs. Two sources of nondeterminism are pinned:
//
//   1. CreationDate — @react-pdf/renderer defaults it to `new Date()`; pdfkit
//      also derives the PDF trailer file ID by hashing the info dictionary,
//      so pinning CreationDate pins the file ID too.
//   2. Font subset tags — @react-pdf/pdfkit names embedded font subsets with
//      six Math.random() letters (e.g. "EEPPPK+Lato"), which also scramble
//      the compressed font streams. Seeding Math.random pins them.
//   3. Object write order — pdfkit compresses each PDF object through an
//      async zlib.createDeflate() stream and writes it whenever that stream
//      happens to finish, so large and small objects race for file position.
//      Swapping in a synchronous deflate (identical bytes — same zlib, same
//      defaults) makes objects land in finalize-call order every time.
//
// See https://reproducible-builds.org/docs/source-date-epoch/
// ────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The real mutable module object — ESM namespace imports of builtins are
// frozen under some loaders (e.g. Vitest), and pdfkit's own `import zlib`
// resolves to this same object in Node, so patching here is visible there.
const require_ = createRequire(import.meta.url)
const zlib = require_('zlib')

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
    console.warn(`Ignoring invalid SOURCE_DATE_EPOCH: "${raw}" (expected non-negative integer seconds)`)
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
 * Replace zlib.createDeflate with a synchronous drop-in. pdfkit only uses the
 * subset of the stream API shimmed here (write/end/on), and deflateSync over
 * the concatenated chunks yields byte-identical output to the streaming form.
 * Process-global — intended for one-shot export scripts.
 */
export function makeDeflateSynchronous() {
  // Node ≥25 marks builtin exports writable:false (configurable:true), so
  // plain assignment is rejected — defineProperty is the supported override.
  Object.defineProperty(zlib, 'createDeflate', {
    configurable: true,
    value: function createDeflateSync() {
      const chunks = []
      const shim = new EventEmitter()
      shim.write = (chunk) => { chunks.push(Buffer.from(chunk)); return true }
      shim.end = (chunk) => {
        if (chunk) chunks.push(Buffer.from(chunk))
        shim.emit('data', zlib.deflateSync(Buffer.concat(chunks)))
        shim.emit('end')
      }
      return shim
    },
  })
}

/**
 * One-stop setup for export scripts: resolve the pinned date and, when
 * reproducible mode is active, seed the global RNG from it and serialise
 * PDF object writes.
 *
 * @param {Record<string, string|undefined>} env  typically process.env
 * @returns {{ creationDate: Date|undefined }}
 */
export function setupReproducibility(env = {}) {
  const creationDate = resolveCreationDate(env)
  if (creationDate) {
    if (verifyPatchPoints() === false) {
      console.warn(
        '⚠ SOURCE_DATE_EPOCH is set, but @react-pdf/pdfkit internals have changed since this\n' +
        '  version of makecv was tested — output may NOT be byte-identical across runs.\n' +
        '  Please report this: https://github.com/ramith/makecv/issues'
      )
    }
    seedMathRandom(creationDate.getTime() / 1000)
    makeDeflateSynchronous()
  }
  return { creationDate }
}

/**
 * Verify the pdfkit internals our patches target still exist. The whole
 * byte-identical guarantee rests on two upstream implementation details:
 * subset tags drawn from Math.random() and per-object zlib.createDeflate()
 * streams. If a dependency bump rewrites either, reproducible mode would
 * silently stop pinning — so we check the bundled source once and warn loudly.
 *
 * @returns {boolean|null}  true = patch points present, false = internals
 *   changed, null = could not inspect (e.g. isolated module layouts)
 */
export function verifyPatchPoints() {
  try {
    let pdfkitPath
    try {
      const rendererDir = dirname(require_.resolve('@react-pdf/renderer'))
      pdfkitPath = require_.resolve('@react-pdf/pdfkit', { paths: [rendererDir] })
    } catch {
      pdfkitPath = require_.resolve('@react-pdf/pdfkit')
    }
    const src = readFileSync(pdfkitPath, 'utf8')
    return src.includes('Math.random() * 26 + 65') && src.includes('zlib.createDeflate()')
  } catch {
    return null
  }
}
