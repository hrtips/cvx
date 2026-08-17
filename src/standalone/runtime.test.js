// Asset extraction for the standalone bundle. test/standalone.test.js proves
// the happy path end to end (build the bundle, render a PDF from it in an empty
// directory); what it can never reach is a SECOND run against an existing cache
// — and that is where the interesting failures live: serving a stale tree after
// an upgrade, or trusting a half-written one after an interrupted run.
//
// `cvx:assets` is aliased to test/fixtures/standaloneAssets.js (see
// vitest.config.js), so the data here is fake and the logic is real.

import { DIGEST, FILES } from 'cvx:assets'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { materializeAssets } from './runtime.js'

const STAMP = '.cvx-assets-complete'

/** @type {string | undefined} */
let previousDir
let scratch = ''

beforeEach(() => {
  previousDir = process.env.CVX_STANDALONE_DIR
  scratch = mkdtempSync(join(tmpdir(), 'cvx-runtime-test-'))
  process.env.CVX_STANDALONE_DIR = join(scratch, 'assets')
})

afterEach(() => {
  if (previousDir === undefined) delete process.env.CVX_STANDALONE_DIR
  else process.env.CVX_STANDALONE_DIR = previousDir
  vi.doUnmock('node:fs')
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('materializeAssets', () => {
  it('writes every embedded asset, decompressed, at its declared path', () => {
    const dir = materializeAssets()
    expect(dir).toBe(process.env.CVX_STANDALONE_DIR)
    for (const rel of Object.keys(FILES)) expect(existsSync(join(dir, rel))).toBe(true)
    // Decompressed, not left as base64 — the whole point of the exercise.
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name).toBe('@hrtips/cvx')
    expect(readFileSync(join(dir, STAMP), 'utf8')).toBe(DIGEST)
  })

  it('reuses an existing tree when the stamp records this digest', () => {
    const dir = materializeAssets()
    // A rewrite replaces the directory wholesale, so a file only this test knows
    // about surviving is proof the second call did nothing.
    writeFileSync(join(dir, 'sentinel'), 'kept')
    expect(materializeAssets()).toBe(dir)
    expect(existsSync(join(dir, 'sentinel'))).toBe(true)
  })

  it('rewrites when the stamp records a different digest', () => {
    // The upgrade case. A cache keyed only on the path would serve the previous
    // release's schema and fonts forever; the digest is what prevents that.
    const dir = materializeAssets()
    writeFileSync(join(dir, 'sentinel'), 'stale')
    writeFileSync(join(dir, STAMP), 'some-older-digest')

    expect(materializeAssets()).toBe(dir)
    expect(existsSync(join(dir, 'sentinel'))).toBe(false)
    expect(readFileSync(join(dir, STAMP), 'utf8')).toBe(DIGEST)
  })

  it('rewrites when the stamp is missing entirely', () => {
    // An interrupted first run: files present, stamp never written. Trusting
    // the directory's existence alone would ship a partial asset tree.
    const dir = /** @type {string} */ (process.env.CVX_STANDALONE_DIR)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'half-written'), 'x')

    materializeAssets()
    expect(existsSync(join(dir, 'half-written'))).toBe(false)
    expect(readFileSync(join(dir, STAMP), 'utf8')).toBe(DIGEST)
  })

  /**
   * Re-import runtime.js with a failing `renameSync`. It has to be doMock and
   * not spyOn: node:fs is an ESM namespace, so its exports are non-configurable
   * and cannot be redefined in place.
   *
   * @param {(dir: string) => never} onRename
   */
  async function withFailingRename(onRename) {
    const actual = /** @type {typeof import('node:fs')} */ (await vi.importActual('node:fs'))
    vi.doMock('node:fs', () => ({
      ...actual,
      default: actual,
      renameSync: () => onRename(/** @type {string} */ (process.env.CVX_STANDALONE_DIR))
    }))
    vi.resetModules()
    return (await import('./runtime.js')).materializeAssets
  }

  it('accepts another process winning the race to populate the directory', async () => {
    // Two builds starting at once: both extract to their own pid-suffixed
    // staging dir, one renames first. The loser must accept the winner's tree
    // (content-identical — same digest) rather than failing the build.
    const materialize = await withFailingRename((dir) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, STAMP), DIGEST)
      throw Object.assign(new Error('ENOTEMPTY: directory not empty'), { code: 'ENOTEMPTY' })
    })

    const dir = /** @type {string} */ (process.env.CVX_STANDALONE_DIR)
    expect(materialize()).toBe(dir)
    expect(readFileSync(join(dir, STAMP), 'utf8')).toBe(DIGEST)
  })

  it('fails loudly when the rename fails and no usable tree appeared', async () => {
    // The genuinely broken case — a full disk, a permissions problem. Silently
    // returning a path with nothing at it would surface later as a confusing
    // "schema not found" from deep inside validate.
    const materialize = await withFailingRename(() => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    })
    expect(() => materialize()).toThrow(/could not populate asset root/)
  })
})

describe('module side effects', () => {
  it('marks the process as standalone and points the asset root at the cache', () => {
    // Importing this module IS the prelude — src/standalone/entry.js relies on
    // exactly these two assignments happening before bin/cvx.js is evaluated.
    expect(process.env.CVX_STANDALONE).toBe('1')
    expect(process.env.CVX_ASSET_ROOT).toBeTruthy()
    expect(existsSync(join(/** @type {string} */ (process.env.CVX_ASSET_ROOT), STAMP))).toBe(true)
  })
})
