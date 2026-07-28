// ── Content-completeness oracle (pdftotext-based) ──────────────────────────
//
// Review's highest-severity finding (round 1): the old "sidebar Invariant 0"
// check (blocks.js/sidebarPlan.js's presentSidebarKeys() vs. the static
// per-page KEY assignment) is vacuous — it only proves a section's KEY is
// assigned to some page-kind, never that the section's actual ITEMS made it
// into the rendered PDF. A section can be "structurally present" and still
// have its tail clipped, or overflow invisibly, and that check would never
// notice.
//
// Review round 2's highest-severity finding: round 1's fix was still BLIND
// to the exact bug class this sprint exists to catch — a bullet the packer
// PLACES (invariant0/placedExactlyOnce hold on the logical plan) but the
// RENDERER CLIPS at the physical page edge (packExperiences() budgets against
// an ESTIMATE, and the config-driven forced-split branch has no budget check
// at all — see layout.js). sentinelsFor() checked only each experience
// entry's ROLE (a short heading that either renders or the whole entry is
// missing) and only the LAST item of each sidebar section — a bullet
// (main column) or a middle item (sidebar) could be silently dropped and
// every previous check would stay green. Concretely: the shipped scaffold's
// tuned config.yaml clips the second bullet of "Chairman & Chief Executive
// Officer" (C2's real-measurement finding) and NOTHING before this fix
// noticed, because nothing was ever checking bullets at all.
//
// The fix: this is the real oracle now — render the fixture, extract ALL
// text from the PDF with `pdftotext` (shipped alongside `pdftoppm` in the
// same poppler package — gated by the same `hasPdftoppm()` guard), and
// assert a sentinel from EVERY present item is actually findable in the
// extracted text — main column (every experience entry's role, AND every
// one of its bullets — not just the entry heading) AND sidebar (EVERY item
// of every present section: education, certifications, publications,
// languages, referees, achievements, competencies — not just the last).
//
// For anything long enough to WRAP across multiple lines (experience
// bullets; potentially long sidebar fields like education.degree) the
// sentinel is a TAIL substring (tailSentinel() below) — the last few words
// — rather than the whole string. This is deliberate, not merely "shorter is
// cheaper": a physical-page clip cuts off whatever falls past the page
// edge, which for a wrapped multi-line block is its LATER lines/words while
// its FIRST line/words can still render in full — so checking only "does
// the text appear at all" (or a HEAD substring) can pass even when the tail
// of the exact same block was silently dropped. contentSpecs.js's item
// generators already emit index-tagged, greppable short text for the atomic
// sidebar fields (e.g. "Certification 7", "Publication 3", "Referee 2" —
// matching the sprint's own examples) — tailSentinel() on a short string
// that has fewer words than the tail window is simply the whole string, so
// this subsumes the old "whole value" behaviour for those without a special
// case.
//
// Known, accepted residual gap (documented rather than silently present):
// tailSentinel() can only be as unique as the underlying CONTENT is — this
// file has no license to change contentSpecs.js/textPool.js's generated
// text. The 'overflowing' text-length bucket's bullet pool is smaller than
// its bullet count (3 canned sentences, up to 7 bullets per entry), so two
// DIFFERENT bullets in an 'overflowing' fixture can be byte-identical; if
// one is clipped and the other (identical) text survives elsewhere in the
// SAME document, checkCompleteness() cannot tell them apart (a false
// negative on that specific fixture/bucket only). Real CV prose (the
// shipped scaffold, and any real user's content) does not share this
// property — hand-written bullets are not drawn from a 3-sentence pool —
// so this gap does not weaken the check that actually matters in practice;
// it is called out here so nobody mistakes silence-on-'overflowing' for
// proof of correctness there specifically.
//
// Latin-only, by design: personal.name is deliberately never a checked
// sentinel (see NON_LATIN_NAME_CAVEAT below) — the non-Latin name fixture's
// glyphs are a KNOWN, DOCUMENTED gap (design doc G-a: Lato has no Sinhala/
// Tamil/Devanagari glyphs and no fallback font is registered), not
// something this oracle silently papers over. layoutRenderOracle.test.js
// asserts that absence explicitly, by name, rather than omitting the check.
// ─────────────────────────────────────────────────────────────────────────

/** How many trailing words make up a tail sentinel — see module docblock. */
const TAIL_WORDS = 6

/**
 * The trailing word-run of `text` — for a string with TAIL_WORDS words or
 * fewer (every atomic sidebar field in practice: "Certification 7",
 * "Award 3", a language name, ...) this is simply the whole string, so it
 * doubles as "the exact value" with no special-casing needed. `null`/empty
 * input yields `''` (callers skip pushing a sentinel for that).
 */
export function tailSentinel(text) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  return words.slice(-TAIL_WORDS).join(' ')
}

/**
 * Build the sentinel list for one fixture's content bag (contentSpecs.js's
 * buildContent() output). Each sentinel is `{ section, text }` — `text` is
 * asserted present verbatim (after whitespace normalization — see
 * checkCompleteness()) in the rendered PDF's extracted text.
 */
export function sentinelsFor(content) {
  const sentinels = []
  for (const e of content.experience ?? []) {
    // The entry heading — either the whole entry rendered somewhere or it
    // didn't; unrelated to bullet-level clipping, kept from round 1.
    sentinels.push({ section: 'experience', text: e.role })
    // Every bullet (round 2 fix): a bullet can be individually clipped at a
    // physical page edge while the entry's role/earlier bullets render
    // fine — see module docblock. bullets may be plain strings or the
    // object form with an inline hyperlink (schema: bulletItem) — mirrors
    // layout.js's own `typeof b === 'string' ? b : b.text` handling.
    for (const b of e.bullets ?? []) {
      const text = typeof b === 'string' ? b : b.text
      const tail = tailSentinel(text)
      if (tail) sentinels.push({ section: 'experience', text: tail })
    }
  }
  // Every item of every present section (round 2 fix: was lastOf() — only
  // the last item — which misses a silently-dropped MIDDLE item).
  const everyItemSentinel = (section, arr, pick) => {
    for (const item of arr ?? []) {
      const tail = tailSentinel(pick(item))
      if (tail) sentinels.push({ section, text: tail })
    }
  }
  everyItemSentinel('education', content.education, (x) => x.degree)
  everyItemSentinel('certifications', content.certifications, (x) => x.name)
  everyItemSentinel('publications', content.publications, (x) => x.title)
  everyItemSentinel('languages', content.languages, (x) => x.language)
  everyItemSentinel('referees', content.referees, (x) => x.name)
  everyItemSentinel('achievements', content.achievements, (x) => x.year)
  everyItemSentinel('competencies', content.competencies, (x) => x)
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
