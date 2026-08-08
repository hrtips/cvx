/**
 * cvx MCP server — stdio transport, 5 tools (see tools.js).
 *
 * Uses the SDK's low-level Server class so tool input schemas stay plain
 * JSON Schema (the same shapes documented in schema/v1) instead of a second
 * zod copy that could drift. stdout belongs to the protocol — anything
 * human-facing goes to stderr.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import Ajv from 'ajv'
import { TOOLS } from './tools.js'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Validate tool arguments against the tool's own advertised `inputSchema`.
 *
 * Every tool declares `additionalProperties: false`, and until this existed
 * nothing enforced it: arguments went straight to the handler, so a client that
 * invented `fill`, `targetPages` or `density` got `ok: true` and a PDF built as
 * if it had asked for nothing. An argument that appears to work is worse than
 * one that is refused — it is how a caller comes to believe in a lever CVX does
 * not have (design doc §7.4 / the lever rule recorded in resolveDocument.js), and
 * how the day a real lever ships nobody can tell which builds honoured it.
 *
 * Ajv is already a dependency (validateContent.js validates cv-content with it),
 * and the schemas are plain JSON Schema by design — so the advertised contract
 * and the enforced one are the same object, not two copies that can drift.
 */
const ajv = new Ajv({ allErrors: true, strict: false })
const validators = new Map(TOOLS.map((t) => [t.name, ajv.compile(t.inputSchema)]))

/** @param {import('ajv').ErrorObject[] | null | undefined} errors */
function describeArgErrors(errors) {
  return (errors ?? [])
    .map((e) => {
      const where = e.instancePath ? e.instancePath.replace(/^\//, '') : ''
      if (e.keyword === 'additionalProperties') {
        const key = /** @type {{ additionalProperty?: string }} */ (e.params).additionalProperty
        return `unknown argument "${key}" — this tool takes no such option, and CVX has no hidden layout levers`
      }
      return `${where || 'arguments'} ${e.message}`
    })
    .join('; ')
}

/**
 * Run the cvx MCP server on `transport`.
 *
 * @param {import('@modelcontextprotocol/sdk/shared/transport.js').Transport} [transport]
 *   defaults to a fresh stdio transport (the production/CLI path). The
 *   parameter exists so the server can be driven in-process over an in-memory
 *   transport by the test suite; passing nothing preserves the original
 *   stdio behavior exactly.
 */
export async function runMcpServer(transport = new StdioServerTransport()) {
  const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

  const server = new Server(
    { name: 'cvx', version },
    {
      capabilities: { tools: {} },
      instructions:
        'CVX renders CVs from plain YAML (cv-content/) to pixel-perfect PDFs, fully locally. ' +
        "Loop: get_schema → init_cv (if no cv-content/ yet) → edit the YAML files with the user's real details → validate_cv after every edit → build_pdf. " +
        'plan_layout (optional, no PDF written) shows how the CV will paginate before you build it — page count, per-page fills, which roles land on page 1. ' +
        'CVX renders 100% of the YAML: it never drops, clips, or hides content to save a page. If the CV is longer than the user wants, surface the trade-off and let them choose — never cut content for them. ' +
        "Never invent facts: every entry must be truthful to the user's real history, especially keywords.yaml (ATS parsers cross-check keywords against the CV body). " +
        'Pass the workspace folder as `dir` (absolute path) on every call.'
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, title, description, inputSchema }) => ({
      name,
      title,
      description,
      inputSchema
    }))
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find((t) => t.name === request.params.name)
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: { code: 'unknown-tool', message: `unknown tool: ${request.params.name}` }
            })
          }
        ],
        isError: true
      }
    }
    const args = request.params.arguments ?? {}
    const validate = validators.get(tool.name)
    if (validate && !validate(args)) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: {
                code: 'invalid-arguments',
                message: `${tool.name}: ${describeArgErrors(validate.errors)}`
              }
            })
          }
        ],
        isError: true
      }
    }
    try {
      const result = await tool.handler(args)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: /** @type {{ ok?: boolean }} */ (result)?.ok === false
      }
    } catch (err) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              ok: false,
              error: { code: 'tool-failed', message: /** @type {Error} */ (err).message }
            })
          }
        ],
        isError: true
      }
    }
  })

  await server.connect(transport)
  console.error(
    `cvx mcp v${version} — stdio server ready (tools: ${TOOLS.map((t) => t.name).join(', ')})`
  )
}
