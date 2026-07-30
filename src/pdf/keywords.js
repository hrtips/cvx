// ── ATS & AI-parser keyword embedding ───────────────────────────────────────
// Builds the string written to the PDF's standard "Keywords" metadata field.
//
// Reality check: most mainstream ATS (Workday, Greenhouse, Lever, Taleo…) rank
// on text extracted from the CV *body*, and support for the PDF Keywords/XMP
// metadata field is inconsistent. Treat this as a best-effort supplement to a
// well-structured, keyword-rich body — not a substitute for it, and not a
// reliable ranking lever on its own.
//
// It is, however, legitimate: keywords live in document metadata, not as hidden
// white-on-white body text (a deceptive trick parsers detect and penalise).
// Keep every keyword TRUTHFUL — stuffing false or irrelevant terms risks the
// metadata/body mismatch that gets a CV auto-rejected, not ranked higher.
// ────────────────────────────────────────────────────────────────────────────

const clean = (/** @type {unknown} */ s) => String(s ?? '').trim()

// Keywords go into a comma-joined field, so a keyword must not itself contain a
// comma — otherwise a parser splitting on "," sees spurious fragments. Collapse
// internal commas (and runs of whitespace) into single spaces.
const sanitizeKeyword = (/** @type {string} */ s) => clean(s).replace(/,/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Flatten a keyword source into a clean string array. Accepts:
 *   - ["a", "b"]                    (flat list)
 *   - { Skills: ["a"], Tools: ["b"] } (grouped map)
 *   - [{ Skills: ["a"] }]           (list of grouped maps)
 *   - "a"                           (single string)
 */
function toList(/** @type {import('./types.js').Keywords | undefined} */ value) {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === 'string') return [item]
        if (item && typeof item === 'object') return Object.values(item).flat()
        return []
      })
      .map(clean)
      .filter(Boolean)
  }
  if (typeof value === 'object') {
    return Object.values(value).flat().map(clean).filter(Boolean)
  }
  return clean(value) ? [clean(value)] : []
}

/**
 * Pull high-signal keywords already present in the visible CV content:
 * competencies (skills) and job titles — the terms ATS actually match on.
 * Company names are deliberately NOT derived: they are low-signal as keywords
 * and mostly add noise.
 */
function deriveFromContent(/** @type {{ competencies?: string[], experience?: import('./types.js').ExperienceEntry[], personal?: Partial<import('./types.js').Personal> }} */ { competencies, experience, personal }) {
  const out = [...toList(competencies)]

  if (personal?.title) out.push(clean(personal.title))

  const jobs = Array.isArray(experience) ? experience : []
  for (const job of jobs) {
    if (job?.role) out.push(clean(job.role))
    for (const step of job?.progression ?? []) {
      if (step?.title) out.push(clean(step.title))
    }
  }
  return out.filter(Boolean)
}

/** Case-insensitive dedupe that preserves first-seen order and casing. */
function dedupe(/** @type {string[]} */ list) {
  const seen = new Set()
  const result = []
  for (const item of list) {
    const key = item.toLowerCase()
    if (item && !seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

/**
 * Build the comma-separated keyword string for the PDF's Keywords metadata.
 *
 * @param {{ keywords?: import('./types.js').Keywords, competencies?: string[], experience?: import('./types.js').ExperienceEntry[], personal?: Partial<import('./types.js').Personal> }} [data]    { keywords, competencies, experience, personal }
 * @param {import('./types.js').CVConfig} [config]  parsed config.yaml (reads config.atsKeywords)
 * @returns {string}       deduped, comma-joined keywords ("" when disabled/empty)
 */
export function buildKeywords(data = {}, config = {}) {
  const opts = /** @type {import('./types.js').AtsKeywords} */ ((config && config.atsKeywords) || {})
  if (opts.enabled === false) return ''

  const manual = toList(data.keywords)
  const derived = opts.autoDerive === false ? [] : deriveFromContent(data)

  // Body-derived terms first: under a `max` cap, the keywords retained are the
  // ones that actually appear on the page (competencies + titles), avoiding the
  // metadata/body mismatch that curated-but-unverified terms could introduce.
  const merged = dedupe([...derived, ...manual].map(sanitizeKeyword).filter(Boolean))
  const max = Number.isInteger(opts.max) && /** @type {number} */ (opts.max) > 0 ? opts.max : merged.length
  return merged.slice(0, max).join(', ')
}
