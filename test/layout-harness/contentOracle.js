// ── Content-completeness oracle (pdftotext-based) ──────────────────────────
//
// Review's highest-severity finding: the old "sidebar Invariant 0" check
// (blocks.js/sidebarPlan.js's presentSidebarKeys() vs. the static per-page
// KEY assignment) is vacuous — it only proves a section's KEY is assigned
// to some page-kind, never that the section's actual ITEMS made it into the
// rendered PDF. A section can be "structurally present" and still have its
// tail clipped, or overflow invisibly, and that check would never notice.
//
// This is the real oracle: render the fixture, extract ALL text from the
// PDF with `pdftotext` (shipped alongside `pdftoppm` in the same poppler
// package — gated by the same `hasPdftoppm()` guard), and assert a unique,
// greppable, per-item sentinel from EVERY present section is actually
// findable in the extracted text — main column (every experience entry's
// role — experience can split across pages under page1SplitBullets, so
// every entry's text must survive somewhere) AND sidebar (the LAST item of
// every present section: education, certifications, publications,
// languages, referees, achievements, competencies — the last item is the
// one most likely to go missing if a section silently overflows/clips).
//
// contentSpecs.js's generators already emit index-tagged, greppable text
// for exactly this purpose (e.g. "Certification 7", "Publication 3",
// "Referee 2" — matching the sprint's own examples) — no separate fixture
// vocabulary needed.
//
// Latin-only, by design: personal.name is deliberately never a checked
// sentinel (see NON_LATIN_NAME_CAVEAT below) — the non-Latin name fixture's
// glyphs are a KNOWN, DOCUMENTED gap (design doc G-a: Lato has no Sinhala/
// Tamil/Devanagari glyphs and no fallback font is registered), not
// something this oracle silently papers over. layoutRenderOracle.test.js
// asserts that absence explicitly, by name, rather than omitting the check.
// ─────────────────────────────────────────────────────────────────────────

function lastOf(arr, pick) {
  return arr?.length ? pick(arr[arr.length - 1]) : null
}

/**
 * Build the sentinel list for one fixture's content bag (contentSpecs.js's
 * buildContent() output). Each sentinel is `{ section, text }` — `text` is
 * asserted present verbatim in the rendered PDF's extracted text.
 */
export function sentinelsFor(content) {
  const sentinels = []
  for (const e of content.experience ?? []) {
    sentinels.push({ section: 'experience', text: e.role })
  }
  const lastItemSentinel = (section, arr, pick) => {
    const text = lastOf(arr, pick)
    if (text != null) sentinels.push({ section, text })
  }
  lastItemSentinel('education', content.education, (x) => x.degree)
  lastItemSentinel('certifications', content.certifications, (x) => x.name)
  lastItemSentinel('publications', content.publications, (x) => x.title)
  lastItemSentinel('languages', content.languages, (x) => x.language)
  lastItemSentinel('referees', content.referees, (x) => x.name)
  lastItemSentinel('achievements', content.achievements, (x) => x.year)
  lastItemSentinel('competencies', content.competencies, (x) => x)
  return sentinels
}

/**
 * @param {string} text        extracted PDF text (scaffold.js's extractText())
 * @param {{section,text}[]} sentinels
 * @returns {{ok: boolean, missing: {section,text}[]}}
 */
export function checkCompleteness(text, sentinels) {
  // Collapse whitespace runs (including newlines) to a single space before
  // matching. Real finding while building this: ATSDocument.jsx's
  // competencies section joins every item into ONE wrapping string
  // (`competencies.join('  ·  ')`); when a wrap point falls between a
  // sentinel's two words (e.g. "...Competency\n7" instead of "Competency
  // 7" — pdftotext renders a plain-text line break as a newline where the
  // source had an ordinary space), a naive substring check would report
  // content as "missing" when it was actually rendered in full — a false
  // positive from the harness, not real clipping (confirmed by reading the
  // raw extracted text around the wrap). Normalizing whitespace first fixes
  // that without weakening the check against genuine content loss: a truly
  // dropped sentinel is still entirely absent either way.
  const normalized = text.replace(/\s+/g, ' ')
  const missing = sentinels.filter((s) => !normalized.includes(s.text))
  return { ok: missing.length === 0, missing }
}

/**
 * The one intentional, documented exception: personal.name is never a
 * sentinel checkCompleteness() looks for, because for the non-Latin-name
 * fixture it is *expected* to be unrecoverable (Lato has no glyphs for
 * Sinhala/Tamil/Devanagari and no fallback font is registered — design doc
 * G-a). layoutRenderOracle.test.js's dedicated non-Latin test asserts this
 * absence explicitly (`expect(text).not.toContain(...)`), citing this
 * constant, so the gap stays visible rather than silently un-checked.
 */
export const NON_LATIN_NAME_CAVEAT =
  'personal.name is excluded from sentinelsFor() on purpose — see contentOracle.js module docblock (design doc G-a).'
