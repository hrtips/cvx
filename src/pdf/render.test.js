// End-to-end in-process render tests. Rendering the full CV and the ATS variant
// through renderCV() exercises the whole document tree — CVDocument, ATSDocument,
// every section + component, the section registry, layout packing, real-font
// measurement (measure.js), keyword embedding, content loading, and render.js's
// own branches — in one pass. The real template fixture supplies the
// photo-present path and dense multi-page content; synthetic fixtures fill the
// optional-field, single-page, continuation, and error branches the template
// does not reach.

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump } from 'js-yaml'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { discoverLayouts, renderCV } from './render.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TEMPLATE = join(ROOT, 'template', 'cv-content')
const FONTS = join(ROOT, 'src', 'fonts')
const RENDER_TIMEOUT = 30000

/** @type {string} */
let tmp

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'cvx-render-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

// Write a { key: value } content bag + optional config/layouts into a fresh
// cv-content dir, mirroring what the real scaffold looks like on disk.
function writeContent(
  /** @type {Record<string, unknown>} */ bag,
  /** @type {{ config?: unknown, layouts?: Record<string, unknown> }} */ { config, layouts } = {}
) {
  const dir = join(tmp, 'cv-content')
  mkdirSync(dir, { recursive: true })
  for (const [key, value] of Object.entries(bag)) {
    writeFileSync(join(dir, `${key}.yaml`), dump(value))
  }
  if (config) writeFileSync(join(dir, 'config.yaml'), dump(config))
  if (layouts) {
    const ld = join(dir, 'layouts')
    mkdirSync(ld, { recursive: true })
    for (const [name, doc] of Object.entries(layouts))
      writeFileSync(join(ld, `${name}.yaml`), dump(doc))
  }
  return dir
}

function isPdf(/** @type {Buffer} */ buffer) {
  expect(buffer.byteLength).toBeGreaterThan(1000)
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-'
}

// Rich synthetic content that hits the "other" branch of every optional field
// the Bruce Wayne template leaves in a single state.
const RICH = {
  personal: {
    name: 'Ada Lovelace',
    title: 'Principal Engineer',
    company: 'Analytical Engines Ltd',
    phone: '+44 20 7946 0000',
    phoneHref: 'tel:+442079460000',
    email: 'ada@example.com',
    linkedin: 'linkedin.com/in/ada',
    linkedinHref: 'https://linkedin.com/in/ada',
    facebook: 'fb.com/ada',
    facebookHref: 'https://facebook.com/ada',
    location: 'London, UK',
    links: [
      { label: 'Portfolio', href: 'https://ada.example.com' },
      { href: 'https://nolabel.example.com' }
    ]
  },
  summary: [
    'Strategic engineering leader with a long record of shipping complex systems on time.',
    {
      text: 'Publishes regularly, e.g. ',
      link: { href: 'https://ada.example.com/blog', label: 'the engineering blog' },
      suffix: '.'
    }
  ],
  experience: [
    {
      role: 'Head of Engineering',
      company: 'Analytical Engines Ltd',
      period: '2019 – Present',
      location: 'London, UK',
      description: 'Owns the whole engineering org across four product lines and a platform team.',
      progression: [
        { title: 'Head of Engineering', period: '2021 – Present' },
        { title: 'Engineering Manager', period: '2019 – 2021' }
      ],
      bullets: [
        'Scaled the engineering organisation from eight to forty across four countries and two time zones.',
        {
          text: 'Shipped the ',
          link: { href: 'https://example.com/x', label: 'Difference Engine v2' },
          suffix: ' platform to general availability.'
        },
        {
          text: 'Introduced a lightweight delivery process adopted org-wide with no extra headcount.'
        },
        { link: { href: 'https://example.com/z', label: 'Read the write-up' } }
      ]
    },
    {
      role: 'Senior Engineer',
      company: 'Babbage Systems',
      period: '2015 – 2019',
      bullets: [
        'Led the migration of the billing subsystem to an event-driven architecture with zero downtime.',
        'Mentored six engineers, three of whom were promoted within the year.'
      ]
    },
    {
      role: 'Engineer',
      company: 'Lovelace Computing',
      period: '2012 – 2015',
      bullets: ['Built the first internal analytics pipeline still in use today.']
    }
  ],
  education: [
    { degree: 'MSc Mathematics', institution: 'University of London', period: '2010 – 2012' },
    { degree: 'BSc Computer Science', institution: 'University of London' }
  ],
  certifications: [
    { name: 'Certified Kubernetes Administrator', issuer: 'CNCF', year: '2021' },
    { name: 'Some Certificate With No Metadata' }
  ],
  publications: [
    { title: 'Notes on the Analytical Engine', venue: 'Journal of Computing', year: '1843' },
    { title: 'An Untitled Preprint With No Venue' }
  ],
  languages: [{ language: 'English', proficiency: 'Native' }, { language: 'French' }],
  competencies: ['Systems Design', 'Team Leadership', 'Distributed Systems', 'Mentorship'],
  achievements: [{ year: '2022', text: 'Engineering Leader of the Year' }],
  referees: [
    {
      name: 'Charles Babbage',
      title: 'Founder',
      company: 'Babbage Systems',
      email: 'charles@example.com',
      phone: '+44 20 7946 0001'
    },
    { name: 'Grace Advisor', title: 'Advisor' },
    { name: 'Referee With Name Only' }
  ],
  keywords: ['Platform Engineering', { Leadership: ['Executive Leadership', 'Org Design'] }]
}

const RICH_CONFIG = {
  schemaVersion: 1,
  theme: 'coral',
  layout: 'two-column',
  page1ExperienceCount: 1,
  page1SplitBullets: 2,
  atsKeywords: { enabled: true, autoDerive: true, max: 6 }
}

describe('renderCV — designed (two-column)', () => {
  it(
    'renders the real Bruce Wayne template with a profile photo',
    async () => {
      cpSync(TEMPLATE, join(tmp, 'cv-content'), { recursive: true })
      const { buffer, filename, themeName, layoutName } = await renderCV({
        contentDir: join(tmp, 'cv-content'),
        fontsDir: FONTS,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
      expect(filename).toBe('bruce-wayne.pdf')
      expect(themeName).toBe('teal')
      expect(layoutName).toBe('two-column')
    },
    RENDER_TIMEOUT
  )

  it(
    'renders rich content that forces a single continuation page (coral, split bullets)',
    async () => {
      const dir = writeContent(RICH, { config: RICH_CONFIG })
      const { buffer, themeName } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
      expect(themeName).toBe('coral')
    },
    RENDER_TIMEOUT
  )

  it(
    'renders enough content to span several continuation pages (cont + last page kinds)',
    async () => {
      const experience = Array.from({ length: 20 }, (_, i) => ({
        role: `Role Number ${i}`,
        company: `Company ${i}`,
        period: '2005 – Present',
        description:
          'A description line for this role that adds a little vertical height to each packed entry.',
        bullets: Array.from(
          { length: 5 },
          (_b, j) =>
            `Entry ${i} bullet ${j}: a reasonably long achievement sentence that wraps across the column and consumes vertical space.`
        )
      }))
      const dir = writeContent(
        {
          personal: { name: 'Many Pages' },
          summary: ['A short summary.'],
          experience,
          education: [{ degree: 'BSc', institution: 'Uni' }],
          referees: [{ name: 'Ref' }]
        },
        { config: { schemaVersion: 1, theme: 'teal', layout: 'two-column' } }
      )
      const { buffer } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'renders a two-column CV with no summary (summary section renders nothing)',
    async () => {
      const dir = writeContent(
        {
          personal: { name: 'No Summary' },
          experience: [
            { role: 'A', company: 'X', period: 'p', bullets: ['b1'] },
            { role: 'B', company: 'Y', period: 'p', bullets: ['b2'] }
          ]
        },
        {
          config: { schemaVersion: 1, theme: 'teal', layout: 'two-column', page1ExperienceCount: 1 }
        }
      )
      const { buffer } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'folds sidebar sections onto page 1 for a single-page CV and honours a user layout file',
    async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const dir = writeContent(
        {
          personal: { name: 'Grace Hopper', title: 'Rear Admiral' },
          summary: ['Short summary line.'],
          experience: [
            { role: 'Engineer', company: 'Navy', period: '1944', bullets: ['One concise bullet.'] }
          ],
          education: [{ degree: 'PhD', institution: 'Yale', period: '1934' }],
          competencies: ['Compilers'],
          referees: []
        },
        {
          config: { schemaVersion: 1, theme: 'teal', layout: 'mylayout' },
          layouts: {
            mylayout: {
              template: 'two-column',
              pages: {
                first: {
                  sidebar: [
                    'identity-photo',
                    'contact',
                    { education: {} },
                    { experience: { continued: true } }
                  ],
                  main: ['summary', 'unknown-xyz', { spacer: 12 }, 'experience']
                },
                continuation: { main: [{ experience: { continued: true } }] }
              }
            }
          }
        }
      )
      const { buffer } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
    },
    RENDER_TIMEOUT
  )
})

describe('renderCV — single-column (header-ats section + template)', () => {
  it(
    'renders the real template in a single column (photo + company header)',
    async () => {
      cpSync(TEMPLATE, join(tmp, 'cv-content'), { recursive: true })
      writeFileSync(
        join(tmp, 'cv-content', 'config.yaml'),
        dump({ schemaVersion: 1, theme: 'teal', layout: 'single-column' })
      )
      const { buffer, filename, layoutName } = await renderCV({
        contentDir: join(tmp, 'cv-content'),
        fontsDir: FONTS,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
      expect(layoutName).toBe('single-column')
      expect(filename).toBe('bruce-wayne-ats.pdf')
    },
    RENDER_TIMEOUT
  )

  it(
    'renders a single-column CV with no company and a label-less link',
    async () => {
      const dir = writeContent(
        {
          personal: {
            name: 'Column Person',
            title: 'Analyst',
            email: 'c@x.com',
            location: 'Remote',
            links: [{ label: 'Site', href: 'https://s' }, { href: 'https://nolabel' }]
          },
          summary: ['s'],
          experience: [{ role: 'R', company: 'C', period: 'p', bullets: ['b'] }]
        },
        { config: { schemaVersion: 1, layout: 'single-column' } }
      )
      const { buffer, filename } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
      expect(filename).toBe('column-person-ats.pdf')
    },
    RENDER_TIMEOUT
  )
})

describe('renderCV — ATS document (ats: true)', () => {
  it(
    'renders the real template as an ATS document',
    async () => {
      cpSync(TEMPLATE, join(tmp, 'cv-content'), { recursive: true })
      const { buffer, filename, themeName, layoutName } = await renderCV({
        contentDir: join(tmp, 'cv-content'),
        fontsDir: FONTS,
        ats: true,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
      expect(filename).toBe('bruce-wayne-ats.pdf')
      expect(themeName).toBeNull()
      expect(layoutName).toBeNull()
    },
    RENDER_TIMEOUT
  )

  it(
    'renders rich content (all ATS sections, object bullets, referee variants)',
    async () => {
      const dir = writeContent(RICH, { config: RICH_CONFIG })
      const { buffer } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        ats: true,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'renders a minimal ATS document (no company, no photo, no optional sections)',
    async () => {
      const dir = writeContent({ personal: { name: 'Solo Name', title: 'Widget Maker' } })
      const { buffer, filename } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        ats: true,
        env: {},
        warn: () => {}
      })
      expect(isPdf(buffer)).toBe(true)
      expect(filename).toBe('solo-name-ats.pdf')
    },
    RENDER_TIMEOUT
  )
})

describe('renderCV — warnings and errors', () => {
  it('throws when the content directory is missing', async () => {
    await expect(
      renderCV({ contentDir: join(tmp, 'nope'), fontsDir: FONTS, env: {}, warn: () => {} })
    ).rejects.toThrow(/not found/i)
  })

  it('throws on an unknown theme', async () => {
    const dir = writeContent(
      {
        personal: { name: 'X' },
        summary: ['s'],
        experience: [{ role: 'R', company: 'C', period: 'p', bullets: ['b'] }]
      },
      { config: { schemaVersion: 1, theme: 'ultraviolet' } }
    )
    await expect(
      renderCV({ contentDir: dir, fontsDir: FONTS, env: {}, warn: () => {} })
    ).rejects.toThrow(/Unknown theme/)
  })

  it(
    'warns and falls back when the configured layout is not found',
    async () => {
      const dir = writeContent(
        {
          personal: { name: 'X' },
          summary: ['s'],
          experience: [{ role: 'R', company: 'C', period: 'p', bullets: ['b'] }]
        },
        { config: { schemaVersion: 1, layout: 'ghost' } }
      )
      /** @type {string[]} */
      const warnings = []
      const { buffer } = await renderCV({
        contentDir: dir,
        fontsDir: FONTS,
        env: {},
        warn: (m) => warnings.push(m)
      })
      expect(isPdf(buffer)).toBe(true)
      expect(warnings.some((m) => m.includes('ghost') && /not found/i.test(m))).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'warns when a forced page1ExperienceCount cannot fit',
    async () => {
      const bigBullets = Array.from(
        { length: 6 },
        (_, i) =>
          `Delivered a substantial and detailed accomplishment number ${i} spanning many teams, quarters and stakeholders across the organisation.`
      )
      const experience = Array.from({ length: 3 }, (_, i) => ({
        role: `Very Senior Role Number ${i}`,
        company: `Company ${i}`,
        period: '2020 – Present',
        description:
          'A long paragraph describing the scope and responsibilities of this role in considerable detail for measurement.',
        bullets: bigBullets
      }))
      const dir = writeContent(
        {
          personal: { name: 'Over Flow' },
          summary: [
            'One reasonably long summary sentence used to eat into the page-1 budget for the overflow estimate.'
          ],
          experience
        },
        {
          config: { schemaVersion: 1, theme: 'teal', layout: 'two-column', page1ExperienceCount: 3 }
        }
      )
      /** @type {string[]} */
      const warnings = []
      await renderCV({ contentDir: dir, fontsDir: FONTS, env: {}, warn: (m) => warnings.push(m) })
      expect(
        warnings.some((m) => m.includes('page1ExperienceCount') && m.includes('safety margin'))
      ).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'warns about characters the bundled font cannot render',
    async () => {
      const dir = writeContent({
        personal: { name: 'Ада Лавлейс' },
        summary: ['s'],
        experience: [{ role: 'R', company: 'C', period: 'p', bullets: ['b'] }]
      })
      /** @type {string[]} */
      const warnings = []
      await renderCV({ contentDir: dir, fontsDir: FONTS, env: {}, warn: (m) => warnings.push(m) })
      expect(warnings.some((m) => m.includes('invisible'))).toBe(true)
    },
    RENDER_TIMEOUT
  )
})

describe('discoverLayouts', () => {
  it('returns {} when the layouts directory is absent', () => {
    expect(discoverLayouts(join(tmp, 'no-layouts'))).toEqual({})
  })

  it('loads and normalizes user layout files', () => {
    const ld = join(tmp, 'layouts')
    mkdirSync(ld, { recursive: true })
    writeFileSync(
      join(ld, 'custom.yaml'),
      dump({ template: 'two-column', pages: { first: { main: ['summary'] } } })
    )
    const layouts = discoverLayouts(ld)
    expect(layouts.custom.template).toBe('two-column')
    expect(layouts.custom.first?.main).toEqual(['summary'])
  })
})
