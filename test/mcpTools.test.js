// MCP tool layer: same behavior as the CLI's JSON envelopes, driven as
// plain functions with an explicit workspace dir.

import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPdf, getSchema, initCv, planLayout, TOOLS, validateCv } from '../src/mcp/tools.js'

const scratch = () => mkdtempSync(path.join(tmpdir(), 'cvx-mcp-'))

describe('TOOLS metadata', () => {
  it('exposes exactly the five sprint tools with model-facing descriptions', () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      'get_schema',
      'init_cv',
      'validate_cv',
      'build_pdf',
      'plan_layout'
    ])
    for (const tool of TOOLS) {
      expect(tool.description.length).toBeGreaterThan(80)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.additionalProperties).toBe(false)
      expect(typeof tool.handler).toBe('function')
    }
  })

  it('plan_layout takes only a dir — this slice exposes no layout levers at all', () => {
    // C6a is read-only. The day a lever is added it must arrive with the three
    // things resolveDocument.js records (plumbed through resolveDocument, added
    // to the config schema, given a fixture axis) — and this assertion is what
    // makes "we added an arg and shipped" impossible to do quietly.
    const plan = TOOLS.find((t) => t.name === 'plan_layout')
    expect(Object.keys(plan.inputSchema.properties)).toEqual(['dir'])
    expect(plan.inputSchema.required).toBeUndefined()
  })

  it('the tools that report emptyColumn say plainly it is not a target', () => {
    // The C4 finding this whole slice is fenced by: driving "planned pages with
    // an empty column" toward zero produces measurably worse CVs. The number is
    // reported because hiding a real property would be worse — but the model
    // reading the description must be told, and it must be told never to drop
    // content to fit.
    const plan = TOOLS.find((t) => t.name === 'plan_layout')
    expect(plan.description).toMatch(/NOT TARGETS/)
    expect(plan.description).toMatch(/never drop content/i)
    expect(plan.description).toMatch(/no layout levers/i)
  })
})

describe('get_schema', () => {
  it('returns the canonical schema, themes, and layouts', async () => {
    const result = await getSchema({ dir: scratch() })
    expect(result.schemaVersion).toBe(1)
    expect(Object.keys(result.schema.$defs)).toContain('personal')
    expect(result.themes.map((t) => t.name)).toEqual(
      expect.arrayContaining(['teal', 'coral', 'mono'])
    )
    expect(result.layouts.map((l) => l.name)).toEqual(
      expect.arrayContaining(['two-column', 'single-column'])
    )
  })
})

describe('init_cv → validate_cv → build_pdf loop', () => {
  it('scaffolds, validates strict-clean, and renders a PDF', async () => {
    const dir = scratch()

    const init = await initCv({ dir })
    expect(init.ok).toBe(true)
    expect(existsSync(path.join(dir, 'cv-content', 'personal.yaml'))).toBe(true)
    expect(existsSync(path.join(dir, 'cv-content', 'AGENTS.md'))).toBe(true)

    const again = await initCv({ dir })
    expect(again.ok).toBe(false)
    expect(again.error.code).toBe('already-exists')

    const validation = await validateCv({ dir })
    expect(validation.strict).toBe(true)
    expect(validation.errors).toEqual([])
    expect(validation.ok).toBe(true)

    const build = await buildPdf({ dir })
    expect(build.ok).toBe(true)
    expect(build.filename).toBe('bruce-wayne.pdf')
    expect(build.theme).toBe('teal')
    expect(statSync(build.path).size).toBe(build.bytes)
    expect(build.bytes).toBeGreaterThan(10_000)

    // The build reports how it paginated, so an assistant does not need a
    // second call to tell the user what it just produced.
    expect(build.diagnostics.totalPages).toBe(2)
    expect(build.diagnostics.pages).toHaveLength(2)
    // Since S4 the healthy scaffold carries exactly ONE named condition:
    // page1-ends-early — page 1's roles stop 71pt short of taking any piece of
    // the next one, and the summary is the lever. Not a defect (overflow is
    // absent); a priced fact. Its firing on a well-packed 2-page CV is by
    // design (§3.8's predicate has no judgement threshold).
    expect(build.diagnostics.warnings.map((w) => w.code)).toEqual(['page1-ends-early'])
    expect(build.diagnostics.warnings[0].shortByPt).toBeGreaterThan(0)
    // ONE field named `warnings` in this envelope, and it is the structured one
    // inside `diagnostics`. The run's plain-text notes are `notices` (C6a review
    // blocker 4: the two used to sit side by side carrying the same sentence).
    expect(build.warnings).toBeUndefined()
    expect(build.notices).toEqual([])
  }, 30_000)

  it('plan_layout answers the same questions without writing a PDF', async () => {
    const dir = scratch()
    await initCv({ dir })

    const plan = await planLayout({ dir })
    expect(plan.ok).toBe(true)
    expect(plan.rendered).toBe(false)
    expect(existsSync(path.join(dir, 'bruce-wayne.pdf'))).toBe(false)
    expect(plan.theme).toBe('teal')
    expect(plan.layout).toBe('two-column')
    expect(plan.diagnostics.totalPages).toBe(2)

    // Every page reports both columns, 1-based. This CV fits, so every fill is
    // in (0,1] — but that is a fact about THIS content, not a property of the
    // field (see the overflow test below, where it reads 2.033).
    expect(plan.diagnostics.pages.map((p) => p.page)).toEqual([1, 2])
    for (const page of plan.diagnostics.pages) {
      for (const col of [page.main, page.sidebar]) {
        if (col.fill === null) continue
        expect(col.fill).toBeGreaterThan(0)
        expect(col.fill).toBeLessThanOrEqual(1)
        expect(col.usedPt).toBeGreaterThan(0)
      }
    }
    // The scaffold's known shape: one role on page 1, and NO stranded tail page.
    // This used to assert the opposite — `pages[2].emptyColumn === 'main'` and
    // `emptyColumnPages === 1` — pinning the demo's own worst defect as expected
    // behaviour: a third sheet holding nothing but the tail of the sidebar flow
    // beside a completely empty main column. The scaffold was trimmed to two
    // pages (referees dropped from the layout, education 4→3, certifications
    // 2→1), so the assertion is now that the defect is absent.
    expect(plan.diagnostics.pages[0].main.entries).toHaveLength(1)
    expect(plan.diagnostics.pages.every((p) => p.emptyColumn === null)).toBe(true)
    expect(plan.diagnostics.totals.emptyColumnPages).toBe(0)
    expect(plan.diagnostics.totals.overflowPages).toBe(0)
    // No leversUsed field any more: the page-1 levers were REMOVED (maintainer
    // ruling) and pagination is always the content's. version: 2 is the flag
    // consumers key on for this shape.
    expect(plan.diagnostics.version).toBe(2)
    expect(plan.diagnostics).not.toHaveProperty('leversUsed')
    // The answer describes the designed variant; the ATS variant is not packed
    // at all, so it has no plan and can have a different page count.
    expect(plan.variant).toBe('designed')
    expect(plan.note).toMatch(/DESIGNED/)
  }, 30_000)

  it('fill goes ABOVE 1 when a page is over budget — it is a ratio, not a gauge', async () => {
    // The C6a review's blocker 1: `fill` was documented "0..1" in four places
    // and asserted `<= 1` here, which passed only because the scaffold never
    // overflows. A mutation clamping the ratio to `Math.min(1, …)` — which hides
    // exactly the condition an agent must act on — survived all 62 diagnostics
    // tests. This is the fixture that kills it.
    const dir = scratch()
    await initCv({ dir })
    // The old forced-overflow lever is gone, so overflow needs a real shape:
    // a summary taller than the whole main column — fixed page-1 content the
    // packer cannot paginate (the same edge-summary-exceeds-page class the
    // corpus pins). 40 long bullets ≈ 1600pt against a ~682pt column.
    const sum = path.join(dir, 'cv-content', 'summary.yaml')
    const line =
      '- Led the delivery of a multi-year, multi-team programme across several regions and functions with measurable outcomes.'
    writeFileSync(sum, `${Array.from({ length: 40 }, () => line).join('\n')}\n`)

    const plan = await planLayout({ dir })
    const page1 = plan.diagnostics.pages[0]
    expect(page1.main.fill).toBeGreaterThan(1)
    // 2.13: forty summary bullets are ~1450pt of fixed content in a ~682pt
    // column — (fixed + used) / capacity under v2. Above 1 is the fact under
    // test; the magnitude is pinned so a denominator change cannot hide.
    expect(page1.main.fill).toBeCloseTo(2.13, 3)
    // `> 1` and `overflowPt > 0` are the same fact seen twice; neither may be
    // reported without the other.
    expect(page1.overflowPt).toBeGreaterThan(0)
    expect(page1.main.usedPt).toBeGreaterThan(page1.main.budgetPt)
    expect(plan.diagnostics.warnings[0]).toMatchObject({
      code: 'overflow',
      page: 1,
      // permanently false since the forcing levers were removed; kept on the
      // shape so consumers that match on it keep working
      forcedByConfig: false
    })
    expect(plan.diagnostics.totals.overflowPages).toBe(1)
    // ...and the cause is named in the message: the summary, the one block no
    // pagination can help with.
    expect(plan.diagnostics.warnings[0].message).toMatch(/summary alone is taller/)
    expect(plan.diagnostics.warnings[0].forcedByConfig).toBe(false)
  }, 30_000)

  it('plan_layout on a missing workspace fails like every other tool', async () => {
    await expect(planLayout({ dir: scratch() })).rejects.toThrow(/Content directory not found/)
  })

  it('validate_cv reports findings on broken content and strict=false downgrades unknown keys', async () => {
    const dir = scratch()
    await initCv({ dir })
    writeFileSync(path.join(dir, 'cv-content', 'personal.yaml'), 'name: Jane\nlinkdin: typo\n')

    const strict = await validateCv({ dir })
    expect(strict.ok).toBe(false)
    expect(strict.errors.some((f) => f.code === 'unknown-key')).toBe(true)

    const lax = await validateCv({ dir, strict: false })
    expect(lax.ok).toBe(true)
    expect(lax.warnings.some((f) => f.code === 'unknown-key')).toBe(true)
  })

  it('validate_cv on a missing workspace suggests init', async () => {
    const result = await validateCv({ dir: scratch() })
    expect(result.ok).toBe(false)
    expect(result.errors[0].code).toBe('missing-content-dir')
  })
})
