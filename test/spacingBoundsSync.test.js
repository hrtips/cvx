// RV11: `SPACING_BOUNDS` is one constant with seven copies and nothing binding
// them.
//
// `layoutSpacing.js` holds the value `validateContent` enforces. The JSON
// Schema cannot import a JS module, so it re-declares the same two numbers
// three times — and `validateContent.js` says so in its own comment ("the
// schema carries the same bounds, so this is belt and braces"), which is an
// author noticing there are two sources of truth and trusting them to stay
// equal by hand. Four more copies sit in prose that `docsSync.test.js` does
// not read.
//
// Why it is worth a tripwire rather than a shrug: `get_schema` is the tool an
// assistant is told to call FIRST, and it serves the SCHEMA's copy as the
// authoritative contract. A drifted copy there is not an internal
// inconsistency — it is misinformation handed to the thing writing the CV,
// which would then propose a value `validate` rejects. §7.4 also records an
// open rider to retune this exact constant, so the drift is scheduled rather
// than hypothetical.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SPACING_BOUNDS, SPACING_KEYS } from '../src/pdf/themes/layoutSpacing.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (/** @type {string} */ rel) => readFileSync(path.join(ROOT, rel), 'utf8')

describe('the spacing legibility bound has one source of truth (RV11)', () => {
  it('the JSON Schema declares the same min/max for every spacing key', () => {
    const schema = JSON.parse(read('schema/v1/cvx.schema.json'))
    // Walk to the spacing block rather than grepping numbers: a grep would
    // pass on a file that had drifted and happened to mention 0.6 elsewhere.
    const spacing = schema.$defs?.layout?.properties?.spacing?.properties
    expect(spacing, 'could not find the spacing block in the schema').toBeTruthy()
    for (const key of SPACING_KEYS) {
      expect(spacing[key], `schema is missing the "${key}" spacing group`).toBeTruthy()
      expect(spacing[key].minimum, `schema minimum for ${key}`).toBe(SPACING_BOUNDS.min)
      expect(spacing[key].maximum, `schema maximum for ${key}`).toBe(SPACING_BOUNDS.max)
    }
  })

  it('every doc that states the range states the current one', () => {
    // The four prose copies. Each is a place a reader — or an assistant — is
    // told what the legible range is.
    const range = `${SPACING_BOUNDS.min}`
    const docs = [
      'docs/ai-guide.md',
      'llms.txt',
      'skills/cvx/SKILL.md',
      'template/cv-content/layouts/two-column.yaml'
    ]
    for (const rel of docs) {
      const text = read(rel)
      expect(text.includes(range), `${rel} no longer states the spacing minimum ${range}`).toBe(
        true
      )
      expect(
        text.includes(`${SPACING_BOUNDS.max}`),
        `${rel} no longer states the spacing maximum ${SPACING_BOUNDS.max}`
      ).toBe(true)
    }
  })
})
