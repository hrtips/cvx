---
name: cvx
description: Create, validate, and render professional CV/resume PDFs from plain YAML using CVX — fully local, no accounts. Use when the user wants to write a CV or resume, convert an existing CV to a maintained format, tailor a CV for a job application, or produce an ATS-safe variant. Covers the cv-content/ YAML schema, the edit→validate→build loop, themes, layouts, and ATS keywords.
license: Apache-2.0
compatibility: Requires Node.js 20+ (runs via npx, no install). Sandboxes with no npm access can run the single-file `cvx.bundle.js` from the GitHub releases instead. MCP server available via `npx @hrtips/cvx mcp`.
metadata:
  author: hrtips
  homepage: https://github.com/hrtips/cvx
---

# CVX — structured input, professional output

CVX renders a folder of plain YAML files (`cv-content/`) into a pixel-perfect CV PDF. Everything runs locally: no accounts, no network calls, and the user's data never leaves their machine. The YAML is the durable asset — the user keeps and re-edits it for every future application.

## Run order

Work through these in sequence. The sections below are the detail for each — read them when you get there, not up front.

| # | Do | Detail |
|---|---|---|
| 0 | **Get CVX running.** MCP tools if connected; else `npx`; else the bundle. Never hand off before trying all three. | [Getting CVX](#getting-cvx) |
| 1 | **Ask for source content _and_ the brief in ONE message**, then wait. Never invent facts. | [Ask about shape](#ask-about-shape-before-you-draft--once-with-examples) |
| 2 | **Scaffold, then replace every example value** with the user's real content. | [Getting CVX](#getting-cvx) |
| 3 | **Validate after every edit** — `validate --strict --json` — and fix what it names. | [Getting CVX](#getting-cvx) |
| 4 | **Review the content, batch 3–5 gap questions, then show a pre-build preview** and get an OK. | [Review, then brainstorm](#review-then-brainstorm--before-the-final-build) |
| 5 | **Build both variants** — designed and `--ats`. | [Getting CVX](#getting-cvx) |
| 6 | **Open the PDF and look at every page.** Iterate on what you see, not on numbers alone. | [Reading the layout](#reading-the-layout) |
| 7 | **Deliver both PDFs and the `cv-content/` folder** — the YAML is what the user keeps, and an ephemeral sandbox loses it otherwise. | — |

Two things go wrong most often, and both are avoidable: guessing at setup instead of running the block in step 0, and reporting a successful build without ever looking at the PDF. Step 6 is what makes you more useful than a YAML generator.

## Getting CVX

If the CVX MCP server is connected, use its tools: `get_schema` → `init_cv` → edit YAML → `validate_cv` → `plan_layout` (optional dry run — see below) → `build_pdf` (pass the workspace folder as `dir`, absolute path). Otherwise use the CLI:

```bash
npx @hrtips/cvx init                      # scaffold cv-content/ with a complete example CV
npx @hrtips/cvx validate --strict --json  # every problem at once: file + field paths + fixes
npx @hrtips/cvx build --json              # writes <name>.pdf; --ats for the ATS variant, --all for both
npx @hrtips/cvx list --json               # available themes and layouts
```

Exit codes: `0` ok · `2` validation failed · `3` render failed · `64` usage error. With `--json`, stdout is exactly one JSON object; logs go to stderr.

Always validate after every edit and before every build. Findings include the file, the field path, and a suggested fix — apply the fix and re-validate.

If `npx` is unreachable, **get the standalone bundle instead of falling back to a handoff** — CVX ships as one self-contained file that needs Node and nothing else. Run this exact block; do not explore first:

```bash
mkdir -p .cvx && cd .cvx
curl -sSfLO https://hrtips.github.io/cvx/download/cvx.bundle.min.js.zip
unzip -o -q cvx.bundle.min.js.zip
node cvx.bundle.min.js --version      # same commands, flags, exit codes, --json
```

**Running CVX is a file download, not a repository task.** That URL is a public ZIP served from the project site — fetch it with ordinary HTTP. Do not clone the repository, call the GitHub API, or route this through a GitHub connector: none of it is needed to run CVX, and a connector fails on binary assets in a way that reads as "this sandbox cannot download", which is false. **One tool failing is not evidence that the sandbox has no network** — work down the list below before concluding anything, and never ask the user to upload a file you have not yet failed to fetch several ways. The repository is for reading or changing CVX's own source, nothing else.

Same engine, byte-identical PDFs. If `curl` is blocked, try in order: Python's `urllib.request.urlretrieve` on that URL, your own download tool, a copy already on disk (`ls /mnt/data | grep -i cvx` — glob `cvx*.bundle*.js*`, since a release attaches versioned and unversioned names with the same bytes), then ask the user to upload it from [the latest release](https://github.com/hrtips/cvx/releases/latest). Stop at the first that works and say one line about it — never narrate a string of failed attempts.

It writes `cv-content/` and the PDF into the **current working directory**, so `cd` first and stay there. `cvx mcp` is not in the bundle, and `.js` theme files dropped beside it are ignored on purpose.

Only if neither `npx` nor the bundle can be had: write the `cv-content/*.yaml` files from the schema and deliver them with the handoff from the AI guide's default flow (see below — it ships with CVX, so no network is needed to read it) — never substitute another PDF renderer. A linkedin.com URL is unfetchable even when public: ask for the profile's **More → Save to PDF** export or pasted text instead of inferring.

## Ask about shape before you draft — once, with examples

A designer takes a brief before working, and so should you. Before writing any YAML, ask the user how they want the CV to *read* — one message, batched, with concrete examples so the question is answerable by someone who has never thought about layout:

> *"Before I draft: roughly how long should this be — one page, two, or as long as it needs? Anything you want to lead with or play down (recent roles, education, publications)? And is this aimed at a particular job — if so, paste the ad and I'll angle the wording at it."*

Ask once and move on; don't interrogate. What you get back is **scope, not permission**: with it, trimming a section or tightening prose is work you were asked to do rather than a decision you need to clear each time. Without it, you'll either over-ask or guess.

**The brief is the conversation, not a file.** There is no `preferences:` block and no brief file — nothing to write, nothing to keep in sync. It lives in your context for this session, and anything that should outlast the session is the user's own notes or your client's memory feature, not `cv-content/`.

## Track your own changes — CVX cannot

CVX is stateless. It has no undo, no snapshots, no history, and it does not remember the previous build: ask it the same question twice and you get the same answer. Every bit of continuity in the loop is yours to hold.

So keep a short running list as you go — what you changed, why, and what it did to the render (*"tightened the two 2019 bullets to pull page 3's referees up; page count unchanged"*). You need it to:

- **Backtrack.** If an edit made the page worse, put the previous wording back — you are the only thing that knows what it was.
- **Not re-litigate.** If the user restored a sentence you had rewritten, that is direction: leave it alone from then on.
- **Report honestly at the end.** Tell the user what you changed across the whole session, not just the last step.

And know when to stop: nothing in CVX bounds the loop. Stop when the page looks right and the user is satisfied — not after a fixed number of passes, and never by iterating on measurements when you cannot see the render.

## The full docs ship with CVX — don't fetch them

`docs/ai-guide.md` (the complete playbook) and `docs/cv-schema.md` (the field-by-field reference) are inside the installed package, alongside this skill — `../../docs/ai-guide.md` relative to this file. Read them from disk when you can; they match the version you are actually running.

- **With the MCP server:** `get_schema` lists them under `guides` with an absolute `path`, and returns the text inline if you ask — `get_schema({ dir, guides: ["ai-guide"] })`. That is the one route that needs no network *and* no file access outside the workspace, so prefer it when the path is unreadable (an `npx`-launched server lives in the npm cache, which many clients won't let you read).
- **Reading this skill outside an install**, with no package on disk: fall back to <https://raw.githubusercontent.com/hrtips/cvx/main/docs/ai-guide.md>. That is the `main` branch — the latest instructions, not necessarily the ones matching an installed CVX.

## Review, then brainstorm — before the final build

After converting the user's material into YAML (and passing validation), review the *content* and bring your findings to the user as a short brainstorm — never silently ship the first draft:

1. **Grammar and prose.** Strong action verbs, verb-first bullets (*managed*, *shipped*, *cut* — not *responsible for*); consistent tense (past for former roles, present for the current one); no typos, no filler words; quantify only where the source supports it. Translate insider jargon into plain-language impact a non-specialist recruiter understands. Fix what's unambiguous silently; list notable rewrites for the user to approve.
2. **Gaps and quality.** Missing dates, roles with no outcomes or metrics, thin one-line descriptions, unexplained employment gaps, an unprofessional email address (flag it, suggest `first.last@…`), a `competencies` list that is all hard or all soft skills (aim for a truthful mix, weighted to the target role), and sections the source hints at but the draft lacks (certifications, publications, languages). Turn these into **3–5 targeted questions, batched into one message** — e.g. *"Your CEO role lists no outcomes — any truthful numbers on users, revenue, or funding? And your LinkedIn mentions three publications; want them on the CV?"*
3. **Conflicts.** Contradictory titles or dates between sources — present both options and ask which is correct; never pick silently.

4. **Pre-build preview.** Before calling `build_pdf` (or running `build`), show the user a plain-language rundown of exactly what the CV will contain and get their OK: each section with its entries — roles with companies and periods (and which land on page 1), education, the competency pills, achievements, referees or *"available upon request"*, which keywords go into the (invisible) ATS metadata — plus the theme, layout, and photo status. Summarize the YAML; don't dump it. Nothing goes on the CV the user hasn't seen. Use `plan_layout` for the page-by-page part — don't guess it.

Apply the answers, re-validate, then build both variants. A truthful thin bullet always beats an embellished one — never pad with invented metrics.

## Reading the layout

**Open the PDF and look at it.** `build_pdf` returns an absolute `path` — open it and read every page. Most clients (Claude Code, Claude Desktop, the IDE extensions) render PDFs natively, and the defects that matter most — a stranded heading, a page that ends early, a near-empty column — appear in no diagnostic field. If your client genuinely cannot open a PDF, build once and hand off; don't iterate on measurements alone.

`plan_layout` (MCP) or the `diagnostics` block in `build --json` / `build_pdf` reports how it paginated without rendering anything. Measurements tell you what the layout *costs*; looking at the page tells you whether it's any good. Use both:

- It describes the **designed two-column variant only**. The ATS variant is a single column react-pdf flows by itself — CVX never packs it, there is no dry run for it, and its sheet count can differ. Build it to find out.
- `totalPages` is the number of **planned** pages, not necessarily the sheet count of the PDF: an overflowing page spills onto an extra sheet the numbering can't count. Check `totals.overflowPt` before telling the user "your CV is 3 pages" — and know that `overflowPt` only prices the flows the planner *measures* (summary, experience, and the sidebar sections). A main slot carrying anything else (see "Student and first-job CVs" below) can spill extra sheets with `overflowPt: 0` and no warning. CVX now runs that check for you on every build: if the finished PDF has more sheets than the plan numbered, `build_pdf` (and `cvx build --json`) returns the **`physical-pages-exceed-plan`** defect naming both counts. It is the one warning a dry run can never produce — `plan_layout` renders nothing, so a clean plan is not proof of a clean PDF. When it fires, open the PDF and look at the last pages: a mismatch is usually a trailing margin spilling a **blank** sheet, which no text-extraction check will ever notice.
- Per page: `main.fill` / `sidebar.fill` — **column occupancy**: `(fixedPt + usedPt) / capacityPt`, the same measurement on every page so pages can be compared (`diagnostics.version: 5`; v1 divided by the residual budget, which made page 1 look far emptier than it was). Normally 0–1, and **above 1 exactly when that page is over budget**. Also per page: `blockedBy` — why the next role/section could not start there, with `shortByPt`, **the one number that falls monotonically as you shorten what is above it**. Fill is a description, not a progress signal: shortening content LOWERS fill until a block moves up, then it jumps — steer by `shortByPt`, never by fill. Plus the roles on that page, and the sidebar sections with their item ranges. Ranges are **0-based and end-exclusive**: `range: [6, 8)` of `of: 8` is the last *two* items — `items` already gives you the count, so you never have to do that arithmetic. `continued: true` = carried over from the previous page.
- **Per main-column entry: what it costs.** `heightPt` is the placed piece's measured height; `headPt` is the **indivisible** part — everything the piece must carry before its first bullet — broken out as `head.rolePt` / `metaPt` / `locationPt` / `descriptionPt` / `progressionPt`; and `bulletsPt` prices each bullet of the slice in order. This is what turns `shortByPt` into an edit **without rebuilding**: compare it against the terms and take the first one that covers it. Worked example — a role blocked with `shortByPt: 53.64` and `headPt: 124.35` whose `head` reads `{rolePt: 13, metaPt: 12.3, descriptionPt: 35.15, progressionPt: 63.9}`: the progression table alone (63.9) exceeds the shortfall, so dropping it starts the role on page 1, while the description (35.15) alone would not. Do that subtraction before you propose any prose cut.
- `diagnostics.warnings` is the list of **named conditions**, each with a `code` — match on that, not on the wording. Each carries a `kind`: `defect` (something is wrong — act) or `fact` (true and priced — act only if the user wants what it prices):
  - `overflow` — a page reaches past its budget and spills onto an extra sheet. The warning names the page and the overshoot; what to shorten is the judgement call below.
  - `page1-ends-early` — page 1 has roles, but the next one could not start there: its smallest legal piece needs more than the room left. **Fires on well-packed CVs too** — it is not by itself a defect. Its payload prices the trade: `shortByPt` is how much must come free for the next role to start on page 1. Mention it only when the user wants page 1 fuller or the CV shorter; it is the number that turns "make it fit" into an actionable edit. **The smallest legal piece is not just a heading and a bullet** — it is the role heading, its company/period line, any `description`, and then the entry's first unit of content: **one `progression` row, or the first bullet**. The promotion table splits at a row boundary, so a role with a long one can start on a part-full page carrying only some of its rows and continue the rest overleaf. What is never split is the heading block itself, and a description alone can still be a large share of `smallestPiecePt`.
  - `physical-pages-exceed-plan` (**defect**, builds only) — the rendered PDF has more sheets than the plan numbered: content the planner did not measure reached the page and react-pdf flowed it onto sheets the page badges do not count. Payload: `planned` and `physical`. Open the PDF and look at the last pages.
  - `slot-not-renderable` (**defect**) — a `main` slot names a key nothing can draw: a typo (`experiance`), or a `<section>:continued` form only `experience` implements. That slot renders NOTHING, so whatever belonged there is missing from the PDF while the plan still prices it. Payload: `keys`. Distinguish it from its neighbour: `main-slot-unmeasured` means the ink reaches the page and the arithmetic excludes it; this means the ink never reaches the page. `cvx validate` names the file, the slot index and the likely spelling — run it rather than guessing.
  - `main-slot-unmeasured` (**fact**) — this layout puts a section other than the summary/experience in a `main` slot. It renders correctly, but the planner does not measure it, so `totalPages` and `overflowPt` exclude it. Payload: `keys`. Expected on the student layout below; it is why the defect above exists.
  - `main-column-empty` (**fact**) — a multi-page CV whose wide column renders nothing on any page: every page carries only its sidebar. Payload: `pages`. This is *not* the ordinary case of a sidebar outlasting a short experience list (that shape has content on page 1 and runs out later, and is fine). It usually means the layout should carry sections in `main` — see "Student and first-job CVs" below.
  - `experience-empty` (**fact**) — this CV has no experience entries at all: a student or first-job CV. Payload: `fixedPt`, how much of page 1 the summary occupies. It is mutually exclusive with `page1-no-experience`, which needs roles to exist — so on a CV with no work history you get this, never that.
  - `page1-no-experience` — page 1 carries no roles at all, because the summary and identity block leave less room than the smallest piece of the first role. The reader's first page shows no work history; raise it with the user. Two lengths move it: the summary, and the first role's own head (its `description` and `progression` rows are part of the piece that has to fit).
- **`--all` restructures stdout**: `cvx build --json` puts `diagnostics` at the top level, while `cvx build --all --json` returns `{outputs: [{filename, diagnostics, …}, …]}` — one entry per variant. A script written against one shape throws on the other, so read `outputs` when you pass `--all`. `notices` is a separate, plain-text list of notes about the run (a font with no glyph for some text, a layout that fell back to the default). It is not the same field as `diagnostics.warnings`.
- `emptyColumn` / `emptyColumnPages` are **diagnostics, not targets**. It means **no ink in that column** — a page-1 main column carrying a summary is *not* empty (it used to report `'main'` before `version: 5`'s lineage, which is why older docs explain the difference). A *last* page whose sidebar outlasts the experience list is normal and fine; packing to remove it measurably produces worse CVs (fragmented sections, near-empty pages). Report it if the user asks; don't chase it — but do READ it: a sidebar that ends early names exactly which sections the CV has nothing for, and "you have no languages or certifications listed — do you have any?" is usually the most useful question left. An underfilled sidebar is a content-gathering prompt, not a layout defect. The one case that is *not* fine is page 1 — and that one arrives as the `page1-no-experience` warning, so you never have to judge it from `emptyColumn` alone.

**What the warnings price, and what you do about it.** The engine states
conditions and their cost; choosing the edit is your job with the user (that
split is deliberate — a renderer has no business having opinions about someone's
career). The usual moves, by code:

- `page1-ends-early` / `page1-no-experience` — `shortByPt` is exactly how much
  must come free for the next role to start on page 1. **Check `spacerPt`
  first**: it is published beside `shortByPt`, it is the layout's own
  `- spacer: N` above the roles, and it is pure whitespace — editable in
  `layouts/*.yaml`, costing no words and needing no permission to change text.
  If it covers the shortfall, that is the cheapest fix there is. Otherwise there
  are two places the space can come from: the fixed content above the roles (the
  summary, usually), or the blocked role's own head — its `description` and its
  `progression` rows, which shrinks the piece rather than enlarging the hole.
  The second is invisible if you only read "what is above it", and on a role
  with a promotion table it is often the cheaper of the two. Offer the user the
  trade before making it.
- `overflow` where the summary alone is taller than the column — the summary is
  fixed page-1 content, so no pagination helps; it has to get shorter.
- `overflow` where one block is taller than a page — one bullet, description or
  sidebar item is the culprit; splitting only happens at item boundaries.
- `main-column-empty` / `experience-empty` — the wide column is unused or has no
  roles to hold. Moving sections into `main` in the layout is the lever.
- `physical-pages-exceed-plan` — open the PDF and look at the last pages.

**`plan_layout` is idempotent — the pagination is a function of the content**, so it returns the same answer every time until the YAML changes, and calling it in a loop achieves nothing. Use it once before the build, and once after a content edit if the user asked about length.

That is *not* the same as "layout changes never help", and the two cases are worth keeping straight:

- **A full experience list** — the main column's pagination is fixed by the content *and the template's spacing*. Swapping sidebar sections around does not move it (the two columns are independent flows), `summary` only renders from `first.main`, and themes are colour-only with identical geometry. The levers here are content edits, the two `shortByPt` targets above, and the `spacing:` block below.
- **An empty or very short experience list** — moving sections between columns is the strongest lever there is, and costs no content edits. See "Student and first-job CVs" below.

**Rank levers by cost before you recommend one.** Compare `blockedBy.shortByPt` across pages and take the cheapest, not the most comfortable. Greedy top-down packing makes prefix repair monotone: **an edit below a break cannot move content already placed above it** — so a cut in the last role cannot fill page 1. The carve-out that matters: *the blocked role's own head is an input to its break*, so shrinking that role's `description` or `progression` does move the break even though the role sits below it.

**Tighten the template before you cut the text.** Two levers live in
`cv-content/layouts/*.yaml`, and the smaller one is easy to miss: a literal
`- spacer: N` in a `main` slot is N points of plain whitespace between the
sections around it. It is local, it is not content, and its value *is* the
budget you can reclaim — dropping 27 to 14 frees 13pt at page 1, which is often
the whole shortfall. `plan_layout` publishes it as `main.spacerPt`. The other
lever is global: `cv-content/layouts/*.yaml` also takes a `spacing:` block of multipliers on the theme's own vertical whitespace — `1` is unchanged, and the legible range is `0.6`–`1.5` (outside it is a validation error, not a silent clamp):

```yaml
spacing:
  entryGap: 0.8      # space BETWEEN experience entries — the strongest lever on page count
  bulletGap: 1.0     # space between bullets, in the summary and within an entry
  sectionGap: 1.0    # space around section boundaries and under section titles
```

Prefer `entryGap` alone: it compresses the gaps between jobs and leaves the reading rhythm *inside* a job untouched, which is the typographically right instinct. Measured on a real CV, `entryGap: 0.8` turned 3 pages into 2 with no word changed — so this is the first thing to try for an author who does not want their text altered, and it costs nothing to undo. Two cautions: it is a real design change, so look at the render rather than only the page count; and packing to 0.99 fill leaves nothing for the next sentence they add. Horizontal spacing is deliberately not exposed — changing it would change wrap widths, hence every measurement.

**Check for text that is already on the page.** Before proposing any cut, look for duplication across sections — a summary bullet listing awards that the `achievements` sidebar prints beside it, or skills restated in both the summary and `competencies`. On a real CV a single duplicated summary bullet was 48pt of the 53.64pt needed, and removing it lost no fact at all. This is the cheapest edit that exists and it is invisible to a grammar pass.

**Never drop content to fit — surface the trade-off to the user.** CVX renders 100% of the YAML: it never omits, clips, or hides text to save a page, and neither do you. If the CV is longer than the user wants, name the options and what each one costs — *"we could cut the two oldest roles to 2 bullets each, or drop the publications section — which would you prefer?"* — and let them decide. Once they've given you direction, editing the text is your job: tighten the prose, make the cut they chose, and say what you changed each time you change it. The rule is that the user decides *what* goes, not that you may never act.

**Under a "don't change the text" brief the hierarchy inverts.** The template levers stop being what you try first and become the *only* thing you may touch, and the review step changes character with them: its job is no longer to tighten prose but to surface every decision the author has to make — including their own typos, which are theirs to keep or fix. Distinguish an author's typo from a `pdftotext` wrap artifact by where the join sits: mid-line is the author's, at a wrap point is the tool's.

**Don't promise a page count for an edit you haven't planned.** Cuts don't map to pages the way they look like they should: on the shipped example CV, dropping the whole publications section still renders 3 pages (page 3 holds the referees), and so does trimming the two oldest roles to 2 bullets each. Sidebar and main are two independent flows, and the page count is the longer of them — so removing main-column text can leave the total untouched. If the user wants a number, make the edit and re-run `plan_layout`.

## Tailoring to a job posting

If the user gives you a target job description, tailor **truthfully** — never invent experience to match it:

- Mirror the posting's own wording for skills and duties the user genuinely has; recruiters and ATS match on exact terms. Add real, posting-relevant skills to `competencies.yaml` and truthful terms to `keywords.yaml`.
- Lead with and expand the experience bullets most relevant to the role; keep the rest but trim them.
- Point `summary.yaml` at the target role.
- Recent graduate or career-changer with thin experience: make `education.yaml` and `competencies.yaml` do more of the work, and keep the experience section tight.

Keep the base `cv-content/` intact and tailor a copy — the durable YAML is reusable for the next application.

## Student and first-job CVs (no experience yet)

`experience.yaml: []` is valid — but the default two-column layout was designed around it being full. With it empty, page 1's wide column holds only the summary, education lands in the *narrow sidebar* (where entry text wraps badly), and the diagnostics now name it for you: `experience-empty` fires (with `fixedPt`, what page 1 does carry), and page 1's `main.*` numbers are real rather than `null`. `page1-no-experience` stays silent here by construction — it needs at least one role to exist. The result looks like a rendering bug and is actually a layout mismatch.

The fix is the layout file, not the content. Any section key can be placed in a `main` slot in `cv-content/layouts/two-column.yaml` — the renderer draws it there. The reverse is **not** true: a `sidebar` slot only accepts the sidebar's own sections (contact, achievements, education, certifications, publications, languages, competencies, referees). Putting `summary` or `experience` in one is a validation error, because the packer cannot render them there.

```yaml
pages:
  first:
    sidebar: [identity-photo, contact, certifications, referees]
    main: [summary, {spacer: 14}, education, {spacer: 10}, competencies]
```

Three things to know when you do this:

- **The `first`/`continuation`/`last` keys mean different things in the two columns.** The `main` lists really are per-page-kind. The `sidebar` lists are **not**: all three concatenate into one ordered flow that the engine paginates itself, so listing a section under `last` sets its *position in the order*, not the page it lands on. A section named in `last.sidebar` routinely renders on page 1. You cannot push sidebar content onto a later page by naming it there.
- **The planner measures only summary + experience in `main`.** Everything else renders unmeasured: the plan can say 1 page while the PDF has 2 (often a blank spill sheet from a trailing margin). After *every* build with such a layout, verify the physical sheet count against `totalPages` and open the last page. If a blank sheet appears, remove spacers or move a section to the other column — don't trust the diagnostics to price it, they can't see it.
- **Sections cost different amounts per column.** Competency tags flow horizontally — cheap in the wide column, tall in the sidebar. Entry-style sections (education, certifications, referees) are the opposite: narrow-column wrapping roughly doubles them. Swapping which column carries which section is the strongest one-page lever you have, and it costs no content edits.

## Converting an existing CV (PDF or export)

When the source is a designed PDF, extract before you transcribe — never retype from a screenshot:

```bash
pdftotext -layout original.pdf -   # read the text with its visual structure
pdfimages -png original.pdf img    # pull the photo; convert/rename to cv-content/images/profile.jpg
```

Transcribe **verbatim** into the nearest honest section — never relabel content under a heading that misrepresents it (a "Training / Courses" list belongs in `certifications.yaml` and will render as "Certifications"; that's an honest home with a different label, so tell the user about the rename). What the schema can't express, disclose instead of approximating silently: grouped skills flatten to one tag cloud, education details (GPA, specialization) fold into the `institution` string, a paragraph summary becomes bullets, inline bold is lost. **A personal-details block** (full legal name distinct from the display name, date of birth, civil status, nationality) **and a signed declaration** — both conventional in South Asian, Middle Eastern and several African markets — have no home at all. Dropping them is usually the better CV for a Western-market application, because DOB and civil status invite bias screening; say that, and let the author decide, rather than leaving them to notice the text went missing.

**Promotions within one employer are a layout decision, not just an ATS one.** You can model them as one entry with a `progression` table, or as separate entries — both are truthful, and the guide recommends separate entries so ATS keyword derivation sees every title. What neither says is that the choice moves the page break: a `progression` table is welded into the entry's indivisible head, so an entry carrying one is much harder to start on a part-full page. Measured on a real CV, the two modellings of the *same four promotions* differed by a whole page-1 column (`main.fill` 0.767 vs 0.985) and by whether `page1-ends-early` fired at all. If page 1 is ending early on an entry with a promotion table, try the other modelling before proposing any cut — it changes no facts.

After the build, prove nothing was lost: extract the new PDF's text in **reading order** (`pdftotext` *without* `-layout` — layout mode interleaves the two columns and breaks phrases that wrap), normalize whitespace, and check that a few dozen distinctive strings from the original — every name, phone number, date, grade, URL — appear. Do this for **both** PDFs, not just the designed one: they are built from one folder by one command and can still differ, and checking only one hides exactly that. Anything missing has three possible causes, and the third is the one that will not occur to you: a wrap artifact (check the normalized text), genuine loss, or **a section your layout has no slot for** — present and valid in the YAML, rendered in the ATS variant, and never placed in the designed one. The build reports that last one as `section-has-no-slot`, but the fidelity check is what caught it before the code did; the first two causes are about text and the third is about configuration, so go read `layouts/*.yaml` rather than hunting the prose.

## Rules that are not optional

1. **Never invent facts.** Every entry must be truthful to the user's real history. This matters most for `keywords.yaml`: ATS parsers cross-check keywords against the CV body, and stuffing false terms gets CVs auto-rejected.
2. **Don't rename the YAML files.** Sections are discovered by filename: `personal.yaml`, `summary.yaml`, `experience.yaml`, `education.yaml`, `certifications.yaml`, `publications.yaml`, `languages.yaml`, `competencies.yaml`, `achievements.yaml`, `referees.yaml`, `keywords.yaml`, `config.yaml`.
3. **Quote strings containing colons** (`"Director: Operations"`). Date ranges are free text (`2019 – Present`).
4. The photo goes at `cv-content/images/profile.jpg` (or `.jpeg`/`.png`/`.webp`) — ask the user for it; it cannot be generated.

## Content files (summary — the schema is authoritative)

Every scaffolded file carries a `$schema` header, pinned to the CVX release that scaffolded it — don't rewrite those headers to `main`, and don't hand-write them into new files. The canonical JSON Schema ships at `schema/v1/` inside the package and is returned by the MCP `get_schema` tool; `docs/cv-schema.md` (packaged too) is the same contract with examples.

- `personal.yaml` (object): `name` (required — drives the output filename), `title`, `company`, `phone`+`phoneHref`, `email`, `linkedin`+`linkedinHref`, `facebook`+`facebookHref`, `location`, `links` (list of `{label, href}` for a blog/portfolio; `label` optional).
- `summary.yaml`: list of 3–6 single-sentence bullets. A bullet may also be `{text, link: {href, label}, suffix}` to embed a clickable link (same form works in experience bullets).
- `experience.yaml`: list of roles, most recent first — `role` (required), `company`, `period`, `location`, `description`, `progression` (list of `{title, period}`), `bullets` (verb-first, quantified, truthful).
- `education.yaml`: list of `{degree, institution, period}`.
- `certifications.yaml`: list of `{name, issuer, year}` — only `name` required; kept separate from achievements.
- `publications.yaml`: list of `{title, venue, year}` — only `title` required.
- `languages.yaml`: list of `{language, proficiency}` — `proficiency` is free text (Native, Professional, …).
- `competencies.yaml`: 6–12 short skill strings.
- `achievements.yaml`: list of `{year, text}` — `year` is the bold headline (often the award name), `text` the attribution.
- `referees.yaml`: list of `{name, title, company, email, phone}`, or `[]`. **The shipped `two-column` layout has no `referees` slot** (it costs ~231pt), so on the default designed CV this file renders *nothing* — populated or not — while the ATS variant renders it either way. `[]` prints "References available upon request." only where a slot exists, which today means the ATS variant. Put content in this file and the build now says so: `section-has-no-slot`, a defect, because your two deliverables would otherwise differ without you knowing. To render it in the designed CV, add `referees` to a sidebar slot in `cv-content/layouts/two-column.yaml`.
- `keywords.yaml` (optional): extra truthful ATS keywords not already covered by competencies/titles; embedded in PDF metadata, never printed.
- `config.yaml`: `schemaVersion: 1`, `theme` (`teal`|`coral`|`mono`), `layout` (`two-column`|`single-column`|custom filename). Pagination is automatic — the old page-1 keys were removed; if a legacy config still has them, validation says so and they are ignored.

## Variants

- Designed CV: `build` → two-column, photo sidebar, theme colours.
- Job-portal upload: `build --ats` (or `build_pdf` with `ats: true`) → single column, no colours, machine-friendly, `<name>-ats.pdf`.

## When validation fails

Report the findings to the user in plain language, apply the suggested fixes to the YAML, and re-validate. Unknown keys are typos more often than not — the findings include a "did you mean" suggestion. Do not build until validation passes.
