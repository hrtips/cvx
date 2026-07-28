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
const FONTS_DIR = path.join(ROOT, 'src', 'fonts')

function scaffold(mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvx-validate-'))
  const contentDir = path.join(dir, 'cv-content')
  cpSync(TEMPLATE, contentDir, { recursive: true })
  mutate?.(contentDir)
  return contentDir
}

const codes = (list) => list.map((f) => f.code)

describe('validateContent', () => {
  // History (kept for context — do not re-add the forced keys below without
  // re-reading this): C2 (real font measurement) found that the shipped
  // scaffold's default config — page1ExperienceCount: 2, page1SplitBullets: 2
  // — measured ~72pt over page 1's honest budget, and a prior report read
  // that as a genuine content clip (claiming the 2nd bullet of "Chairman &
  // CEO" was invisibly lost). A follow-up review traced it further: react-pdf
  // defaults every node to `wrap: true` (nothing in src/pdf ever sets
  // `wrap={false}`), so overflow never actually drops text — it auto-
  // continues onto an extra, unstyled physical page instead. Verified two
  // ways: a full pdftotext dump of the built PDF found every bullet present,
  // and a visual render showed the "missing" bullet's continuation landing on
  // an unplanned page (see contentOracle.js's module docblock for the
  // detection mechanism, and test/layoutRenderOracle.test.js for the
  // corrected self-tests). So the real bug was never text loss — it was the
  // already-known wasted-near-blank-page bug (research/c0-baseline.md's bug
  // (b)): the 2nd entry's tail spills onto its own near-empty page. Per the
  // scaffold's own AGENTS.md rule ("add pagination keys only if page 1
  // overflows"), this config never needed to force anything — automatic
  // pagination respects its own budget by construction — so the actual fix
  // was removing the two forced-pagination keys from template/cv-content/
  // config.yaml and the root cv-content/config.yaml demo, not a packer
  // change. The warning itself is still real and still tested below, just
  // against a synthetic forced config instead of the (now-fixed) shipped one.
  it('passes the shipped scaffold with zero errors and zero warnings', () => {
    const result = validateContent({ contentDir: scaffold(), fontsDir: FONTS_DIR })
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
//
// C2 (real font measurement — src/pdf/measure.js) replaces the char-width
// estimate these checks used to run on exclusively with real fontkit
// metrics, injected via `fontsDir` (see validateContent()'s docblock) — the
// same measurement `cvx build` packs against, so the warning and the actual
// render now agree. PAGE1_OVERFLOW_WARN_THRESHOLD also shrank from an
// empirical 220pt fudge to a small, honest 15pt safety backstop
// (layout.js), sized for accurate measurement — see that constant's
// docblock for why the char-width fallback (no fontsDir) reads noisier
// against the same small threshold; every real entry point always has
// fontsDir, so this only affects a caller that deliberately omits it.
//
// The shipped scaffold no longer forces a page-1 split at all (see the
// "zero errors and zero warnings" test above for why), so every test here
// forces one synthetically via `forceConfig()` — appending fresh YAML keys
// rather than string-replacing a line that may or may not exist in the
// current config.yaml, so these stay correct however the scaffold's own
// config evolves.
function forceConfig(dir, extraYamlLine) {
  const config = readFileSync(path.join(dir, 'config.yaml'), 'utf8')
  writeFileSync(path.join(dir, 'config.yaml'), `${config}\n${extraYamlLine}\n`)
}

describe('page-1 overflow estimate', () => {
  it('warns when a forced page1ExperienceCount cannot fit (accurate measurement)', () => {
    // count:6 against a 4-entry scaffold forces every entry whole onto page
    // 1 (packExperiences: no splitEntry exists past the array's end) — a
    // large, reliable overflow regardless of exact content tuning.
    const contentDir = scaffold((dir) => forceConfig(dir, 'page1ExperienceCount: 6'))
    const result = validateContent({ contentDir, fontsDir: FONTS_DIR })
    const finding = result.warnings.find((f) => f.code === 'page1-overflow')
    expect(finding).toBeDefined()
    expect(finding.path).toBe('/page1ExperienceCount')
    expect(finding.message).toMatch(/pt past the safety margin/)
    expect(finding.suggestion).toMatch(/page1SplitBullets/)
  })

  it('stays silent when nothing forces a split — automatic pagination never overflows its own budget by construction', () => {
    const result = validateContent({ contentDir: scaffold(), fontsDir: FONTS_DIR })
    expect(result.warnings.filter((f) => f.code === 'page1-overflow')).toEqual([])
  })

  it('still runs the check without fontsDir, against the looser char-width fallback', () => {
    const contentDir = scaffold((dir) => forceConfig(dir, 'page1ExperienceCount: 6'))
    const result = validateContent({ contentDir })
    expect(result.warnings.some((f) => f.code === 'page1-overflow')).toBe(true)
  })
})

describe('unsupported-glyph detection (design doc G-a)', () => {
  it('warns when text contains a character the bundled font has no glyph for', () => {
    const contentDir = scaffold((dir) => {
      const personal = readFileSync(path.join(dir, 'personal.yaml'), 'utf8')
        .replace('Bruce Wayne', 'බ්‍රූස් වේන්')
      writeFileSync(path.join(dir, 'personal.yaml'), personal)
    })
    const result = validateContent({ contentDir, fontsDir: FONTS_DIR })
    const finding = result.warnings.find((f) => f.code === 'unsupported-glyphs')
    expect(finding).toBeDefined()
    expect(finding.file).toBe('personal.yaml')
    expect(finding.path).toBe('/name')
    expect(finding.message).toMatch(/can't render/)
    expect(finding.suggestion).toMatch(/fallback font/)
  })

  it('does not warn for the shipped (all-Latin) scaffold', () => {
    const result = validateContent({ contentDir: scaffold(), fontsDir: FONTS_DIR })
    expect(result.warnings.filter((f) => f.code === 'unsupported-glyphs')).toEqual([])
  })

  it('never checks keywords.yaml (metadata only, never printed) or config.yaml', () => {
    const contentDir = scaffold((dir) => {
      writeFileSync(path.join(dir, 'keywords.yaml'), '- සිංහල\n')
    })
    const result = validateContent({ contentDir, fontsDir: FONTS_DIR })
    expect(result.warnings.filter((f) => f.code === 'unsupported-glyphs')).toEqual([])
  })

  it('is skipped entirely without fontsDir (no approximation of glyph coverage exists)', () => {
    const contentDir = scaffold((dir) => {
      const personal = readFileSync(path.join(dir, 'personal.yaml'), 'utf8')
        .replace('Bruce Wayne', 'බ්‍රූස් වේන්')
      writeFileSync(path.join(dir, 'personal.yaml'), personal)
    })
    const result = validateContent({ contentDir })
    expect(result.warnings.filter((f) => f.code === 'unsupported-glyphs')).toEqual([])
  })
})
