// Branch coverage for the `cvx validate` engine: schema findings, required-file
// checks, YAML parse errors, unknown files/keys (strict vs lenient), the
// real-metric overflow + unsupported-glyph checks, layout inventory, and the
// photo probe. Filesystem fixtures are tiny temp dirs; the photo probe only
// reads filenames, so the "images" are empty placeholder files.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump } from 'js-yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { validateContent } from './validateContent.js'

const FONTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts')

/** @type {string[]} */
const dirsToClean = []
afterEach(() => {
  while (dirsToClean.length)
    rmSync(/** @type {string} */ (dirsToClean.pop()), { recursive: true, force: true })
})

const BASE = {
  'personal.yaml': 'name: Test Person\n',
  'summary.yaml': '- A summary line.\n',
  'experience.yaml':
    '- role: Engineer\n  company: Acme\n  period: "2020"\n  bullets:\n    - A bullet point.\n'
}

function makeDir(
  /** @type {Record<string, string>} */ files = {},
  /** @type {{ layouts?: Record<string, string>, images?: Record<string, string|undefined> }} */ {
    layouts,
    images
  } = {}
) {
  const dir = mkdtempSync(join(tmpdir(), 'cvx-validate-'))
  dirsToClean.push(dir)
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content)
  if (layouts) {
    mkdirSync(join(dir, 'layouts'), { recursive: true })
    for (const [name, content] of Object.entries(layouts))
      writeFileSync(join(dir, 'layouts', name), content)
  }
  if (images) {
    mkdirSync(join(dir, 'images'), { recursive: true })
    for (const [name, content] of Object.entries(images))
      writeFileSync(join(dir, 'images', name), content ?? '')
  }
  return dir
}

const codes = (/** @type {{ code: string }[]} */ findings) => findings.map((f) => f.code)

describe('validateContent — happy path', () => {
  it('accepts a minimal valid content dir under --strict', () => {
    const res = validateContent({ contentDir: makeDir(BASE), strict: true, fontsDir: FONTS })
    expect(res.ok).toBe(true)
    expect(res.errors).toEqual([])
    expect(res.checked).toEqual(
      expect.arrayContaining(['personal.yaml', 'summary.yaml', 'experience.yaml'])
    )
  })
})

describe('validateContent — structural problems', () => {
  it('reports a missing content directory', () => {
    const res = validateContent({ contentDir: join(tmpdir(), 'cvx-does-not-exist-xyz') })
    expect(res.ok).toBe(false)
    expect(codes(res.errors)).toContain('missing-content-dir')
  })

  it('reports missing required files', () => {
    const res = validateContent({
      contentDir: makeDir({ 'personal.yaml': 'name: X\n' }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    expect(codes(res.errors)).toContain('missing-file')
  })

  it('warns about a .yml file (ignored) and continues', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'personal.yml': 'name: X\n' }),
      fontsDir: FONTS
    })
    expect(codes(res.warnings)).toContain('wrong-extension')
  })

  it('warns about an unrecognised file with a did-you-mean suggestion', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'personel.yaml': 'x: 1\n' }),
      fontsDir: FONTS
    })
    const finding = res.warnings.find((f) => f.code === 'unknown-file')
    expect(finding).toBeTruthy()
    expect(finding?.suggestion).toContain('personal')
  })

  it('reports a YAML parse error', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'education.yaml': '"unterminated string\n' }),
      fontsDir: FONTS
    })
    expect(codes(res.errors)).toContain('yaml-parse')
  })
})

describe('validateContent — schema findings', () => {
  it('reports a missing required field as a schema error', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'personal.yaml': 'title: No Name\n' }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    expect(codes(res.errors)).toContain('schema')
  })

  it('treats an unknown key as a warning by default and an error under --strict', () => {
    const files = { ...BASE, 'personal.yaml': 'name: X\nnaem: Y\n' }
    const lenient = validateContent({ contentDir: makeDir(files), strict: false, fontsDir: FONTS })
    expect(lenient.ok).toBe(true)
    expect(codes(lenient.warnings)).toContain('unknown-key')

    const strict = validateContent({ contentDir: makeDir(files), strict: true, fontsDir: FONTS })
    expect(strict.ok).toBe(false)
    expect(codes(strict.errors)).toContain('unknown-key')
  })

  it('picks the matching oneOf branch for an invalid bullet object', () => {
    const experience = dump([
      {
        role: 'R',
        company: 'C',
        period: 'p',
        bullets: [{ link: { href: 'https://x', label: 'y' } }]
      }
    ])
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'experience.yaml': experience }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    expect(res.errors.some((f) => /text/.test(f.message))).toBe(true)
  })
})

describe('validateContent — real-metric checks', () => {
  it('warns when a forced page1ExperienceCount cannot fit', () => {
    const experience = dump([
      {
        role: 'R',
        company: 'C',
        period: 'p',
        bullets: Array.from(
          { length: 20 },
          () =>
            'A long bullet line that spans a good fraction of the available column width for measurement purposes.'
        )
      }
    ])
    const summary = dump(
      Array.from(
        { length: 5 },
        () =>
          'A long summary sentence used to consume vertical space on page one so the overflow estimate triggers.'
      )
    )
    const res = validateContent({
      contentDir: makeDir({
        'personal.yaml': 'name: X\n',
        'summary.yaml': summary,
        'experience.yaml': experience,
        'config.yaml': dump({ page1ExperienceCount: 1 })
      }),
      fontsDir: FONTS
    })
    expect(codes(res.warnings)).toContain('page1-overflow')
  })

  it('warns about unsupported glyphs only when a fontsDir is supplied', () => {
    const files = { ...BASE, 'personal.yaml': 'name: Дмитрий\n' }
    const withFonts = validateContent({ contentDir: makeDir(files), fontsDir: FONTS })
    expect(codes(withFonts.warnings)).toContain('unsupported-glyphs')

    const withoutFonts = validateContent({ contentDir: makeDir(files) })
    expect(codes(withoutFonts.warnings)).not.toContain('unsupported-glyphs')
  })
})

describe('validateContent — layout inventory', () => {
  it('warns about an unknown configured layout', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'config.yaml': 'layout: ghost\n' }),
      fontsDir: FONTS
    })
    expect(codes(res.warnings)).toContain('unknown-layout')
  })

  it('accepts a valid user layout file and checks it', () => {
    const res = validateContent({
      contentDir: makeDir(
        { ...BASE, 'config.yaml': 'layout: custom\n' },
        { layouts: { 'custom.yaml': 'template: two-column\n' } }
      ),
      fontsDir: FONTS
    })
    expect(res.checked).toContain('layouts/custom.yaml')
    expect(codes(res.warnings)).not.toContain('unknown-layout')
  })

  it('reports a schema-invalid user layout file', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, { layouts: { 'bad.yaml': 'template: three-column\n' } }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    expect(res.errors.some((f) => f.file === 'layouts/bad.yaml')).toBe(true)
  })
})

describe('validateContent — photo probe', () => {
  it('warns when the only image has an unsupported extension', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, { images: { 'profile.txt': '' } }),
      fontsDir: FONTS
    })
    const finding = res.warnings.find((f) => f.code === 'no-photo')
    expect(finding).toBeTruthy()
    expect(finding?.suggestion).toMatch(/unsupported extension/i)
  })

  it('warns when an image is present but none is named profile', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, { images: { 'random.png': '' } }),
      fontsDir: FONTS
    })
    const finding = res.warnings.find((f) => f.code === 'no-photo')
    expect(finding).toBeTruthy()
    expect(finding?.suggestion).toMatch(/rename/i)
  })

  it('does not warn when a valid profile photo exists', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, { images: { 'profile.jpg': '' } }),
      fontsDir: FONTS
    })
    expect(codes(res.warnings)).not.toContain('no-photo')
  })
})

describe('validateContent — edge branches', () => {
  it('distinguishes an empty required file (YAML null) from a missing one', () => {
    const res = validateContent({
      contentDir: makeDir({
        'personal.yaml': 'name: X\n',
        'summary.yaml': '- s\n',
        'experience.yaml': '~\n'
      }),
      fontsDir: FONTS
    })
    expect(res.errors.some((e) => e.message.includes('empty but required'))).toBe(true)
  })

  it('reports a non-array summary via the schema', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'summary.yaml': 'just a string, not a list\n' }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
  })

  it('warns about an unrecognised file with no close match (no suggestion)', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'zqxjwv.yaml': 'x: 1\n' }),
      fontsDir: FONTS
    })
    const f = res.warnings.find((w) => w.file === 'zqxjwv.yaml')
    expect(f).toBeTruthy()
    expect(f?.suggestion).toBeUndefined()
  })

  it('reports a YAML syntax error carrying a source position', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'personal.yaml': 'name: X\n  bad: : indent\n' }),
      fontsDir: FONTS
    })
    expect(res.errors.some((e) => e.file === 'personal.yaml')).toBe(true)
  })

  it('truncates the found-image list to three names with an ellipsis', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, {
        images: { 'a.png': '', 'b.png': '', 'c.png': '', 'd.png': '' }
      }),
      fontsDir: FONTS
    })
    const f = res.warnings.find((w) => w.code === 'no-photo')
    expect(f?.suggestion).toContain('…')
  })

  it('flags an empty required string (minLength) and a wrong scalar type', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'personal.yaml': 'name: ""\n' }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
  })
})

describe('validateContent — schema keyword coverage (via config.yaml)', () => {
  it('flags a wrong const (schemaVersion) and a below-minimum number', () => {
    const res = validateContent({
      contentDir: makeDir({
        ...BASE,
        'config.yaml': 'schemaVersion: 2\npage1ExperienceCount: 0\n'
      }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    const msgs = res.errors.map((e) => e.message).join(' | ')
    expect(msgs).toMatch(/must be 1|>= 1/)
  })

  it('flags an out-of-enum theme with a did-you-mean suggestion', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'config.yaml': 'theme: tael\n' }),
      fontsDir: FONTS
    })
    const f = res.errors.find((e) => e.message.includes('not one of') || e.message.includes('teal'))
    expect(f).toBeTruthy()
    expect(f?.suggestion).toContain('teal')
  })

  it('flags a wrong scalar type in config', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'config.yaml': 'page1ExperienceCount: "not a number"\n' }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => /must be/.test(e.message))).toBe(true)
  })
})

describe('validateContent — root-level + parse-position branches', () => {
  it('maps a root-level type error (whole file is the wrong shape)', () => {
    // experience must be a list; a scalar fails at the document root, so the
    // finding path falls back to "(root)".
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'experience.yaml': 'just a string\n' }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.path === '(root)')).toBe(true)
  })

  it('reports a YAML parse error with a line position (mark)', () => {
    // A tab in indentation is a hard YAML error carrying a source mark.
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'summary.yaml': '- ok\n\tbad: tab-indent\n' }),
      fontsDir: FONTS
    })
    const f = res.errors.find((e) => e.code === 'yaml-parse')
    expect(f).toBeTruthy()
    expect(f?.path).toMatch(/line \d+|\(root\)/)
  })

  it('still runs the overflow estimate when summary is not a list', () => {
    // A non-array summary must not crash the page-1 overflow estimate.
    const res = validateContent({
      contentDir: makeDir({
        'personal.yaml': 'name: X\n',
        'summary.yaml': 'a scalar summary\n',
        'experience.yaml': BASE['experience.yaml'],
        'config.yaml': 'page1ExperienceCount: 1\n'
      }),
      fontsDir: FONTS
    })
    expect(res).toBeTruthy()
  })
})
