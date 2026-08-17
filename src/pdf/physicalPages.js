// I1 — how many sheets of paper the renderer actually produced.
//
// WHY THIS EXISTS (ARCHITECTURE.md §5 INV-4): the plan counts the pages it
// numbered; react-pdf's default `wrap: true` FLOWS anything that does not fit
// onto extra physical sheets the plan never counted (it does not clip — that
// misdiagnosis is dead, see §7.2). Everywhere the plan is complete those two
// numbers agree. Where the planner is blind — today, any section a layout puts
// in a `main` slot other than summary/experience (§8 I4/I6 close that) — a CV
// can ship with a blank or half-blank extra sheet and a clean report. This
// module is the independent ruler that makes that impossible to miss.
//
// NOT A RE-MEASURE, NOT A RE-RENDER: it reads the bytes the renderer already
// produced. It therefore cannot perturb the build (INV-11 byte-repro is safe:
// nothing here runs before or during rendering) and costs one linear scan.
//
// ── THE RULE THIS MODULE LEARNED THE HARD WAY (gate-7 review of I1) ──────────
// CONTENT IS NOT STRUCTURE. The first cut scanned the whole file for `/Count`
// and `/Type /Page`. Both tokens can also appear inside PDF *string objects* —
// and `keywords.yaml` reaches one: pdfkit writes an all-ASCII Info value as a
// plain literal `(…)`, so a CV containing the literal text "/Type /Page" and
// "/Count 3" made a genuinely 2-page PDF report 3 sheets, and `cvx build
// --strict` exited non-zero on a correct CV. The cross-check did not save it,
// because one injection moves BOTH readings together.
//
// That is content steering a diagnostic — the shape INV-12 exists to forbid,
// and worse than the silence I1 was fixing, because it manufactures a defect
// nobody can act on. So the scan is now anchored to the file's OBJECT
// STRUCTURE: string literals are removed first, then the page tree is resolved
// through the trailer (`/Root` → `/Pages` → that object's `/Count`), and only
// object dictionaries are counted. Two readings still have to agree.
//
// THE NULL RULE: `null` means "unknown", and 0 is never returned. If the two
// independent readings disagree, or either is missing, this refuses to answer.
// Callers must treat null as "no claim" and stay silent rather than warn. The
// harness pins the counter against poppler on every fixture it builds, so if a
// dependency bump ever switches to compressed object streams, that pin goes
// red (loud) instead of this quietly returning null forever (silent).

/**
 * Blank out every `stream … endstream` body.
 *
 * These are Flate-compressed BINARY. Two consequences, both learned by
 * measurement: they can contain any byte, so an unbalanced `(` inside one
 * would make the literal-stripper below swallow the rest of the file
 * (including the trailer — the first version of this module did exactly that
 * and reported `null` for every real PDF); and they are also where page text
 * lives, so blanking them is what makes body text structurally unable to
 * reach this scan at all. Object dictionaries always precede `stream`, so
 * nothing this counter needs is lost.
 *
 * @param {string} text
 * @returns {string}
 */
function stripStreams(text) {
  // Anchored on the PDF TOKEN, not the substring. At this point user text is
  // still present (literals are stripped after this, and must be — see the
  // ordering note in countPdfPages), so a bare indexOf('stream') also fires on
  // ordinary words: a link to `example.com/stream/processing`, or the keyword
  // "real-time stream processing", started a bogus skip that ate the closing
  // `)`, unbalanced the literal stripper, and swallowed the trailer. The
  // counter then returned null — silently switching the whole check off for
  // that CV, which is the clean-report-on-a-defective-PDF silence I1 exists to
  // remove. A real stream keyword follows the dictionary's `>>` and is
  // terminated by a newline; a URL or a keyword never is.
  const OPEN = /(^|[^\w])stream\r?\n/g
  let out = ''
  let i = 0
  OPEN.lastIndex = 0
  for (let m = OPEN.exec(text); m !== null; m = OPEN.exec(text)) {
    const start = m.index + m[1].length
    const end = text.indexOf('endstream', start)
    if (end === -1) return out + text.slice(i, start)
    out += text.slice(i, start)
    i = end + 'endstream'.length
    OPEN.lastIndex = i
  }
  return out + text.slice(i)
}

/**
 * Remove PDF literal strings — `(…)` — from a scan buffer, so text a user
 * wrote can never be read as file structure.
 *
 * Safe by construction against a payload trying to escape its own string:
 * pdfkit escapes `(`, `)` and `\` on the way in (its `escapableRe`), so the
 * parenthesis nesting seen here is exactly the nesting the writer intended.
 * Hex strings (`<FEFF…>`, used for any non-ASCII value) are left alone: they
 * cannot contain literal `/Type /Page` ASCII in the first place.
 *
 * @param {string} text
 * @returns {string} the same text with every literal string blanked out
 */
function stripLiterals(text) {
  let out = ''
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (depth > 0 && ch === '\\') {
      i++ // skip the escaped byte, whatever it is
      continue
    }
    if (ch === '(') {
      depth++
      if (depth === 1) out += ' ' // keep offsets from fusing tokens together
      continue
    }
    if (ch === ')' && depth > 0) {
      depth--
      continue
    }
    if (depth === 0) out += ch
  }
  return out
}

/**
 * The page count the document's own page tree declares, resolved through the
 * trailer rather than guessed: `trailer /Root` → the catalog's `/Pages` → that
 * object's `/Count`. Returns null when any link in the chain is missing, which
 * is the honest answer for a PDF this module does not understand.
 *
 * @param {string} pdf structure-only text (literals already stripped)
 * @returns {number | null}
 */
function declaredPageCount(pdf) {
  const objectBody = (/** @type {string} */ ref) => {
    const m = new RegExp(`(?:^|[^0-9])${ref}\\s+obj\\b`).exec(pdf)
    if (!m) return null
    const start = m.index + m[0].length
    const end = pdf.indexOf('endobj', start)
    return pdf.slice(start, end === -1 ? undefined : end)
  }

  // Any trailer will do: an incremental update repeats /Root, and every copy
  // points at a catalog whose /Pages carries the whole-document count.
  const rootRefs = [...pdf.matchAll(/\/Root\s+(\d+\s+\d+)\s*R/g)].map((m) => m[1])
  for (const rootRef of rootRefs) {
    const catalog = objectBody(rootRef)
    if (!catalog) continue
    const pagesRef = /\/Pages\s+(\d+\s+\d+)\s*R/.exec(catalog)?.[1]
    if (!pagesRef) continue
    const pagesObj = objectBody(pagesRef)
    if (!pagesObj) continue
    const count = /\/Count\s+(\d+)/.exec(pagesObj)?.[1]
    if (count === undefined) continue
    const n = Number(count)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

/**
 * How many page objects the file actually contains — counted only inside
 * `N G obj … endobj` bodies, never in free-floating bytes.
 *
 * `/Type /Page` must not match `/Type /Pages`; `#`-escaped name characters are
 * excluded too, since `/Page#73` *is* `/Pages` spelled differently.
 *
 * @param {string} pdf structure-only text (literals already stripped)
 * @returns {number}
 */
function countPageObjects(pdf) {
  let pages = 0
  for (const m of pdf.matchAll(/\d+\s+\d+\s+obj\b/g)) {
    const start = m.index + m[0].length
    const end = pdf.indexOf('endobj', start)
    const body = pdf.slice(start, end === -1 ? undefined : end)
    if (/\/Type\s*\/Page(?![s\w#])/.test(body)) pages++
  }
  return pages
}

/**
 * Count the physical sheets in a rendered PDF.
 *
 * @param {Buffer | Uint8Array} buffer the bytes `renderCV` produced
 * @returns {number | null} the sheet count, or `null` when it cannot be
 *   established with two agreeing readings (never 0, never a guess)
 */
export function countPdfPages(buffer) {
  if (!buffer || buffer.length === 0) return null
  // latin1 keeps every byte a single code unit, so offsets and binary streams
  // cannot corrupt the scan the way utf8 replacement characters would.
  // Order matters: streams first (binary, may hold unbalanced parens), then
  // literals (user text). Reversing the two re-creates the swallow-the-file bug.
  const pdf = stripLiterals(stripStreams(Buffer.from(buffer).toString('latin1')))

  const declared = declaredPageCount(pdf)
  const counted = countPageObjects(pdf)

  if (declared === null || counted === 0) return null
  if (declared !== counted) return null
  return counted
}
