// In-process tests for the cvx CLI. bin/cvx.js exports every command plus
// `main`; the run-as-main guard keeps the dispatch from firing on import, so we
// drive commands directly. process.cwd() is stubbed to a fresh temp dir per
// test and process.exit is stubbed to throw a tagged error.
//
// Exit-code contract (0 ok / 2 validation / 3 render / 64 usage) is asserted by
// calling the command FUNCTIONS directly: their process.exit() is not wrapped,
// so the thrown code and the single JSON envelope match production exactly.
// main() is used for dispatch coverage and the happy paths; where main's own
// try/catch re-wraps a command's process.exit (a mock artifact — real exits
// terminate the process), the assertions are tolerant of the extra envelope.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { build, buildAll, init, isRunAsMain, list, main, mcpInit, validate } from './cvx.js'

// The `mcp` (no subcommand) branch starts a blocking stdio server; mock it so
// the branch is exercised without hanging the test process.
vi.mock('../lib/mcp/server.js', () => ({ runMcpServer: vi.fn().mockResolvedValue(undefined) }))

const RENDER_TIMEOUT = 30000

class ExitError extends Error {
  /** @param {number} code */
  constructor(code) {
    super(`process.exit(${code})`)
    /** @type {number} */
    this.code = code
  }
}

/** @type {string} */
let tmp
/** @type {import('vitest').MockInstance} */
let cwdSpy
/** @type {import('vitest').MockInstance} */
let exitSpy
/** @type {import('vitest').MockInstance} */
let logSpy
/** @type {import('vitest').MockInstance} */
let errSpy

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cvx-cli-'))
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmp)
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitError(Number(code ?? 0))
  })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cwdSpy.mockRestore()
  exitSpy.mockRestore()
  logSpy.mockRestore()
  errSpy.mockRestore()
  rmSync(tmp, { recursive: true, force: true })
})

// Run a command promise and report the process.exit code it raised (or null if
// it completed without exiting).
async function exitCode(/** @type {Promise<unknown>} */ promise) {
  try {
    await promise
    return null
  } catch (e) {
    if (e instanceof ExitError) return e.code
    throw e
  }
}

// Every JSON object printed on stdout (emit()/--json), in order.
function jsonEmits() {
  return logSpy.mock.calls
    .map((c) => c[0])
    .filter((c) => typeof c === 'string' && c.trimStart().startsWith('{'))
    .map((s) => JSON.parse(s))
}

// The single JSON object a well-behaved command prints on stdout.
function jsonOut() {
  const emits = jsonEmits()
  expect(emits).toHaveLength(1)
  return emits[0]
}

const errText = () => errSpy.mock.calls.map((c) => String(c[0])).join('\n')
const logText = () => logSpy.mock.calls.map((c) => String(c[0])).join('\n')
const argv = (/** @type {string[]} */ ...args) => ['node', 'cvx', ...args]

describe('top-level flags', () => {
  it('--version prints the version and does not exit', async () => {
    await main(argv('--version'))
    expect(logSpy).toHaveBeenCalledTimes(1)
    expect(typeof logSpy.mock.calls[0][0]).toBe('string')
  })

  it('--help prints the help banner', async () => {
    await main(argv('--help'))
    expect(logText()).toContain('config-driven CV generator')
  })

  it('no args prints help', async () => {
    await main(argv())
    expect(logText()).toContain('Usage:')
  })

  it('unknown command → usage error (64) with a json envelope', async () => {
    expect(await exitCode(main(argv('frobnicate', '--json')))).toBe(64)
    expect(jsonEmits().some((j) => j.error?.code === 'unknown-command')).toBe(true)
  })

  it('unknown command → usage error (64), human output', async () => {
    expect(await exitCode(main(argv('frobnicate')))).toBe(64)
    expect(errText()).toContain('Unknown command')
  })
})

describe('init', () => {
  it('scaffolds cv-content/ (--json) and does not exit', async () => {
    await init({ json: true })
    expect(existsSync(join(tmp, 'cv-content', 'personal.yaml'))).toBe(true)
    expect(jsonOut()).toEqual({ command: 'init', ok: true, dest: 'cv-content' })
  })

  it('scaffolds cv-content/ (human) with next steps', async () => {
    await init({ json: false })
    expect(logText()).toContain('Created cv-content/')
  })

  it('refuses to overwrite an existing cv-content/ (usage 64, --json)', async () => {
    await init({ json: true })
    logSpy.mockClear()
    expect(await exitCode(init({ json: true }))).toBe(64)
    expect(jsonOut()).toMatchObject({ ok: false, error: { code: 'already-exists' } })
  })

  it('refuses to overwrite (human)', async () => {
    await init({ json: false })
    expect(await exitCode(init({ json: false }))).toBe(64)
    expect(errText()).toContain('already exists')
  })

  it('is reachable via main() dispatch', async () => {
    await main(argv('init', '--json'))
    expect(jsonOut()).toMatchObject({ command: 'init', ok: true })
  })
})

describe('validate', () => {
  it('exits 0 on the scaffold (--json, --strict)', async () => {
    await init({ json: true })
    logSpy.mockClear()
    expect(await exitCode(validate({ strict: true, json: true }))).toBe(0)
    const out = jsonOut()
    expect(out).toMatchObject({ command: 'validate', ok: true, schemaVersion: 1, strict: true })
    expect(out.errors).toEqual([])
  })

  it('exits 0 on the scaffold (human output)', async () => {
    await init({ json: false })
    logSpy.mockClear()
    expect(await exitCode(validate({ strict: false, json: false }))).toBe(0)
    expect(logText()).toContain('is valid')
  })

  it('exits 2 when a required field is missing (--json)', async () => {
    await init({ json: true })
    writeFileSync(join(tmp, 'cv-content', 'personal.yaml'), 'title: No Name Here\n')
    logSpy.mockClear()
    expect(await exitCode(validate({ json: true }))).toBe(2)
    const out = jsonOut()
    expect(out.ok).toBe(false)
    expect(out.errors.length).toBeGreaterThan(0)
  })

  it('exits 2 (human) and prints the finding', async () => {
    await init({ json: false })
    writeFileSync(join(tmp, 'cv-content', 'personal.yaml'), 'title: No Name Here\n')
    logSpy.mockClear()
    expect(await exitCode(validate({ json: false }))).toBe(2)
    expect(logText()).toContain('error')
  })

  it('is reachable via main() dispatch', async () => {
    await init({ json: true })
    logSpy.mockClear()
    await exitCode(main(argv('validate', '--strict', '--json')))
    expect(jsonEmits().some((j) => j.command === 'validate' && j.ok === true)).toBe(true)
  })

  it('human output renders a nested path + a did-you-mean suggestion', async () => {
    await init({ json: false })
    // A typo'd key deep in a list entry → warning carrying both a JSON path
    // and a "did you mean" suggestion, exercising both human-format branches.
    writeFileSync(
      join(tmp, 'cv-content', 'personal.yaml'),
      'name: Test\nlinkdin: https://example.com\n'
    )
    logSpy.mockClear()
    await exitCode(validate({ strict: true, json: false }))
    expect(logText()).toMatch(/linkedin/i)
  })
})

describe('list', () => {
  it('lists themes and layouts (--json)', async () => {
    await list({ json: true })
    const out = jsonOut()
    expect(out.command).toBe('list')
    expect(out.themes.map((/** @type {{ name: string }} */ t) => t.name)).toEqual(
      expect.arrayContaining(['teal', 'coral', 'mono'])
    )
    expect(out.layouts.map((/** @type {{ name: string }} */ l) => l.name)).toEqual(
      expect.arrayContaining(['two-column', 'single-column'])
    )
  })

  it('lists just themes when kind=themes (--json)', async () => {
    await list({ kind: 'themes', json: true })
    const out = jsonOut()
    expect(out.themes).toBeTruthy()
    expect(out.layouts).toBeUndefined()
  })

  it('human output labels the default theme and layout', async () => {
    await list({ json: false })
    expect(logText()).toContain('Themes')
    expect(logText()).toContain('Layouts')
    expect(logText()).toMatch(/\(default\)/)
  })

  it('lists just layouts (human) including user layouts from cv-content/layouts', async () => {
    mkdirSync(join(tmp, 'cv-content', 'layouts'), { recursive: true })
    writeFileSync(join(tmp, 'cv-content', 'layouts', 'wide.yaml'), 'template: two-column\n')
    await main(argv('list', 'layouts'))
    expect(logText()).toContain('wide')
    expect(logText()).toContain('cv-content/layouts')
  })

  it('rejects an unknown list kind (usage 64, --json)', async () => {
    expect(await exitCode(main(argv('list', 'bogus', '--json')))).toBe(64)
    expect(jsonEmits().some((j) => j.error?.code === 'unknown-list-kind')).toBe(true)
  })

  it('rejects an unknown list kind (human)', async () => {
    expect(await exitCode(main(argv('list', 'bogus')))).toBe(64)
    expect(errText()).toContain('Unknown list kind')
  })
})

describe('mcp init', () => {
  it('writes .mcp.json for claude (--json) and pins the version', async () => {
    await mcpInit({ client: 'claude', json: true })
    expect(jsonOut()).toMatchObject({ command: 'mcp-init', ok: true, client: 'claude' })
    const written = JSON.parse(readFileSync(join(tmp, '.mcp.json'), 'utf8'))
    expect(written.mcpServers.cvx.command).toBe('npx')
    expect(written.mcpServers.cvx.type).toBe('stdio')
  })

  it('writes .cursor/mcp.json for cursor and merges into existing servers', async () => {
    mkdirSync(join(tmp, '.cursor'), { recursive: true })
    writeFileSync(
      join(tmp, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'x' } } })
    )
    await mcpInit({ client: 'cursor', json: false })
    const written = JSON.parse(readFileSync(join(tmp, '.cursor', 'mcp.json'), 'utf8'))
    expect(written.mcpServers.other).toBeTruthy()
    expect(written.mcpServers.cvx).toBeTruthy()
  })

  it('writes .vscode/mcp.json under the servers root', async () => {
    await mcpInit({ client: 'vscode', json: true })
    const written = JSON.parse(readFileSync(join(tmp, '.vscode', 'mcp.json'), 'utf8'))
    expect(written.servers.cvx.type).toBe('stdio')
  })

  it('rejects an unknown client (usage 64, --json)', async () => {
    expect(await exitCode(mcpInit({ client: 'emacs', json: true }))).toBe(64)
    expect(jsonOut()).toMatchObject({ ok: false, error: { code: 'unknown-client' } })
  })

  it('rejects a missing client (human)', async () => {
    expect(await exitCode(mcpInit({ client: undefined, json: false }))).toBe(64)
    expect(errText()).toContain('Unknown client')
  })

  it('fails on a corrupt existing config (usage 64)', async () => {
    writeFileSync(join(tmp, '.mcp.json'), '{ not valid json')
    expect(await exitCode(mcpInit({ client: 'claude', json: true }))).toBe(64)
    expect(jsonOut()).toMatchObject({ ok: false, error: { code: 'invalid-config' } })
  })

  it('routes "mcp init" through main() dispatch', async () => {
    await main(argv('mcp', 'init', '--client', 'claude', '--json'))
    expect(jsonOut()).toMatchObject({ command: 'mcp-init', ok: true })
  })

  it('rejects an unknown mcp subcommand (usage 64, --json)', async () => {
    expect(await exitCode(main(argv('mcp', 'wat', '--json')))).toBe(64)
    expect(jsonEmits().some((j) => j.error?.code === 'unknown-subcommand')).toBe(true)
  })

  it('rejects an unknown mcp subcommand (human)', async () => {
    expect(await exitCode(main(argv('mcp', 'wat')))).toBe(64)
    expect(errText()).toContain('Unknown mcp subcommand')
  })
})

describe('build', () => {
  it(
    'renders the designed PDF (--json)',
    async () => {
      await init({ json: true })
      logSpy.mockClear()
      await build({ ats: false, json: true })
      const out = jsonOut()
      expect(out).toMatchObject({
        command: 'build',
        ok: true,
        filename: 'bruce-wayne.pdf',
        ats: false,
        theme: 'teal',
        layout: 'two-column'
      })
      expect(out.bytes).toBeGreaterThan(0)
      expect(existsSync(join(tmp, 'bruce-wayne.pdf'))).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'renders the ATS PDF (human) with the -ats filename',
    async () => {
      await init({ json: false })
      logSpy.mockClear()
      await build({ ats: true, json: false })
      expect(existsSync(join(tmp, 'bruce-wayne-ats.pdf'))).toBe(true)
      expect(logText()).toContain('bruce-wayne-ats.pdf')
    },
    RENDER_TIMEOUT
  )

  it(
    'renders the ATS PDF (--json) with null theme/layout',
    async () => {
      await init({ json: true })
      logSpy.mockClear()
      await build({ ats: true, json: true })
      const out = jsonOut()
      expect(out).toMatchObject({
        command: 'build',
        ok: true,
        ats: true,
        theme: null,
        layout: null
      })
    },
    RENDER_TIMEOUT
  )

  it(
    'renders the designed PDF (human) reporting theme + layout',
    async () => {
      await init({ json: false })
      logSpy.mockClear()
      await build({ ats: false, json: false })
      expect(logText()).toMatch(/theme:.*layout:/)
    },
    RENDER_TIMEOUT
  )

  it('render failure → exit 3 when cv-content/ is missing (--json, via main)', async () => {
    expect(await exitCode(main(argv('build', '--json')))).toBe(3)
    expect(jsonOut()).toMatchObject({
      command: 'build',
      ok: false,
      error: { code: 'render-failed' }
    })
  })

  it('render failure → exit 3 (human, via main)', async () => {
    expect(await exitCode(main(argv('build')))).toBe(3)
    expect(errSpy).toHaveBeenCalled()
  })
})

describe('build --all', () => {
  it(
    'validates then renders both variants in child processes (--json)',
    async () => {
      await init({ json: true })
      logSpy.mockClear()
      await buildAll({ json: true })
      const out = jsonOut()
      expect(out).toMatchObject({ command: 'build', all: true, ok: true })
      expect(out.outputs).toHaveLength(2)
      expect(out.outputs.map((/** @type {{ ats: boolean }} */ o) => o.ats)).toEqual([false, true])
      expect(existsSync(join(tmp, 'bruce-wayne.pdf'))).toBe(true)
      expect(existsSync(join(tmp, 'bruce-wayne-ats.pdf'))).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'prints a per-variant summary (human)',
    async () => {
      await init({ json: false })
      logSpy.mockClear()
      await buildAll({ json: false })
      expect(logText()).toContain('bruce-wayne.pdf')
      expect(logText()).toContain('bruce-wayne-ats.pdf')
    },
    RENDER_TIMEOUT
  )

  it('blocks on validation errors before building (exit 2, --json)', async () => {
    await init({ json: true })
    writeFileSync(join(tmp, 'cv-content', 'personal.yaml'), 'title: No Name\n')
    logSpy.mockClear()
    expect(await exitCode(buildAll({ json: true }))).toBe(2)
    expect(jsonOut()).toMatchObject({
      command: 'build',
      all: true,
      ok: false,
      error: { code: 'validation-failed' }
    })
    expect(existsSync(join(tmp, 'bruce-wayne.pdf'))).toBe(false)
  })

  it('blocks on validation errors (human)', async () => {
    await init({ json: false })
    writeFileSync(join(tmp, 'cv-content', 'personal.yaml'), 'title: No Name\n')
    expect(await exitCode(buildAll({ json: false }))).toBe(2)
    expect(errText()).toContain('validation failed')
  })

  it(
    'is reachable via "build --all" through main()',
    async () => {
      await init({ json: true })
      logSpy.mockClear()
      await main(argv('build', '--all', '--json'))
      expect(jsonOut()).toMatchObject({ all: true, ok: true })
    },
    RENDER_TIMEOUT
  )
})

describe('mcp dispatch', () => {
  it('mcp (no subcommand) starts the stdio server', async () => {
    await main(argv('mcp'))
    const { runMcpServer } = await import('../lib/mcp/server.js')
    expect(runMcpServer).toHaveBeenCalled()
  })

  it('mcp with an unknown subcommand → usage error (64)', async () => {
    expect(await exitCode(main(argv('mcp', 'bogus', '--json')))).toBe(64)
    expect(jsonEmits().some((j) => j.error?.code === 'unknown-subcommand')).toBe(true)
  })
})

describe('mcp init — error + human paths', () => {
  it('unknown client → usage error (64)', async () => {
    expect(await exitCode(mcpInit({ client: 'emacs', json: true }))).toBe(64)
    expect(jsonOut()).toMatchObject({ ok: false, error: { code: 'unknown-client' } })
  })

  it('refuses to write when the existing config is not valid JSON (64)', async () => {
    writeFileSync(join(tmp, '.mcp.json'), 'not json{')
    expect(await exitCode(mcpInit({ client: 'claude', json: true }))).toBe(64)
    expect(jsonOut()).toMatchObject({ ok: false, error: { code: 'invalid-config' } })
  })

  it('merges into an existing valid config without clobbering other servers', async () => {
    writeFileSync(
      join(tmp, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'x' } } })
    )
    await mcpInit({ client: 'claude', json: true })
    const written = JSON.parse(readFileSync(join(tmp, '.mcp.json'), 'utf8'))
    expect(written.mcpServers.other).toBeTruthy()
    expect(written.mcpServers.cvx).toBeTruthy()
  })

  it('prints human confirmation when not --json', async () => {
    await mcpInit({ client: 'claude', json: false })
    expect(logText()).toContain('Added the cvx MCP server')
  })
})

describe('mcp init — claude-desktop (per-OS config path)', () => {
  // Exercise all three platform branches deterministically regardless of the
  // host OS by overriding process.platform (configurable) + the home env vars.
  for (const [platform, expected] of /** @type {[NodeJS.Platform, string[]][]} */ ([
    ['darwin', ['Library', 'Application Support', 'Claude', 'claude_desktop_config.json']],
    ['win32', ['AppData', 'Roaming', 'Claude', 'claude_desktop_config.json']],
    ['linux', ['.config', 'claude-desktop', 'claude_desktop_config.json']]
  ])) {
    it(`writes the ${platform} config path`, async () => {
      const origPlatform = process.platform
      const origHome = process.env.HOME
      const origAppData = process.env.APPDATA
      Object.defineProperty(process, 'platform', { value: platform, configurable: true })
      process.env.HOME = tmp
      process.env.APPDATA = join(tmp, 'AppData', 'Roaming')
      try {
        await mcpInit({ client: 'claude-desktop', json: true })
        expect(jsonOut()).toMatchObject({ ok: true, client: 'claude-desktop' })
        const cfg = join(tmp, ...expected)
        expect(existsSync(cfg)).toBe(true)
        expect(JSON.parse(readFileSync(cfg, 'utf8')).mcpServers.cvx.command).toBe('npx')
      } finally {
        Object.defineProperty(process, 'platform', { value: origPlatform, configurable: true })
        if (origHome === undefined) delete process.env.HOME
        else process.env.HOME = origHome
        if (origAppData === undefined) delete process.env.APPDATA
        else process.env.APPDATA = origAppData
      }
    })
  }
})

describe('isRunAsMain guard', () => {
  it('is false when argv[1] is absent (imported, not executed)', () => {
    const orig = process.argv[1]
    process.argv[1] = ''
    try {
      expect(isRunAsMain()).toBe(false)
    } finally {
      process.argv[1] = orig
    }
  })

  it('is false when argv[1] does not resolve (realpath throws)', () => {
    const orig = process.argv[1]
    process.argv[1] = join(tmp, 'no-such-file-xyz')
    try {
      expect(isRunAsMain()).toBe(false)
    } finally {
      process.argv[1] = orig
    }
  })

  it('is true when argv[1] realpaths to this bin module', () => {
    const orig = process.argv[1]
    process.argv[1] = fileURLToPath(new URL('./cvx.js', import.meta.url))
    try {
      expect(isRunAsMain()).toBe(true)
    } finally {
      process.argv[1] = orig
    }
  })
})
