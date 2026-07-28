// C2 — real font metrics: canary + determinism (design doc §5's "canary
// test pins lineCount(knownString) === 3 so a fontkit/font bump that shifts
// metrics fails loudly", extended here with a width tolerance too, mirroring
// reproducible.test.js's verifyPatchPoints() spirit — a tripwire on an
// external dependency's behavior, not just our own code).
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMeasurer, findUnsupportedGlyphs, describeUnsupportedGlyphFinding } from './measure.js'
import { deriveMetrics } from './layout.js'
import { tealTheme } from './themes/teal.js'

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts')

// Pinned against an actual render (verified with pdftoppm ink-band counting
// — see test/layout-harness/measureDiff.js and research/c0-baseline.md): at
// 9pt in a column `bulletW` points wide — the REAL width layout.js's
// entryH()/summaryH() actually pass for an experience/summary bullet
// (deriveMetrics(tealTheme).bulletW, not an arbitrary round number: review
// round 2 found the previous 200pt canary width was never a width any real
// call site passes) — this real-world sentence wraps to exactly 3 lines. If
// a future fontkit or font-file bump changes Lato's metrics enough to shift
// this, this test fails loudly rather than silently drifting pagination.
const CANARY_TEXT = 'Established and scaled a citywide security operation from a solo initiative to a franchised network, extending coverage across multiple districts and international cities.'
const CANARY_SIZE = 9
const CANARY_WIDTH = deriveMetrics(tealTheme).bulletW
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
    expect(measure.widthOf('Hello', 12, { weight: 700 })).toBeGreaterThan(measure.widthOf('Hello', 12, { weight: 400 }))
  })

  it('a single word wider than maxWidth still returns at least 1 (never divides/loops pathologically)', () => {
    expect(measure.lineCount('Supercalifragilisticexpialidocious', 9, 10)).toBeGreaterThanOrEqual(1)
  })

  it('empty/whitespace-only text is always exactly 1 line, never 0', () => {
    expect(measure.lineCount('', 9, 200)).toBe(1)
    expect(measure.lineCount('   ', 9, 200)).toBe(1)
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
    expect(m1.lineCount(CANARY_TEXT, CANARY_SIZE, CANARY_WIDTH)).toBe(m2.lineCount(CANARY_TEXT, CANARY_SIZE, CANARY_WIDTH))
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
    expect(measure.unsupportedChars('Hello, World! — 100% "quoted" • café • naïve • Müller • Núñez')).toEqual([])
  })

  it('never flags whitespace or zero-width formatting characters', () => {
    expect(measure.unsupportedChars('a\tb\nc‍ d')).toEqual([])
  })

  it('findUnsupportedGlyphs() walks a content bag and attributes file + JSON-pointer path', () => {
    const findings = findUnsupportedGlyphs(measure, {
      personal: { name: 'Dmitri Дмитрий', title: 'Engineer' },
      summary: ['A perfectly ordinary English sentence.'],
      config: { theme: 'сериф' }, // must be skipped — settings, not rendered text
      keywords: ['сериф'], // must be skipped — metadata only, never printed
    })
    expect(findings).toEqual([{ file: 'personal.yaml', path: '/name', text: 'Dmitri Дмитрий', chars: expect.any(Array) }])
    expect(findings[0].chars.length).toBeGreaterThan(0)
  })

  it('describeUnsupportedGlyphFinding() produces a readable, truncated message', () => {
    const msg = describeUnsupportedGlyphFinding({ chars: ['а', 'б', 'в', 'г', 'д', 'е', 'ж', 'з', 'и', 'к'] })
    expect(msg).toMatch(/can't render/)
    expect(msg).toContain('…') // 10 chars, preview caps at 8 — truncation marker must show
  })
})
