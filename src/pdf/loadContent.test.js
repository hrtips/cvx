// loadContent — NFC normalization (review round 2, SHOULD #4). See
// normalizeContent.js's module docblock for the full "why" (NFD input both
// mis-renders and mis-warns). NFD test strings are derived with
// `.normalize('NFD')` from the precomposed form rather than hand-typed
// Unicode escapes, so the fixture is self-verifying instead of relying on a
// human counting combining-mark codepoints correctly.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadContent } from './loadContent.js'
import { createMeasurer, findUnsupportedGlyphs } from './measure.js'

const FONTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fonts')

const dirsToClean = []
afterEach(() => {
  while (dirsToClean.length) rmSync(dirsToClean.pop(), { recursive: true, force: true })
})

function contentDirWith(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'cvx-loadcontent-'))
  dirsToClean.push(dir)
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text)
  return dir
}

// "José" and "Nguyễn", decomposed to NFD (base letter + separate combining
// mark codepoint(s)) — canonically equivalent to the precomposed form, byte-
// different from it.
const JOSE_NFD = 'José'.normalize('NFD')
const NGUYEN_NFD = 'Nguyễn'.normalize('NFD')

describe('loadContent — NFC normalization', () => {
  it('sanity: the NFD fixtures really are byte-different from their precomposed (NFC) form', () => {
    expect(JOSE_NFD).not.toBe('José')
    expect(NGUYEN_NFD).not.toBe('Nguyễn')
    // ...but canonically equivalent — a human/editor sees identical text.
    expect(JOSE_NFD.normalize('NFC')).toBe('José')
    expect(NGUYEN_NFD.normalize('NFC')).toBe('Nguyễn')
  })

  it('normalizes an NFD-decomposed string to NFC on load', () => {
    const dir = contentDirWith({ 'personal.yaml': `name: "${JOSE_NFD} García"\n` })
    const { content } = loadContent(dir)
    expect(content.personal.name).toBe('José García')
  })

  it('recurses into arrays and nested objects (e.g. a bullet inside experience.yaml)', () => {
    const dir = contentDirWith({
      'experience.yaml': `- role: Engineer\n  company: Acme\n  bullets:\n    - "Worked with ${NGUYEN_NFD} on a project."\n`
    })
    const { content } = loadContent(dir)
    expect(content.experience[0].bullets[0]).toBe('Worked with Nguyễn on a project.')
  })

  it('fixes the false-positive glyph warning for accented text Lato DOES support', () => {
    const measure = createMeasurer(FONTS_DIR)
    // Pre-fix behaviour (measure.js itself is unchanged and never
    // normalizes — the fix is entirely at load time): the bare combining
    // acute accent (U+0301) has no Lato glyph even though the precomposed
    // 'é' (U+00E9) does, so raw NFD input wrongly flags a character.
    expect(measure.unsupportedChars(JOSE_NFD).length).toBeGreaterThan(0)

    const dir = contentDirWith({ 'personal.yaml': `name: "${JOSE_NFD}"\n` })
    const { content } = loadContent(dir)
    expect(content.personal.name).toBe('José') // confirms normalization ran
    expect(findUnsupportedGlyphs(measure, content)).toEqual([]) // no false positive post-normalization
  })

  it('turns a noisy two-combining-mark warning into the one precise, correct one for genuinely unsupported text', () => {
    const measure = createMeasurer(FONTS_DIR)
    // Pre-fix: NFD "Nguyễn" decomposes 'ễ' into e + combining circumflex +
    // combining tilde — Lato has a glyph for neither combining mark, so raw
    // NFD input reports TWO unsupported "characters", neither of which is
    // the actual letter a person reading the warning would recognize.
    expect(measure.unsupportedChars(NGUYEN_NFD)).toHaveLength(2)

    const dir = contentDirWith({ 'personal.yaml': `name: "${NGUYEN_NFD}"\n` })
    const { content } = loadContent(dir)
    expect(content.personal.name).toBe('Nguyễn') // confirms normalization ran
    // Post-normalization: Lato still doesn't support Vietnamese (design doc
    // G-a — genuinely, correctly unsupported), but now the warning names
    // exactly the one real precomposed character, not two mark artifacts.
    const findings = findUnsupportedGlyphs(measure, content)
    expect(findings).toHaveLength(1)
    expect(findings[0].chars).toEqual(['ễ'])
  })
})
