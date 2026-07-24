#!/usr/bin/env node
/**
 * cvx — config-driven CV generator.
 *
 *   cvx init           scaffold a starter cv-content/ in the current directory
 *   cvx build [--ats]  render cv-content/ to a PDF in the current directory
 *
 * Imports from ../lib (the published transform of src/pdf). In a repo checkout
 * run `npm run build:lib` first, or use the `npm run pdf` scripts instead.
 */
import { existsSync, cpSync, writeFileSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parseArgs } from 'node:util'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8')).version

const HELP = `cvx ${version} — config-driven CV generator

Usage:
  cvx init           Scaffold a starter cv-content/ here (Bruce Wayne demo)
  cvx build          Render cv-content/ to <your-name>.pdf
  cvx build --ats    Render the ATS-safe single-column variant

Options:
  -h, --help            Show this help
  -v, --version         Show version

Edit the YAML files in cv-content/ and re-run "cvx build".
Docs: https://github.com/hrtips/cvx#readme`

async function init() {
  const dest = join(process.cwd(), 'cv-content')
  if (existsSync(dest)) {
    console.error(`cv-content/ already exists here — refusing to overwrite.`)
    process.exit(1)
  }
  cpSync(join(pkgRoot, 'template', 'cv-content'), dest, { recursive: true })
  console.log(`✅ Created cv-content/ with starter content.

Next steps:
  1. Edit cv-content/*.yaml with your details
  2. Drop your photo at cv-content/images/profile.jpg
  3. Run: npx @hrtips/cvx build   (or just "cvx build" if installed globally)`)
}

async function build(ats) {
  const { renderCV } = await import('../lib/pdf/render.js')
  const { buffer, filename, themeName, layoutName } = await renderCV({
    contentDir: join(process.cwd(), 'cv-content'),
    fontsDir:   join(pkgRoot, 'lib', 'fonts'),
    ats,
  })
  writeFileSync(join(process.cwd(), filename), buffer)
  const mode = ats ? 'ATS' : `theme: ${themeName}, layout: ${layoutName}`
  console.log(`✅ ${filename}  (${(buffer.byteLength / 1024).toFixed(0)} KB, ${mode})`)
}

try {
  const { values, positionals } = parseArgs({
    options: {
      ats:     { type: 'boolean', default: false },
      help:    { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
  })

  if (values.version) {
    console.log(version)
  } else if (values.help || positionals.length === 0) {
    console.log(HELP)
  } else if (positionals[0] === 'init') {
    await init()
  } else if (positionals[0] === 'build') {
    await build(values.ats)
  } else {
    console.error(`Unknown command: ${positionals[0]}\n\n${HELP}`)
    process.exit(1)
  }
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
