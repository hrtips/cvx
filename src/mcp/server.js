/**
 * cvx MCP server — stdio transport, 4 tools (see tools.js).
 *
 * Uses the SDK's low-level Server class so tool input schemas stay plain
 * JSON Schema (the same shapes documented in schema/v1) instead of a second
 * zod copy that could drift. stdout belongs to the protocol — anything
 * human-facing goes to stderr.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TOOLS } from './tools.js'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export async function runMcpServer() {
  const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))

  const server = new Server(
    { name: 'cvx', version },
    {
      capabilities: { tools: {} },
      instructions:
        'CVX renders CVs from plain YAML (cv-content/) to pixel-perfect PDFs, fully locally. ' +
        'Loop: get_schema → init_cv (if no cv-content/ yet) → edit the YAML files with the user\'s real details → validate_cv after every edit → build_pdf. ' +
        'Never invent facts: every entry must be truthful to the user\'s real history, especially keywords.yaml (ATS parsers cross-check keywords against the CV body). ' +
        'Pass the workspace folder as `dir` (absolute path) on every call.',
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = TOOLS.find((t) => t.name === request.params.name)
    if (!tool) {
      return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code: 'unknown-tool', message: `unknown tool: ${request.params.name}` } }) }], isError: true }
    }
    try {
      const result = await tool.handler(request.params.arguments ?? {})
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: /** @type {{ ok?: boolean }} */ (result)?.ok === false,
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, error: { code: 'tool-failed', message: /** @type {Error} */ (err).message } }) }],
        isError: true,
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`cvx mcp v${version} — stdio server ready (tools: ${TOOLS.map((t) => t.name).join(', ')})`)
}
