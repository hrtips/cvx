/**
 * gpt-endpoints.js
 * Generate the two static files a CVX Custom GPT talks to.
 *
 *   gpt/version.json  — a few hundred bytes: current version, Node floor, the
 *                       stable download URLs. Cheap for a GPT to poll.
 *   gpt/bundle.json    — the bundle itself, base64'd inside an
 *                       `openaiFileResponse` envelope, so a GPT Action DELIVERS
 *                       THE FILE into the conversation where Code Interpreter
 *                       can run it.
 *
 * ## Why this exists, and why it is a static file
 *
 * A Custom GPT's Knowledge attachments can only be changed by hand — there is no
 * ChatGPT API, so no workflow can refresh them. A Knowledge-file design therefore
 * needs manual work on every single release, forever, and goes stale silently in
 * between. The fix is to stop shipping the bundle with the GPT and have the GPT
 * FETCH it: the Action schema and the GPT's instructions then name no version at
 * all, so they never need editing again.
 *
 * That only needs an HTTP endpoint returning the file, and an endpoint returning a
 * fixed body is just a file. So this generates one, GitHub Pages serves it, and
 * there is no service to run, pay for, or keep up.
 *
 * Deliberately NOT a rebuild of the bundle: the caller passes the artifact
 * downloaded from the release, so what the GPT receives is provably the bytes
 * that were published rather than a fresh build that merely should match.
 *
 * Run:  node scripts/gpt-endpoints.js --bundle <file> --version <x.y.z> --out <dir>
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    bundle: { type: 'string' },
    version: { type: 'string' },
    out: { type: 'string' }
  }
})

if (!values.bundle || !values.version || !values.out) {
  console.error('usage: gpt-endpoints.js --bundle <file> --version <x.y.z> --out <dir>')
  process.exit(64)
}

const bundlePath = values.bundle
const version = values.version.replace(/^v/, '')
const outDir = values.out

const bytes = readFileSync(bundlePath)
const name = basename(bundlePath)
const sha256 = createHash('sha256').update(bytes).digest('hex')

/**
 * MIME type by extension. `.zip` is served as application/zip so the receiving
 * side treats it as an archive; the GPT unzips it in one command.
 */
const MIME = name.endsWith('.zip') ? 'application/zip' : 'text/javascript'

const DL = 'https://github.com/hrtips/cvx/releases/latest/download'

mkdirSync(join(outDir, 'gpt'), { recursive: true })

writeFileSync(
  join(outDir, 'gpt', 'version.json'),
  `${JSON.stringify(
    {
      version,
      node: '>=20',
      // What `bundle.json` will hand over, so a GPT can report what it is about
      // to run — and verify it, since the hash is of those exact bytes.
      delivers: { name, mimeType: MIME, bytes: bytes.byteLength, sha256 },
      bundles: {
        plain: `${DL}/cvx.bundle.js`,
        plainZip: `${DL}/cvx.bundle.js.zip`,
        min: `${DL}/cvx.bundle.min.js`,
        minZip: `${DL}/cvx.bundle.min.js.zip`
      },
      checksums: `${DL}/SHA256SUMS.txt`,
      release: 'https://github.com/hrtips/cvx/releases/latest',
      aiGuide: 'https://raw.githubusercontent.com/hrtips/cvx/main/docs/ai-guide.md'
    },
    null,
    2
  )}\n`
)

// The envelope GPT Actions recognise as "these are files, not text to read".
// Files returned this way are materialised for Code Interpreter rather than
// spent as context tokens, which is the only reason a multi-megabyte artifact
// can travel this path at all.
writeFileSync(
  join(outDir, 'gpt', 'bundle.json'),
  `${JSON.stringify({
    openaiFileResponse: [{ name, mime_type: MIME, content: bytes.toString('base64') }]
  })}\n`
)

const mb = (/** @type {number} */ n) => `${(n / 1048576).toFixed(2)} MB`
console.log(`✅ gpt/version.json  (${statSync(join(outDir, 'gpt', 'version.json')).size} bytes)
✅ gpt/bundle.json    ${mb(statSync(join(outDir, 'gpt', 'bundle.json')).size)}  delivering ${name} (${mb(bytes.byteLength)}, ${MIME})
   sha256: ${sha256}`)
