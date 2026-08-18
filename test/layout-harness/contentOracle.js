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
// to the bug class this sprint set out to catch — a bullet the packer PLACES
// (invariant0/placedExactlyOnce hold on the logical plan) that never reaches
// the reader (packExperiences() budgets against an ESTIMATE, and the
// config-driven forced-split branch has no budget check at all — see
// layout.js). sentinelsFor() checked only each experience entry's ROLE (a
// short heading that either renders or the whole entry is missing) and only
// the LAST item of each sidebar section — a bullet (main column) or a middle
// item (sidebar) could be silently dropped and every previous check would
// stay green.
//
// ⚠ CORRECTION (2026-07-28, restated 2026-08-01): the motivating example
// this comment used to give — "the shipped scaffold's tuned config.yaml
// CLIPS the second bullet of 'Chairman & Chief Executive Officer'" — was a
// MISDIAGNOSIS that propagated through three agents before a direct render
// settled it. There is no clip. Nothing in src/pdf ever sets `wrap={false}`,
// so react-pdf's default `wrap: true` FLOWS overflow onto extra physical
// pages instead of dropping it. Re-verified 2026-08-01: a config forced
// ~541pt over page-1 budget renders 3 pages with all 20 bullets present in
// the extracted text and no overprinting. The real defect is the
// wasted/near-blank page (c0-baseline.md bug (b)) — a layout bug, not a
// content-loss bug — which is what C3 fixes.
//
// This oracle is therefore DEFENCE IN DEPTH, not a live-bug detector: it
// reports 0 violations across all 58 checks today, and its job is to stay at
// 0 while C3 rewrites the packer. Keep it; do not read its existence as
// evidence that content is being lost.
//
// NOTE for anyone re-running this by hand: extract with plain `pdftotext`,
// NOT `pdftotext -layout`. Layout mode interleaves the sidebar column into
// the main column's wrapped lines, which splits bullet text mid-phrase and
// manufactures false "missing content" hits (observed 2026-08-01: 4 bogus
// misses under -layout, 0 under raw extraction on the same PDF).
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
  const words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words.slice(-TAIL_WORDS).join(' ')
}

/**
 * Build the sentinel list for one fixture's content bag (contentSpecs.js's
 * buildContent() output). Each sentinel is `{ section, text }` — `text` is
 * asserted present verbatim (after whitespace normalization — see
 * checkCompleteness()) in the rendered PDF's extracted text.
 */
/**
 * Fields deliberately NOT walked, each for a stated reason. This list is the
 * whole judgement in RV2 — everything else the content bag holds is asserted
 * present in the render.
 *
 * Keyed by the JSON-Pointer-ish path segment, matched on the LAST segment so
 * `experience/0/link/href` and `summary/3/link/href` are both covered.
 */
const NOT_A_SENTINEL = new Set([
  // The one documented carve-out, predating RV2: a non-Latin name renders as
  // tofu by design (INV-14 warns rather than substitutes), so asserting it
  // present would make `edge-non-latin-name` fail for doing the right thing.
  // `layoutRenderOracle.test.js` asserts this absence by name.
  //
  // SECTION-QUALIFIED, and that is not pedantry: keyed on the bare word `name`
  // this silently also excluded `certifications[].name` and `referees[].name`,
  // so widening the walk would have LOST two checks while appearing to add
  // dozens. Caught by the existing count assertion, which is what it is for.
  'personal.name',
  // A URL is not drawn as text; ContactSection renders `label || href`, and a
  // long href is the token pdftotext is least reliable about.
  'personal.href',
  'personal.phoneHref',
  'personal.linkedinHref',
  'personal.facebookHref',
  'experience.href',
  'summary.href'
])

/**
 * Values too short or too repeated to be a sentinel. `containsAsWhole` enforces
 * word boundaries, but it cannot make a NON-UNIQUE value diagnostic: every
 * entry in the corpus shares `period: "2020 – 2024"`, and `proficiency:
 * "Native"` repeats across languages, so finding one proves nothing about the
 * other. A sentinel that cannot fail is worse than no sentinel — it inflates
 * the count while asserting nothing.
 */
const MIN_SENTINEL_WORDS = 2

/**
 * Build the sentinel list for one fixture's content bag (contentSpecs.js's
 * buildContent() output). Each sentinel is `{ section, text }` — `text` is
 * asserted present verbatim (after whitespace normalization — see
 * checkCompleteness()) in the rendered PDF's extracted text.
 *
 * RV2: this walks EVERY string leaf, minus `NOT_A_SENTINEL`. It used to
 * enumerate a hand-written field list — role, bullets, degree, name, title,
 * language, name, year, competency — about eight of the roughly thirty fields
 * the renderer draws. Everything else had no render-level content check at
 * all: the whole summary, every `personal.*` field, company, period, location,
 * description, progression, institution, issuer, venue, proficiency, and
 * achievement text.
 *
 * Measured cost of that gap: seeding `e.company?.toUpperCase()` into
 * ATSDocument.jsx — a case-transform INV-0 names explicitly — left the FULL
 * suite at 857/857 green while the shipped PDF printed "WAYNE ENTERPRISES".
 * Dropping `experience.period` likewise left the render oracle, the harness
 * invariants, the sidebar measure-diff and the physical-page check all green.
 * INV-0 says "every character of C reaches the PDF text layer"; the instrument
 * enforced it for a minority of C.
 *
 * The ATS variant is the worst case and the reason this matters most: it has
 * no height instrument at all (there is no measure-diff for single column), so
 * these sentinels are its ONLY content check.
 */
export function sentinelsFor(content) {
  const sentinels = []

  const walk = (value, section, key) => {
    if (value == null) return
    if (typeof value === 'string') {
      if (key && NOT_A_SENTINEL.has(`${section}.${key}`)) return
      const tail = tailSentinel(value)
      // Keep single-word tails only when the whole value is that word — an
      // atomic field like a competency or a language name is a legitimate
      // sentinel; a one-word TAIL of a longer sentence is not distinctive.
      const words = tail.split(/\s+/).filter(Boolean).length
      if (!tail) return
      if (words < MIN_SENTINEL_WORDS && tail !== String(value).trim()) return
      sentinels.push({ section, text: tail })
      return
    }
    if (Array.isArray(value)) {
      for (const v of value) walk(v, section, key)
      return
    }
    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, section, k)
    }
  }

  for (const [section, value] of Object.entries(content ?? {})) {
    // `config` is not drawn, and `keywords` is metadata that is never printed
    // on the page (keywords.yaml's own header says so) — asserting either
    // present would assert a falsehood.
    if (section === 'config' || section === 'keywords' || section === 'profilePhoto') continue
    walk(value, section, null)
  }
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
  const missing = sentinels.filter((s) => !containsAsWhole(normalized, s.text))
  return { ok: missing.length === 0, missing }
}

/**
 * Substring match with word boundaries at BOTH ends, so a sentinel cannot be
 * satisfied by a longer sibling.
 *
 * Review found the plain `includes()` this replaces masked exactly the drop it
 * exists to catch: the fixtures generate "Certification 1" ... "Certification
 * 19", so a dropped "Certification 1" was reported present because
 * "Certification 19" rendered. Any generated corpus with index-suffixed labels
 * has this shape, which is most of the sidebar sentinels.
 *
 * Boundaries are checked by hand rather than with `\b`: sentinel text is
 * arbitrary content (it can start or end with punctuation, e.g. the achievement
 * bodies' leading em dash, or a bullet tail ending in "."), for which `\b`
 * asserts the opposite of what is wanted. "Adjacent character is not a word
 * character" is the property that actually matters.
 */
function containsAsWhole(/** @type {string} */ haystack, /** @type {string} */ needle) {
  if (!needle) return true
  const isWordChar = (/** @type {string | undefined} */ c) => c !== undefined && /[\w]/.test(c)
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return false
    const before = haystack[at - 1]
    const after = haystack[at + needle.length]
    // Only enforce a boundary on an end that is itself a word character —
    // "— Example Body 0" must still match when preceded by a space, and a
    // sentinel ending in "." needs no boundary after it.
    const startOk = !isWordChar(needle[0]) || !isWordChar(before)
    const endOk = !isWordChar(needle[needle.length - 1]) || !isWordChar(after)
    if (startOk && endOk) return true
    from = at + 1
  }
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
