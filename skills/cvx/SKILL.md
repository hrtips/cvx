---
name: cvx
description: Create, validate, and render professional CV/resume PDFs from plain YAML using CVX — fully local, no accounts. Use when the user wants to write a CV or resume, convert an existing CV to a maintained format, tailor a CV for a job application, or produce an ATS-safe variant. Covers the cv-content/ YAML schema, the edit→validate→build loop, themes, layouts, and ATS keywords.
license: Apache-2.0
compatibility: Requires Node.js 20+ (runs via npx, no install). MCP server available via `npx @hrtips/cvx mcp`.
metadata:
  author: hrtips
  homepage: https://github.com/hrtips/cvx
---

# CVX — structured input, professional output

CVX renders a folder of plain YAML files (`cv-content/`) into a pixel-perfect CV PDF. Everything runs locally: no accounts, no network calls, and the user's data never leaves their machine. The YAML is the durable asset — the user keeps and re-edits it for every future application.

## The loop

If the CVX MCP server is connected, use its tools: `get_schema` → `init_cv` → edit YAML → `validate_cv` → `plan_layout` (optional dry run — see below) → `build_pdf` (pass the workspace folder as `dir`, absolute path). Otherwise use the CLI:

```bash
npx @hrtips/cvx init                      # scaffold cv-content/ with a complete example CV
npx @hrtips/cvx validate --strict --json  # every problem at once: file + field paths + fixes
npx @hrtips/cvx build --json              # writes <name>.pdf; --ats for the ATS variant, --all for both
npx @hrtips/cvx list --json               # available themes and layouts
```

Exit codes: `0` ok · `2` validation failed · `3` render failed · `64` usage error. With `--json`, stdout is exactly one JSON object; logs go to stderr.

Always validate after every edit and before every build. Findings include the file, the field path, and a suggested fix — apply the fix and re-validate.

If `npx` is unreachable (no network in your sandbox), write the `cv-content/*.yaml` files from the schema and deliver them with the handoff from the AI guide's default flow (see below — it ships with CVX, so no network is needed to read it) — never substitute another PDF renderer. A linkedin.com URL is unfetchable even when public: ask for the profile's **More → Save to PDF** export or pasted text instead of inferring.

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
- Per page: `main.fill` / `sidebar.fill` — **column occupancy**: `(fixedPt + usedPt) / capacityPt`, the same measurement on every page so pages can be compared (`diagnostics.version: 3`; v1 divided by the residual budget, which made page 1 look far emptier than it was). Normally 0–1, and **above 1 exactly when that page is over budget**. Also per page: `blockedBy` — why the next role/section could not start there, with `shortByPt`, **the one number that falls monotonically as you shorten what is above it**. Fill is a description, not a progress signal: shortening content LOWERS fill until a block moves up, then it jumps — steer by `shortByPt`, never by fill. Plus the roles on that page, and the sidebar sections with their item ranges. Ranges are **0-based and end-exclusive**: `range: [6, 8)` of `of: 8` is the last *two* items — `items` already gives you the count, so you never have to do that arithmetic. `continued: true` = carried over from the previous page.
- `diagnostics.warnings` is the list of **named conditions**, each with a `code` — match on that, not on the wording. Each carries a `kind`: `defect` (something is wrong — act) or `fact` (true and priced — act only if the user wants what it prices):
  - `overflow` — a page reaches past its budget and spills onto an extra sheet. The warning names the page and the fix (usually: shorten the longest single item, or the summary).
  - `page1-ends-early` — page 1 has roles, but the next one could not start there: its smallest legal piece needs more than the room left. **Fires on well-packed CVs too** — it is not by itself a defect. Its payload prices the trade: `shortByPt` is what shortening the summary (or that role's first bullet) would need to free for the next role to start on page 1. Mention it only when the user wants page 1 fuller or the CV shorter; it is the number that turns "make it fit" into an actionable edit.
  - `physical-pages-exceed-plan` (**defect**, builds only) — the rendered PDF has more sheets than the plan numbered: content the planner did not measure reached the page and react-pdf flowed it onto sheets the page badges do not count. Payload: `planned` and `physical`. Open the PDF and look at the last pages.
  - `main-slot-unmeasured` (**fact**) — this layout puts a section other than the summary/experience in a `main` slot. It renders correctly, but the planner does not measure it, so `totalPages` and `overflowPt` exclude it. Payload: `keys`. Expected on the student layout below; it is why the defect above exists.
  - `experience-empty` (**fact**) — this CV has no experience entries at all: a student or first-job CV. Payload: `fixedPt`, how much of page 1 the summary occupies. It is mutually exclusive with `page1-no-experience`, which needs roles to exist — so on a CV with no work history you get this, never that.
  - `page1-no-experience` — page 1 carries no roles at all, because the summary and identity block leave less room than the smallest piece of the first role. The reader's first page shows no work history; raise it with the user (shortening the summary is the only thing that moves it).
- `notices` is a separate, plain-text list of notes about the run (a font with no glyph for some text, a layout that fell back to the default). It is not the same field as `diagnostics.warnings`.
- `emptyColumn` / `emptyColumnPages` are **diagnostics, not targets**. It means **no ink in that column** — as of `version: 3` a page-1 main column carrying a summary is *not* empty (it used to report `'main'`, which is why older docs explain the difference). A *last* page whose sidebar outlasts the experience list is normal and fine; packing to remove it measurably produces worse CVs (fragmented sections, near-empty pages). Report it if the user asks; don't chase it. The one case that is *not* fine is page 1 — and that one arrives as the `page1-no-experience` warning, so you never have to judge it from `emptyColumn` alone.

**There are no layout levers.** The layout is a function of the content, so `plan_layout` returns the same answer every time until the YAML changes — calling it in a loop achieves nothing. Use it once before the build, and once after a content edit if the user asked about length.

**Never drop content to fit — surface the trade-off to the user.** CVX renders 100% of the YAML: it never omits, clips, or hides text to save a page, and neither do you. If the CV is longer than the user wants, name the options and what each one costs — *"we could cut the two oldest roles to 2 bullets each, or drop the publications section — which would you prefer?"* — and let them decide. Once they've given you direction, editing the text is your job: tighten the prose, make the cut they chose, and say what you changed each time you change it. The rule is that the user decides *what* goes, not that you may never act.

**Don't promise a page count for an edit you haven't planned.** Cuts don't map to pages the way they look like they should: on the shipped example CV, dropping the whole publications section still renders 3 pages (page 3 holds the referees), and so does trimming the two oldest roles to 2 bullets each. Sidebar and main are two independent flows, and the page count is the longer of them — so removing main-column text can leave the total untouched. If the user wants a number, make the edit and re-run `plan_layout`.

## Tailoring to a job posting

If the user gives you a target job description, tailor **truthfully** — never invent experience to match it:

- Mirror the posting's own wording for skills and duties the user genuinely has; recruiters and ATS match on exact terms. Add real, posting-relevant skills to `competencies.yaml` and truthful terms to `keywords.yaml`.
- Lead with and expand the experience bullets most relevant to the role; keep the rest but trim them.
- Point `summary.yaml` at the target role.
- Recent graduate or career-changer with thin experience: make `education.yaml` and `competencies.yaml` do more of the work, and keep the experience section tight.

Keep the base `cv-content/` intact and tailor a copy — the durable YAML is reusable for the next application.

## Student and first-job CVs (no experience yet)

`experience.yaml: []` is valid — but the default two-column layout was designed around it being full. With it empty, page 1's wide column holds only the summary, education lands in the *narrow sidebar* (where entry text wraps badly), and nothing warns you: `page1-no-experience` needs at least one role to exist before it can fire, and the per-page `main.*` diagnostics all read `null`. The result looks like a rendering bug and is actually a layout mismatch.

The fix is the layout file, not the content. Any section key can be placed in a `main` slot in `cv-content/layouts/two-column.yaml` — the renderer draws it there:

```yaml
pages:
  first:
    sidebar: [identity-photo, contact, certifications, referees]
    main: [summary, {spacer: 14}, education, {spacer: 10}, competencies]
```

Two things to know when you do this:

- **The planner measures only summary + experience in `main`.** Everything else renders unmeasured: the plan can say 1 page while the PDF has 2 (often a blank spill sheet from a trailing margin). After *every* build with such a layout, verify the physical sheet count against `totalPages` and open the last page. If a blank sheet appears, remove spacers or move a section to the other column — don't trust the diagnostics to price it, they can't see it.
- **Sections cost different amounts per column.** Competency tags flow horizontally — cheap in the wide column, tall in the sidebar. Entry-style sections (education, certifications, referees) are the opposite: narrow-column wrapping roughly doubles them. Swapping which column carries which section is the strongest one-page lever you have, and it costs no content edits.

## Converting an existing CV (PDF or export)

When the source is a designed PDF, extract before you transcribe — never retype from a screenshot:

```bash
pdftotext -layout original.pdf -   # read the text with its visual structure
pdfimages -png original.pdf img    # pull the photo; convert/rename to cv-content/images/profile.jpg
```

Transcribe **verbatim** into the nearest honest section — never relabel content under a heading that misrepresents it (a "Training / Courses" list belongs in `certifications.yaml` and will render as "Certifications"; that's an honest home with a different label, so tell the user about the rename). What the schema can't express, disclose instead of approximating silently: grouped skills flatten to one tag cloud, education details (GPA, specialization) fold into the `institution` string, a paragraph summary becomes bullets, inline bold is lost.

After the build, prove nothing was lost: extract the new PDF's text in **reading order** (`pdftotext` *without* `-layout` — layout mode interleaves the two columns and breaks phrases that wrap), normalize whitespace, and check that a few dozen distinctive strings from the original — every name, phone number, date, grade, URL — appear. Anything missing is either a wrap artifact (check the normalized text) or genuine loss; find out which before handing over.

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
- `referees.yaml`: list of `{name, title, company, email, phone}`, or `[]` to print "References available upon request." Modern guidance treats even that line as filler — offer to drop the section (a layout without the `referees` slot) and reclaim the space.
- `keywords.yaml` (optional): extra truthful ATS keywords not already covered by competencies/titles; embedded in PDF metadata, never printed.
- `config.yaml`: `schemaVersion: 1`, `theme` (`teal`|`coral`|`mono`), `layout` (`two-column`|`single-column`|custom filename). Pagination is automatic — the old page-1 keys were removed; if a legacy config still has them, validation says so and they are ignored.

## Variants

- Designed CV: `build` → two-column, photo sidebar, theme colours.
- Job-portal upload: `build --ats` (or `build_pdf` with `ats: true`) → single column, no colours, machine-friendly, `<name>-ats.pdf`.

## When validation fails

Report the findings to the user in plain language, apply the suggested fixes to the YAML, and re-validate. Unknown keys are typos more often than not — the findings include a "did you mean" suggestion. Do not build until validation passes.
