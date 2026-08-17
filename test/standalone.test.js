// The standalone single-file bundle: dist/cvx.bundle.js must run CVX with
// nothing else present — no node_modules, no npm, no network, no package tree.
//
// Every test here copies the bundle ALONE into a fresh temp directory and runs
// it with a scrubbed environment, because that is the only shape of proof that
// matters: "esbuild exited 0" says nothing about whether the artifact works
// where it is meant to be used (a Custom GPT Knowledge file at /mnt/data, in a
// sandbox with a Node runtime and nothing else).
//
// The bundle is built here rather than assumed, so this suite fails on a stale
// or missing dist/ instead of testing yesterday's artifact.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inflateRawSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const BUNDLE = path.join(ROOT, 'dist', 'cvx.bundle.js')
const CLI = path.join(ROOT, 'bin', 'cvx.js')
const TEMPLATE = path.join(ROOT, 'template', 'cv-content')
const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version

/**
 * A deliberately minimal environment: enough for `node` to start, and nothing
 * else. In particular NOT CVX_ASSET_ROOT or CVX_STANDALONE — the bundle must set
 * those up for itself, and inheriting them from the test runner would hide a
 * broken prelude.
 *
 * Windows needs more than PATH+HOME to spawn a process at all: without
 * SystemRoot, Node fails to initialise its own networking/crypto stack, and
 * without TEMP/TMP `os.tmpdir()` falls back to a path the runner cannot write.
 * Scrubbing to nothing on that platform would test the harness, not the bundle.
 */
const SCRUBBED =
  process.platform === 'win32'
    ? {
        PATH: process.env.PATH ?? '',
        SystemRoot: process.env.SystemRoot ?? '',
        COMSPEC: process.env.COMSPEC ?? '',
        PATHEXT: process.env.PATHEXT ?? '',
        TEMP: process.env.TEMP ?? '',
        TMP: process.env.TMP ?? '',
        USERPROFILE: process.env.USERPROFILE ?? ''
      }
    : { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' }

/** Copy the bundle alone into an empty directory with no node_modules above it. */
function isolate(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), `cvx-${prefix}-`))
  cpSync(BUNDLE, path.join(dir, 'cvx.bundle.js'))
  return dir
}

/** @returns {{ code: number, stdout: string, stderr: string }} */
function run(dir, args, { env = {}, nodeArgs = [] } = {}) {
  try {
    const stdout = execFileSync('node', [...nodeArgs, './cvx.bundle.js', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...SCRUBBED, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? ''
    }
  }
}

beforeAll(() => {
  // Build rather than assume, so this suite fails on a stale dist/ instead of
  // testing yesterday's artifact. This also runs the build's own gate: it
  // throws if any non-builtin package is still imported at runtime, per
  // esbuild's metafile.
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-standalone.js')], {
    cwd: ROOT,
    stdio: 'pipe'
  })
  if (!existsSync(BUNDLE)) throw new Error(`build-standalone.js did not produce ${BUNDLE}`)
}, 180_000)

describe('the release artifact set', () => {
  const DIST = path.join(ROOT, 'dist')
  const sha = (/** @type {string} */ p) =>
    createHash('sha256').update(readFileSync(p)).digest('hex')

  it('ships all four variants, each under a versioned and an unversioned name', () => {
    for (const name of [
      `cvx-${VERSION}.bundle.js`,
      `cvx-${VERSION}.bundle.js.zip`,
      `cvx-${VERSION}.bundle.min.js`,
      `cvx-${VERSION}.bundle.min.js.zip`,
      'cvx.bundle.js',
      'cvx.bundle.js.zip',
      'cvx.bundle.min.js',
      'cvx.bundle.min.js.zip',
      'SHA256SUMS.txt'
    ]) {
      expect(existsSync(path.join(DIST, name)), `dist/${name} missing`).toBe(true)
    }
  })

  it('keeps each unversioned .js alias byte-identical to its versioned original', () => {
    // These back releases/latest/download/<name>, which the docs and any Custom
    // GPT Knowledge refresh depend on. If they diverge, that URL silently serves
    // something other than the release it is named after.
    for (const suffix of ['bundle.js', 'bundle.min.js']) {
      expect(sha(path.join(DIST, `cvx-${VERSION}.${suffix}`))).toBe(
        sha(path.join(DIST, `cvx.${suffix}`))
      )
    }
  })

  it('names its version inside every .js variant, not only in the filename', () => {
    // A renamed or re-downloaded copy must still be identifiable, and `--version`
    // requires actually running it — so the banner carries it in plain text, and
    // survives minification.
    for (const name of [`cvx-${VERSION}.bundle.js`, `cvx-${VERSION}.bundle.min.js`]) {
      expect(readFileSync(path.join(DIST, name), 'utf8').slice(0, 400)).toContain(`CVX ${VERSION}`)
    }
  })

  it('checksums every artifact, in a format sha256sum -c accepts', () => {
    const lines = readFileSync(path.join(DIST, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(8)
    for (const line of lines) {
      const [hash, name] = line.split(/\s{2}/)
      expect(hash, `malformed line: ${line}`).toMatch(/^[0-9a-f]{64}$/)
      expect(sha(path.join(DIST, name)), `${name} checksum is wrong`).toBe(hash)
    }
  })

  it('produces zips that a real unzip implementation can read', () => {
    // The ZIP writer in scripts/build-standalone.js is hand-rolled. Its own
    // round-trip check shares a parser with the writer, so it cannot catch a
    // misunderstanding of the format — this reads the archives back with Node's
    // zlib via an independent header walk, and asserts the entry name too,
    // because cvx.bundle.js.zip extracting to a differently-named file would
    // break every documented command.
    for (const base of [
      `cvx-${VERSION}.bundle.js`,
      `cvx-${VERSION}.bundle.min.js`,
      'cvx.bundle.js',
      'cvx.bundle.min.js'
    ]) {
      const archive = readFileSync(path.join(DIST, `${base}.zip`))
      expect(archive.readUInt32LE(0), `${base}.zip has no local file header`).toBe(0x04034b50)
      const nameLen = archive.readUInt16LE(26)
      const start = 30 + nameLen + archive.readUInt16LE(28)
      expect(archive.subarray(30, 30 + nameLen).toString('utf8')).toBe(base)
      const inflated = inflateRawSync(archive.subarray(start, start + archive.readUInt32LE(18)))
      expect(inflated.equals(readFileSync(path.join(DIST, base)))).toBe(true)
    }
  })
})

describe('the minified variant', () => {
  it('renders a byte-identical PDF to the plain one', () => {
    // Minification must be a size change and nothing else. Both are compared
    // against the same pinned epoch so CreationDate, subset tags and object
    // write order are fixed (src/pdf/reproducible.js).
    const epoch = { SOURCE_DATE_EPOCH: '1700000000' }
    const outputs = [`cvx-${VERSION}.bundle.js`, `cvx-${VERSION}.bundle.min.js`].map((name) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'cvx-min-'))
      cpSync(path.join(ROOT, 'dist', name), path.join(dir, name))
      const exec = (/** @type {string[]} */ args) =>
        execFileSync('node', [`./${name}`, ...args], {
          cwd: dir,
          encoding: 'utf8',
          env: { ...SCRUBBED, ...epoch }
        })
      exec(['init'])
      const built = JSON.parse(exec(['build', '--json']))
      return { dir, built }
    })

    for (const { built } of outputs) expect(built.ok).toBe(true)
    const [plain, min] = outputs.map(({ dir, built }) =>
      createHash('sha256')
        .update(readFileSync(path.join(dir, built.filename)))
        .digest('hex')
    )
    expect(min).toBe(plain)
  }, 180_000)
})

describe('standalone bundle — runs from an empty directory', () => {
  it('reports its version with no package.json on disk', () => {
    const dir = isolate('version')
    const { code, stdout } = run(dir, ['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toBe(VERSION)
  })

  it('scaffolds, validates and builds a PDF end to end', () => {
    const dir = isolate('e2e')

    const init = run(dir, ['init', '--json'])
    expect(init.code).toBe(0)
    expect(JSON.parse(init.stdout)).toMatchObject({ command: 'init', ok: true })

    const valid = run(dir, ['validate', '--json'])
    expect(valid.code).toBe(0)
    const validated = JSON.parse(valid.stdout)
    expect(validated.ok).toBe(true)
    expect(validated.errors).toEqual([])
    // The schema came out of the bundle, so this proves it was embedded and
    // found — an unreadable schema would fail the run, not pass it vacuously.
    expect(validated.checked.length).toBeGreaterThan(5)

    const built = run(dir, ['build', '--json'])
    expect(built.code).toBe(0)
    const result = JSON.parse(built.stdout)
    expect(result).toMatchObject({ command: 'build', ok: true, theme: 'teal' })
    expect(result.diagnostics.totalPages).toBeGreaterThan(0)

    const pdf = readFileSync(path.join(dir, result.filename))
    expect(pdf.byteLength).toBe(result.bytes)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  }, 120_000)

  it('renders byte-identically to the npm entry point', () => {
    // The strongest available proof that the bundle executes the real CVX and
    // not a reimplementation: same fonts, same layout engine, same PDF bytes.
    // SOURCE_DATE_EPOCH pins CreationDate, the subset tags and the object
    // write order (see src/pdf/reproducible.js).
    const epoch = { SOURCE_DATE_EPOCH: '1700000000' }

    const viaBundle = isolate('repro-bundle')
    run(viaBundle, ['init'], { env: epoch })
    const b = JSON.parse(run(viaBundle, ['build', '--json'], { env: epoch }).stdout)

    const viaNpm = mkdtempSync(path.join(tmpdir(), 'cvx-repro-npm-'))
    cpSync(TEMPLATE, path.join(viaNpm, 'cv-content'), { recursive: true })
    const npmOut = execFileSync('node', [CLI, 'build', '--json'], {
      cwd: viaNpm,
      encoding: 'utf8',
      env: { ...SCRUBBED, ...epoch }
    })
    const n = JSON.parse(npmOut)

    const sha = (/** @type {string} */ p) =>
      createHash('sha256').update(readFileSync(p)).digest('hex')
    expect(b.filename).toBe(n.filename)
    expect(sha(path.join(viaBundle, b.filename))).toBe(sha(path.join(viaNpm, n.filename)))
  }, 180_000)

  it('builds both variants, which re-invokes the bundle as a child process', () => {
    // buildAll() spawns `process.execPath <this file> build --ats`, so this
    // covers the bundle finding ITSELF through import.meta.url, and the child
    // inheriting CVX_ASSET_ROOT instead of re-extracting the assets.
    const dir = isolate('all')
    run(dir, ['init'])
    const { code, stdout } = run(dir, ['build', '--all', '--json'])
    expect(code).toBe(0)
    const result = JSON.parse(stdout)
    expect(result).toMatchObject({ command: 'build', all: true, ok: true })
    expect(result.outputs).toHaveLength(2)
    for (const out of result.outputs) {
      expect(readFileSync(path.join(dir, out.filename)).subarray(0, 5).toString()).toBe('%PDF-')
    }
  }, 180_000)

  it('lists every shipped theme without scanning the filesystem', () => {
    const dir = isolate('list')
    const { code, stdout } = run(dir, ['list', 'themes', '--json'])
    expect(code).toBe(0)
    expect(
      JSON.parse(stdout)
        .themes.map((t) => t.name)
        .sort()
    ).toEqual(['coral', 'mono', 'teal'])
  })

  it('never imports a .js file sitting next to the bundle', () => {
    // In the npm package, theme auto-discovery scans a package-owned directory.
    // A bundle's directory belongs to the USER, so the same scan would execute
    // arbitrary sibling code; src/pdf/themes/index.js skips it when
    // CVX_STANDALONE is set. This test is that guarantee's tripwire.
    const dir = isolate('sibling')
    writeFileSync(
      path.join(dir, 'rogue.js'),
      'console.error("ROGUE-SIBLING-EXECUTED")\nexport const evil = { name: "pwned" }\n'
    )
    const { code, stdout, stderr } = run(dir, ['list', 'themes', '--json'])
    expect(code).toBe(0)
    expect(stderr).not.toContain('ROGUE-SIBLING-EXECUTED')
    expect(stdout).not.toContain('pwned')
  })

  it('refuses the MCP server with an actionable message, not a crash', () => {
    const dir = isolate('mcp')
    const { code, stdout } = run(dir, ['mcp', '--json'])
    expect(code).toBe(64)
    const result = JSON.parse(stdout)
    expect(result.ok).toBe(false)
    expect(result.error.message).toMatch(/npx @hrtips\/cvx mcp/)
  })
})

describe('standalone bundle — no runtime network access', () => {
  it('builds a PDF with every outbound network primitive rigged to throw', () => {
    // Stronger than "it worked on a machine that happened to be offline": DNS
    // lookups, socket connects, http requests and non-data: fetches all become
    // hard failures, and the build must still succeed. A cached-dependency
    // false pass is impossible because there is nothing to cache — the bundle
    // is the only file in the directory.
    //
    // `fetch` is allowed for `data:` URLs and ONLY those: @react-pdf/yoga loads
    // its WebAssembly module through fetch on a base64 data: URI embedded in
    // the bundle, which undici serves in-process without touching the network.
    // Banning fetch outright would fail a build that never leaves the process;
    // banning every other scheme is the property actually worth asserting.
    const dir = isolate('nonet')
    const guard = path.join(dir, 'no-network.mjs')
    writeFileSync(
      guard,
      `import dns from 'node:dns'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'

const MARKER = 'NETWORK ACCESS ATTEMPTED: '
const boom = (what) => () => {
  throw new Error(MARKER + what)
}

const realFetch = globalThis.fetch
globalThis.fetch = (resource, ...rest) => {
  const url = typeof resource === 'string' ? resource : (resource?.url ?? String(resource))
  if (!/^data:/i.test(url)) throw new Error(MARKER + 'fetch ' + url.slice(0, 80))
  return realFetch(resource, ...rest)
}

dns.lookup = boom('dns.lookup')
dns.resolve = boom('dns.resolve')
dns.promises.lookup = boom('dns.promises.lookup')
net.connect = boom('net.connect')
net.createConnection = boom('net.createConnection')
net.Socket.prototype.connect = boom('net.Socket#connect')
tls.connect = boom('tls.connect')
http.request = boom('http.request')
http.get = boom('http.get')
https.request = boom('https.request')
https.get = boom('https.get')
`
    )

    run(dir, ['init'])
    const { code, stdout, stderr } = run(dir, ['build', '--json'], {
      // pathToFileURL, not `file://${guard}`: a Windows path (C:\…) produces a
      // malformed URL that --import rejects.
      nodeArgs: ['--import', pathToFileURL(guard).href]
    })
    // Under --json a thrown error becomes an envelope on STDOUT, so check both
    // streams — asserting on stderr alone would pass while the build failed.
    expect(`${stdout}${stderr}`).not.toContain('NETWORK ACCESS ATTEMPTED')
    expect(code).toBe(0)
    const result = JSON.parse(stdout)
    expect(result.ok).toBe(true)
    expect(readFileSync(path.join(dir, result.filename)).subarray(0, 5).toString()).toBe('%PDF-')
  }, 120_000)
})
