#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
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
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf-8')).version

const EXIT = { ok: 0, validation: 2, render: 3, usage: 64 }

/**
 * Which build-time defects `--strict` turns into a non-zero exit.
 *
 * ONE set, used by `build` and by `build --all`, because they drifted apart
 * the moment they were written separately: `--all` gated every `kind:'defect'`
 * while `build` gated this code alone, so the same CV exited 0 from one
 * command and 2 from the other (gate-7 re-review). Scoped narrowly on purpose
 * — R-D rules on this defect, and `HELP` documents exactly this — so widening
 * it to every defect stays a maintainer ruling that changes this one line.
 */
const STRICT_GATED_CODES = new Set(['physical-pages-exceed-plan'])

const HELP = `cvx ${version} — config-driven CV generator

Usage:
  cvx init             Scaffold a starter cv-content/ here (Bruce Wayne demo)
  cvx validate         Check cv-content/ — all errors at once, with fixes
  cvx build            Render cv-content/ to <your-name>.pdf
  cvx build --ats      Render the ATS-safe single-column variant
  cvx build --all      Validate, then render both the designed and ATS PDFs
  cvx list [themes|layouts]   Show available themes and layouts
  cvx mcp              Run the MCP stdio server (5 tools, fully offline)
  cvx mcp init --client claude|claude-desktop|cursor|vscode
                       Write the MCP config for your client

Options:
  --strict             validate: treat warnings (e.g. unknown keys) as errors
                       build: exit non-zero if the PDF has more sheets than
                       planned (also applies to build --all)
  --json               Machine-readable result on stdout; logs on stderr
  -h, --help           Show this help
  -v, --version        Show version

Exit codes: 0 ok · 2 validation failed · 3 render failed · 64 usage error
Edit the YAML files in cv-content/ and re-run "cvx build".
Docs: https://github.com/hrtips/cvx#readme`

const emit = (/** @type {unknown} */ obj) => console.log(JSON.stringify(obj, null, 2))

export async function init(/** @type {{ json?: boolean }} */ { json }) {
  const dest = join(process.cwd(), 'cv-content')
  if (existsSync(dest)) {
    if (json)
      emit({
        command: 'init',
        ok: false,
        error: {
          code: 'already-exists',
          message: 'cv-content/ already exists here — refusing to overwrite'
        }
      })
    else console.error(`cv-content/ already exists here — refusing to overwrite.`)
    process.exit(EXIT.usage)
  }
  // Shared with the init_cv MCP tool. Not a plain copy: it pins the scaffold's
  // `$schema` headers and doc links to THIS release, so an editor validates the
  // user's CV against the schema that shipped with the code they are running.
  const { scaffoldContent } = await import('../lib/pdf/scaffold.js')
  const { ref } = scaffoldContent(dest, { version })
  if (json) {
    emit({ command: 'init', ok: true, dest: 'cv-content', schemaRef: ref })
  } else {
    console.log(`✅ Created cv-content/ with starter content.

Next steps:
  1. Edit cv-content/*.yaml with your details
  2. Drop your photo at cv-content/images/profile.jpg
  3. Check: npx @hrtips/cvx validate
  4. Run:   npx @hrtips/cvx build`)
  }
}

export async function validate(
  /** @type {{ strict?: boolean, json?: boolean }} */ { strict, json }
) {
  const { validateContent } = await import('../lib/pdf/validateContent.js')
  const result = validateContent(
    /** @type {import('../src/pdf/types.js').ValidateOptions} */ ({
      contentDir: join(process.cwd(), 'cv-content'),
      strict,
      fontsDir: join(pkgRoot, 'lib', 'fonts')
    })
  )

  if (json) {
    emit({
      command: 'validate',
      ok: result.ok,
      schemaVersion: 1,
      strict,
      errors: result.errors,
      warnings: result.warnings,
      checked: result.checked
    })
  } else {
    const byFile = new Map()
    for (const [sev, items] of [
      ['error', result.errors],
      ['warning', result.warnings]
    ])
      for (const f of items) {
        if (!byFile.has(f.file)) byFile.set(f.file, [])
        byFile.get(f.file).push({ sev, ...f })
      }
    for (const [file, findings] of byFile) {
      console.log(file ? `cv-content/${file}` : 'cv-content/')
      for (const f of findings) {
        const mark = f.sev === 'error' ? '✖' : '⚠'
        const where = f.path && f.path !== '(root)' ? `${f.path}: ` : ''
        console.log(
          `  ${mark} ${where}${f.message}${f.suggestion ? `\n      ↳ ${f.suggestion}` : ''}`
        )
      }
    }
    const e = result.errors.length,
      w = result.warnings.length
    if (e === 0 && w === 0)
      console.log(`✅ cv-content/ is valid (${result.checked.length} files checked)`)
    else
      console.log(
        `\n${e ? '✖' : '⚠'} ${e} error${e === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'}${!strict && w ? '  (use --strict to treat warnings as errors)' : ''}`
      )
  }
  process.exit(result.ok ? EXIT.ok : EXIT.validation)
}

export async function list(/** @type {{ kind?: string, json?: boolean }} */ { kind, json }) {
  const { discoverThemes } = await import('../lib/pdf/themes/index.js')
  const themes = Object.keys(await discoverThemes()).map((name) => ({
    name,
    default: name === 'teal'
  }))

  const layoutsDir = join(process.cwd(), 'cv-content', 'layouts')
  const builtIn = ['two-column', 'single-column']
  const names = new Set(builtIn)
  const layouts = builtIn.map((name) => ({
    name,
    default: name === 'two-column',
    source: 'built-in'
  }))
  if (existsSync(layoutsDir)) {
    for (const f of readdirSync(layoutsDir).filter((name) => name.endsWith('.yaml'))) {
      const name = f.replace(/\.yaml$/, '')
      if (!names.has(name)) layouts.push({ name, default: false, source: 'cv-content/layouts' })
      names.add(name)
    }
  }

  const result = {
    command: 'list',
    ...((!kind || kind === 'themes') && { themes }),
    ...((!kind || kind === 'layouts') && { layouts })
  }
  if (json) return emit(result)
  if (result.themes) {
    console.log('Themes (config.yaml → theme):')
    for (const t of result.themes) console.log(`  ${t.name}${t.default ? '   (default)' : ''}`)
  }
  if (result.layouts) {
    console.log('Layouts (config.yaml → layout):')
    for (const l of result.layouts)
      console.log(
        `  ${l.name}${l.default ? '   (default)' : ''}${l.source === 'built-in' ? '' : `   [${l.source}]`}`
      )
  }
}

// Pin the exact version that wrote the config: predictable output for the
// user (visual layout frozen until they re-run mcp init) and canary configs
// actually launch the canary instead of resolving `latest`.
const MCP_ENTRY = { command: 'npx', args: ['-y', `@hrtips/cvx@${version}`, 'mcp'] }
const MCP_CLIENTS = {
  claude: {
    file: () => join(process.cwd(), '.mcp.json'),
    root: 'mcpServers',
    entry: { type: 'stdio', ...MCP_ENTRY }
  },
  cursor: {
    file: () => join(process.cwd(), '.cursor', 'mcp.json'),
    root: 'mcpServers',
    entry: MCP_ENTRY
  },
  vscode: {
    file: () => join(process.cwd(), '.vscode', 'mcp.json'),
    root: 'servers',
    entry: { type: 'stdio', ...MCP_ENTRY }
  },
  'claude-desktop': {
    file: () => {
      if (process.platform === 'darwin')
        return join(
          homedir(),
          'Library',
          'Application Support',
          'Claude',
          'claude_desktop_config.json'
        )
      if (process.platform === 'win32')
        return join(
          process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'),
          'Claude',
          'claude_desktop_config.json'
        )
      return join(homedir(), '.config', 'claude-desktop', 'claude_desktop_config.json')
    },
    root: 'mcpServers',
    entry: MCP_ENTRY
  }
}

export async function mcpInit(/** @type {{ client?: string, json?: boolean }} */ { client, json }) {
  const target = MCP_CLIENTS[/** @type {keyof typeof MCP_CLIENTS} */ (client)]
  if (!target) {
    const msg = `unknown client: ${client ?? '(none)'} (expected ${Object.keys(MCP_CLIENTS).join(', ')})`
    if (json)
      emit({ command: 'mcp-init', ok: false, error: { code: 'unknown-client', message: msg } })
    else
      console.error(
        `Unknown client: ${client ?? '(none)'} — use --client ${Object.keys(MCP_CLIENTS).join('|')}`
      )
    process.exit(EXIT.usage)
  }
  const file = target.file()
  // Merge into an existing config rather than clobbering other servers.
  /** @type {Record<string, any>} */
  let config = {}
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      const msg = `${file} exists but is not valid JSON — fix it manually, then re-run`
      if (json)
        emit({ command: 'mcp-init', ok: false, error: { code: 'invalid-config', message: msg } })
      else console.error(msg)
      process.exit(EXIT.usage)
    }
  }
  config[target.root] = { ...config[target.root], cvx: target.entry }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  if (json) emit({ command: 'mcp-init', ok: true, client, file, version })
  else
    console.log(
      `✅ Added the cvx MCP server (pinned to ${version}) to ${file}\n   Restart ${client === 'claude-desktop' ? 'Claude Desktop' : client} to pick it up. Re-run mcp init after upgrading cvx.`
    )
}

export async function build(
  /** @type {{ ats?: boolean, json?: boolean, strict?: boolean }} */ { ats, json, strict }
) {
  const { renderCV } = await import('../lib/pdf/render.js')
  const { layoutDiagnostics } = await import('../lib/pdf/layoutDiagnostics.js')
  const { attachPhysicalWarnings } = await import('../lib/pdf/physicalPagesWarning.js')
  /** @type {string[]} */
  const notices = []
  const { buffer, filename, themeName, layoutName, plan } = await renderCV({
    contentDir: join(process.cwd(), 'cv-content'),
    fontsDir: join(pkgRoot, 'lib', 'fonts'),
    ats,
    warn: (msg) => {
      notices.push(msg)
      console.error(`⚠ ${msg}`)
    }
  })
  writeFileSync(join(process.cwd(), filename), buffer)

  // I1 (INV-4): the plan counts pages it numbered; this counts sheets that
  // exist. `--ats` has no plan (single column, auto-flowed) so there is no
  // claim to check. Merged into the envelope's warnings here — NOT inside
  // layoutDiagnostics, which is pinned pure over the plan; see
  // physicalPagesWarning.js.
  const { diagnostics, added: physical } = attachPhysicalWarnings({
    diagnostics: ats ? null : layoutDiagnostics(plan),
    buffer,
    plan,
    ats
  })
  for (const w of physical) {
    // R-D: a defect reaches stderr in every mode. Facts never do — a normal
    // page break is not shouted at (the existing page1-ends-early rule).
    notices.push(w.message)
    console.error(`⚠ ${w.message}`)
  }

  if (json) {
    emit({
      command: 'build',
      ok: true,
      filename,
      bytes: buffer.byteLength,
      ats,
      theme: ats ? null : themeName,
      layout: ats ? null : layoutName,
      // The run's human-readable notes — the same lines printed to stderr.
      // Named `notices` and not `warnings` because `diagnostics.warnings` sits
      // right next to it carrying structured {code, page, …} objects and the
      // same overflow text: one name, two meanings, in one envelope.
      notices,
      // Layout diagnostics for the plan this build rendered (C6a): page count,
      // per-page column fills, what landed where, overflow. --json is the
      // documented agent contract, and an agent driving the CLI is exactly as
      // blind to the PDF as one driving the MCP server — so it gets the same
      // numbers `build_pdf` returns, from the same function. `null` for --ats
      // (single column, auto-flowed, never packed).
      diagnostics
    })
  } else {
    const mode = ats ? 'ATS' : `theme: ${themeName}, layout: ${layoutName}`
    console.log(`✅ ${filename}  (${(buffer.byteLength / 1024).toFixed(0)} KB, ${mode})`)
  }

  // R-D: the PDF exists and is content-complete, so a defect is exit 0 by
  // default — calling it a render failure would misstate what happened. Under
  // --strict it must be impossible to ignore, matching `validate`'s precedent
  // (warnings become errors) so a scripted caller can opt into hard failure.
  if (strict && physical.some((w) => STRICT_GATED_CODES.has(w.code))) {
    process.exit(EXIT.validation)
  }
}

// build --all: validate first (errors block), then render both variants.
// One command instead of validate + build + build --ats, so an agent has
// fewer steps to stall on and always produces both PDFs.
//
// Each variant renders in its OWN child process. This started as the fix for a
// font-state leak across renderToBuffer() calls in one process, which corrupted
// the 2nd PDF (garbled text layer, and — as v1.6.0's MCP server showed —
// missing glyphs on the page). That leak is now fixed at the source, in
// src/pdf/fonts.js, so every caller is safe; the child processes stay as
// defence in depth for the one command that renders twice by construction.
export async function buildAll(
  /** @type {{ json?: boolean, strict?: boolean }} */ { json, strict }
) {
  const contentDir = join(process.cwd(), 'cv-content')
  const { validateContent } = await import('../lib/pdf/validateContent.js')
  const vr = validateContent(
    /** @type {import('../src/pdf/types.js').ValidateOptions} */ ({
      contentDir,
      strict: false,
      fontsDir: join(pkgRoot, 'lib', 'fonts')
    })
  )
  if (!vr.ok) {
    if (json)
      emit({
        command: 'build',
        all: true,
        ok: false,
        error: {
          code: 'validation-failed',
          message: 'validation failed — fix errors before building'
        },
        errors: vr.errors,
        warnings: vr.warnings
      })
    else {
      console.error('✖ validation failed — fix these before building:')
      for (const f of vr.errors)
        console.error(
          `  ✖ cv-content/${f.file ?? ''}${f.path && f.path !== '(root)' ? ` ${f.path}:` : ''} ${f.message}`
        )
    }
    process.exit(EXIT.validation)
  }

  const cliPath = fileURLToPath(import.meta.url)
  const outputs = []
  /** Defect-kind warnings from either variant — the --strict gate below. */
  const strictFailures = []
  for (const ats of [false, true]) {
    const label = ats ? 'ATS' : 'designed'
    let res
    try {
      const stdout = execFileSync(
        process.execPath,
        [cliPath, 'build', ...(ats ? ['--ats'] : []), '--json'],
        { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
      )
      res = JSON.parse(stdout)
    } catch (err) {
      if (json)
        emit({
          command: 'build',
          all: true,
          ok: false,
          error: {
            code: 'render-failed',
            message: `${label} variant failed: ${/** @type {Error} */ (err).message}`
          }
        })
      else
        console.error(
          `Build failed for the ${label} variant: ${/** @type {Error} */ (err).message}`
        )
      process.exit(EXIT.render)
    }
    if (!res?.ok) {
      if (json)
        emit({
          command: 'build',
          all: true,
          ok: false,
          error: res?.error ?? { code: 'render-failed', message: `${label} variant failed` }
        })
      else console.error(`Build failed for the ${label} variant.`)
      process.exit(EXIT.render)
    }
    // R-D applies to `--all` too. The child is NOT run with --strict: it would
    // exit non-zero, and the catch above would report that as `render-failed`,
    // which misdescribes a PDF that exists and is content-complete. Collect the
    // defects from the child's own envelope and decide once, after both
    // variants are written.
    for (const w of res.diagnostics?.warnings ?? []) {
      if (STRICT_GATED_CODES.has(w.code)) strictFailures.push(`${label}: ${w.message}`)
    }
    outputs.push({
      filename: res.filename,
      bytes: res.bytes,
      ats,
      theme: res.theme,
      layout: res.layout,
      notices: res.notices ?? [],
      // Passed straight through from the child build, so `build --all --json`
      // carries the same layout diagnostics as `build --json` (C6a).
      diagnostics: res.diagnostics ?? null
    })
    if (!json)
      console.log(
        `✅ ${res.filename}  (${(res.bytes / 1024).toFixed(0)} KB, ${ats ? 'ATS' : `theme: ${res.theme}, layout: ${res.layout}`})`
      )
  }
  if (json) emit({ command: 'build', all: true, ok: true, outputs })
  // Both PDFs exist and are content-complete, so the default stays exit 0 with
  // the defects reported (R-D). --strict is the opt-in hard gate, and it must
  // behave the same here as on a single build — `--all` is the command the
  // docs push agents toward, so a carve-out would be the gap that matters.
  if (strict && strictFailures.length > 0) process.exit(EXIT.validation)
}

export async function main(argv = process.argv) {
  let command = null
  let jsonMode = false
  try {
    const { values, positionals } = parseArgs({
      args: argv.slice(2),
      options: {
        ats: { type: 'boolean', default: false },
        all: { type: 'boolean', default: false },
        strict: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        client: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false }
      },
      allowPositionals: true
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
        if (jsonMode)
          emit({
            command: 'list',
            ok: false,
            error: {
              code: 'unknown-list-kind',
              message: `unknown list kind: ${kind} (expected themes or layouts)`
            }
          })
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
        if (jsonMode)
          emit({
            command: 'mcp',
            ok: false,
            error: {
              code: 'unknown-subcommand',
              message: `unknown mcp subcommand: ${positionals[1]}`
            }
          })
        else console.error(`Unknown mcp subcommand: ${positionals[1]} (expected "init" or nothing)`)
        process.exit(EXIT.usage)
      }
    } else if (command === 'build') {
      if (values.all) await buildAll(values)
      else await build(values)
    } else {
      if (jsonMode)
        emit({
          command,
          ok: false,
          error: { code: 'unknown-command', message: `unknown command: ${command}` }
        })
      else console.error(`Unknown command: ${command}\n\n${HELP}`)
      process.exit(EXIT.usage)
    }
  } catch (err) {
    const code = command === 'build' ? EXIT.render : EXIT.usage
    if (jsonMode)
      emit({
        command,
        ok: false,
        error: {
          code: command === 'build' ? 'render-failed' : 'usage',
          message: /** @type {Error} */ (err).message
        }
      })
    else console.error(/** @type {Error} */ (err).message)
    process.exit(code)
  }
}

// Run-as-main guard: dispatch only when executed directly (`node bin/cvx.js …`
// or via the npm-created `cvx` bin symlink), never on plain import (tests import
// the command functions). import.meta.url is realpath-resolved by Node, so we
// realpath argv[1] too — otherwise invocation through the symlink wouldn't match
// and the CLI would silently do nothing. buildAll re-invokes this same file per
// variant, so the guard must keep firing in those child processes.
export function isRunAsMain() {
  try {
    return (
      Boolean(process.argv[1]) &&
      import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
    )
  } catch {
    return false
  }
}

/* v8 ignore next 2 -- the real-entry dispatch only fires when run as the CLI
   binary (covered by the packaged-E2E subprocess), never on import. */
if (isRunAsMain()) main(process.argv)
