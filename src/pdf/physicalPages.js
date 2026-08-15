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
// WHY A PARSER AND NOT A DEPENDENCY: pdfkit (through @react-pdf) writes page
// dictionaries and the page-tree root in plaintext today, so both facts are a
// regex away; pulling in a PDF parsing library to count pages would cost more
// than the feature. That is a bet on an implementation detail of a pinned
// dependency, so it is written to FAIL LOUD rather than guess — see below.
//
// THE NULL RULE: `null` means "unknown", and 0 is never returned. If the two
// independent readings (the page tree's own `/Count`, and the number of page
// dictionaries) disagree, or either is missing, this refuses to answer.
// Callers must treat null as "no claim" and stay silent rather than warn — a
// counter that guessed would eventually manufacture a defect warning on a
// correct PDF, which is worse than the silence I1 is fixing. The harness pins
// the counter against poppler on every fixture it builds, so if a dependency
// bump ever switches to compressed object streams, that pin goes red (loud)
// instead of this quietly returning null forever (silent).

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
  const text = Buffer.from(buffer).toString('latin1')

  // Reading 1: the page-tree root's own count. `/Type /Pages` may appear on
  // either side of `/Count`, and intermediate nodes carry `/Count` too, so
  // take the LARGEST — the root's count is the total, interior nodes hold
  // subtree sizes.
  let declared = null
  for (const m of text.matchAll(/\/Count\s+(\d+)/g)) {
    const n = Number(m[1])
    if (Number.isFinite(n) && (declared === null || n > declared)) declared = n
  }

  // Reading 2: count the page dictionaries themselves. `/Type /Page` must not
  // match `/Type /Pages` — the negative lookahead is what separates a leaf
  // from the tree node above it.
  const counted = (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length

  if (declared === null || counted === 0) return null
  if (declared !== counted) return null
  return counted
}
