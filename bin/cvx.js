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
 * Contract for agents and scripts:
 *   - exit codes: 0 success · 2 validation failed · 3 render failed · 64 usage error
 *   - with --json, stdout carries exactly one JSON object (the result);
 *     logs and warnings go to stderr. Errors become { ok: false, error: {...} }.
 *   - every command is non-interactive.
 */
import { existsSync, cpSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { homedir } from 'os'
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
  cvx list [themes|layouts]   Show available themes and layouts
  cvx mcp              Run the MCP stdio server (4 tools, fully offline)
  cvx mcp init --client claude|claude-desktop|cursor|vscode
                       Write the MCP config for your client

Options:
  --strict             validate: treat warnings (e.g. unknown keys) as errors
  --json               Machine-readable result on stdout; logs on stderr
  -h, --help           Show this help
  -v, --version        Show version

Exit codes: 0 ok · 2 validation failed · 3 render failed · 64 usage error
Edit the YAML files in cv-content/ and re-run "cvx build".
Docs: https://github.com/hrtips/cvx#readme`

const emit = (obj) => console.log(JSON.stringify(obj, null, 2))

async function init({ json }) {
  const dest = join(process.cwd(), 'cv-content')
  if (existsSync(dest)) {
    if (json) emit({ command: 'init', ok: false, error: { code: 'already-exists', message: 'cv-content/ already exists here — refusing to overwrite' } })
    else console.error(`cv-content/ already exists here — refusing to overwrite.`)
    process.exit(EXIT.usage)
  }
  cpSync(join(pkgRoot, 'template', 'cv-content'), dest, { recursive: true })
  if (json) {
    emit({ command: 'init', ok: true, dest: 'cv-content' })
  } else {
    console.log(`✅ Created cv-content/ with starter content.

Next steps:
  1. Edit cv-content/*.yaml with your details
  2. Drop your photo at cv-content/images/profile.jpg
  3. Check: npx @hrtips/cvx validate
  4. Run:   npx @hrtips/cvx build`)
  }
}

async function validate({ strict, json }) {
  const { validateContent } = await import('../lib/pdf/validateContent.js')
  const result = validateContent({ contentDir: join(process.cwd(), 'cv-content'), strict })

  if (json) {
    emit({ command: 'validate', ok: result.ok, schemaVersion: 1, strict, errors: result.errors, warnings: result.warnings, checked: result.checked })
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

async function list({ kind, json }) {
  const { discoverThemes } = await import('../lib/pdf/themes/index.js')
  const themes = Object.keys(await discoverThemes()).map((name) => ({ name, default: name === 'teal' }))

  const layoutsDir = join(process.cwd(), 'cv-content', 'layouts')
  const builtIn = ['two-column', 'single-column']
  const names = new Set(builtIn)
  const layouts = builtIn.map((name) => ({ name, default: name === 'two-column', source: 'built-in' }))
  if (existsSync(layoutsDir)) {
    for (const f of readdirSync(layoutsDir).filter((f) => f.endsWith('.yaml'))) {
      const name = f.replace(/\.yaml$/, '')
      if (!names.has(name)) layouts.push({ name, default: false, source: 'cv-content/layouts' })
      names.add(name)
    }
  }

  const result = { command: 'list', ...((!kind || kind === 'themes') && { themes }), ...((!kind || kind === 'layouts') && { layouts }) }
  if (json) return emit(result)
  if (result.themes) {
    console.log('Themes (config.yaml → theme):')
    for (const t of result.themes) console.log(`  ${t.name}${t.default ? '   (default)' : ''}`)
  }
  if (result.layouts) {
    console.log('Layouts (config.yaml → layout):')
    for (const l of result.layouts) console.log(`  ${l.name}${l.default ? '   (default)' : ''}${l.source === 'built-in' ? '' : `   [${l.source}]`}`)
  }
}

const MCP_ENTRY = { command: 'npx', args: ['-y', '@hrtips/cvx', 'mcp'] }
const MCP_CLIENTS = {
  claude:           { file: () => join(process.cwd(), '.mcp.json'),            root: 'mcpServers', entry: { type: 'stdio', ...MCP_ENTRY } },
  cursor:           { file: () => join(process.cwd(), '.cursor', 'mcp.json'),  root: 'mcpServers', entry: MCP_ENTRY },
  vscode:           { file: () => join(process.cwd(), '.vscode', 'mcp.json'),  root: 'servers',    entry: { type: 'stdio', ...MCP_ENTRY } },
  'claude-desktop': {
    file: () => {
      if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
      return join(homedir(), '.config', 'claude-desktop', 'claude_desktop_config.json')
    },
    root: 'mcpServers',
    entry: MCP_ENTRY,
  },
}

async function mcpInit({ client, json }) {
  const target = MCP_CLIENTS[client]
  if (!target) {
    const msg = `unknown client: ${client ?? '(none)'} (expected ${Object.keys(MCP_CLIENTS).join(', ')})`
    if (json) emit({ command: 'mcp-init', ok: false, error: { code: 'unknown-client', message: msg } })
    else console.error(`Unknown client: ${client ?? '(none)'} — use --client ${Object.keys(MCP_CLIENTS).join('|')}`)
    process.exit(EXIT.usage)
  }
  const file = target.file()
  // Merge into an existing config rather than clobbering other servers.
  let config = {}
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      const msg = `${file} exists but is not valid JSON — fix it manually, then re-run`
      if (json) emit({ command: 'mcp-init', ok: false, error: { code: 'invalid-config', message: msg } })
      else console.error(msg)
      process.exit(EXIT.usage)
    }
  }
  config[target.root] = { ...config[target.root], cvx: target.entry }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
  if (json) emit({ command: 'mcp-init', ok: true, client, file })
  else console.log(`✅ Added the cvx MCP server to ${file}\n   Restart ${client === 'claude-desktop' ? 'Claude Desktop' : client} to pick it up.`)
}

async function build({ ats, json }) {
  const { renderCV } = await import('../lib/pdf/render.js')
  const { buffer, filename, themeName, layoutName } = await renderCV({
    contentDir: join(process.cwd(), 'cv-content'),
    fontsDir:   join(pkgRoot, 'lib', 'fonts'),
    ats,
    warn: (msg) => console.error(`⚠ ${msg}`),
  })
  writeFileSync(join(process.cwd(), filename), buffer)
  if (json) {
    emit({ command: 'build', ok: true, filename, bytes: buffer.byteLength, ats, theme: ats ? null : themeName, layout: ats ? null : layoutName })
  } else {
    const mode = ats ? 'ATS' : `theme: ${themeName}, layout: ${layoutName}`
    console.log(`✅ ${filename}  (${(buffer.byteLength / 1024).toFixed(0)} KB, ${mode})`)
  }
}

let command = null
let jsonMode = false
try {
  const { values, positionals } = parseArgs({
    options: {
      ats:     { type: 'boolean', default: false },
      strict:  { type: 'boolean', default: false },
      json:    { type: 'boolean', default: false },
      client:  { type: 'string' },
      help:    { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
  })
  command = positionals[0] ?? null
  jsonMode = values.json

  if (values.version) {
    console.log(version)
  } else if (values.help || positionals.length === 0) {
    console.log(HELP)
  } else if (command === 'init') {
    await init(values)
  } else if (command === 'validate') {
    await validate(values)
  } else if (command === 'list') {
    const kind = positionals[1]
    if (kind && !['themes', 'layouts'].includes(kind)) {
      if (jsonMode) emit({ command: 'list', ok: false, error: { code: 'unknown-list-kind', message: `unknown list kind: ${kind} (expected themes or layouts)` } })
      else console.error(`Unknown list kind: ${kind} (expected themes or layouts)`)
      process.exit(EXIT.usage)
    }
    await list({ kind, json: values.json })
  } else if (command === 'mcp') {
    if (positionals[1] === 'init') {
      await mcpInit({ client: values.client, json: values.json })
    } else if (positionals[1] === undefined) {
      const { runMcpServer } = await import('../lib/mcp/server.js')
      await runMcpServer()
    } else {
      if (jsonMode) emit({ command: 'mcp', ok: false, error: { code: 'unknown-subcommand', message: `unknown mcp subcommand: ${positionals[1]}` } })
      else console.error(`Unknown mcp subcommand: ${positionals[1]} (expected "init" or nothing)`)
      process.exit(EXIT.usage)
    }
  } else if (command === 'build') {
    await build(values)
  } else {
    if (jsonMode) emit({ command, ok: false, error: { code: 'unknown-command', message: `unknown command: ${command}` } })
    else console.error(`Unknown command: ${command}\n\n${HELP}`)
    process.exit(EXIT.usage)
  }
} catch (err) {
  const code = command === 'build' ? EXIT.render : EXIT.usage
  if (jsonMode) emit({ command, ok: false, error: { code: command === 'build' ? 'render-failed' : 'usage', message: err.message } })
  else console.error(err.message)
  process.exit(code)
}
