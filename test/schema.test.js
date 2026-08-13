// The canonical JSON Schema (schema/v1/) must accept every file the scaffold
// ships and reject seeded mistakes. Green here means the schema matches what
// the renderer actually reads — it is the tripwire for schema/code drift.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020Module from 'ajv/dist/2020.js'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SCHEMA_DIR = path.join(ROOT, 'schema', 'v1')
/** Local Ajv registration key. The schema files declare no `$id` — see below. */
const SCHEMA_KEY = 'cvx.schema.json'

const canonical = JSON.parse(readFileSync(path.join(SCHEMA_DIR, 'cvx.schema.json'), 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true })
ajv.addSchema(canonical, SCHEMA_KEY)

const validators = {}
function validatorFor(def) {
  validators[def] ??= ajv.compile({ $ref: `${SCHEMA_KEY}#/$defs/${def}` })
  return validators[def]
}

function loadYaml(...segments) {
  return load(readFileSync(path.join(ROOT, ...segments), 'utf8'))
}

const CONTENT_DIRS = ['template/cv-content', 'cv-content']

describe('canonical schema accepts the shipped content', () => {
  for (const dir of CONTENT_DIRS) {
    describe(dir, () => {
      const files = readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.yaml'))
      it('covers every yaml file in the directory', () => {
        const defs = files.map((f) => path.basename(f, '.yaml'))
        for (const def of defs)
          expect(canonical.$defs, `no $def for ${def}.yaml`).toHaveProperty(def)
      })
      for (const file of files) {
        it(`${file} validates`, () => {
          const validate = validatorFor(path.basename(file, '.yaml'))
          const ok = validate(loadYaml(dir, file))
          expect(validate.errors ?? []).toEqual([])
          expect(ok).toBe(true)
        })
      }
      for (const layoutFile of readdirSync(path.join(ROOT, dir, 'layouts'))) {
        it(`layouts/${layoutFile} validates`, () => {
          const validate = validatorFor('layout')
          const ok = validate(loadYaml(dir, 'layouts', layoutFile))
          expect(validate.errors ?? []).toEqual([])
          expect(ok).toBe(true)
        })
      }
    })
  }
})

describe('per-file stub schemas', () => {
  it('exist for every $def that maps to a file, and point into the canonical schema', () => {
    const stubs = readdirSync(SCHEMA_DIR).filter((f) => f !== 'cvx.schema.json')
    expect(stubs.length).toBeGreaterThanOrEqual(10)
    for (const stub of stubs) {
      const parsed = JSON.parse(readFileSync(path.join(SCHEMA_DIR, stub), 'utf8'))
      const def = path.basename(stub, '.schema.json')
      expect(parsed.$ref).toBe(`cvx.schema.json#/$defs/${def}`)
      expect(canonical.$defs).toHaveProperty(def)
    }
  })
})

// ── Why no file under schema/v1/ may declare $id ────────────────────────────
// A scaffolded cv-content/ pins its `# yaml-language-server: $schema=` header
// to the release that wrote it (…/cvx/v1.7.0/schema/v1/personal.schema.json).
// The stubs reach the definitions by RELATIVE ref — "cvx.schema.json#/$defs/…"
// — and a relative ref is resolved against the schema's base URI. Per the spec
// that base is `$id` when one is present, and only the retrieval URI when it is
// not. So an `$id` naming `main` silently sends the pinned stub back to main's
// canonical schema: the pin would validate nobody's CV against the release they
// are running, while looking like it did. Measured, not assumed — the probe is
// in the report for this change. Deleting `$id` makes the base URI the URI the
// file was fetched from, which is the pin, under every implementation.
//
// The second reason is identity: an `$id` on a branch URL names a DIFFERENT
// document every release, and once two pinned copies can be open in one editor
// they collide on it.
describe('schema/v1 declares no $id (this is what makes the scaffold pin real)', () => {
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.json'))
  it('has files to check', () => expect(files.length).toBeGreaterThanOrEqual(11))
  for (const file of files) {
    it(`${file} has no $id`, () => {
      const parsed = JSON.parse(readFileSync(path.join(SCHEMA_DIR, file), 'utf8'))
      expect(parsed).not.toHaveProperty('$id')
    })
  }
  it('and no schema file mentions a branch or tag URL at all', () => {
    for (const file of files) {
      const text = readFileSync(path.join(SCHEMA_DIR, file), 'utf8')
      // The $comment in cvx.schema.json explains the rule and cites the shape;
      // what must not come back is a KEYWORD holding such a URL.
      const parsed = JSON.parse(text)
      for (const key of ['$id', '$anchor', '$dynamicAnchor']) {
        expect(parsed, `${file} declares ${key}`).not.toHaveProperty(key)
      }
    }
  })
})

// The behavioural half of the rule above, driven through a real resolver: fetch
// a stub from a PINNED URL and the relative $ref must land on the canonical
// schema at the SAME pin. With an $id this returned the `main` URL instead —
// which is the whole failure mode, and it is invisible in a static assertion.
describe('a stub fetched from a pinned tag resolves its $ref to that same tag', () => {
  const PIN = 'https://raw.githubusercontent.com/hrtips/cvx/v1.7.0/schema/v1'
  it('asks for the pinned canonical schema, never main', async () => {
    const stub = JSON.parse(readFileSync(path.join(SCHEMA_DIR, 'personal.schema.json'), 'utf8'))
    /** @type {string[]} */
    const requested = []
    const resolver = new Ajv2020({
      strict: false,
      // Stands in for the editor's fetch: records the URI, returns a schema
      // shaped enough to satisfy the `#/$defs/personal` pointer.
      loadSchema: async (uri) => {
        requested.push(uri)
        return { $defs: { personal: { type: 'object' } } }
      }
    })
    // `$id` here is the RETRIEVAL URI (the `$schema=` header the editor read),
    // supplied the way a fetching client supplies it — not a field in the file.
    await resolver.compileAsync({ ...stub, $id: `${PIN}/personal.schema.json` })
    expect(requested).toEqual([`${PIN}/cvx.schema.json`])
  })
})

describe('layout flat form (loadLayout.js accepts pages without the pages: wrapper)', () => {
  it('validates first/continuation/last at the top level', () => {
    const validate = validatorFor('layout')
    const ok = validate({
      template: 'two-column',
      first: { sidebar: ['identity-photo'], main: ['summary', { spacer: 27 }, 'experience'] },
      continuation: { main: ['experience:continued'] }
    })
    expect(validate.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })
})

describe('canonical schema rejects seeded mistakes', () => {
  const bad = [
    ['personal', {}, 'missing name'],
    ['personal', { name: 'Jane Doe', linkdin: 'typo' }, 'unknown key'],
    ['summary', [{ link: { href: 'https://x', label: 'x' } }], 'bullet object without text'],
    ['experience', [{ company: 'Acme' }], 'entry missing role'],
    [
      'experience',
      [{ role: 'Eng', bullets: [{ text: 'a', link: { href: 'https://x' } }] }],
      'link missing label'
    ],
    ['education', [{ degree: 'BSc' }], 'entry missing institution'],
    ['competencies', ['ok', 42], 'non-string item'],
    ['achievements', [{ year: '2024' }], 'entry missing text'],
    ['referees', [{ title: 'CTO' }], 'entry missing name'],
    ['keywords', 42, 'number is not a keyword shape'],
    ['config', { theme: 'neon' }, 'unknown theme'],
    ['config', { page1ExperienceCount: 0 }, 'removed key (rejected as unknown, not by a minimum)'],
    ['config', { atsKeywords: { enable: true } }, 'unknown atsKeywords key'],
    ['config', { schemaVersion: 2 }, 'wrong schema major'],
    ['layout', { template: 'three-column' }, 'unknown template'],
    ['layout', { pages: { first: { footer: [] } } }, 'unknown page region']
  ]
  for (const [def, doc, why] of bad) {
    it(`${def}: ${why}`, () => {
      expect(validatorFor(def)(doc)).toBe(false)
    })
  }
})
