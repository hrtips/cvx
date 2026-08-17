# Dogfood report — converting a third-party CV with 1.8.0

**Date:** 2026-08-17 · **CVX:** 1.8.0 (released, via `npx`) · **Route:** coding agent + `skills/cvx/SKILL.md` · **Platform:** macOS (zsh)

A real conversion run: a 3-page HR professional's CV (PDF, South Asian market)
into `cv-content/`, with the author's constraint **"don't change the text."**
Delivered both variants, 3 designed sheets / 2 ATS sheets, validation clean.

This is what the run exposed. Findings are ordered by severity, and every one
was reproduced directly — the two bugs in §1 and §2 have probe transcripts
behind them, not inference.

---

## 1. DEFECT — a populated section with no layout slot is dropped silently

**This is the headline finding.** It breaks the product's central promise.

`referees.yaml` containing a real, named referee renders in the ATS PDF and
**vanishes from the designed PDF**, with nothing reported anywhere:

```
validate --strict --json  →  ok: true, errors: [], warnings: []
build --all --json        →  designed: warnings: [], notices: []
                             ats:      warnings: [], notices: []
grep referee-name         →  ats PDF: 1 hit
                             designed PDF: 0 hits
```

It is not referees-specific. Removing the `languages` slot from
`layouts/two-column.yaml` while `languages.yaml` holds an entry reproduces it
exactly: clean validate, clean build, zero hits in the PDF. **Any populated
section whose key appears in no layout slot is discarded without a word.**

This ships in the default configuration. `layouts/two-column.yaml` deliberately
omits `referees` (there is a comment explaining the ~231pt cost), so every user
of the default designed layout who fills in `referees.yaml` loses it.

Three separate problems compound here:

1. **It contradicts the stated contract.** SKILL.md: *"CVX renders 100% of the
   YAML: it never omits, clips, or hides text to save a page."* It does omit —
   not to save a page, but because no slot claims the section.
2. **The two deliverables disagree.** The designed CV and the ATS CV, built from
   one content folder in one command, contain different content. A user sends
   one to a recruiter and the other to a portal, and cannot know they differ.
3. **No diagnostic covers it.** There is a `main-slot-unmeasured` fact and a
   `physical-pages-exceed-plan` defect, both about *measurement*. There is
   nothing about *content that never reached the page*. A clean build is
   currently not evidence that the content rendered.

**Suggested fix:** a validation warning — `section-has-no-slot`, kind `defect` —
whenever a non-empty content file's key is absent from every slot in the
resolved layout, naming the file and the layout. It is a set difference between
two things the tool already holds at validate time, so it needs no rendering. An
empty `referees.yaml` (`[]`) should stay silent, since dropping the "available
upon request" line is the documented intent.

**Doc bug in the same area:** SKILL.md line 206 and the ai-guide both say
`referees.yaml` set to `[]` prints *"References available upon request."* On the
shipped default designed layout it prints nothing at all — there is no slot. The
claim is true only of the ATS layout. I believed the line had rendered until the
content-fidelity check said otherwise.

---

## 2. DEFECT (docs) — the capability probe gives a false negative on macOS

The ai-guide's path-2 probe is:

```bash
timeout 30s npx -y @hrtips/cvx --version
```

On macOS this returns:

```
(eval):1: command not found: timeout
```

`timeout` is GNU coreutils; macOS does not ship it (it is `gtimeout`, and only
with Homebrew coreutils installed). The guide hedges with *"use your runtime's
timeout mechanism if `timeout` is unavailable"* — but it also instructs, two
sentences later, that *"any npm error means the same thing"* and to **switch to
path 3 in the same turn.**

So an assistant that follows the guide literally on a Mac sees the probe fail
and falls back to hand-writing YAML with no build — on a machine where `npx`
works perfectly. The failure mode is silent and total: the user gets no PDF, and
the reported reason ("npx unreachable") is false.

**Suggested fix:** make the probe portable, or tell the assistant to
discriminate. `command -v timeout >/dev/null && timeout 30s npx …` or simply
dropping `timeout` in favour of the runtime's own tool-call timeout. At minimum,
the guide should say that a *shell* error (`command not found`) is not an *npm*
error and must not trigger the path-3 fallback.

---

## 3. GAP — the page-1 lever the docs don't mention is the one that worked

`page1-ends-early` fired with `shortByPt: 9.46`. The warning message names
exactly two sources for the shortfall:

> *"Two edits close the gap: free 9.46pt above this role (the summary is the
> usual place), or take 9.46pt out of the role's own head — its description or
> its progression rows."*

Both are **content edits** — forbidden by this author's brief. SKILL.md's
"Tighten the template before you cut the text" section offers `spacing:`
multipliers as the non-content lever.

Neither mentions the third option, which is the one that solved it:
`layouts/two-column.yaml` `first.main` carries a literal `- spacer: 27` between
summary and experience. **27pt of pure whitespace, directly editable, costing no
words and no design integrity.** Dropping it to 14 freed 13pt against a 9.46pt
need:

| | before | after |
|---|---|---|
| page 1 `main.fill` | 0.809 | **0.995** |
| `page1-ends-early` | fires | silent |
| planned / physical sheets | 3 / 3 | 3 / 3 |
| words changed | — | **0** |

The spacer is strictly cheaper than the documented levers for small shortfalls:
`spacing:` multipliers are global and change reading rhythm everywhere, while
the spacer is local, is not content, and its value *is* the budget available.

**Suggested fix:** name the spacer in the `page1-ends-early` guidance and in
"Tighten the template before you cut the text" — and, better, put its value in
the warning payload. The engine knows the resolved spacer height for the page;
surfacing `spacerPt: 27` next to `shortByPt: 9.46` turns the judgement into
arithmetic and makes the zero-content-change fix the obvious first move.

---

## 4. GAP — `build --json` and `build --all --json` return different shapes

Without `--all`, the result is flat: `diagnostics` sits at the top level.
With `--all`, it is `{outputs: [{filename, diagnostics, …}, …]}`.

A script written against one shape dies on the other. Mine did —
`KeyError: 'outputs'` — on what looked like a trivial flag change.

Not necessarily wrong (one build, one result is defensible), but it is
undocumented: SKILL.md shows `build --json` and mentions `--all` without
signalling that the flag restructures stdout. Either always wrap in `outputs`,
or document the difference where both are introduced.

---

## 5. GAP — the schema has no home for non-Western CV conventions

The source carried a block the schema cannot express at all:

- **Personal details** — full legal name (distinct from the display name), date
  of birth, civil status, nationality
- **A signed declaration** — *"I, the undersigned, certify that all the above
  information is accurate…"* with a sign-off

Both are conventional in South Asian, Middle Eastern, and several African
markets. SKILL.md's "Converting an existing CV" section lists what the schema
cannot express (grouped skills flatten, education details fold into
`institution`, paragraph summaries become bullets, inline bold is lost) — this
category is absent from that list.

The right handling is disclosure, not accommodation, and the skill's existing
instinct is correct: DOB and civil status invite bias screening in most Western
markets, so dropping them is usually the better CV. But the assistant should not
have to *discover* that these have no home. Add the category to the
can't-express list with the market context and the recommendation, so it is
surfaced as a deliberate trade-off rather than found by an assistant noticing
leftover text.

**Adjacent, smaller:** `personal.yaml` has one `phone`. The source had mobile
and home. `links: [{label: "Home: 037…", href: "tel:…"}]` works and renders in
the contact block, but it is a workaround discovered rather than documented, and
every entry needs an `href` — fine for phones, awkward for anything else.

---

## 6. CONFIRMED — the fidelity check earns its place, for a reason not stated

SKILL.md's post-build check (`pdftotext` without `-layout`, normalize, look for
distinctive strings) is the **only** thing in the entire loop that caught
finding §1. Validation passed, the build reported no warnings, and the render
looked correct. A 41-string check across both variants is what surfaced the
missing section.

The skill frames a miss as *"either a wrap artifact or genuine loss."* This run
adds a third cause it does not name: **a section present and valid in the YAML
that no layout slot renders.** That is worth listing explicitly, because the
first two causes are about text and the third is about configuration — an
assistant hunting for a wrap artifact will not think to go read the layout file.

The check should probably run against **both** variants as a matter of course.
Checking only the designed PDF would have hidden nothing here, but checking only
the ATS one would have — and the divergence between them is exactly the risk.

---

## 7. CONFIRMED — a "don't change the text" brief inverts the lever hierarchy

SKILL.md treats template levers as the thing to try *before* cutting text. Under
this brief they are not first-resort, they are **the only resort**, and the
review step changes character completely: its value moves from *fixing* prose to
*surfacing* decisions the author must make.

What that looked like in practice — four run-together typos in the source
(`records andstatistics`, `departments andassisting`, `system is upto date`,
`and coachingby`). Distinguishing an author's typo from a `pdftotext` wrap
artifact needs the plain extraction: a join **mid-line** is the author's, a join
at a **wrap point** is the tool's. All four were mid-line, and confirmed
independently — the source PDF's own embedded hyperlink was likewise malformed,
so the document genuinely contained errors.

Under "don't change the text" these are neither silently fixed nor silently
kept — they are surfaced with the trade-off, and the author chose to fix the
four spaces while keeping every word. That is the correct shape of the
interaction, and the skill supports it, but it is worth writing down that a
no-text-change brief **promotes** the template levers rather than merely
permitting them.

---

## 8. OBSERVATION — thin sidebar content has no lever, and that is fine

Page 1 finished at `main.fill 0.995` / `sidebar.fill 0.748`, with pages 2–3
carrying no sidebar content at all (`emptyColumn: "sidebar"`). The sidebar held
only contact, education, and competencies, because the source had no
certifications, languages, publications, or achievements.

No layout lever fixes this — the sidebar is one flow, all of it fit on page 1,
and the remaining space can only be filled with content that does not exist.
SKILL.md's "report it if the user asks; don't chase it" is correct and was
followed.

The productive reframe, which the skill could adopt: **an underfilled sidebar is
a content-gathering prompt, not a layout defect.** The empty slots name exactly
what to ask the author for — here, languages (near-certain for this market) and
certifications. That converts a diagnostic dead-end into the most useful
question left to ask.

---

## Priority

| # | Finding | Kind | Priority |
|---|---|---|---|
| 1 | Populated section with no layout slot dropped silently | defect | **P0** — silent content loss, default config, breaks stated contract |
| 2 | `timeout` probe false-negative on macOS | docs defect | **P1** — costs the user their PDF on a major platform |
| 3 | `spacer` absent from page-1 guidance and payload | gap | P2 — cheapest lever is undiscoverable |
| 4 | `--all` restructures `--json` stdout | docs gap | P2 — breaks scripts silently |
| 5 | No home for non-Western CV conventions | gap | P3 — disclosure, not accommodation |
| 6 | Fidelity check catches slot omissions | confirm | P3 — extend guidance, run on both variants |
| 7 | No-text-change brief promotes template levers | confirm | P3 — document the inversion |
| 8 | Thin sidebar has no lever | confirm | P4 — reframe as a content prompt |

§1 is the one that should not wait for a sprint boundary. Everything else is
documentation or payload enrichment.
