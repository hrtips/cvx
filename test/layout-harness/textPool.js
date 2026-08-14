// ── Deterministic filler text ───────────────────────────────────────────────
// No RNG anywhere in the harness (the sprint's byte-reproducibility gate
// applies to fixtures too — see research/archive/layout-packing-design.md §0 G-b).
// Every "random-looking" choice below is an index into a fixed pool, so the
// same spec always yields byte-identical YAML.
// ─────────────────────────────────────────────────────────────────────────

// One hand-written sentence per length bucket, cycled deterministically by
// index rather than drawn at random. Lengths (chars) are approximate but
// intentionally span: short ≈ 40, typical ≈ 150, long ≈ 260, overflowing ≈ 420.
const SENTENCES = {
  short: [
    'Led a team of five engineers.',
    'Shipped the v2 API on schedule.',
    'Cut deployment time in half.',
    'Owned the on-call rotation.',
    'Mentored two junior hires.',
    'Closed the quarter under budget.'
  ],
  typical: [
    'Established and scaled a citywide security operation from a solo initiative to a franchised network, extending coverage across multiple districts and international cities.',
    'Recruited, trained, and led a high-performing field team, owning end-to-end mentorship, succession planning, and day-to-day operational readiness across every shift.',
    'Reduced incident response time by an estimated 40% through data-driven monitoring, root-cause investigation, and a disciplined on-call rotation across three time zones.',
    'Directed strategic partnerships with external agencies, coordinating intelligence-sharing and joint operations while keeping every stakeholder aligned on outcomes.',
    'Maintained 24/7 operational availability under a strict quality mandate, balancing decisive action with a rigorous, auditable ethical framework at every step.'
  ],
  long: [
    'Directed strategic partnerships with the regional regulator, coordinating intelligence-sharing and joint operations with senior counterparts while managing a portfolio of cross-agency initiatives spanning modernization, accreditation, and outreach.',
    'Championed a multi-year platform migration that touched every downstream team, from data engineering to customer support, and required renegotiating a dozen long-standing internal service contracts along the way.',
    'Built and scaled a globally distributed on-call program from a single time zone to round-the-clock coverage, cutting mean time to resolution while keeping the roster sustainable for the humans running it.',
    'Co-authored the incident-response playbook now used by every downstream team, standardising severity definitions, escalation paths, and postmortem templates across a dozen previously inconsistent local practices.'
  ],
  overflowing: [
    'Directed strategic partnerships with the Gotham City Police Department, coordinating intelligence-sharing and joint operations with Commissioner James Gordon while managing a portfolio of cross-agency initiatives spanning surveillance modernization, forensic lab accreditation, and community outreach programs that reduced repeat-offender recidivism across every precinct in the city over a sustained multi-year engagement.',
    'Ran a global, always-on incident-response function spanning five regions and eleven time zones, personally rewriting the escalation matrix, retraining every on-call engineer, renegotiating vendor SLAs that had gone stale for years, and presenting the resulting reliability numbers to the board on a quarterly cadence that never once slipped.',
    'Led the multi-year replatforming of the core billing system end to end — requirements, vendor selection, phased migration, and the eventual deprecation of the legacy stack — while keeping the old and new systems reconciled to the cent throughout, across every currency and every regional tax jurisdiction the company operated in.'
  ]
}

/**
 * `n` deterministic sentences at the requested length bucket, for `label`
 * (kept distinct across call sites — summary vs description vs bullets — by
 * offsetting the starting index so two different sections of the same
 * fixture don't emit literally identical lines).
 */
export function sentencesFor(lengthBucket, label, n) {
  const pool = SENTENCES[lengthBucket] ?? SENTENCES.typical
  const offset = [...label].reduce((a, c) => a + c.codePointAt(0), 0)
  return Array.from({ length: n }, (_, i) => pool[(offset + i) % pool.length])
}

export function bulletsFor(lengthBucket, label, n) {
  return sentencesFor(lengthBucket, label, n)
}

// A single, very long unbroken token (no spaces) — stresses greedy word-wrap
// at a long-token boundary (§2 of the design doc; also used by the "label-
// less long URL link" named edge case).
export const LONG_URL =
  'https://example.com/a/very/long/path/segment/that/does/not/want/to/wrap/nicely/because/it/has/no/internal/spaces/at/all'

// Non-Latin names for the fallback-font risk (design doc G-a). Real, short,
// human names — not random codepoints — so a render failure is clearly
// visible as "the name is missing/garbled", not "gibberish input". Used by
// the personal.name edge-case fixture (layoutRenderOracle.test.js).
export const NON_LATIN_NAMES = {
  sinhala: 'බ්‍රූස් වේන්',
  tamil: 'புரூஸ் வேயின்',
  devanagari: 'ब्रूस वेन'
}

// Slightly longer non-Latin phrases (name + a short title) for the measure
// diff corpus (measureDiff.js) — long enough that the char-width estimator
// predicts more than one line, so a rendered/estimated mismatch is visible
// at all (a bare two-word name is short enough that both sides agree on
// "1 line" even when the render is otherwise badly wrong — see
// research/archive/c0-baseline.md).
export const NON_LATIN_PHRASES = {
  sinhala: 'බ්‍රූස් වේන් - ගොතම් නගරයේ ආරක්ෂක විශේෂඥයා',
  tamil: 'புரூஸ் வேயின் - காதம் நகர பாதுகாப்பு நிபுணர்',
  devanagari: 'ब्रूस वेन - गॉथम शहर सुरक्षा विशेषज्ञ'
}
