// Stand-in for the `cvx:assets` virtual module that
// scripts/build-standalone.js generates at bundle time. Aliased in
// vitest.config.js so src/standalone/runtime.js is importable — and therefore
// unit-testable — outside a bundle.
//
// Deliberately tiny and fake: the REAL assets are proven end to end by
// test/standalone.test.js, which builds the bundle and renders a PDF from it.
// What these fixtures exercise is the extraction logic — the cache-hit,
// stale-digest and lost-race branches that a first clean extraction never
// reaches.

import { gzipSync } from 'node:zlib'

const pack = (/** @type {string} */ text) => gzipSync(Buffer.from(text)).toString('base64')

export const VERSION = '0.0.0-fixture'
export const DIGEST = 'deadbeefcafe'
export const FILES = {
  'package.json': pack('{"name":"@hrtips/cvx","version":"0.0.0-fixture"}\n'),
  'schema/v1/cvx.schema.json': pack('{"$id":"fixture"}\n'),
  'template/cv-content/config.yaml': pack('theme: teal\n'),
  'lib/fonts/Lato-Regular.ttf': pack('not-a-real-font')
}
