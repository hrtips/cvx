// cvx validate engine: catches seeded errors with paths + suggestions,
// warns without failing on ignorable problems, and promotes under strict.
import { describe, it, expect } from 'vitest'
import { mkdtempSync, cpSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { validateContent } from '../src/pdf/validateContent.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const TEMPLATE = path.join(ROOT, 'template', 'cv-content')

function scaffold(mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvx-validate-'))
  const contentDir = path.join(dir, 'cv-content')
  cpSync(TEMPLATE, contentDir, { recursive: true })
  mutate?.(contentDir)
  return contentDir
}

const codes = (list) => list.map((f) => f.code)

describe('validateContent', () => {
  it('passes the shipped scaffold with zero findings', () => {
    const result = validateContent({ contentDir: scaffold() })
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.checked.length).toBeGreaterThanOrEqual(9)
  })

  it('reports a missing content dir with an init suggestion', () => {
    const result = validateContent({ contentDir: path.join(tmpdir(), 'cvx-does-not-exist') })
    expect(result.ok).toBe(false)
    expect(codes(result.errors)).toEqual(['missing-content-dir'])
    expect(result.errors[0].suggestion).toMatch(/cvx init/)
  })

  it('collects all errors at once with paths and did-you-mean suggestions', () => {
    const contentDir = scaffold((dir) => {
      writeFileSync(path.join(dir, 'personal.yaml'), 'title: Engineer\nlinkdin: x\n')
      writeFileSync(path.join(dir, 'config.yaml'), 'theme: neon\npage1ExperienceCount: 0\n')
      rmSync(path.join(dir, 'experience.yaml'))
      writeFileSync(path.join(dir, 'compitencies.yaml'), '- Leadership\n')
    })
    const result = validateContent({ contentDir })
    expect(result.ok).toBe(false)

    const missingName = result.errors.find((f) => f.file === 'personal.yaml' && f.message.includes('"name"'))
    expect(missingName?.code).toBe('schema')

    const typo = result.warnings.find((f) => f.code === 'unknown-key')
    expect(typo?.suggestion).toMatch(/linkedin/)

    const theme = result.errors.find((f) => f.path === '/theme')
    expect(theme?.message).toMatch(/teal, coral, mono/)

    expect(result.errors.some((f) => f.path === '/page1ExperienceCount')).toBe(true)
    expect(result.errors.some((f) => f.file === 'experience.yaml' && f.code === 'missing-file')).toBe(true)

    const stray = result.warnings.find((f) => f.code === 'unknown-file')
    expect(stray?.suggestion).toMatch(/competencies/)
  })

  it('promotes unknown keys to errors under strict', () => {
    const contentDir = scaffold((dir) => {
      writeFileSync(path.join(dir, 'personal.yaml'), 'name: Jane\nlinkdin: x\n')
    })
    expect(validateContent({ contentDir }).ok).toBe(true)
    const strict = validateContent({ contentDir, strict: true })
    expect(strict.ok).toBe(false)
    expect(codes(strict.errors)).toContain('unknown-key')
  })

  it('reports YAML parse errors with line numbers and keeps checking other files', () => {
    const contentDir = scaffold((dir) => {
      writeFileSync(path.join(dir, 'education.yaml'), '- degree: BSc\n  institution: [unclosed\n')
      writeFileSync(path.join(dir, 'config.yaml'), 'theme: neon\n')
    })
    const result = validateContent({ contentDir })
    const parse = result.errors.find((f) => f.code === 'yaml-parse')
    expect(parse?.file).toBe('education.yaml')
    expect(parse?.path).toMatch(/line \d+/)
    expect(result.errors.some((f) => f.path === '/theme')).toBe(true)
  })

  it('suppresses oneOf noise when a precise branch error exists', () => {
    const contentDir = scaffold((dir) => {
      writeFileSync(path.join(dir, 'summary.yaml'), '- text: Led team\n  link:\n    href: https://x\n')
    })
    const result = validateContent({ contentDir })
    const summaryFindings = result.errors.filter((f) => f.file === 'summary.yaml')
    expect(summaryFindings).toHaveLength(1)
    expect(summaryFindings[0].message).toMatch(/"label"/)
  })

  it('warns on unknown layout with available list, and validates user layout files', () => {
    const contentDir = scaffold((dir) => {
      writeFileSync(path.join(dir, 'config.yaml'), 'layout: two-colums\n')
      writeFileSync(path.join(dir, 'layouts', 'custom.yaml'), 'template: three-column\nfirst:\n  main: [summary]\n')
    })
    const result = validateContent({ contentDir })
    const layout = result.warnings.find((f) => f.code === 'unknown-layout')
    expect(layout?.suggestion).toMatch(/two-column/)
    expect(result.errors.some((f) => f.file === 'layouts/custom.yaml' && f.path === '/template')).toBe(true)
  })

  it('accepts the flat layout form in user layout files', () => {
    const contentDir = scaffold((dir) => {
      writeFileSync(path.join(dir, 'layouts', 'flat.yaml'), 'template: two-column\nfirst:\n  main: [summary, experience]\n')
    })
    expect(validateContent({ contentDir }).ok).toBe(true)
  })

  it('warns when images/ has no usable profile photo', () => {
    const contentDir = scaffold((dir) => {
      rmSync(path.join(dir, 'images'), { recursive: true, force: true })
    })
    // no images dir at all: no warning
    expect(validateContent({ contentDir }).warnings.filter((f) => f.code === 'no-photo')).toEqual([])

    const withBadPhoto = scaffold((dir) => {
      rmSync(path.join(dir, 'images'), { recursive: true, force: true })
      cpSync(path.join(TEMPLATE, 'images'), path.join(dir, 'images'), { recursive: true })
      const images = path.join(dir, 'images')
      writeFileSync(path.join(images, 'profile.heic'), 'x')
      rmSync(path.join(images, 'profile.jpg'), { force: true })
    })
    const result = validateContent({ contentDir: withBadPhoto })
    const photo = result.warnings.find((f) => f.code === 'no-photo')
    expect(photo).toBeDefined()
  })

  it('flags .yml files as ignored', () => {
    const contentDir = scaffold((dir) => {
      rmSync(path.join(dir, 'summary.yaml'))
      writeFileSync(path.join(dir, 'summary.yml'), '- A bullet\n')
    })
    const result = validateContent({ contentDir })
    expect(result.warnings.some((f) => f.code === 'wrong-extension')).toBe(true)
    // summary is then missing as a .yaml file → required-file error
    expect(result.errors.some((f) => f.file === 'summary.yaml' && f.code === 'missing-file')).toBe(true)
  })
})

// Dogfood regression (2026-07-26): a forced page1ExperienceCount that cannot
// fit used to render silently corrupted PDFs (flex-shrink glyph overlap).
// Validation must now warn before anyone builds.
describe('page-1 overflow estimate', () => {
  it('warns when page1ExperienceCount cannot fit', () => {
    const contentDir = scaffold((dir) => {
      const config = readFileSync(path.join(dir, 'config.yaml'), 'utf8')
        .replace('page1ExperienceCount: 2', 'page1ExperienceCount: 6')
        .replace(/^page1SplitBullets: 2$/m, '')
      writeFileSync(path.join(dir, 'config.yaml'), config)
    })
    const result = validateContent({ contentDir })
    const finding = result.warnings.find((f) => f.code === 'page1-overflow')
    expect(finding).toBeDefined()
    expect(finding.path).toBe('/page1ExperienceCount')
    expect(finding.message).toMatch(/pt past the tuned margin/)
    expect(finding.suggestion).toMatch(/page1SplitBullets/)
  })

  it('stays silent for the shipped scaffold pagination', () => {
    const result = validateContent({ contentDir: scaffold() })
    expect(result.warnings.filter((f) => f.code === 'page1-overflow')).toEqual([])
  })
})
