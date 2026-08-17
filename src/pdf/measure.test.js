// C2 — real font metrics: canary + determinism (design doc §5's "canary
// test pins lineCount(knownString) === 3 so a fontkit/font bump that shifts
// metrics fails loudly", extended here with a width tolerance too, mirroring
// reproducible.test.js's verifyPatchPoints() spirit — a tripwire on an
// external dependency's behavior, not just our own code).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bulletWidth, deriveMetrics, NATURAL_LINE_HEIGHT } from './layout.js'
import {
  createMeasurer,
  describeUnsupportedGlyphFinding,
  findUnsupportedGlyphs
} from './measure.js'
import { tealTheme } from './themes/teal.js'

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts')

// Pinned against an actual render (verified with pdftoppm ink-band counting
// — see test/layout-harness/measureDiff.js and research/archive/c0-baseline.md): at
// 9pt in a column `bulletW` points wide — the REAL width layout.js's
// entryH()/summaryH() actually pass for an experience/summary bullet
// (deriveMetrics(tealTheme).bulletW, not an arbitrary round number: review
// round 2 found the previous 200pt canary width was never a width any real
// call site passes) — this real-world sentence wraps to exactly 3 lines. If
// a future fontkit or font-file bump changes Lato's metrics enough to shift
// this, this test fails loudly rather than silently drifting pagination.
const CANARY_TEXT =
  'Established and scaled a citywide security operation from a solo initiative to a franchised network, extending coverage across multiple districts and international cities.'
const CANARY_SIZE = 9
// The REAL bullet wrap width (dash advance + BulletList's marginRight — §3.4),
// computed with this test's own measurer so the canary keeps testing the width
// the packer actually passes. 301.91pt for shipped Lato; the pinned line count
// below was re-verified against a render at this width when S3 landed.
const CANARY_WIDTH = bulletWidth(deriveMetrics(tealTheme), createMeasurer(FONTS_DIR))
const CANARY_EXPECTED_LINES = 3

describe('measure.js — canary (tripwire on fontkit/font-file drift)', () => {
  const measure = createMeasurer(FONTS_DIR)

  it('pins the known-correct line count for a real bullet-shaped string', () => {
    expect(measure.lineCount(CANARY_TEXT, CANARY_SIZE, CANARY_WIDTH)).toBe(CANARY_EXPECTED_LINES)
  })

  it('pins glyph-advance width within a small tolerance (catches a metrics shift too subtle to flip a line count)', () => {
    // "Hello" @ 12pt, Regular — measured directly against the pinned TTF.
    expect(measure.widthOf('Hello', 12, { weight: 400 })).toBeCloseTo(28.18, 1)
    // Bold must be measurably wider than Regular at the same size/text —
    // a sanity check that weight actually selects a different font file
    // (fontFileFor()), not just a coincidence of the pinned number above.
    expect(measure.widthOf('Hello', 12, { weight: 700 })).toBeGreaterThan(
      measure.widthOf('Hello', 12, { weight: 400 })
    )
  })

  it('a single word wider than maxWidth still returns at least 1 (never divides/loops pathologically)', () => {
    expect(measure.lineCount('Supercalifragilisticexpialidocious', 9, 10)).toBeGreaterThanOrEqual(1)
  })

  it('empty/whitespace-only text is always exactly 1 line, never 0', () => {
    expect(measure.lineCount('', 9, 200)).toBe(1)
    expect(measure.lineCount('   ', 9, 200)).toBe(1)
  })

  // C3a canary: layout.js's NATURAL_LINE_HEIGHT is the line height
  // react-pdf/textkit gives a <Text> with no explicit `lineHeight` style —
  // `(ascent - descent + lineGap) / unitsPerEm`. Most sidebar styles omit
  // lineHeight, so every sidebar section height depends on this number being
  // 1.2 for the bundled Lato faces. Pinned here (against the real font files,
  // through the same fontkit the measurer and react-pdf both use) so a font or
  // fontkit bump that changes the metrics fails loudly instead of silently
  // repaginating the sidebar.
  it("pins Lato's natural line height at NATURAL_LINE_HEIGHT for every registered face", () => {
    const faces = [
      { weight: 300 },
      { weight: 300, italic: true },
      { weight: 400 },
      { weight: 400, italic: true },
      { weight: 500 },
      { weight: 600 },
      { weight: 700 },
      { weight: 700, italic: true }
    ]
    // Tabulated (label + value) rather than asserted per iteration, so a
    // failure names the offending face instead of just a number.
    expect(faces.map((f) => [JSON.stringify(f), measure.naturalLineHeight(f)])).toEqual(
      faces.map((f) => [JSON.stringify(f), NATURAL_LINE_HEIGHT])
    )
    expect(NATURAL_LINE_HEIGHT).toBe(1.2)
    // ...and no measurer at all falls back to the same constant, so the
    // browser preview and the CLI agree on Lato.
    expect(measure.naturalLineHeight()).toBe(NATURAL_LINE_HEIGHT)
  })
})

describe('measure.js — letterSpacing (C3a: sidebar titles and the identity name set it)', () => {
  const measure = createMeasurer(FONTS_DIR)

  it('adds the spacing once per glyph, matching textkit', () => {
    const plain = measure.widthOf('CORE COMPETENCIES', 7, { weight: 600 })
    const spaced = measure.widthOf('CORE COMPETENCIES', 7, { weight: 600, letterSpacing: 1.2 })
    expect(spaced - plain).toBeCloseTo('CORE COMPETENCIES'.length * 1.2, 6)
    // Ground truth: the same string in the same style measured 92.7pt of
    // visual extent in a real render (`pdftotext -bbox`); the advance textkit
    // breaks lines against carries one extra trailing spacing unit.
    expect(spaced).toBeCloseTo(92.7 + 1.2, 1)
  })

  it('defaults to zero spacing, so existing call sites are unchanged', () => {
    expect(measure.widthOf('Hello', 12, { weight: 400, letterSpacing: 0 })).toBe(
      measure.widthOf('Hello', 12, { weight: 400 })
    )
  })

  it('is cached separately per spacing value (no cross-contamination through the width cache)', () => {
    const m = createMeasurer(FONTS_DIR)
    const a = m.widthOf('Hello', 12, {})
    const b = m.widthOf('Hello', 12, { letterSpacing: 5 })
    expect(m.widthOf('Hello', 12, {})).toBe(a)
    expect(b).toBeCloseTo(a + 5 * 5, 6)
  })

  it('can push a string onto an extra line', () => {
    const text = 'Alexandria Cassandra Montgomery'
    const width = measure.widthOf(text, 11, { weight: 700 }) + 1
    expect(measure.lineCount(text, 11, width, { weight: 700 })).toBe(1)
    expect(measure.lineCount(text, 11, width, { weight: 700, letterSpacing: 2 })).toBeGreaterThan(1)
  })
})

describe('measure.js — determinism', () => {
  it('measuring the same string twice, same instance, is === identical', () => {
    const measure = createMeasurer(FONTS_DIR)
    const a = measure.lineCount(CANARY_TEXT, CANARY_SIZE, CANARY_WIDTH)
    const b = measure.lineCount(CANARY_TEXT, CANARY_SIZE, CANARY_WIDTH)
    expect(a).toBe(b)
    const wa = measure.widthOf(CANARY_TEXT, CANARY_SIZE)
    const wb = measure.widthOf(CANARY_TEXT, CANARY_SIZE)
    expect(wa).toBe(wb) // exact === on the float — font.layout() is bit-stable (pure reads of a pinned font file, no RNG/IO)
  })

  it('measuring the same string, two independent measurer instances, is === identical', () => {
    const m1 = createMeasurer(FONTS_DIR)
    const m2 = createMeasurer(FONTS_DIR)
    expect(m1.lineCount(CANARY_TEXT, CANARY_SIZE, CANARY_WIDTH)).toBe(
      m2.lineCount(CANARY_TEXT, CANARY_SIZE, CANARY_WIDTH)
    )
    expect(m1.widthOf(CANARY_TEXT, CANARY_SIZE)).toBe(m2.widthOf(CANARY_TEXT, CANARY_SIZE))
  })
})

describe('measure.js — unsupported-glyph detection (design doc G-a)', () => {
  const measure = createMeasurer(FONTS_DIR)

  it('flags non-Latin scripts the bundled Lato has zero coverage of', () => {
    expect(measure.unsupportedChars('බ්‍රූස් වේන්').length).toBeGreaterThan(0) // Sinhala
    expect(measure.unsupportedChars('புரூஸ் வேயின்').length).toBeGreaterThan(0) // Tamil
    expect(measure.unsupportedChars('ब्रूस वेन').length).toBeGreaterThan(0) // Devanagari
    expect(measure.unsupportedChars('Дмитрий').length).toBeGreaterThan(0) // Cyrillic
  })

  it('flags specific common European diacritics the bundled subset is missing (Czech, Romanian, Turkish)', () => {
    expect(measure.unsupportedChars('Dvořák')).toContain('ř')
    expect(measure.unsupportedChars('Brătianu')).toContain('ă')
    expect(measure.unsupportedChars('Ayşe')).toContain('ş')
  })

  it('does not flag ordinary English punctuation or common Western-European Latin diacritics', () => {
    expect(
      measure.unsupportedChars('Hello, World! — 100% "quoted" • café • naïve • Müller • Núñez')
    ).toEqual([])
  })

  it('never flags whitespace or zero-width formatting characters', () => {
    expect(measure.unsupportedChars('a\tb\nc‍ d')).toEqual([])
  })

  it('findUnsupportedGlyphs() walks a content bag and attributes file + JSON-pointer path', () => {
    const findings = findUnsupportedGlyphs(measure, {
      personal: { name: 'Dmitri Дмитрий', title: 'Engineer' },
      summary: ['A perfectly ordinary English sentence.'],
      config: { theme: 'сериф' }, // must be skipped — settings, not rendered text
      keywords: ['сериф'] // must be skipped — metadata only, never printed
    })
    expect(findings).toEqual([
      { file: 'personal.yaml', path: '/name', text: 'Dmitri Дмитрий', chars: expect.any(Array) }
    ])
    expect(findings[0].chars.length).toBeGreaterThan(0)
  })

  it('describeUnsupportedGlyphFinding() produces a readable, truncated message', () => {
    const msg = describeUnsupportedGlyphFinding({
      chars: ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и', 'к']
    })
    expect(msg).toMatch(/can't render/)
    expect(msg).toContain('…') // 10 chars, preview caps at 8 — truncation marker must show
  })
})
