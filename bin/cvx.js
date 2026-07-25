#!/usr/bin/env node
/**
 * cvx — config-driven CV generator.
 *
 *   cvx init              scaffold a starter cv-content/ in the current directory
 *   cvx validate          check cv-content/ and report every problem at once
 *   cvx build [--ats]     render cv-content/ to a PDF in the current directory
 *
 * Imports from ../lib (the published transform of src/pdf). In a repo checkout
 * run `npm run build:lib` first, or use the `npm run pdf` scripts instead.
 *
 * Exit codes: 0 success · 2 validation failed · 3 render failed · 64 usage error
 */
import { existsSync, cpSync, writeFileSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { parseArgs } from 'node:util'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8')).version

const EXIT = { ok: 0, validation: 2, render: 3, usage: 64 }

const HELP = `cvx ${version} — config-driven CV generator

Usage:
  cvx init             Scaffold a starter cv-content/ here (Bruce Wayne demo)
  cvx validate         Check cv-content/ — all errors at once, with fixes
  cvx build            Render cv-content/ to <your-name>.pdf
  cvx build --ats      Render the ATS-safe single-column variant

Options:
  --strict             validate: treat warnings (e.g. unknown keys) as errors
  --json               Machine-readable result on stdout (validate)
  -h, --help           Show this help
  -v, --version        Show version

Exit codes: 0 ok · 2 validation failed · 3 render failed · 64 usage error
Edit the YAML files in cv-content/ and re-run "cvx build".
Docs: https://github.com/hrtips/cvx#readme`

async function init() {
  const dest = join(process.cwd(), 'cv-content')
  if (existsSync(dest)) {
    console.error(`cv-content/ already exists here — refusing to overwrite.`)
    process.exit(EXIT.usage)
  }
  cpSync(join(pkgRoot, 'template', 'cv-content'), dest, { recursive: true })
  console.log(`✅ Created cv-content/ with starter content.

Next steps:
  1. Edit cv-content/*.yaml with your details
  2. Drop your photo at cv-content/images/profile.jpg
  3. Run: npx @hrtips/cvx build   (or just "cvx build" if installed globally)`)
}

async function validate({ strict, json }) {
  const { validateContent } = await import('../lib/pdf/validateContent.js')
  const result = validateContent({ contentDir: join(process.cwd(), 'cv-content'), strict })

  if (json) {
    console.log(JSON.stringify({ command: 'validate', schemaVersion: 1, strict, ...result }, null, 2))
  } else {
    const byFile = new Map()
    for (const [sev, list] of [['error', result.errors], ['warning', result.warnings]])
      for (const f of list) {
        if (!byFile.has(f.file)) byFile.set(f.file, [])
        byFile.get(f.file).push({ sev, ...f })
      }
    for (const [file, findings] of byFile) {
      console.log(file ? `cv-content/${file}` : 'cv-content/')
      for (const f of findings) {
        const mark = f.sev === 'error' ? '✖' : '⚠'
        const where = f.path && f.path !== '(root)' ? `${f.path}: ` : ''
        console.log(`  ${mark} ${where}${f.message}${f.suggestion ? `\n      ↳ ${f.suggestion}` : ''}`)
      }
    }
    const e = result.errors.length, w = result.warnings.length
    if (e === 0 && w === 0) console.log(`✅ cv-content/ is valid (${result.checked.length} files checked)`)
    else console.log(`\n${e ? '✖' : '⚠'} ${e} error${e === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'}${!strict && w ? '  (use --strict to treat warnings as errors)' : ''}`)
  }
  process.exit(result.ok ? EXIT.ok : EXIT.validation)
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

let command = null
try {
  const { values, positionals } = parseArgs({
    options: {
      ats:     { type: 'boolean', default: false },
      strict:  { type: 'boolean', default: false },
      json:    { type: 'boolean', default: false },
      help:    { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
  })
  command = positionals[0] ?? null

  if (values.version) {
    console.log(version)
  } else if (values.help || positionals.length === 0) {
    console.log(HELP)
  } else if (command === 'init') {
    await init()
  } else if (command === 'validate') {
    await validate(values)
  } else if (command === 'build') {
    await build(values.ats)
  } else {
    console.error(`Unknown command: ${command}\n\n${HELP}`)
    process.exit(EXIT.usage)
  }
} catch (err) {
  console.error(err.message)
  process.exit(command === 'build' ? EXIT.render : EXIT.usage)
}
