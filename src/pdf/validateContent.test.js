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
  /** @type {{ layouts?: Record<string, string>, images?: Record<string, string|undefined>, dirs?: string[] }} */ {
    layouts,
    images,
    dirs
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
  // Entries that LOOK like content files but cannot be read as one (a
  // directory named *.yaml). readdirSync lists them, so validateContent must
  // report them per-file instead of throwing out of the whole run.
  for (const d of dirs ?? []) mkdirSync(join(dir, d), { recursive: true })
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
  it('warns when fixed page-1 content alone overflows the column (the levers that could force one are removed)', () => {
    // An over-tall summary is the one shape that can still overflow: it is
    // fixed page-1 content the packer cannot paginate. (This test used to
    // force overflow via page1ExperienceCount; that lever was removed —
    // maintainer ruling, design-layout-fidelity.md Review outcome #1.)
    const summary = dump(
      Array.from(
        { length: 40 },
        () =>
          'A long summary sentence used to consume vertical space on page one so the overflow estimate triggers.'
      )
    )
    const res = validateContent({
      contentDir: makeDir({
        'personal.yaml': 'name: X\n',
        'summary.yaml': summary,
        'experience.yaml': dump([{ role: 'R', company: 'C', period: 'p', bullets: ['b'] }])
      }),
      fontsDir: FONTS
    })
    expect(codes(res.warnings)).toContain('page-overflow')
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
    // schemaVersion is the surviving typed scalar (page1ExperienceCount used
    // to be the example here; it was removed and now surfaces as a removed-key
    // warning instead of a type error).
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'config.yaml': 'schemaVersion: "not a number"\n' }),
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

// The `oneOf` reporting path: which branch's complaint a user is shown when a
// value matches none of a subschema's alternatives. mapAjvErrors() keeps only
// the branch errors whose declared type matches the instance's ACTUAL type
// (jsonType()), so a wrong-shaped value gets one shape finding instead of one
// "must be <type>" per alternative.
describe('validateContent — oneOf shape reporting', () => {
  it('reports a null and a nested-list layout slot as one shape error each, not one per alternative', () => {
    // `- ` (an empty list item → null) and a nested list are the two ways a
    // slot can be neither of layoutSlot's alternatives (string / one-key
    // object). Both must read as "invalid shape", never as the string
    // branch's "must be string" plus the object branch's "must be object".
    //
    // The same two shapes in summary.yaml or an entry's bullets would be the
    // more obvious fixture, but a null bullet currently throws out of the
    // page-overflow estimate (planTwoColumn → summaryH) before validation can
    // report anything, so this exercises the identical code path through a
    // layout file, which the estimate never touches.
    const res = validateContent({
      contentDir: makeDir(BASE, {
        layouts: { 'custom.yaml': 'template: two-column\nfirst:\n  main:\n    - ~\n    - [a, b]\n' }
      }),
      fontsDir: FONTS
    })
    const slots = res.errors.filter((e) => e.file === 'layouts/custom.yaml')
    expect(slots.map((e) => e.path)).toEqual(['/first/main/0', '/first/main/1'])
    for (const f of slots) expect(f.message).toMatch(/^invalid shape — one slot in a page region/)
    expect(slots.some((f) => /must be (string|object)/.test(f.message))).toBe(false)
  })

  it('reports a root-level shape violation at (root), quoting the schema description', () => {
    // keywords.yaml is the one file whose ROOT is a oneOf (string / group map /
    // list), so a bare scalar fails at the document root: instancePath is
    // empty and the finding must name the file as a whole, not a field in it.
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'keywords.yaml': '42\n' }),
      fontsDir: FONTS
    })
    const f = res.errors.find((e) => e.file === 'keywords.yaml')
    expect(res.ok).toBe(false)
    expect(f?.path).toBe('(root)')
    expect(f?.message).toMatch(/^invalid shape — optional ats keywords/)
  })

  it('falls back to a bare "invalid shape" when the failing alternative has no description', () => {
    // A keyword group's value must be a string or a list of strings. That
    // inner oneOf carries no description, so there is nothing to append — the
    // finding still has to point at the offending group by path.
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'keywords.yaml': 'languages: 5\n' }),
      fontsDir: FONTS
    })
    const f = res.errors.find((e) => e.path === '/languages')
    expect(f?.file).toBe('keywords.yaml')
    expect(f?.message).toBe('invalid shape')
  })
})

// Suggestions are offered only when they are likely to be right, and ajv
// keywords without a bespoke message still have to reach the user.
describe('validateContent — suggestion + fallback messages', () => {
  it('offers no did-you-mean for an unknown key that resembles nothing', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'personal.yaml': 'name: X\nquuxfrobnicator: 1\n' }),
      fontsDir: FONTS
    })
    const f = res.warnings.find((w) => w.code === 'unknown-key')
    expect(f?.message).toBe('unknown key "quuxfrobnicator"')
    expect(f?.suggestion).toBeUndefined()
    expect(res.ok).toBe(true)
  })

  it('offers no did-you-mean for a non-string enum value', () => {
    // didYouMean() is string-edit-distance; a number has no spelling to fix,
    // so the finding lists the allowed values and stops there.
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'config.yaml': 'theme: 3\n' }),
      fontsDir: FONTS
    })
    const f = res.errors.find((e) => e.message.includes('not one of'))
    expect(f?.path).toBe('/theme')
    expect(f?.message).toBe('"3" is not one of: teal, coral, mono')
    expect(f?.suggestion).toBeUndefined()
    expect(res.errors.some((e) => e.path === '/theme' && e.message === 'must be string')).toBe(true)
  })

  it("passes through ajv's own message for a keyword it has no bespoke wording for", () => {
    // A slot object must carry exactly one key: `{}` names no section and
    // `{a: …, b: …}` names two. Neither keyword (minProperties/maxProperties)
    // has a hand-written message, so the raw ajv text is what a user sees —
    // silently dropping these findings would be the alternative.
    const res = validateContent({
      contentDir: makeDir(BASE, {
        layouts: {
          'custom.yaml':
            'template: two-column\nfirst:\n  main:\n    - {}\n    - {summary: {}, experience: {}}\n'
        }
      }),
      fontsDir: FONTS
    })
    expect(res.errors.map((e) => [e.path, e.message])).toEqual([
      ['/first/main/0', 'must NOT have fewer than 1 properties'],
      ['/first/main/1', 'must NOT have more than 1 properties']
    ])
  })
})

// Reading a file can fail for reasons js-yaml never sees (the entry is a
// directory, a broken symlink, permissions). Those errors carry no source
// position and no `reason`, so the finding must fall back to "(root)" and to
// the raw message — and, either way, must not take the rest of the run down.
describe('validateContent — unreadable files', () => {
  it('reports an unreadable content file without inventing a line number', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, { dirs: ['education.yaml'] }),
      fontsDir: FONTS
    })
    expect(codes(res.errors)).toEqual(['yaml-parse'])
    const f = res.errors[0]
    expect(f.file).toBe('education.yaml')
    expect(f.path).toBe('(root)')
    expect(f.message).toMatch(/^YAML parse error: [A-Z]+:/)
    expect(res.checked).toEqual(expect.arrayContaining(['personal.yaml', 'summary.yaml']))
  })

  it('reports an unreadable layout file without inventing a line number', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, { dirs: ['layouts/broken.yaml'] }),
      fontsDir: FONTS
    })
    expect(codes(res.errors)).toEqual(['yaml-parse'])
    const f = res.errors[0]
    expect(f.file).toBe('layouts/broken.yaml')
    expect(f.path).toBe('(root)')
    expect(f.message).toMatch(/^YAML parse error: [A-Z]+:/)
  })
})

describe('validateContent — layout files', () => {
  it('reports a malformed layout file at its line, and keeps checking the others', () => {
    const res = validateContent({
      contentDir: makeDir(BASE, {
        layouts: {
          'bad.yaml': 'template: two-column\n\tbad: tab\n',
          'good.yaml': 'template: two-column\nfirst:\n  main: [summary]\n'
        }
      }),
      fontsDir: FONTS
    })
    expect(codes(res.errors)).toEqual(['yaml-parse'])
    const f = res.errors[0]
    expect(f.file).toBe('layouts/bad.yaml')
    expect(f.path).toBe('line 2')
    expect(f.message).toBe('YAML parse error: tab characters must not be used in indentation')
    expect(res.checked).toEqual(expect.arrayContaining(['layouts/bad.yaml', 'layouts/good.yaml']))
  })

  it('skips an empty layout file instead of failing it against the layout schema', () => {
    // An empty file parses to null. Validating null against the layout schema
    // would report "must be object" on a file the user has merely not written
    // yet; it is still listed as checked.
    const res = validateContent({
      contentDir: makeDir(BASE, { layouts: { 'empty.yaml': '\n' } }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(true)
    expect(res.checked).toContain('layouts/empty.yaml')
    expect(res.errors).toEqual([])
    expect(res.warnings).toEqual([])
  })

  it('treats an unknown key in a layout file as a warning by default and an error under --strict', () => {
    // Same severity rule as content files: a stray key keeps a human's build
    // working, and fails an agent's --strict run.
    const layouts = { 'extra.yaml': 'template: two-column\nmargins: 10\n' }
    const lenient = validateContent({ contentDir: makeDir(BASE, { layouts }), fontsDir: FONTS })
    expect(lenient.ok).toBe(true)
    const warned = lenient.warnings.find((w) => w.code === 'unknown-key')
    expect(warned?.file).toBe('layouts/extra.yaml')
    expect(warned?.message).toBe('unknown key "margins"')

    const strict = validateContent({
      contentDir: makeDir(BASE, { layouts }),
      strict: true,
      fontsDir: FONTS
    })
    expect(strict.ok).toBe(false)
    expect(strict.errors.map((e) => [e.file, e.code])).toEqual([
      ['layouts/extra.yaml', 'unknown-key']
    ])
  })
})

describe('validateContent — overflow that no config forced', () => {
  it('blames summary.yaml, not config.yaml, when a page overflows on its own', () => {
    // Nothing here forces pagination — the summary alone is taller than the
    // main column, so the page-1 budget goes negative before a single
    // experience entry is placed. The finding must point at the file the user
    // can actually shorten, and must NOT quote a page1ExperienceCount lever
    // that this content never set.
    const summary = Array.from(
      { length: 24 },
      () =>
        '- A long summary sentence used to consume vertical space on page one so the overflow estimate triggers.\n'
    ).join('')
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'summary.yaml': summary }),
      fontsDir: FONTS
    })
    const f = res.warnings.find((w) => w.code === 'page-overflow')
    expect(f?.file).toBe('summary.yaml')
    expect(f?.path).toBe('(root)')
    expect(f?.message).toMatch(/the summary alone is taller than the main column/)
    expect(f?.message).not.toMatch(/page1ExperienceCount/)
    // R-F (I3): the suggestion states the condition; what to cut is a content
    // judgement the skill teaches, not something validate decides.
    expect(f?.suggestion).toMatch(/taller than a whole page/)
    expect(f?.suggestion).not.toMatch(/shorten|the fix is/i)
  })
})

describe('validateContent — malformed content reaches the user, not the packer', () => {
  // Regression for a crash in released 1.7.1: a bare `- ` in YAML parses to
  // null, and the page-overflow estimate ran BEFORE the schema errors were
  // considered. `layout.js` does `typeof b === 'string' ? b : b.text`, so null
  // threw straight out of validate — raw `Cannot read properties of null`,
  // exit 64 ("you used the CLI wrong"), and not one finding printed. The
  // command whose whole job is explaining problems explained nothing.
  //
  // These assert the finding, not the absence of a throw: a test that only
  // said `not.toThrow()` would pass again the moment someone wrapped the
  // estimate in a bare try/catch and swallowed the real error with it.
  it('reports the schema error for an empty summary bullet', () => {
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'summary.yaml': '- \n- A real bullet.\n' }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    const f = res.errors.find((e) => e.file === 'summary.yaml')
    expect(f, 'the null bullet must be reported against summary.yaml').toBeDefined()
    expect(f?.path).toBe('/0')
    // No page-overflow advisory: the estimate is skipped while errors stand,
    // so nothing is reported off content that was never validated.
    expect(res.warnings.some((w) => w.code === 'page-overflow')).toBe(false)
  })

  it('reports the schema error for an empty experience bullet', () => {
    const res = validateContent({
      contentDir: makeDir({
        ...BASE,
        'experience.yaml':
          '- role: Engineer\n  company: Acme\n  period: "2020"\n  bullets:\n    - \n'
      }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(false)
    const f = res.errors.find((e) => e.file === 'experience.yaml')
    expect(f?.path).toBe('/0/bullets/0')
  })

  it('still runs the overflow estimate when the content is clean', () => {
    // The control. Without it, the fix above could be "never run the estimate"
    // and every assertion here would still pass.
    // Same sentence length as the overflow suite above — a shorter one does
    // not actually overflow, so the control would have passed vacuously by
    // asserting an absence rather than proving the estimate still runs.
    const summary = Array.from(
      { length: 24 },
      () =>
        '- A long summary sentence used to consume vertical space on page one so the overflow estimate triggers.\n'
    ).join('')
    const res = validateContent({
      contentDir: makeDir({ ...BASE, 'summary.yaml': summary }),
      fontsDir: FONTS
    })
    expect(res.ok).toBe(true)
    expect(res.warnings.some((w) => w.code === 'page-overflow')).toBe(true)
  })
})
