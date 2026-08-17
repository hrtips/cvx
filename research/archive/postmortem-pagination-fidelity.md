> **SUPERSEDED (2026-08-14).** This document was folded into the single source
> of truth, [`ARCHITECTURE.md`](../../ARCHITECTURE.md), and is kept verbatim as
> a historical record. Where this file and ARCHITECTURE.md disagree,
> ARCHITECTURE.md wins — several decisions recorded here were later overturned
> (see its §7.2). Do not update this file.

# Post-mortem: the 2-page CV that came back as 3 — and the analysis that got it wrong first

*2026-08-14. A real user's CV (16-year HR career: four roles, one carrying a
4-step progression block), originally rendered by the predecessor tool as a
clean 2-page PDF in March 2026, was reconstructed from that PDF and rebuilt with
today's engine as the P1 dogfood gate. Result: 3 pages, page 1's main column
reported 59.5% full, `warnings: []`. The maintainer called it a product
regression and asked for a post-mortem and an architecture review. Everything
below was measured twice — once in the initial investigation, independently
re-derived by an external algorithm-design review, then verified a third time
line-by-line before this document was written. The first analysis was wrong in
its central claim; the corrections are part of the record.*

*Fix design: `design-layout-fidelity.md`. No personal content is reproduced
here beyond block heights.*

---

## 1. What is actually true

**T1 — This CV cannot be laid out in two pages by any algorithm.** Main-column
content is 1051.68pt in the current model (entries 203.83 + 358.45 + 265.65 +
122.50, plus 3 × 33.75 dividers) against a two-page capacity of 342.59 + 659.99
= 1002.58pt: **49.10pt short**. Exhaustive enumeration of every legal packing —
every boundary, every bullet-level split — finds no 2-page solution. Splitting
never helps here: a continuation repeats the role line, so head + tail exceeds
the unsplit entry by a constant **+26.50pt** at every cut point. Greedy
front-load is *optimal* on this document; there was nothing better for any
search, veto, or repair pass to find.

**T2 — The predecessor's 2-page PDF was not a better layout; it was an
overflowing page silently compressed.** In the original PDF, page 2's spacing is
byte-for-byte today's spacing (4.50pt bullet gaps, 14.50pt role→company steps),
while page 1's *inter-block* gaps are squeezed to 0.7–2.4pt with intra-paragraph
line steps identical at 13.50 — the signature of yoga flex-shrinking an
over-constrained fixed-height page. Two spacings in one document, from one run.
Today's template uses `minHeight` precisely to prevent that
(`TwoColumnTemplate.jsx:31`, with a comment citing the blank-sheet bug the fix
closed). **The engine change was a correctness fix. The old tool hid
infeasibility; the new one exposes it — and neither told the user.**

**T3 — The box model over-measures every entry.** Verified by controlled render
probes (role-top differencing) by two engineers with separate instruments:

| term | model | render | error |
|---|---|---|---|
| entry bottom margin | `m.entryMb * (15/11)` = 15pt (`layout.js:433`) | `marginBottom: 11` (`ExpItem.jsx:8`) | **+4.00/entry** |
| company/period row | `lh(9, 1.5)` = 13.5 | no `lineHeight` set → ~10.8 | **+2.70/entry** |
| location row | `lh(8, 1.5)` = 12 | no `lineHeight` → ~9.6 | **+2.40** |
| progression row | `progPy·2 + lh(8, 1.4)` = 14.2 | 12.6 | **+1.60/row**, linear |
| description | explicit lineHeight | exact | 0 |

Plain entry +6.70; located +9.10; four progression rows +13.10. This CV's total
phantom height: **33.20pt**. Corrected, the two-page deficit is **15.90pt** —
still infeasible, but within one bullet of feasible.

**T4 — The test suite cannot see T3.** `planLayout.test.js:25-39` documents the
first two terms and bounds the error at `MAIN_SLACK_PER_ENTRY_PT = 8`; located
and progression-bearing entries breach that bound, and `grep -rn progression
test/` returns nothing — no fixture in the corpus has a progression or a
location. 658 tests pass because the corpus cannot reach the error.

**T5 — Two spacing tokens are write-only.** `BulletList.jsx` hardcodes its gaps
(`gap={4.5}` from ExpItem, `gap={7.5}` from SummarySection) while
`entryH`/`summaryH` read `m.bulletGap`/`m.summaryBulletGap`. Editing the theme
tokens moves the packing model and zero rendered pixels.

**T6 — Page-1 `fill` is not comparable to any other page's.** It is measured
against the experience-only residual budget (342.59pt after the summary), not
the physical column. This page reported 0.595 while physically ~80% occupied.
Consequence, measured across eight plausible shortening edits: **six lowered
the reported fill** (0.595 → 0.522 → 0.497 → 0.441) before one large cut
crossed the cliff to 2 pages at 0.979. The signal anti-correlates with progress
until it flips — actively hostile to any assistant (or human) steering by it.

**T7 — The tool said nothing.** No stall/underfill condition exists in the
diagnostic vocabulary; `page1-no-experience` needs *zero* entries;
`emptyColumn` means "no packed blocks". The correct output for this content at
this length **is** 3 pages — the defect is that the response gave the user (and
the assistant driving) no way to learn that, or what would change it. The
missing sentence was one subtraction away: *"page 1 has 105.01pt free; the next
role's smallest legal piece needs 191.95pt; short by 86.94pt; the 287.4pt
summary is the only lever."*

**T8 — The config bypass misreports the sheet count.** Her original layout
reproduced via `page1ExperienceCount: 2, page1SplitBullets: 2` reports
`totalPages: 2` (with an `overflow` warning, `forcedByConfig: true`) and renders
**3 physical sheets**.

## 2. What the first analysis got wrong

Recorded because the errors are instructive, and because the review process —
maintainer-directed independent expert verification — is what caught them.

1. **"Inter-bullet spacing grew and triggered the regression" — refuted.**
   Today's spacing equals the original's own *page 2*. The claim came from
   comparing today's render against the original's *compressed page 1* and
   taking the compressed page as ground truth. The follow-up sweep that
   "tested" spacing measured a fiction anyway (T5: the tokens are write-only) —
   it moved the model, not the render, and the wrong conclusion was drawn from
   a real observation (restoring gaps didn't restore 2 pages).
2. **"Room on page 1 was 138.76pt" — wrong; 105.01pt.** `budget − used` forgets
   the 33.75pt divider that `packBlocks` also charges (`layout.js:655`).
3. **"Page 1 is 40% empty — the packer starved it" — wrong page-reading.** It
   is ~20% empty (T6). The starvation framing, and the red-team vectors built
   on it (a repair/veto pass, head-internal splits *as a fix for this CV*),
   aimed at a packing failure that does not exist: greedy is optimal here (T1).
4. **"The splitter's failure is the actual defect" — inverted.** The splitter
   correctly declined: no split produces a 2-page result (T1), and every split
   costs +26.50pt. The actual defects are fidelity (T3) and silence (T7).

Method note: every number in §1 was produced at least twice by different
instruments before being written down, after round one demonstrated exactly why
that discipline exists.

## 3. Why nothing caught any of it

- The invariants (never drop/clip/overflow, byte-reproducibility, sidebar
  0.01pt agreement) all held — they are orthogonal to fidelity of the *main*
  column model and to the usefulness of the diagnostics.
- The main-column model is bounded, not proven: the bound is 8pt/entry and the
  corpus cannot generate an entry that breaches it (T4).
- The baseline lock records whatever the current engine does; regenerating it
  converts a defect into the expected value unless the diff is interrogated.
- The dogfood gap: no real CV with a progression block had ever been rendered
  and *looked at* next to its predecessor. This one was, and the entire chain
  fell out of one afternoon.

## 4. Way forward

Designed comprehensively (maintainer's instruction: independent expert design,
document first, review, then implement — no shortcuts) in
**`design-layout-fidelity.md`**: box-model fidelity fixes with a main-column
render-diff harness at the sidebar's 0.01pt bar as the acceptance criterion,
token wiring, a stall diagnostic that names the missing sentence in T7,
comparable fill semantics, and the `totalPages`-vs-sheets contract fix. The
corrected `design-p3-surface.md` §3.1 blocks per-CV exposure of the write-only
tokens until the wiring lands.
