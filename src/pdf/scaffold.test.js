// The scaffolder, and the one judgement call it makes: which git ref a
// scaffolded file's `$schema` header points at.
//
// The failure this guards against is silent and slow — a CV scaffolded by
// 1.7.0 whose editor starts validating against a schema change made in 1.9.0,
// which is the opposite of the "content files never break within a major"
// promise. The opposite failure is just as bad and much louder: a pin to a tag
// that was never pushed, which 404s in the user's editor. Both are decided
// here, so both are tested here.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  packageVersion,
  pinRepoRefs,
  scaffoldContent,
  schemaRefFor,
  TEMPLATE_DIR
} from './scaffold.js'

/** @type {string[]} */
const made = []
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), 'cvx-scaffold-'))
  made.push(d)
  return d
}
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
})

const MAIN_URL = /raw\.githubusercontent\.com\/hrtips\/cvx\/main\//

describe('schemaRefFor — the released/unreleased rule', () => {
  it('pins a plain x.y.z to its tag', () => {
    expect(schemaRefFor('1.7.0')).toBe('v1.7.0')
    expect(schemaRefFor('0.0.1')).toBe('v0.0.1')
    expect(schemaRefFor('10.20.30')).toBe('v10.20.30')
  })

  it('falls back to main for anything that has no tag', () => {
    // The canary channel stamps this shape (workflow_dispatch, never tagged).
    expect(schemaRefFor('1.7.0-next.abc1234')).toBe('main')
    expect(schemaRefFor('1.8.0-rc.1')).toBe('main')
    expect(schemaRefFor('1.7.0+build.5')).toBe('main')
    expect(schemaRefFor('1.7')).toBe('main')
    expect(schemaRefFor('')).toBe('main')
    expect(schemaRefFor(undefined)).toBe('main')
    expect(schemaRefFor(null)).toBe('main')
  })

  it('reads the running version from package.json, not a baked constant', () => {
    // The point of deriving it: nothing in template/ names a version, so a
    // bump between writing the template and tagging cannot leave a stale URL.
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+/)
    for (const file of readdirSync(TEMPLATE_DIR)) {
      if (!file.endsWith('.yaml')) continue
      expect(readFileSync(join(TEMPLATE_DIR, file), 'utf8')).not.toMatch(/cvx\/v\d+\.\d+\.\d+\//)
    }
  })
})

describe('pinRepoRefs — which URLs move and which do not', () => {
  it('rewrites both shapes the template uses', () => {
    expect(
      pinRepoRefs(
        '# yaml-language-server: $schema=https://raw.githubusercontent.com/hrtips/cvx/main/schema/v1/personal.schema.json',
        'v1.7.0'
      )
    ).toBe(
      '# yaml-language-server: $schema=https://raw.githubusercontent.com/hrtips/cvx/v1.7.0/schema/v1/personal.schema.json'
    )
    expect(pinRepoRefs('https://github.com/hrtips/cvx/blob/main/docs/cv-schema.md', 'v1.7.0')).toBe(
      'https://github.com/hrtips/cvx/blob/v1.7.0/docs/cv-schema.md'
    )
  })

  it('leaves ref-less project links alone — those must not point at a tag', () => {
    for (const url of [
      'https://github.com/hrtips/cvx',
      'https://github.com/hrtips/cvx#readme',
      'https://github.com/hrtips/cvx/issues'
    ]) {
      expect(pinRepoRefs(url, 'v1.7.0')).toBe(url)
    }
  })

  it('does not rewrite an already-pinned URL a second time', () => {
    const pinned =
      'https://raw.githubusercontent.com/hrtips/cvx/v1.6.0/schema/v1/config.schema.json'
    expect(pinRepoRefs(pinned, 'v1.7.0')).toBe(pinned)
  })

  it('leaves another repo that happens to have a main branch alone', () => {
    const other = 'https://raw.githubusercontent.com/someone/else/main/schema/v1/x.json'
    expect(pinRepoRefs(other, 'v1.7.0')).toBe(other)
  })
})

describe('scaffoldContent', () => {
  it('pins every yaml header and doc link to the release tag', () => {
    const dest = join(scratch(), 'cv-content')
    const { ref, pinned } = scaffoldContent(dest, { version: '1.7.0' })

    expect(ref).toBe('v1.7.0')
    expect(pinned.length).toBeGreaterThan(10)
    expect(pinned).toContain('personal.yaml')
    expect(pinned).toContain('README.md')
    expect(pinned).toContain('AGENTS.md')
    expect(pinned).toContain(join('layouts', 'two-column.yaml'))

    for (const rel of pinned) {
      const text = readFileSync(join(dest, rel), 'utf8')
      expect(text, `${rel} still points at main`).not.toMatch(MAIN_URL)
      // raw…/hrtips/cvx/<ref>/… and github.com/hrtips/cvx/blob/<ref>/… both.
      expect(text, `${rel} is not pinned`).toMatch(/\/hrtips\/cvx\/(blob\/)?v1\.7\.0\//)
    }
  })

  it('gives every scaffolded yaml a pinned $schema header', () => {
    const dest = join(scratch(), 'cv-content')
    scaffoldContent(dest, { version: '1.7.0' })
    const yamls = [
      ...readdirSync(dest).filter((f) => f.endsWith('.yaml')),
      ...readdirSync(join(dest, 'layouts')).map((f) => join('layouts', f))
    ]
    expect(yamls.length).toBeGreaterThan(10)
    for (const rel of yamls) {
      expect(readFileSync(join(dest, rel), 'utf8').split(/\r?\n/)[0]).toBe(
        `# yaml-language-server: $schema=https://raw.githubusercontent.com/hrtips/cvx/v1.7.0/schema/v1/${
          rel.startsWith('layouts') ? 'layout' : rel.replace(/\.yaml$/, '')
        }.schema.json`
      )
    }
  })

  it('copies verbatim on an unreleased version — main always resolves, a phantom tag does not', () => {
    const dest = join(scratch(), 'cv-content')
    const { ref, pinned } = scaffoldContent(dest, { version: '1.8.0-next.deadbee' })
    expect(ref).toBe('main')
    expect(pinned).toEqual([])
    expect(readFileSync(join(dest, 'personal.yaml'), 'utf8')).toMatch(MAIN_URL)
  })

  it('copies the whole template, binary files included', () => {
    const dest = join(scratch(), 'cv-content')
    scaffoldContent(dest, { version: '1.7.0' })
    const photo = join(dest, 'images', 'profile.jpg')
    expect(existsSync(photo)).toBe(true)
    expect(readFileSync(photo)).toEqual(readFileSync(join(TEMPLATE_DIR, 'images', 'profile.jpg')))
  })

  it('defaults to the running package version', () => {
    const dest = join(scratch(), 'cv-content')
    expect(scaffoldContent(dest).ref).toBe(schemaRefFor(packageVersion()))
  })
})
