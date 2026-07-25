// Tripwire: the canonical schema is the single source of truth, and the
// human doc copies must keep restating it. If a key is added to the schema
// without documenting it, this fails — the reverse (docs mention keys the
// schema lacks) is caught by schema.test.js validating the shipped content.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const schema = JSON.parse(readFileSync(path.join(ROOT, 'schema', 'v1', 'cvx.schema.json'), 'utf8'))
const cvSchemaDoc = readFileSync(path.join(ROOT, 'docs', 'cv-schema.md'), 'utf8')
const scaffoldReadme = readFileSync(path.join(ROOT, 'template', 'cv-content', 'README.md'), 'utf8')
const aiGuide = readFileSync(path.join(ROOT, 'docs', 'ai-guide.md'), 'utf8')

const CONTENT_DEFS = ['personal', 'summary', 'experience', 'education', 'competencies', 'achievements', 'referees', 'keywords', 'config']

const keysOf = (def) => Object.keys(schema.$defs[def]?.properties ?? {})

describe('docs/cv-schema.md restates the schema', () => {
  it('documents every content file', () => {
    for (const def of CONTENT_DEFS) {
      expect(cvSchemaDoc, `missing section for ${def}.yaml`).toContain(`\`${def}.yaml\``)
    }
  })

  const keyed = {
    personal: keysOf('personal'),
    experience: keysOf('experienceEntry'),
    education: keysOf('educationEntry'),
    achievements: keysOf('achievementEntry'),
    referees: keysOf('refereeEntry'),
    config: [...keysOf('config').filter((k) => k !== 'atsKeywords'), ...Object.keys(schema.$defs.config.properties.atsKeywords.properties).map((k) => `atsKeywords.${k}`)],
    'bullet object': Object.keys(schema.$defs.bulletItem.oneOf[1].properties),
  }
  for (const [group, keys] of Object.entries(keyed)) {
    it(`documents every ${group} key`, () => {
      for (const key of keys) {
        expect(cvSchemaDoc, `cv-schema.md does not mention \`${key}\``).toContain(`\`${key}\``)
      }
    })
  }
})

describe('scaffold README and AI guide stay aligned', () => {
  it('scaffold README mentions every content file', () => {
    for (const def of CONTENT_DEFS) {
      expect(scaffoldReadme, `template README missing ${def}.yaml`).toContain(`${def}.yaml`)
    }
  })

  it('AI guide Route C prompt covers every content file and the validate step', () => {
    for (const def of CONTENT_DEFS) {
      expect(aiGuide, `ai-guide Route C missing ${def}.yaml`).toContain(`${def}.yaml`)
    }
    expect(aiGuide).toContain('validate')
    expect(aiGuide).toContain('schemaVersion')
  })
})
