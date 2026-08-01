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
const CANONICAL_ID = 'https://raw.githubusercontent.com/hrtips/cvx/main/schema/v1/cvx.schema.json'

const canonical = JSON.parse(readFileSync(path.join(SCHEMA_DIR, 'cvx.schema.json'), 'utf8'))

const ajv = new Ajv2020({ allErrors: true, strict: true })
ajv.addSchema(canonical)

const validators = {}
function validatorFor(def) {
  validators[def] ??= ajv.compile({ $ref: `${CANONICAL_ID}#/$defs/${def}` })
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
    ['config', { page1ExperienceCount: 0 }, 'count below 1'],
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
