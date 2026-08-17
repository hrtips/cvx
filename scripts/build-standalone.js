/**
 * build-standalone.js
 * Bundle CVX into ONE self-contained file: dist/cvx.bundle.js
 *
 * The target is a restricted sandbox — an OpenAI Custom GPT's Knowledge file
 * landing at /mnt/data — where there is a Node runtime and nothing else: no
 * npm, no npx, no registry, no DNS. So the bundle must carry every JavaScript
 * dependency AND every non-JavaScript asset, and must run from an empty
 * directory with no node_modules anywhere above it.
 *
 * This is an ADDITIONAL distribution format. The npm package is untouched:
 * dist/ is not in package.json "files", and the four source edits this build
 * relies on (CVX_ASSET_ROOT / CVX_STANDALONE) are no-ops when those env vars
 * are unset, which is always the case in a normal install.
 *
 * Run:  npm run build:standalone      (runs build:lib first — bin/cvx.js
 *                                      imports lib/, the transform of src/)
 *
 * Three things need handling, and each is a real constraint rather than a
 * bundler flag:
 *
 *   1. Assets. The schema is readFileSync'd, the `init` template is cpSync'd,
 *      and the Lato TTFs are opened BY PATH by both fontkit and @react-pdf.
 *      They are embedded here (gzip + base64) and written back out at startup
 *      by src/standalone/runtime.js. See that file for why paths, not buffers.
 *   2. The version read. bin/cvx.js reads package.json at module load, so a
 *      trimmed package.json is one of the embedded assets — which keeps ONE
 *      code path for version lookup instead of a bundle-only special case.
 *   3. The MCP server. bin/cvx.js reaches it through a lazy
 *      `await import('../lib/mcp/server.js')`, and esbuild inlines that,
 *      turning @modelcontextprotocol/sdk's static imports into top-level
 *      imports of the bundle — which pulls in ~21 MB (zod, hono, @noble/*)
 *      to serve a command that is useless in this sandbox anyway (an MCP
 *      client would have to spawn it over stdio). It is replaced with a stub
 *      that fails with an actionable message.
 */

import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync, gzipSync, inflateRawSync } from 'node:zlib'
import { build } from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * TWO names for one artifact, byte-identical, and both are needed.
 *
 * `cvx-<version>.bundle.js` is the one a human keeps. A loose file gets
 * downloaded, uploaded, parked in a Downloads folder and wired into a Custom
 * GPT's Knowledge — and at that point the filename is the only thing telling
 * anyone which release is loaded. `cvx.bundle.js` and `cvx.bundle (1).js` are
 * unidentifiable, and a stale one looks exactly like a fresh one. (The version
 * is inside the file too — the banner, and `--version` — but neither helps
 * while you are choosing which file to upload.)
 *
 * `cvx.bundle.js` is the unversioned alias, and it buys exactly one thing:
 * `releases/latest/download/cvx.bundle.js` as a stable direct-download URL.
 * GitHub resolves that path by EXACT asset name — there is no
 * latest-asset-by-pattern redirect — so a versioned-only release has no stable
 * URL at all, only a page a human must read. The docs and any Knowledge-file
 * refresh need the URL, so the duplicate is the price: ~5 MB of release
 * storage, which is free and never cloned.
 */
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const OUT = join(root, 'dist', `cvx-${pkg.version}.bundle.js`)
const OUT_MIN = join(root, 'dist', `cvx-${pkg.version}.bundle.min.js`)
const ALIAS = join(root, 'dist', 'cvx.bundle.js')
const ALIAS_MIN = join(root, 'dist', 'cvx.bundle.min.js')

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
}

/** CRC-32 (IEEE), the one checksum a ZIP entry cannot do without. */
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(/** @type {Buffer} */ buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * A single-entry ZIP, written by hand.
 *
 * Deliberately not the `zip` binary and not a new dependency: this script runs
 * inside `npm test`, and the CI matrix includes a Windows leg where `zip` does
 * not exist. A one-file archive is three fixed-layout structures plus a CRC,
 * which is less risk than either alternative.
 *
 * Timestamps are pinned to the ZIP epoch (1980-01-01) rather than "now", so
 * rebuilding the same bundle produces the same archive byte for byte.
 *
 * @param {string} name  entry name as stored in the archive
 * @param {Buffer} data  uncompressed contents
 * @returns {Buffer} the complete archive
 */
function zipOneFile(name, data) {
  const nameBuf = Buffer.from(name, 'utf8')
  const deflated = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)
  const DOS_EPOCH_TIME = 0
  const DOS_EPOCH_DATE = 0x0021 // 1980-01-01

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0) // local file header signature
  local.writeUInt16LE(20, 4) // version needed to extract (2.0 = deflate)
  local.writeUInt16LE(0, 6) // general purpose flags
  local.writeUInt16LE(8, 8) // compression method: deflate
  local.writeUInt16LE(DOS_EPOCH_TIME, 10)
  local.writeUInt16LE(DOS_EPOCH_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(deflated.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28) // extra field length

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0) // central directory header signature
  central.writeUInt16LE(20, 4) // version made by
  central.writeUInt16LE(20, 6) // version needed
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(DOS_EPOCH_TIME, 12)
  central.writeUInt16LE(DOS_EPOCH_DATE, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(deflated.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30) // extra
  central.writeUInt16LE(0, 32) // comment
  central.writeUInt16LE(0, 34) // disk number start
  central.writeUInt16LE(0, 36) // internal attributes
  central.writeUInt32LE(0, 38) // external attributes
  central.writeUInt32LE(0, 42) // offset of local header

  const centralSize = central.length + nameBuf.length
  const centralOffset = local.length + nameBuf.length + deflated.length

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  end.writeUInt16LE(0, 4) // this disk
  end.writeUInt16LE(0, 6) // disk with central directory
  end.writeUInt16LE(1, 8) // entries on this disk
  end.writeUInt16LE(1, 10) // total entries
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(centralOffset, 16)
  end.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([local, nameBuf, deflated, central, nameBuf, end])
}

// ── 1. Collect the assets ────────────────────────────────────────────────────
// Keys are paths RELATIVE TO THE ASSET ROOT, and must match what the code
// expects to find under pkgRoot: bin/cvx.js wants lib/fonts/, scaffold.js
// wants template/cv-content/, validateContent.js wants schema/v1/.

/** @type {Record<string, Buffer>} */
const raw = {}

// Trimmed on purpose: only `.version` is ever read (bin/cvx.js, scaffold.js's
// packageVersion), and a redistributed artifact has no business carrying this
// project's devDependency list.
raw['package.json'] = Buffer.from(
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      license: pkg.license,
      _comment: 'Trimmed metadata embedded in cvx.bundle.js — see scripts/build-standalone.js'
    },
    null,
    2
  )}\n`
)

for (const [srcDir, prefix] of [
  [join(root, 'schema'), 'schema'],
  [join(root, 'template'), 'template'],
  [join(root, 'lib', 'fonts'), join('lib', 'fonts')]
]) {
  for (const file of walk(srcDir)) {
    raw[join(prefix, relative(srcDir, file)).split(sep).join('/')] = readFileSync(file)
  }
}

const fontCount = Object.keys(raw).filter((k) => k.endsWith('.ttf')).length
if (fontCount === 0) {
  throw new Error('no fonts found under lib/fonts — run `npm run build:lib` first')
}

// Content-addressed so the extraction directory changes whenever an asset
// does, which makes a stale cache impossible rather than merely unlikely.
const digest = createHash('sha256')
for (const key of Object.keys(raw).sort()) {
  digest.update(key).update(raw[key])
}
const DIGEST = digest.digest('hex').slice(0, 12)

/** @type {Record<string, string>} */
const packed = {}
for (const [key, buf] of Object.entries(raw)) {
  packed[key] = gzipSync(buf, { level: 9 }).toString('base64')
}

const rawBytes = Object.values(raw).reduce((n, b) => n + b.byteLength, 0)
const packedBytes = Object.values(packed).reduce((n, s) => n + s.length, 0)

// ── 2. Bundle ────────────────────────────────────────────────────────────────

/** Supplies the embedded-asset data as a virtual module: data only, no logic. */
const assetsPlugin = {
  name: 'cvx-assets',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onResolve({ filter: /^cvx:assets$/ }, (args) => ({
      path: args.path,
      namespace: 'cvx-assets'
    }))
    b.onLoad({ filter: /.*/, namespace: 'cvx-assets' }, () => ({
      contents: `export const VERSION = ${JSON.stringify(pkg.version)}
export const DIGEST = ${JSON.stringify(DIGEST)}
export const FILES = ${JSON.stringify(packed)}
`,
      loader: 'js'
    }))
  }
}

/** Replaces the MCP server with a stub — see header note 3. */
const mcpStubPlugin = {
  name: 'cvx-mcp-stub',
  /** @param {import('esbuild').PluginBuild} b */
  setup(b) {
    b.onResolve({ filter: /(^|\/)lib\/mcp\/server\.js$/ }, () => ({
      path: 'cvx:mcp-stub',
      namespace: 'cvx-mcp-stub'
    }))
    b.onLoad({ filter: /.*/, namespace: 'cvx-mcp-stub' }, () => ({
      contents: `export async function runMcpServer() {
  throw new Error(
    'the standalone bundle does not include the MCP server (it would add ~21 MB ' +
      'for a stdio server this environment cannot connect to). Install the npm ' +
      'package instead: npx @hrtips/cvx mcp'
  )
}
`,
      loader: 'js'
    }))
  }
}

rmSync(join(root, 'dist'), { recursive: true, force: true })
mkdirSync(join(root, 'dist'), { recursive: true })

/**
 * Both variants are built every time, because they answer different questions.
 *
 * The readable one is the default and what the docs point at: this bundle runs
 * where nothing can be installed, which is also where a stack trace is the only
 * debugging tool anyone has — two investigations during its development (a
 * `fetch` on a `data:` URL from @react-pdf/yoga, and a `url.parse` deprecation
 * from @react-pdf/image) were solved by reading frames that named real
 * functions.
 *
 * The minified one exists for uploads that take the raw file rather than the
 * zip — a Custom GPT Knowledge entry, for instance. It halves the raw size
 * (5.3 MB → 2.6 MB) but saves only ~16% once zipped, because the embedded
 * gzipped assets cannot compress twice. Measured, not assumed; see the size
 * table this script prints.
 *
 * @param {boolean} minify
 * @param {string} outfile
 */
async function bundleTo(minify, outfile) {
  const result = await build({
    entryPoints: [join(root, 'src', 'standalone', 'entry.js')],
    outfile,
    bundle: true,
    platform: 'node',
    // Node 20, matching package.json "engines", NOT the newest runtime that
    // happens to be handy: the bundle is the same product as the npm package and
    // must not have a higher floor than it. esbuild fails the build if a
    // dependency uses syntax it cannot lower to this target, which is what makes
    // the documented "Node 20+" a checked claim rather than a hope.
    target: 'node20',
    format: 'esm',
    // Some transitive dependencies are CommonJS and reach for `require` at
    // runtime; in an ESM output that identifier does not exist, and esbuild's
    // shim throws "Dynamic require of X is not supported". Providing a real one
    // built from import.meta.url makes those resolve against the bundle.
    banner: {
      js: `#!/usr/bin/env node
// CVX ${pkg.version} — standalone single-file bundle${minify ? ' (minified)' : ''}. Generated by
// scripts/build-standalone.js; do not edit. Requires only Node.js >= 20.
import { createRequire as __cvxCreateRequire } from 'node:module'
const require = __cvxCreateRequire(import.meta.url)
`
    },
    plugins: [assetsPlugin, mcpStubPlugin],
    logOverride: { 'require-resolve-not-external': 'silent' },
    metafile: true,
    legalComments: 'none',
    // esbuild never touches the banner, so even a minified copy names its
    // version on line 2 without being run.
    minify
  })
  for (const w of result.warnings) console.warn(`⚠ esbuild: ${w.text}`)
  return result
}

const result = await bundleTo(false, OUT)
await bundleTo(true, OUT_MIN)

// ── 3. Verify no runtime dependency escaped the bundle ───────────────────────
// "It bundled" is not the bar. Anything still imported by bare specifier at
// runtime would fail in the sandbox, where there is no node_modules to find it
// in — so fail the build here rather than discovering it at the user's end.

// Read from esbuild's metafile, NOT by grepping the output. A textual scan
// cannot tell a call from a string that looks like one, and this bundle
// contains both: ajv ships `equal.code = 'require("ajv/dist/runtime/equal")'`
// as data for its standalone-codegen feature (never evaluated here), and a
// surviving JSDoc comment mentions `import('@react-pdf/types')`. Both are
// inert; the metafile's `external` flag is the ground truth.
const { builtinModules } = await import('node:module')
const BUILTIN = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]))

/** @type {Map<string, Set<string>>} specifier → import kinds */
const escaped = new Map()
for (const input of Object.values(result.metafile.inputs)) {
  for (const imp of input.imports ?? []) {
    if (!imp.external || BUILTIN.has(imp.path)) continue
    if (!escaped.has(imp.path)) escaped.set(imp.path, new Set())
    escaped.get(imp.path)?.add(imp.kind)
  }
}
if (escaped.size > 0) {
  const lines = [...escaped].map(([spec, kinds]) => `${spec}  [${[...kinds].join(', ')}]`).sort()
  throw new Error(
    `bundle still imports ${escaped.size} package(s) at runtime — they would be missing in a ` +
      `sandbox with no node_modules:\n  ${lines.join('\n  ')}`
  )
}

// esbuild emits this shim only when a CommonJS dependency calls require() with
// a non-literal argument, which it cannot resolve at build time and which then
// throws at runtime. Report it: the smoke tests below decide whether any
// reachable code path actually hits it.
const dynamicRequireShim = readFileSync(OUT, 'utf8').includes('Dynamic require of ')

// Written only after every check above has passed, so a failed build cannot
// leave stale aliases sitting there looking current.
copyFileSync(OUT, ALIAS)
copyFileSync(OUT_MIN, ALIAS_MIN)

// ── 4. Zip every variant ─────────────────────────────────────────────────────
// Pure Node, no `zip` binary: this script runs in `npm test`, and the CI matrix
// includes a Windows leg where that binary does not exist. A single-entry ZIP is
// three structures and a checksum, which is less risk than a new dependency or a
// platform-specific shell-out.
for (const file of [OUT, ALIAS, OUT_MIN, ALIAS_MIN]) {
  writeFileSync(`${file}.zip`, zipOneFile(basename(file), readFileSync(file)))
}

// ── 5. Checksums for every artifact ──────────────────────────────────────────
// Generated here rather than by `sha256sum` in the release workflow, so the
// exact same file is produced locally and in CI — and so a Windows leg running
// this script does not need a coreutils shim. Format is coreutils-compatible
// ("<hash>  <name>"), so `sha256sum -c` / `shasum -a 256 -c` verify it directly.
const ARTIFACTS = [
  OUT,
  `${OUT}.zip`,
  OUT_MIN,
  `${OUT_MIN}.zip`,
  ALIAS,
  `${ALIAS}.zip`,
  ALIAS_MIN,
  `${ALIAS_MIN}.zip`
]
const sums = ARTIFACTS.map(
  (f) => `${createHash('sha256').update(readFileSync(f)).digest('hex')}  ${basename(f)}`
)
writeFileSync(join(root, 'dist', 'SHA256SUMS.txt'), `${sums.join('\n')}\n`)

// A versioned artifact and its unversioned alias must be the same bytes: the
// stable URL would otherwise be able to serve something other than the release
// it is named after. Checked by hash rather than trusted from the copy above.
//
// The .zip pairs are deliberately NOT byte-identical — each stores its own
// filename as the entry name, so cvx.bundle.js.zip extracts to cvx.bundle.js
// and the versioned zip to the versioned name, which is what anyone unzipping
// either one expects. They are verified by round-trip below instead.
for (const [a, b] of [
  [OUT, ALIAS],
  [OUT_MIN, ALIAS_MIN]
]) {
  const [ha, hb] = [a, b].map((f) => createHash('sha256').update(readFileSync(f)).digest('hex'))
  if (ha !== hb) throw new Error(`alias mismatch: ${basename(a)} != ${basename(b)}`)
}

// Every zip must decompress to exactly the file it was made from. The ZIP
// writer above is hand-rolled, so this is not ceremony: a wrong offset or a
// miscomputed CRC would otherwise ship an archive that only fails on the
// user's machine, in the sandbox where they have no way to fix it.
for (const source of [OUT, ALIAS, OUT_MIN, ALIAS_MIN]) {
  const archive = readFileSync(`${source}.zip`)
  const nameLen = archive.readUInt16LE(26)
  const extraLen = archive.readUInt16LE(28)
  const storedName = archive.subarray(30, 30 + nameLen).toString('utf8')
  const dataStart = 30 + nameLen + extraLen
  const compressed = archive.subarray(dataStart, dataStart + archive.readUInt32LE(18))
  const expected = readFileSync(source)
  if (storedName !== basename(source)) {
    throw new Error(`${basename(source)}.zip stores the wrong entry name: ${storedName}`)
  }
  if (!inflateRawSync(compressed).equals(expected)) {
    throw new Error(`${basename(source)}.zip does not round-trip to its source`)
  }
}

const bytes = statSync(OUT).size
const minBytes = statSync(OUT_MIN).size
writeFileSync(
  join(root, 'dist', 'README.md'),
  `# CVX ${pkg.version} — standalone bundle

One file, no installation. Requires Node.js >= 20 and nothing else: no npm, no
npx, no network, no node_modules.

    node cvx-${pkg.version}.bundle.js --version
    node cvx-${pkg.version}.bundle.js init
    node cvx-${pkg.version}.bundle.js validate --json
    node cvx-${pkg.version}.bundle.js build --json

## Which file to take

|                                    | raw | zipped |
|------------------------------------|-----|--------|
| \`cvx-${pkg.version}.bundle.js\`         | ${(bytes / 1048576).toFixed(2)} MB | ${(statSync(`${OUT}.zip`).size / 1048576).toFixed(2)} MB |
| \`cvx-${pkg.version}.bundle.min.js\`     | ${(minBytes / 1048576).toFixed(2)} MB | ${(statSync(`${OUT_MIN}.zip`).size / 1048576).toFixed(2)} MB |

Take the **plain** build unless size is the binding constraint: it is the one the
docs describe, and it keeps readable stack traces — which matter most in exactly
the offline sandboxes this bundle exists for, where a trace is the only debugging
tool available. Take the **\`.min.js\`** when something wants the raw file rather
than a zip and 5 MB is too much (a Custom GPT Knowledge entry, say). Both render
byte-identical PDFs; minifying changes nothing about output.

Zipping helps far more than minifying (~5x vs ~2x) — and once zipped, minifying
adds only ~16%, because the fonts, schema and template are already stored inside
the file as gzipped base64 and cannot compress twice.

Every variant also exists under an unversioned name (\`cvx.bundle.js\`,
\`cvx.bundle.min.js\`, and their \`.zip\`s) with identical bytes, so that
\`releases/latest/download/<name>\` is a stable URL. Keep the VERSIONED name for
anything you store or upload: it is the only thing that says which release a
loose file is.

\`SHA256SUMS.txt\` covers all eight. Verify a download with:

    shasum -a 256 -c SHA256SUMS.txt --ignore-missing   # or sha256sum -c

It detects a corrupt or truncated download, not tampering — anyone able to
replace an asset could replace the sums. The stronger signal is npm's
\`--provenance\` attestation on the package itself.

## Runtime notes

On first run the bundle writes its embedded assets (schema, \`init\` template,
Lato fonts) to a cache directory under the system temp dir; set
\`CVX_STANDALONE_DIR\` to place them elsewhere. Everything else — reading
\`cv-content/\`, writing the PDF — happens in the current working directory.

Not included: the MCP server (\`cvx mcp\`). Use the npm package for that.

Generated by scripts/build-standalone.js. Do not edit.
`
)

const mb = (/** @type {number} */ n) => `${(n / 1048576).toFixed(2)} MB`
console.log(`✅ dist/ — 4 artifacts, each also under an unversioned alias (8 files + SHA256SUMS.txt)

   ${`cvx-${pkg.version}.bundle.js`.padEnd(30)} ${mb(bytes).padStart(8)}   → .zip ${mb(statSync(`${OUT}.zip`).size).padStart(8)}
   ${`cvx-${pkg.version}.bundle.min.js`.padEnd(30)} ${mb(minBytes).padStart(8)}   → .zip ${mb(statSync(`${OUT_MIN}.zip`).size).padStart(8)}

   embedded assets: ${Object.keys(raw).length} files, ${fontCount} fonts, ${kbOf(rawBytes)} raw → ${kbOf(packedBytes)} packed
   asset digest:    ${DIGEST}
   runtime deps outside the bundle: none (node builtins only)${
     dynamicRequireShim
       ? '\n   note: a dynamic-require shim is present (some CJS dep calls require(variable));\n         test/standalone.test.js proves no reachable path reaches it'
       : ''
}`)

function kbOf(/** @type {number} */ n) {
  return `${(n / 1024).toFixed(0)} KB`
}
