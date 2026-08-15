// I1 — the envelope-level half of INV-4 (plan–physical equality).
//
// WHY IT IS NOT IN layoutDiagnostics.js: that module is a PURE FUNCTION OF THE
// PLAN — pinned by its own docblock, by layoutDiagnostics.test.js, and
// load-bearing for the content-injection defence (a diagnostic that reads
// anything but the plan is a diagnostic an attacker can reach through content).
// The sheet count is a fact about produced BYTES, so it cannot enter there
// without breaking that contract. It attaches where the buffer exists instead:
// the build envelope (`cvx build --json`, MCP `build_pdf`).
//
// THE CONSEQUENCE, WHICH MUST BE DOCUMENTED WHEREVER THE TOOLS ARE DESCRIBED:
// `plan_layout` performs no render, so it can NEVER carry this code. A clean
// dry run does not clear this defect class; only a build can.

import { countPdfPages } from './physicalPages.js'

/**
 * Compare the sheets the renderer produced against the pages the plan
 * numbered, and return the defect warning when they disagree.
 *
 * Silent by design in two cases: when the counter cannot establish the count
 * (`null` — see physicalPages.js's null rule; no claim is better than a
 * guessed defect), and when physical ≤ planned. Physical BELOW planned is
 * structurally impossible — every planned page is an explicit `<Page>` element
 * and react-pdf cannot merge two of them — so it is asserted in the harness
 * rather than reported here as a second, unreachable message.
 *
 * @param {Buffer | Uint8Array} buffer the rendered PDF
 * @param {{ totalPages: number }} plan the plan that produced it
 * @returns {import('./types.js').LayoutDiagnosticWarning[]} zero or one warning
 */
export function physicalPageWarnings(buffer, plan) {
  const physical = countPdfPages(buffer)
  const planned = plan?.totalPages ?? null
  if (physical === null || planned === null) return []
  if (physical <= planned) return []
  const extra = physical - planned
  return [
    {
      code: /** @type {const} */ ('physical-pages-exceed-plan'),
      kind: /** @type {const} */ ('defect'),
      planned,
      physical,
      // R-F: name the condition and its price; the edit advice lives in the
      // skill. What this DOES say is where the surplus comes from, because
      // "the PDF has more sheets than the plan" is not actionable without it:
      // content the planner did not measure reached the page, and react-pdf
      // flowed it onto sheets the page numbering never counted.
      message:
        `The rendered PDF has ${physical} sheets; the plan numbered ${planned}. ` +
        `${extra} sheet${extra === 1 ? '' : 's'} carry content the plan did not count, ` +
        `so ${extra === 1 ? 'it is' : 'they are'} unnumbered by the page badges.`
    }
  ]
}
