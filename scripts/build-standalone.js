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
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
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
const ALIAS = join(root, 'dist', 'cvx.bundle.js')

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else yield full
  }
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

const result = await build({
  entryPoints: [join(root, 'src', 'standalone', 'entry.js')],
  outfile: OUT,
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
// CVX ${pkg.version} — standalone single-file bundle. Generated by
// scripts/build-standalone.js; do not edit. Requires only Node.js >= 20.
import { createRequire as __cvxCreateRequire } from 'node:module'
const require = __cvxCreateRequire(import.meta.url)
`
  },
  plugins: [assetsPlugin, mcpStubPlugin],
  logOverride: { 'require-resolve-not-external': 'silent' },
  metafile: true,
  legalComments: 'none',
  minify: false
})

for (const w of result.warnings) console.warn(`⚠ esbuild: ${w.text}`)

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
// leave a stale cvx.bundle.js sitting there looking current.
copyFileSync(OUT, ALIAS)

const bytes = statSync(OUT).size
writeFileSync(
  join(root, 'dist', 'README.md'),
  `# CVX ${pkg.version} — standalone bundle

One file, no installation. Requires Node.js >= 20 and nothing else: no npm, no
npx, no network, no node_modules.

    node cvx-${pkg.version}.bundle.js --version
    node cvx-${pkg.version}.bundle.js init
    node cvx-${pkg.version}.bundle.js validate --json
    node cvx-${pkg.version}.bundle.js build --json

\`cvx-${pkg.version}.bundle.js\` and \`cvx.bundle.js\` are the same bytes. Keep the
versioned name for anything you store or upload — it is the only thing that
tells you later which release you are running. The unversioned one exists so
that \`releases/latest/download/cvx.bundle.js\` is a stable download URL.

On first run the bundle writes its embedded assets (schema, \`init\` template,
Lato fonts) to a cache directory under the system temp dir; set
\`CVX_STANDALONE_DIR\` to place them elsewhere. Everything else — reading
\`cv-content/\`, writing the PDF — happens in the current working directory.

Not included: the MCP server (\`cvx mcp\`). Use the npm package for that.

Generated by scripts/build-standalone.js. Do not edit.
`
)

const kb = (/** @type {number} */ n) => `${(n / 1024).toFixed(0)} KB`
console.log(`✅ dist/cvx-${pkg.version}.bundle.js  ${kb(bytes)} (${bytes} bytes)
   alias:  dist/cvx.bundle.js (identical — keeps releases/latest/download stable)
   assets: ${Object.keys(raw).length} files, ${fontCount} fonts, ${kb(rawBytes)} raw → ${kb(packedBytes)} embedded
   digest: ${DIGEST}
   runtime deps outside the bundle: none (node builtins only)${
     dynamicRequireShim
       ? '\n   note: a dynamic-require shim is present (some CJS dep calls require(variable));\n         test/standalone.test.js proves no reachable path reaches it'
       : ''
}`)
