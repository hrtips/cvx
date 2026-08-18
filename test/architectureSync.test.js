// Tripwire: ARCHITECTURE.md's backlog cannot claim a defect is open after the
// fix has shipped.
//
// Why this exists (RV5, 2026-08-18). `docsSync.test.js` binds the PRODUCT
// surfaces — README, ai-guide, SKILL.md, llms.txt, the MCP tool descriptions —
// and reads none of ARCHITECTURE.md, CHANGELOG.md or SPRINT.md. So the one
// document that calls itself "the single source of truth", and that §6.1 gate 1
// makes the pre-flight read, was the one document nothing checked. It drifted:
// §7.4 carried D1-D6 under the heading "Still open, unscheduled" for two
// releases after all six shipped in 1.8.0, each with a `LANDED`-less header and
// a matching fix comment sitting in the source the whole time.
//
// The rule, refined once while being written (which is itself the finding):
// **every backlog label the code mentions must be declared in ARCHITECTURE.md,
// and its entry must state a STATUS.**
//
// The first cut demanded `LANDED`, on the theory that a `// D5:` comment means
// the fix is in the tree. That is too strong — it went red the moment code
// referenced an item that was scheduled rather than done, and a comment can
// cite a label for context without claiming to have closed it. The invariant
// D1-D6 actually broke was subtler: their entries said *nothing* about status
// while sitting under a heading that said "Still open". Silence is the bug.
//
// So a declaration must carry one of LANDED / SCHEDULED / PARKED / NOT DOING.
// Which one is a judgement this test cannot make; that the author made one, it
// can. It also catches an orphan — a label the code cites that the document
// never declares (which is how RV13 was caught here, unrecorded).

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const architecture = readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8')
const archLines = architecture.split('\n')

/** An entry must commit to one of these. Which one is the author's call; that there IS one is this test's. */
const STATUSES = ['LANDED', 'SCHEDULED', 'PARKED', 'NOT DOING']

/** Every `.js`/`.jsx` under the roots that carry fix comments. */
function sourceFiles() {
  /** @type {string[]} */
  const out = []
  const walk = (/** @type {string} */ dir) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      // This file's own docblock cites D1/D5/RV3/RV13 as worked examples of the
      // drift it exists to catch. Scanning itself would report the tripwire as
      // the thing that fixed them.
      else if (/\.(js|jsx)$/.test(entry) && full !== fileURLToPath(import.meta.url)) out.push(full)
    }
  }
  for (const d of ['src', 'bin', 'scripts', 'test']) walk(path.join(ROOT, d))
  return out
}

/**
 * Backlog labels the CODE claims are fixed: `D5`/`RV3` appearing in a comment.
 * Scanning comments only (not strings) keeps a CV containing the text "D5" out
 * of the result set, and keeps this from firing on unrelated identifiers.
 */
function labelsReferencedInCode() {
  /** @type {Map<string, string[]>} */
  const found = new Map()
  for (const file of sourceFiles()) {
    const text = readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const comment = /(?:\/\/|\/\*|^\s*\*)(.*)$/.exec(line)
      if (!comment) continue
      // `D<n>` and `RV<n>` only. Bare `R<n>` is deliberately NOT scanned: it
      // already means something else in this tree (`keywords.test.js` cites an
      // older review's R6), so claiming that namespace would make this guard
      // assert against the wrong document.
      for (const m of comment[1].matchAll(/\b(D|RV)(\d+)\b/g)) {
        const label = `${m[1]}${m[2]}`
        if (!found.has(label)) found.set(label, [])
        const where = path.relative(ROOT, file)
        if (!found.get(label)?.includes(where)) found.get(label)?.push(where)
      }
    }
  }
  return found
}

/**
 * The bolded ARCHITECTURE.md entries that DECLARE a label — `**D5 (P2) — …**`
 * or `**… (D11).**`. Prose mentions elsewhere are not declarations, so a label
 * discussed in passing does not satisfy the rule.
 *
 * Returns the declaring lines plus the two that follow, because a header can
 * wrap and `LANDED` may sit just past the line break.
 */
function declarationsOf(/** @type {string} */ label) {
  const re = new RegExp(`\\*\\*[^*]*\\b${label}\\b`)
  return archLines
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => re.test(line))
    .map(({ i }) => archLines.slice(i, i + 3).join(' '))
}

describe('ARCHITECTURE.md backlog vs the code that fixed it', () => {
  const referenced = labelsReferencedInCode()

  it('finds backlog labels in the source at all (non-vacuous)', () => {
    // If this suite ever silently stops finding labels — a comment-style change,
    // a moved directory — every assertion below becomes trivially true. Pin it.
    expect(
      referenced.size,
      'no D<n>/R<n> labels found in any source comment — the scan is broken, not the code'
    ).toBeGreaterThanOrEqual(5)
  })

  it('every backlog item the code cites is declared, with a status', () => {
    /** @type {string[]} */
    const problems = []
    for (const [label, files] of [...referenced].sort()) {
      const decls = declarationsOf(label)
      if (decls.length === 0) {
        problems.push(
          `${label}: referenced by a fix comment in ${files.join(', ')} but ARCHITECTURE.md declares no such item`
        )
        continue
      }
      if (!decls.some((d) => STATUSES.some((st) => d.includes(st)))) {
        problems.push(
          `${label}: cited in ${files.join(', ')} but its ARCHITECTURE.md entry states no status — ` +
            `mark it ${STATUSES.join(' / ')}, or delete it per SPRINT.md's "shipping deletes". ` +
            `An entry that is silent about status is how D1-D6 read as open work for two releases ` +
            `after they shipped.`
        )
      }
    }
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([])
  })
})
