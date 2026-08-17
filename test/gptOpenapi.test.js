// The Custom GPT action schema, checked against the limits ChatGPT's builder
// enforces on import.
//
// This exists because the builder rejected the first version of the file, and
// its validator is not something we can run: the only feedback is a red line in
// a web form after a human has already published the endpoint. Encoding the
// limits here turns "someone notices when importing" into a failing test.
//
// Known limits, from the builder's own error text (2026-08-17):
//   "description has length 432 exceeding limit of 300"

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const spec = JSON.parse(readFileSync(path.join(ROOT, 'site', 'gpt', 'openapi.json'), 'utf8'))

/** Every [path, method, operation] triple in the document. */
const operations = Object.entries(spec.paths).flatMap(([p, methods]) =>
  Object.entries(methods).map(([method, op]) => [`${method.toUpperCase()} ${p}`, op])
)

describe('Custom GPT action schema', () => {
  it('declares an OpenAPI version and a single absolute server URL', () => {
    expect(spec.openapi).toMatch(/^3\./)
    expect(spec.servers).toHaveLength(1)
    expect(spec.servers[0].url).toMatch(/^https:\/\//)
    // A relative or trailing-slash server URL silently produces 404s on import.
    expect(spec.servers[0].url).not.toMatch(/\/$/)
  })

  it('keeps every operation description within the builder’s 300-char limit', () => {
    for (const [where, op] of operations) {
      expect(op.description, `${where} has no description`).toBeTruthy()
      expect(
        op.description.length,
        `${where} description is ${op.description.length} chars; the builder rejects over 300`
      ).toBeLessThanOrEqual(300)
    }
  })

  it('gives every operation a unique operationId and a summary', () => {
    const ids = operations.map(([, op]) => op.operationId)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
    for (const [where, op] of operations) {
      expect(op.summary, `${where} has no summary`).toBeTruthy()
    }
  })

  it('serves both operations the GPT relies on', () => {
    const ids = operations.map(([, op]) => op.operationId).sort()
    expect(ids).toEqual(['downloadCvxBundle', 'getCvxRelease'])
  })

  it('describes the file-delivery response as an openaiFileResponse', () => {
    // This envelope is the whole mechanism: it is what makes ChatGPT materialise
    // the bundle as a file for Code Interpreter instead of reading a megabyte of
    // base64 into the conversation. If the shape drifts, delivery breaks.
    const props =
      spec.paths['/gpt/bundle.json'].get.responses['200'].content['application/json'].schema
        .properties
    expect(props).toHaveProperty('openaiFileResponse')
    expect(props.openaiFileResponse.type).toBe('array')
    expect(Object.keys(props.openaiFileResponse.items.properties).sort()).toEqual([
      'content',
      'mime_type',
      'name'
    ])
  })

  it('keeps the GPT instructions inside the 8000-char box, in a file of their own', () => {
    // The builder rejects instructions over 8000 characters. They live in a file
    // containing nothing else because the first version was a fenced block inside
    // a longer document — and the document (9.8 KB) got pasted instead of the
    // block (5.5 KB), a mistake that layout invited rather than one anyone made.
    const instructions = readFileSync(path.join(ROOT, 'site', 'gpt', 'instructions.txt'), 'utf8')
    expect(instructions.length).toBeLessThanOrEqual(8000)

    // Properties, not prose. Each of these is a behaviour that went wrong in
    // testing and cost a user their turn, so it is worth a tripwire — but pinning
    // the sentence itself just makes the instructions unrewritable.
    //
    // 1. Steer away from npm/npx: it is slow, often unreachable, and never needed.
    expect(instructions).toMatch(/do not try npm or npx|never run npm|not npm/i)
    // 2. A concrete download URL, so acquisition is one command and not a search.
    expect(instructions).toContain(
      'https://github.com/hrtips/cvx/releases/latest/download/cvx.bundle.min.js.zip'
    )
    // 3. A fallback that ends with a human, so a broken sandbox is not a dead end.
    expect(instructions).toMatch(/upload/i)
    // 4. cd first — CVX writes into the working directory, and getting this wrong
    //    scatters cv-content/ and the PDF wherever the shell happened to start.
    expect(instructions).toMatch(/CURRENT working directory/)
    // 5. The step that makes this better than a YAML handoff: it must look at the
    //    PDF it rendered, not just report that a build succeeded.
    expect(instructions).toMatch(/render its pages to images/i)
  })

  it('matches the paths the Pages workflow actually publishes', () => {
    // The generator writes gpt/version.json and gpt/bundle.json; a path here that
    // it does not produce would import cleanly and 404 at run time.
    const generator = readFileSync(path.join(ROOT, 'scripts', 'gpt-endpoints.js'), 'utf8')
    for (const p of Object.keys(spec.paths)) {
      const file = p.replace(/^\/gpt\//, '')
      expect(generator, `nothing generates ${p}`).toContain(`'${file}'`)
    }
  })
})
