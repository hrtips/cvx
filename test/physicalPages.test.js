// I1 — plan–physical equality (ARCHITECTURE.md §5 INV-4, §8 row I1) — RED FIRST.
//
// Gate 2 of §6.1: every test in this file was written BEFORE the
// implementation and must fail today because the feature is absent — never
// because of a syntax error or a broken fixture. When I1 lands, each goes
// green without edits (except tuning the trailing-margin fixture's content if
// its own physical-count verification says it stopped reproducing).
//
// What I1 ships (the contract under test, from ARCHITECTURE.md §2.4/§8 and
// the archived plan's I1 section):
//   (a) src/pdf/physicalPages.js — node-only counter over the rendered PDF
//       buffer: reads /Count N on the root /Pages node, cross-checks against
//       the number of /Type /Page dictionaries, returns null (unknown, never
//       0) on any disagreement or parse failure.
//   (b) warning `physical-pages-exceed-plan`, kind 'defect', payload
//       { planned, physical }, appended to the BUILD envelope's
//       diagnostics.warnings by the tool/CLI layer — never by
//       layoutDiagnostics (pure function of the plan); plan_layout can never
//       carry it. Message names both numbers; R-F: no edit advice.
//   (c) R-D exit codes: exit 0 with the defect normally; non-zero under
//       --strict; the defect reaches stderr in all modes (facts never do).
//   (d) fact `main-slot-unmeasured`, kind 'fact', when a layout places any
//       section other than summary/experience/spacers in a main slot; payload
//       lists the keys; derived from layout.js's exported measured-main-keys
//       constant.
//   (e) schema/v1: layoutPage.main's description states the measurement
//       caveat while (d) exists.
//
// Doctrine 9: assertions here pin warning codes, kinds, payload identities
// and orderings — physical page counts appear only as fixture-verification
// assertions (proving the repro still reproduces), never as bare
// totalPages-equality regression pins.

import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { planLayout } from '../src/mcp/tools.js'
import { hasPdftoppm, ROOT, runCli } from './layout-harness/scaffold.js'

const TEMPLATE = path.join(ROOT, 'template', 'cv-content')

/** Copy the scaffold, then overwrite content files for the shape under test. */
function workspace(id, files = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), `cvx-i1-${id}-`))
  cpSync(TEMPLATE, path.join(dir, 'cv-content'), { recursive: true })
  for (const [rel, text] of Object.entries(files)) {
    writeFileSync(path.join(dir, 'cv-content', rel), text)
  }
  return dir
}

/** Physical sheet count by poppler — the independent instrument (doctrine 12). */
function popplerPages(pdfPath) {
  const out = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  return Number(/Pages:\s+(\d+)/.exec(out)[1])
}

const build = (dir, extra = []) => {
  const res = runCli(dir, ['build', '--json', ...extra])
  let json = null
  try {
    json = JSON.parse(res.stdout)
  } catch {
    /* leave null — asserted where it matters */
  }
  return { ...res, json }
}

const warningsOf = (json) => json?.diagnostics?.warnings ?? []
const codesOf = (json) => warningsOf(json).map((w) => w.code)

// ── The two reproduction shapes (temp workspaces, NEVER corpus fixtures:
//    the archived plan forbids landing known-spilling content into
//    baseline.json before I4 makes it plannable) ────────────────────────────

/** (i) Trailing-margin spill: student-CV shape — summary + education +
 *  certifications + referees stacked in first.main just past capacity, so the
 *  plan says 1 page while react-pdf flows a blank second sheet. Content is
 *  synthetic, sized to the shape research/archive/dogfood-student-cv.md F2
 *  measured (no personal data). */
function spillWorkspace() {
  const longInstitution =
    'Metropolitan Institute of Applied Technology (MIAT) — Specialised in ' +
    'Information Systems with Distinction · GPA 3.85 / 4.0'
  return workspace('spill', {
    'experience.yaml': '[]\n',
    'summary.yaml': [
      '- "Results-driven technology undergraduate with a strong foundation in software development, web technologies and mobile application development across modern stacks."',
      '- "Passionate about creating user-focused digital solutions with strong analytical problem-solving and collaborative teamwork skills in agile environments."',
      '- "Quick learner with the demonstrated ability to adapt to new technologies rapidly and work productively in fast-paced delivery environments."',
      '- "Seeking an internship opportunity to contribute technical knowledge, creativity and dedication to a dynamic engineering organization while growing."'
    ].join('\n'),
    'education.yaml': [
      `- degree: Bachelor of Science (Honours) in Information Technology\n  institution: "${longInstitution}"\n  period: 2023 – 2027`,
      '- degree: Advanced Diploma in Information Technology\n  institution: Northgate Metro Campus of Continuing Education\n  period: 2022 – 2023',
      '- degree: Advanced Diploma in Professional English\n  institution: Northgate Metro Campus of Continuing Education\n  period: 2022 – 2023',
      '- degree: General Certificate Examination (Advanced Level) — 2022\n  institution: "Combined Mathematics B · Chemistry B · Physics C"',
      '- degree: General Certificate Examination (Ordinary Level) — 2018\n  institution: "Mathematics A · Science A · First Language A · History A · Religion A · Dancing A · Physical Education A · English B · Business Studies B"'
    ].join('\n\n'),
    'certifications.yaml': [
      '- name: Advanced Programming — Beginner to Master\n  issuer: Online Academy',
      '- name: Complete Full-Stack Web Development Bootcamp\n  issuer: Online Academy',
      '- name: Document Database Data Modeling Path\n  issuer: Vendor Learn'
    ].join('\n\n'),
    'referees.yaml': [
      '- name: Mr. Arthur Pennington\n  title: Former Chief Executive Officer\n  company: Northgate Institute of Printing\n  phone: "011 555 0195"',
      '- name: Ms. Beatrice Holloway\n  title: Senior Lecturer in English\n  company: Northgate Metro Campus, East Wing\n  phone: "011 555 0184"'
    ].join('\n\n'),
    'achievements.yaml': '[]\n',
    'publications.yaml': '[]\n',
    'languages.yaml': '[]\n',
    'layouts/two-column.yaml': [
      'template: two-column',
      'pages:',
      '  first:',
      '    sidebar:',
      '      - identity-photo',
      '      - contact',
      '      - competencies',
      '    main:',
      '      - summary',
      '      - spacer: 8',
      '      - education',
      '      - spacer: 8',
      '      - certifications',
      '      - spacer: 8',
      '      - referees',
      '  continuation:',
      '    sidebar:',
      '      - identity-compact',
      '    main:',
      '      - experience:continued',
      '  last:',
      '    sidebar:',
      '      - identity-compact',
      '    main:',
      '      - experience:continued',
      ''
    ].join('\n')
  })
}

/** (ii) Thirty 2-line summary bullets with an empty experience list. Measured
 *  on this workspace 2026-08-15 (two instruments, doctrine 12): the plan
 *  records 2 pages, the PDF carries 3, and `warnings` is EMPTY — the silence
 *  I1 exists to break. It differs from the archived probe's "planned 1,
 *  physical 3" because that probe trimmed the sidebar; here the scaffold's
 *  full sidebar drives `P = max(main, sidebar)` to 2. The defect is the
 *  same one: an unmeasured main flow spilling a sheet the plan never counted. */
function tallSummaryWorkspace() {
  const bullets = Array.from(
    { length: 30 },
    (_, i) =>
      `- "Probe sentence number ${i + 1} for the tall summary overflow experiment, deliberately long enough to wrap onto a second line in the main column of the page."`
  )
  return workspace('tall-summary', {
    'experience.yaml': '[]\n',
    'summary.yaml': `${bullets.join('\n')}\n`
  })
}

/** Small education in first.main that FITS — the fact fires, no defect. */
function unmeasuredButFittingWorkspace() {
  return workspace('fits', {
    'experience.yaml': '[]\n',
    'education.yaml':
      '- degree: BSc in Information Technology\n  institution: Metropolitan Institute\n  period: 2023 – 2027\n',
    'layouts/two-column.yaml': [
      'template: two-column',
      'pages:',
      '  first:',
      '    sidebar: [identity-photo, contact, achievements]',
      '    main: [summary, education]',
      '  continuation:',
      '    sidebar: [identity-compact]',
      '    main: ["experience:continued"]',
      '  last:',
      '    sidebar: [identity-compact]',
      '    main: ["experience:continued"]',
      ''
    ].join('\n')
  })
}

// ── (a) the counter ──────────────────────────────────────────────────────────

describe('I1(a) — physical page counter (src/pdf/physicalPages.js)', () => {
  it('exists as a node-only module exporting countPdfPages(buffer)', async () => {
    const mod = await import('../src/pdf/physicalPages.js')
    expect(typeof mod.countPdfPages).toBe('function')
  })

  it.skipIf(!hasPdftoppm())(
    'agrees with poppler on a real build (the two-instruments rule)',
    async () => {
      const { countPdfPages } = await import('../src/pdf/physicalPages.js')
      const dir = workspace('counter')
      const { code, json } = build(dir)
      expect(code).toBe(0)
      const pdf = path.join(dir, json.filename)
      const counted = countPdfPages(readFileSync(pdf))
      expect(counted).toBe(popplerPages(pdf))
    },
    60000
  )

  it('returns null — unknown, never 0 — on an unparseable buffer', async () => {
    const { countPdfPages } = await import('../src/pdf/physicalPages.js')
    expect(countPdfPages(Buffer.from('not a pdf at all'))).toBeNull()
    // A cross-check disagreement must also refuse to guess: a fragment with
    // a /Count that no page dictionaries corroborate.
    expect(countPdfPages(Buffer.from('%PDF-1.4\n/Type /Pages /Count 7\n'))).toBeNull()
  })
})

// ── (b) the defect warning, on both reproductions ────────────────────────────

describe('I1(b) — physical-pages-exceed-plan fires on the silent-spill shapes', () => {
  it.skipIf(!hasPdftoppm())(
    'trailing-margin spill: planned 1, physical 2, defect present with both numbers',
    () => {
      const dir = spillWorkspace()
      const { code, json } = build(dir)
      expect(code).toBe(0)
      // Fixture verification first (poppler, the independent instrument): if
      // content drift stops the repro reproducing, fail HERE by name.
      const physical = popplerPages(path.join(dir, json.filename))
      expect(json.diagnostics.totalPages).toBe(1)
      expect(physical).toBe(2)
      const w = warningsOf(json).find((x) => x.code === 'physical-pages-exceed-plan')
      expect(w).toBeDefined()
      expect(w.kind).toBe('defect')
      // Payload must equal what the two instruments independently say.
      expect(w.planned).toBe(json.diagnostics.totalPages)
      expect(w.physical).toBe(physical)
      expect(w.message).toContain('1')
      expect(w.message).toContain('2')
    },
    60000
  )

  it.skipIf(!hasPdftoppm())(
    'tall summary: planned 2, physical 3, defect present with both numbers',
    () => {
      const dir = tallSummaryWorkspace()
      const { code, json } = build(dir)
      expect(code).toBe(0)
      // Fixture verification by the independent instrument FIRST: these two
      // numbers are what makes this workspace a reproduction at all. If
      // content or engine drift changes them, this fails by name here rather
      // than making the payload assertions below quietly meaningless.
      const physical = popplerPages(path.join(dir, json.filename))
      expect(json.diagnostics.totalPages).toBe(2)
      expect(physical).toBe(3)
      const w = warningsOf(json).find((x) => x.code === 'physical-pages-exceed-plan')
      expect(w).toBeDefined()
      expect(w.kind).toBe('defect')
      // The payload must equal what the two instruments independently say.
      expect(w.planned).toBe(json.diagnostics.totalPages)
      expect(w.physical).toBe(physical)
      expect(w.message).toContain('2')
      expect(w.message).toContain('3')
    },
    60000
  )

  it('defects order before facts in the envelope warnings array', () => {
    const dir = spillWorkspace()
    const { json } = build(dir)
    const codes = codesOf(json)
    const defectAt = codes.indexOf('physical-pages-exceed-plan')
    const factAt = codes.indexOf('main-slot-unmeasured')
    expect(defectAt).toBeGreaterThanOrEqual(0)
    expect(factAt).toBeGreaterThanOrEqual(0)
    expect(defectAt).toBeLessThan(factAt)
  }, 60000)

  it('R-F: the defect message prices, never prescribes — no edit advice verbs', () => {
    const dir = tallSummaryWorkspace()
    const { json } = build(dir)
    const w = warningsOf(json).find((x) => x.code === 'physical-pages-exceed-plan')
    expect(w).toBeDefined()
    expect(w.message).not.toMatch(/\bshorten\b|\btrim\b|\bremove\b|\bmove the\b|\byou should\b/i)
  }, 60000)
})

// ── negative sweep + purity + impossible direction ───────────────────────────

describe('I1 — the warning stays silent where nothing spills', () => {
  it('the shipped scaffold build carries no physical-pages code', () => {
    const dir = workspace('clean')
    const { code, json } = build(dir)
    expect(code).toBe(0)
    expect(codesOf(json)).not.toContain('physical-pages-exceed-plan')
  }, 60000)

  it('plan_layout (no render, no sheets) can never carry the code', async () => {
    const dir = spillWorkspace()
    const plan = await planLayout({ dir })
    expect(JSON.stringify(plan)).not.toContain('physical-pages-exceed-plan')
  }, 60000)

  it.skipIf(!hasPdftoppm())(
    'physical < planned is structurally impossible (harness invariant)',
    () => {
      for (const dir of [workspace('inv-clean'), spillWorkspace(), tallSummaryWorkspace()]) {
        const { code, json } = build(dir)
        expect(code).toBe(0)
        const physical = popplerPages(path.join(dir, json.filename))
        expect(physical).toBeGreaterThanOrEqual(json.diagnostics.totalPages)
      }
    },
    120000
  )
})

// ── (c) exit codes per R-D ───────────────────────────────────────────────────

/** Run the CLI capturing stdout AND stderr regardless of exit code — `runCli`
 *  surfaces stderr only on failure, and R-D's routing rule ("defects reach
 *  stderr in all modes; facts never do") has to be observable on a run that
 *  exits 0. */
function runCapturing(dir, args) {
  // spawnSync, not execFileSync: the latter RETURNS only stdout, so a
  // successful run's stderr is unobservable — and "the defect reaches stderr
  // on a run that exits 0" is precisely what R-D asks us to prove.
  const res = spawnSync('node', [path.join(ROOT, 'bin', 'cvx.js'), ...args], {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return { code: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

describe('I1(c) — R-D exit codes and stderr routing', () => {
  it('exit 0 with the defect present in normal mode; the defect reaches stderr', () => {
    const dir = tallSummaryWorkspace()
    const res = runCapturing(dir, ['build', '--json'])
    expect(res.code).toBe(0)
    expect(JSON.parse(res.stdout).ok).toBe(true)
    expect(codesOf(JSON.parse(res.stdout))).toContain('physical-pages-exceed-plan')
    // A defect the caller could otherwise miss must be audible without --json.
    expect(res.stderr).toMatch(/pages?/i)
  }, 90000)

  it('exit non-zero under --strict, with the defect in the JSON envelope', () => {
    const dir = tallSummaryWorkspace()
    const res = runCapturing(dir, ['build', '--json', '--strict'])
    expect(res.code).not.toBe(0)
    expect(codesOf(JSON.parse(res.stdout))).toContain('physical-pages-exceed-plan')
  }, 60000)

  it('facts never reach stderr: a fitting main-slot workspace logs no fact line', () => {
    const dir = unmeasuredButFittingWorkspace()
    const res = runCapturing(dir, ['build', '--json'])
    expect(res.code).toBe(0)
    // The fact IS in the structured envelope…
    expect(codesOf(JSON.parse(res.stdout))).toContain('main-slot-unmeasured')
    // …and is NOT shouted at the terminal.
    expect(res.stderr).not.toContain('main-slot-unmeasured')
    expect(res.stderr).not.toMatch(/not measured|unmeasured/i)
  }, 60000)
})

// ── (d) the interim fact ─────────────────────────────────────────────────────

describe('I1(d) — main-slot-unmeasured fact', () => {
  it('fires, kind fact, listing exactly the unmeasured keys, on a fitting layout', () => {
    const dir = unmeasuredButFittingWorkspace()
    const { code, json } = build(dir)
    expect(code).toBe(0)
    const w = warningsOf(json).find((x) => x.code === 'main-slot-unmeasured')
    expect(w).toBeDefined()
    expect(w.kind).toBe('fact')
    expect(w.keys).toEqual(['education'])
    // R-F again: names the condition and what the plan excludes; no advice.
    expect(w.message).toMatch(/not measured|unmeasured/i)
    expect(w.message).not.toMatch(/\bshorten\b|\bmove\b|\byou should\b/i)
  }, 60000)

  it('is absent when main slots hold only summary/experience/spacers', () => {
    const dir = workspace('default-main')
    const { json } = build(dir)
    expect(codesOf(json)).not.toContain('main-slot-unmeasured')
  }, 60000)

  it('derives from the exported measured-main-keys constant, not a copied list', async () => {
    const layout = await import('../src/pdf/layout.js')
    expect(layout.MEASURED_MAIN_KEYS).toBeDefined()
    const keys = [...layout.MEASURED_MAIN_KEYS]
    expect(keys).toContain('summary')
    expect(keys).toContain('experience')
  })
})

// ── (e) the schema caveat ────────────────────────────────────────────────────

describe('I1(e) — the schema states the measurement caveat while the gap exists', () => {
  it('layoutPage.main description names the limitation', () => {
    const schema = JSON.parse(
      readFileSync(path.join(ROOT, 'schema', 'v1', 'cvx.schema.json'), 'utf8')
    )
    const desc = schema.$defs.layoutPage.properties.main.description
    expect(desc).toMatch(/measur/i)
  })
})
