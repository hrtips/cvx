// Tripwire: the canonical schema is the single source of truth, and the
// human doc copies must keep restating it. If a key is added to the schema
// without documenting it, this fails — the reverse (docs mention keys the
// schema lacks) is caught by schema.test.js validating the shipped content.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { TOOLS } from '../src/mcp/tools.js'
import { packageVersion, scaffoldContent, schemaRefFor } from '../src/pdf/scaffold.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
/** Derived from the server, so a new tool cannot ship undocumented. */
const TOOL_NAMES = TOOLS.map((t) => t.name)
const schema = JSON.parse(readFileSync(path.join(ROOT, 'schema', 'v1', 'cvx.schema.json'), 'utf8'))
const cvSchemaDoc = readFileSync(path.join(ROOT, 'docs', 'cv-schema.md'), 'utf8')
const scaffoldReadme = readFileSync(path.join(ROOT, 'template', 'cv-content', 'README.md'), 'utf8')
const aiGuide = readFileSync(path.join(ROOT, 'docs', 'ai-guide.md'), 'utf8')
const skillMd = readFileSync(path.join(ROOT, 'skills', 'cvx', 'SKILL.md'), 'utf8')
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
const llms = readFileSync(path.join(ROOT, 'llms.txt'), 'utf8')

const CONTENT_DEFS = [
  'personal',
  'summary',
  'experience',
  'education',
  'certifications',
  'publications',
  'languages',
  'competencies',
  'achievements',
  'referees',
  'keywords',
  'config'
]

const keysOf = (def) => Object.keys(schema.$defs[def]?.properties ?? {})

describe('docs/cv-schema.md restates the schema', () => {
  it('documents every content file', () => {
    for (const def of CONTENT_DEFS) {
      expect(cvSchemaDoc, `missing section for ${def}.yaml`).toContain(`\`${def}.yaml\``)
    }
  })

  const keyed = {
    personal: keysOf('personal'),
    experience: keysOf('experienceEntry'),
    education: keysOf('educationEntry'),
    certifications: keysOf('certificationEntry'),
    publications: keysOf('publicationEntry'),
    languages: keysOf('languageEntry'),
    achievements: keysOf('achievementEntry'),
    referees: keysOf('refereeEntry'),
    config: [
      ...keysOf('config').filter((k) => k !== 'atsKeywords'),
      ...Object.keys(schema.$defs.config.properties.atsKeywords.properties).map(
        (k) => `atsKeywords.${k}`
      )
    ],
    'bullet object': Object.keys(schema.$defs.bulletItem.oneOf[1].properties)
  }
  for (const [group, keys] of Object.entries(keyed)) {
    it(`documents every ${group} key`, () => {
      for (const key of keys) {
        expect(cvSchemaDoc, `cv-schema.md does not mention \`${key}\``).toContain(`\`${key}\``)
      }
    })
  }
})

describe('scaffold README and AI guide stay aligned', () => {
  it('scaffold README mentions every content file', () => {
    for (const def of CONTENT_DEFS) {
      expect(scaffoldReadme, `template README missing ${def}.yaml`).toContain(`${def}.yaml`)
    }
  })

  it('AI guide Route C prompt covers every content file and the validate step', () => {
    for (const def of CONTENT_DEFS) {
      expect(aiGuide, `ai-guide Route C missing ${def}.yaml`).toContain(`${def}.yaml`)
    }
    expect(aiGuide).toContain('validate')
    expect(aiGuide).toContain('schemaVersion')
  })

  it('SKILL.md covers every content file, the MCP tools, and the truthfulness rule', () => {
    for (const def of CONTENT_DEFS) {
      expect(skillMd, `SKILL.md missing ${def}.yaml`).toContain(`${def}.yaml`)
    }
    for (const tool of TOOL_NAMES) {
      expect(skillMd, `SKILL.md missing tool ${tool}`).toContain(tool)
    }
    expect(skillMd).toMatch(/[Nn]ever invent facts/)
    // review → brainstorm → pre-build preview (maintainer requirements, 2026-07-26)
    expect(skillMd).toMatch(/brainstorm/i)
    expect(skillMd).toMatch(/batched into one message/)
    expect(skillMd).toMatch(/Pre-build preview/i)
    expect(aiGuide).toMatch(/brainstorm/i)
    expect(aiGuide).toMatch(/Show what's going in before you build/)
    const [, frontmatter] = skillMd.split('---')
    expect(frontmatter).toContain('name: cvx')
    expect(frontmatter.length).toBeLessThan(1500)
  })
})

// The "two-line prompt" front door: a non-tech user pastes the repo URL +
// their CV source into any LLM chat, and the fetched docs carry the assistant
// from there. These lock the load-bearing invariants from the PM/BA review.
describe('assistant entry path stays intact', () => {
  it('README addresses assistants above the fold, with a raw ai-guide URL', () => {
    const fold = readme.slice(0, 3500)
    expect(fold).toMatch(/AI assistants/i)
    expect(fold).toContain('raw.githubusercontent.com/hrtips/cvx/main/docs/ai-guide.md')
    expect(fold).toMatch(/never invent facts/i)
    expect(fold).toContain('Save to PDF')
  })

  it('README carries the two-line user prompt', () => {
    expect(readme).toMatch(/Create my CV with https:\/\/github\.com\/hrtips\/cvx/)
  })

  it('ai-guide default flow precedes the human routes and covers the fallbacks', () => {
    const flow = aiGuide.indexOf('Default flow (for assistants)')
    expect(flow).toBeGreaterThan(-1)
    expect(flow).toBeLessThan(aiGuide.indexOf('## Route A'))
    expect(aiGuide).toContain('Save to PDF') // LinkedIn export ask
    expect(aiGuide).toMatch(/linkedin[\s\S]{0,120}unfetchable/i)
    expect(aiGuide).toContain('nodejs.org') // non-tech Node install
    expect(aiGuide).toMatch(/no npm network|no network/i) // sandbox fallback
    expect(aiGuide).toMatch(/only renderer|never substitute/i)
    expect(aiGuide).toMatch(/Bruce Wayne('s)? (example )?photo/i) // placeholder trap
    expect(aiGuide).toMatch(/`init` is a convenience, not a prerequisite/)
    // dogfood report 2026-07-26: bounded probe, same-turn fallback, no research sinks
    expect(aiGuide).toMatch(/timeout 30s npx/)
    expect(aiGuide).toMatch(/same turn/i)
    expect(aiGuide).toMatch(/research sink/i)
  })

  it('llms.txt is self-sufficient and truthful', () => {
    expect(llms).not.toMatch(/schema below/)
    expect(llms).toContain('Save to PDF')
    expect(llms).toContain('npx @hrtips/cvx build')
    expect(llms).toMatch(/never invent facts/i)
  })

  it('raw URLs referenced by the docs point at files that exist in the repo', () => {
    const all = readme + aiGuide + llms + cvSchemaDoc + skillMd
    for (const [, p] of all.matchAll(
      /raw\.githubusercontent\.com\/hrtips\/cvx\/main\/([\w./-]+)/g
    )) {
      expect(existsSync(path.join(ROOT, p)), `dangling raw URL: ${p}`).toBe(true)
    }
  })

  it('README anchors into ai-guide resolve to real headings', () => {
    const slug = (h) =>
      h
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/ /g, '-')
    const headings = [...aiGuide.matchAll(/^#+\s+(.+)$/gm)].map(([, h]) => slug(h))
    for (const [, a] of readme.matchAll(/docs\/ai-guide\.md#([\w-]+)/g)) {
      expect(headings, `dead anchor #${a}`).toContain(a)
    }
  })
})

// ── The MCP tool surface, and the rules that travel with it (added C6a) ─────
// Two different failure modes, both cheap to catch here: a tool that ships
// without reaching any doc a model reads, and — the one C4's evidence makes
// expensive — a diagnostic that reaches a model WITHOUT the sentence saying it
// is not a target. An assistant optimising `emptyColumn` toward zero lands in
// exactly the layouts the sprint measured and rejected.
describe('MCP tools and the layout-reading rules are documented wherever a model looks', () => {
  const MODEL_FACING = [
    ['skills/cvx/SKILL.md', skillMd],
    ['docs/ai-guide.md', aiGuide],
    ['llms.txt', llms],
    ['README.md', readme]
  ]

  it('every doc that explains fill teaches the v2 occupancy semantics, and none the v1 denominator', () => {
    // §3.9: fill's denominator changed (residual budget → whole column). A doc
    // describing v1 next to a v2 payload would send every reader to the exact
    // misreading the redefinition exists to end — page 1 "40% empty" while the
    // column is 80% occupied.
    for (const [name, text] of MODEL_FACING) {
      if (!/\bfill\b/.test(text)) continue
      expect(text, `${name} explains fill without the v2 occupancy definition`).toMatch(
        /occupancy/i
      )
      expect(text, `${name} still teaches fill's v1 denominator`).not.toMatch(
        /fill.{0,40}used \/ budget/i
      )
    }
  })

  it('every shipped tool is named in the docs a model reads first', () => {
    for (const [name, text] of MODEL_FACING) {
      for (const tool of TOOL_NAMES) {
        expect(text, `${name} does not mention the ${tool} tool`).toContain(tool)
      }
    }
  })

  it('the never-drop-content rule is stated wherever the layout is discussed', () => {
    // Invariant 0 restated for the operator: CVX never drops content to fit, so
    // neither does the assistant driving it — it surfaces the trade-off instead.
    for (const [name, text] of MODEL_FACING) {
      expect(text, `${name} does not carry the never-drop-content rule`).toMatch(
        /never drop.{0,40}content|never drops.{0,60}(to fit|to save a page)/i
      )
      expect(text, `${name} does not say the trade-off goes to the user`).toMatch(
        /trade-off|let them (decide|choose)/i
      )
    }
  })

  it('any doc that reports emptyColumn also says it is not a target', () => {
    const stale = MODEL_FACING.filter(
      ([, text]) => /emptyColumn/.test(text) && !/not a target|not targets/i.test(text)
    ).map(([name]) => name)
    expect(stale, `reports emptyColumn without the caveat: ${stale}`).toEqual([])
    // ...and at least one of them actually does report it, so this is not vacuous.
    expect(MODEL_FACING.some(([, text]) => /emptyColumn/.test(text))).toBe(true)
  })

  it('SKILL.md and the AI guide both carry the layout-reading loop', () => {
    for (const [name, text] of [
      ['skills/cvx/SKILL.md', skillMd],
      ['docs/ai-guide.md', aiGuide]
    ]) {
      expect(text, `${name} has no "reading the layout" section`).toMatch(/Reading the layout/i)
      expect(text, `${name} does not say there are no layout levers`).toMatch(/no layout levers/i)
    }
  })
})

// ── Layout page-kind semantics (added C3a) ──────────────────────────────────
// docsSync is otherwise a key-presence tripwire over the CONTENT $defs, which
// makes it structurally blind to a *semantic* change in prose — and C3a made
// exactly one: the sidebar's three page-kind buckets are now concatenated into
// a single measured flow, so `pages.last.sidebar` sets ORDER, not the page a
// section renders on. Four docs restate that contract, and a stale copy of it
// is actively misleading (a user would expect referees on the last page and get
// it on page 2). These assertions are the narrowest thing that can catch that:
// any doc that shows the `pages:` bucket structure must also carry the
// clarification, and the schema description must too.
describe('layout page-kind buckets: the sidebar-is-one-flow contract is stated wherever the buckets are', () => {
  const layoutPage = schema.$defs.layoutPage
  const DOCS_SHOWING_BUCKETS = [
    ['docs/cv-schema.md', cvSchemaDoc],
    ['README.md', readme],
    ['template/cv-content/README.md', scaffoldReadme]
  ]

  it('the schema itself says the sidebar lists are one ordered flow, and that main lists are per-page-kind', () => {
    expect(layoutPage.description).toMatch(/one ordered flow/i)
    expect(layoutPage.description).toMatch(/per-page-kind/i)
    expect(layoutPage.properties.sidebar.description).toMatch(/flow/i)
  })

  it('every doc that shows the pages: {first, continuation, last} structure also states it', () => {
    const stale = DOCS_SHOWING_BUCKETS.filter(
      ([, text]) =>
        /continuation/.test(text) && !/one ordered flow|single ordered (sidebar )?flow/i.test(text)
    ).map(([name]) => name)
    expect(stale, `documents the page-kind buckets without the flow semantics: ${stale}`).toEqual(
      []
    )
  })

  it('...and none of them still claims a sidebar bucket picks the page a section renders on', () => {
    const wrong = DOCS_SHOWING_BUCKETS.filter(([, text]) =>
      /`?last`?:?\s*#?\s*(the )?final page\b/i.test(text)
    ).map(([name]) => name)
    expect(wrong, `still describes last.sidebar as a page assignment: ${wrong}`).toEqual([])
  })
})

// ── Nothing CVX SCAFFOLDS may point at `main` on a released version ─────────
//
// A user on a pinned CVX follows references that can change under them: the
// `$schema` headers make their editor validate against a schema they never
// installed, and the doc links open instructions for a version they are not
// running. This runs the real scaffolder into a temp dir and reads what a user
// would actually get — the template keeping `main` (correct: it is the source
// on main, and the source of the rewrite) is exactly why a static assertion
// over template/ could not catch a regression here.
describe('scaffolded files pin to the running release, never to main', () => {
  /** @type {string[]} */
  const dirs = []
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })
  const scaffold = (/** @type {string} */ version) => {
    const root = mkdtempSync(path.join(tmpdir(), 'cvx-docsync-'))
    dirs.push(root)
    const dest = path.join(root, 'cv-content')
    return { dest, ...scaffoldContent(dest, { version }) }
  }

  /** Every text file a user gets, relative to cv-content/. */
  const textFiles = (/** @type {string} */ dest) => {
    /** @type {string[]} */
    const out = []
    const walk = (/** @type {string} */ rel) => {
      for (const entry of readdirSync(path.join(dest, rel), { withFileTypes: true })) {
        const next = rel ? path.join(rel, entry.name) : entry.name
        if (entry.isDirectory()) walk(next)
        else if (/\.(ya?ml|md)$/.test(entry.name)) out.push(next)
      }
    }
    walk('')
    return out
  }

  it('a release scaffold carries no main URL in any yaml or markdown file', () => {
    const { dest, ref } = scaffold('1.7.0')
    expect(ref).toBe('v1.7.0')
    const files = textFiles(dest)
    expect(files.length).toBeGreaterThan(12)
    for (const rel of files) {
      expect(
        readFileSync(path.join(dest, rel), 'utf8'),
        `scaffolded ${rel} still points at the main branch`
      ).not.toMatch(/github(usercontent)?\.com\/hrtips\/cvx\/(blob\/)?main\//)
    }
  })

  it('the scaffold this checkout actually produces obeys the rule for its own version', () => {
    // Not a re-run of the above with a literal: the running version is the one
    // a user gets, and if it is a stable release the scaffold must be pinned.
    const version = packageVersion()
    const { dest, ref } = scaffold(version)
    expect(ref).toBe(schemaRefFor(version))
    const offenders = textFiles(dest).filter((rel) =>
      /hrtips\/cvx\/(blob\/)?main\//.test(readFileSync(path.join(dest, rel), 'utf8'))
    )
    // Asserted in BOTH directions, without a conditional: on a release nothing
    // may still say `main`, and on an unreleased build the copy must be
    // verbatim (files still saying `main`) — otherwise a fallback that had
    // quietly become a rewrite to a phantom tag would pass unnoticed.
    const state = offenders.length === 0 ? 'pinned' : 'left-on-main'
    expect(
      `${ref} → ${state}`,
      `version ${version}; scaffolded files still on main: ${offenders}`
    ).toBe(ref === 'main' ? 'main → left-on-main' : `${ref} → pinned`)
  })

  it('the template itself keeps main — the pin is derived at init, never baked in', () => {
    const templateDir = path.join(ROOT, 'template', 'cv-content')
    expect(readFileSync(path.join(templateDir, 'personal.yaml'), 'utf8')).toContain(
      'raw.githubusercontent.com/hrtips/cvx/main/schema/v1/personal.schema.json'
    )
    for (const rel of textFiles(templateDir)) {
      expect(
        readFileSync(path.join(templateDir, rel), 'utf8'),
        `template/${rel} bakes in a version — it must be derived from package.json at init time`
      ).not.toMatch(/hrtips\/cvx\/(blob\/)?v\d+\.\d+\.\d+\//)
    }
  })
})

// ── The model-facing docs must actually SHIP ────────────────────────────────
// SKILL.md tells an assistant the guides are in the installed package, and the
// MCP get_schema tool reads them off disk. Both are false the moment
// package.json's "files" stops carrying them — and a `files` edit is exactly
// the kind of change that looks harmless.
describe('the docs a model is told to read are inside the tarball', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

  it('package.json ships the model-facing docs, by path, and not the internal ones', () => {
    expect(pkg.files).toContain('docs/ai-guide.md')
    expect(pkg.files).toContain('docs/cv-schema.md')
    // Path-based on purpose: `docs` as a directory would drag in
    // hostile-baseline.md, an internal quality record.
    expect(pkg.files).not.toContain('docs')
    expect(existsSync(path.join(ROOT, 'docs', 'hostile-baseline.md'))).toBe(true)
    expect(pkg.files.some((/** @type {string} */ f) => f.startsWith('docs/hostile'))).toBe(false)
  })

  it('get_schema advertises them, and returns the text inline when asked', () => {
    const getSchema = TOOLS.find((t) => t.name === 'get_schema')
    expect(Object.keys(getSchema.inputSchema.properties)).toContain('guides')
    expect(getSchema.inputSchema.properties.guides.items.enum).toEqual(['ai-guide', 'cv-schema'])
    // The description has to tell the model the inline route exists — a path it
    // cannot read is not a fallback.
    expect(getSchema.description).toMatch(/guides: \["ai-guide"\]/)
  })

  it('SKILL.md points at the packaged copy first, with the URL only as a fallback', () => {
    expect(skillMd).toMatch(/ship with CVX|ships with CVX|inside the installed package/i)
    expect(skillMd).toContain('docs/ai-guide.md')
    expect(skillMd).toMatch(/guides: \["ai-guide"\]/)
    // The GitHub URL survives for anyone reading the skill outside an install,
    // but it must be introduced as the fallback, not the first move.
    const local = skillMd.search(/inside the installed package/i)
    const remote = skillMd.indexOf('raw.githubusercontent.com/hrtips/cvx/main/docs/ai-guide.md')
    expect(local).toBeGreaterThan(-1)
    expect(remote).toBeGreaterThan(local)
  })
})
