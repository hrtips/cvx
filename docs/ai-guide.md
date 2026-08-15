# Generating your CV with an AI assistant

CVX is designed to pair with LLMs: the content format is plain YAML with a small, documented schema, so any capable assistant — Claude, ChatGPT, Gemini, or a coding agent — can turn your existing CV, LinkedIn profile, or a rough brain-dump into polished `cv-content/` files. You review the facts, run one command, and get the PDF.

**If you're a person:** paste this into any AI chat, attach your CV or photo if you have them, and let the assistant take it from there:

```text
Create my CV with https://github.com/hrtips/cvx — open that page and follow its instructions for AI assistants.
Here is my LinkedIn profile: <your profile URL> (or attach your current CV and a photo instead).
```

**If you're the assistant:** the next section is your contract. The routes further down are reference detail — pick your own path from your capabilities; never ask the user to choose a route.

## Default flow (for assistants)

You drive; the user only supplies facts and runs at most one command. The schema for every content file is [cv-schema.md](https://raw.githubusercontent.com/hrtips/cvx/main/docs/cv-schema.md) — fetch it before writing any YAML.

### 1. Get truthful source content (first reply, one turn)

- **Given a linkedin.com URL: assume it is unfetchable, even for public profiles** — LinkedIn blocks automated access with a login wall. Do not retry, do not infer or reconstruct the profile from the URL or your training data. Ask once, batching everything you need:

  > *"I can't read LinkedIn directly — could you do one of these: (1) on LinkedIn, open your profile → **More → Save to PDF**, and attach that file here; (2) paste your profile text (select-all on your profile page works); or (3) attach your existing CV. Also attach a square photo (400×400px or larger) for the CV — or say 'no photo'. If you have a target job ad, paste it too and I'll tailor the wording."*

- **Given an attached CV (PDF/DOCX):** read it and proceed — never ask the user to paste what they already attached. If the format is unreadable, ask for a PDF re-save or pasted text.
- **Given neither:** interview the user section by section against the schema (personal → experience → education → the rest).
- **Never invent facts.** Every entry must be truthful to the user's input; ask for anything missing (dates, metrics). AI-embellished CVs fail interviews and background checks, and ATS parsers cross-check keywords against the CV body.
- **Flag conflicts, don't silently resolve them.** If the source contradicts itself (e.g. the headline says one current title and the summary another), surface it — pick the better-supported value for the draft, but tell the user what you chose and why they should confirm.

### 1b. Ask how it should read — once, with examples

Take a brief before you draft, the way a designer would. Fold it into the same first message as the source request, or ask right after — one batched question, with examples, so it is answerable by someone who has never thought about page layout:

> *"Before I draft: roughly how long should this be — one page, two, or as long as it needs? Anything to lead with or play down (recent roles, education, publications)? And is this aimed at a particular job — paste the ad and I'll angle the wording at it."*

Ask once. What comes back is **scope, not permission**: with a brief, tightening prose or trimming a section is work you were asked to do, rather than a decision to clear every time. Without one you will either over-ask or guess.

**The brief is the conversation, not a file.** There is no `preferences:` block and no brief file to write or keep in sync. Anything meant to outlast the session belongs in the user's notes or your client's memory, not in `cv-content/`.

### 1c. Keep your own history — CVX has none

CVX is stateless: no undo, no snapshots, no memory of the previous build, and the same question always gets the same answer. Every bit of continuity across iterations is yours to hold, so keep a short running list of what you changed, why, and what it did to the render.

That list is what lets you **backtrack** when an edit makes the page worse (you are the only thing that remembers the previous wording), **not re-litigate** a sentence the user has restored — that is direction, so leave it — and **report honestly at the end** on the whole session rather than the last step. Nothing in CVX bounds the loop either: stop when the page looks right and the user is satisfied, not at a fixed pass count, and never by iterating on numbers when you cannot see the render.

### 2. Pick your execution path (by your own capabilities)

1. **You have CVX MCP tools or the cvx skill** → use them: `get_schema` → `init_cv` → edit → `validate_cv` → `build_pdf`.
2. **You can run shell commands** → probe **once, with a bounded timeout, as your first action after getting source content**: `timeout 30s npx -y @hrtips/cvx --version` (use your runtime's timeout mechanism if `timeout` is unavailable). If it succeeds: `npx @hrtips/cvx init`, replace the example content, `npx @hrtips/cvx validate --strict --json` after every edit, `npx @hrtips/cvx build` and `build --ats`. Deliver the PDFs **and a zip of `cv-content/`** — sandboxes are ephemeral and the YAML is what the user keeps. If the probe fails or times out — any npm error means the same thing (403/404/429/503, proxy, DNS; sandboxes often have no npm network) — retry at most once, then **switch to path 3 in the same turn** and report the exact command, exit code, and error alongside the fallback. Do not keep the user waiting while you investigate.
3. **You can write files but not run CVX** → generate every `cv-content/` file from the schema, package the folder as a downloadable zip (or one fenced code block per file, titled with its exact path), then give the user the handoff below. Start each generated file with its `# yaml-language-server: $schema=https://raw.githubusercontent.com/hrtips/cvx/main/schema/v1/<file>.schema.json` header (layouts use `layout.schema.json`) so editors validate it. Use `main` **only** when you are writing these files from scratch, with no CVX installed — `cvx init` and `init_cv` instead pin the header to the release that scaffolded the folder (`.../cvx/v<version>/schema/v1/...`). If the folder already has pinned headers, copy that same ref into any file you add, and never rewrite an existing one back to `main`. **The CVX CLI is the only renderer — never substitute reportlab, LaTeX, HTML-to-PDF, or any other generator.** The whole point is a validated, reproducible format the user keeps.

**No research sinks:** this guide plus [cv-schema.md](https://raw.githubusercontent.com/hrtips/cvx/main/docs/cv-schema.md) are everything you need — once you have them and the user's source content, generate; further repository exploration adds nothing to the CV.

### 3. Review, brainstorm, and preview — before any build

- **Review the draft's content**, not just its validity: grammar and prose (verb-first bullets, consistent tense — past for former roles, present for the current one), and **gaps** — missing dates, roles without outcomes or metrics, thin descriptions, sections the source hints at but the draft lacks (certifications, publications, languages). Turn the gaps into 3–5 targeted questions **batched into one message**; fix unambiguous prose issues silently and list notable rewrites.
- **Show what's going in before you build.** Give the user a plain-language rundown of exactly what the CV will contain — each section with its entries (roles with periods, and what lands on page 1), referees or "available upon request", which keywords go into the invisible ATS metadata, plus theme/layout/photo status — and get their OK. Summarize the YAML; don't dump it. Nothing appears on the CV that the user hasn't seen.
- A truthful thin bullet beats an embellished one — never pad with invented metrics.

### 4. The handoff (relay verbatim when the user must run the build)

> 1. Install Node.js (LTS) from **https://nodejs.org** — standard installer, click through. (Already have it? `node --version` should show 20+.)
> 2. Save my files into a folder named exactly `cv-content` (keep the filenames). If you have a photo, put it inside `cv-content/images/` named `profile.jpg`.
> 3. Open a terminal in the folder that *contains* `cv-content` — Windows: Shift+right-click the folder → "Open PowerShell window here"; Mac: right-click it in Finder → Services → New Terminal at Folder — and run: `npx @hrtips/cvx build`
> 4. Your PDF appears in that folder. If you see errors, paste them back to me.

`init` is a convenience, not a prerequisite — `build` renders any `cv-content/` folder with valid YAML; built-in themes and layouts need no extra files.

### 5. Photo and delivery rules

- Ask for the photo in your **first** reply (batched into the source-content ask) — it cannot be generated. No photo is fine: the CV renders cleanly without one; don't block on it.
- **Placeholder trap:** `init` scaffolds Bruce Wayne's example photo at `cv-content/images/profile.jpg`. Replace it with the user's photo or delete it before building — never ship it.
- If validation reports problems, apply the suggested fixes and re-validate before building; findings include the file, field path, and a fix.
- Deliver both variants when the user is applying via portals: the designed CV and the `--ats` single-column one.
- **Keep earlier roles as separate entries** (one bullet each is fine) rather than merging them into a single "earlier roles" entry — ATS keyword derivation reads `role` and `progression` titles, not bullet prose, so merged titles disappear from the keyword metadata.
- For reproducible re-builds later, you may pin the version you tested (`npx -y @hrtips/cvx@<version>`); content files never break within a schema major, but pinning also freezes the visual output.

---

Pick the route that matches the tool you have (reference — assistants use the default flow above):

| You have | Route | Friction |
|---|---|---|
| A coding agent (Claude Code, Cursor, Copilot, Codex…) | [Route A](#route-a--coding-agent-lowest-friction) | Lowest — the agent edits files and builds the PDF itself |
| A chat assistant with web access | [Route B](#route-b--chat-assistant-with-web-access) | One paste in, files out |
| A chat assistant without web access | [Route C](#route-c--chat-assistant-self-contained-prompt) | Same, using a self-contained prompt |
| An agent-mode assistant that can run commands (ChatGPT agent mode, …) | [Route D](#route-d--agent-mode-assistant-zero-local-setup) | Zero local setup — the assistant runs CVX in its own workspace |
| An MCP client (Claude Desktop, Claude Code, Cursor, VS Code, …) | [Route E](#route-e--mcp-any-client-native-tools) | One-time config — the client gets native CVX tools |

Whichever route you take, the same two rules apply:

> **Truthfulness** — tell the assistant to keep every fact from your input and invent nothing. AI-embellished CVs fail interviews and background checks; CVX's ATS keywords are also cross-checked by parsers against the CV body.
>
> **Review** — read every generated file before you send the PDF anywhere. You own what it says.

---

## Route A — coding agent (lowest friction)

Works with Claude Code, Cursor, Windsurf, Copilot Workspace, Codex CLI — anything that can edit files and run commands.

```bash
mkdir my-cv && cd my-cv
npx @hrtips/cvx init
```

Then give your agent a prompt like:

```text
Replace the example content in cv-content/ with my real CV.
The schema is documented in cv-content/README.md — follow it exactly,
keep every fact truthful to my input, and don't invent anything.
When done, run `npx @hrtips/cvx build` and fix any YAML errors until it renders.

My details:
<paste your old CV / LinkedIn text / notes here — or point the agent at a file, e.g. "read ~/Downloads/old-cv.pdf">
```

The scaffolded `cv-content/README.md` ships the full schema, so the agent needs no internet access and no further instructions. It will edit the YAML, build, and hand you `<your-name>.pdf`. Iterate in plain language: *"tighten the bullets for the 2019 role"*, *"this page looks thin — fix it"*, *"switch to the coral theme"*. Length is a content conversation, not a setting: there is no config key that makes a CV shorter (see *Reading the layout* below).

Finish by dropping your photo at `cv-content/images/profile.jpg` (square, 400×400px+) and rebuilding.

## Route B — chat assistant with web access

For Claude, ChatGPT, or any assistant that can fetch a URL. Paste this, then your CV text:

```text
Read the CVX content schema at
https://raw.githubusercontent.com/hrtips/cvx/main/docs/cv-schema.md
then convert my CV below into CVX cv-content/ YAML files.

Rules:
- Output each file as its own fenced code block, titled with its filename.
- Keep every fact truthful to my input — don't invent numbers, dates, or achievements.
- Quote YAML strings that contain colons.
- Skip files I have no content for (they're optional).

My CV:
<paste your old CV / LinkedIn profile text here>
```

Then on your machine:

```bash
mkdir my-cv && cd my-cv
npx @hrtips/cvx init                      # scaffolds the folder structure
# overwrite the example files with the assistant's output
npx @hrtips/cvx build
```

Tip: instead of retyping, export your LinkedIn profile (Profile → More → Save to PDF) and paste its text, or paste the text of your old CV.

## Route C — chat assistant, self-contained prompt

No web access needed — the schema is embedded. Paste this whole block, then your CV text:

```text
Convert my CV below into YAML files for CVX (a tool that renders
cv-content/*.yaml into a PDF). Output each file as its own fenced code
block titled with its filename. Keep every fact truthful to my input —
don't invent numbers, dates, or achievements. Quote YAML strings that
contain colons. Skip optional files I have no content for.

The files and their exact fields:

- personal.yaml (object): name (required), title, company,
  phone + phoneHref (e.g. "tel:+123..."), email, linkedin + linkedinHref,
  location, links (optional list of {label, href} for a blog/portfolio;
  label optional, falls back to the URL). Only these keys render.
- summary.yaml: list of 3-6 single-sentence bullet strings.
- experience.yaml: list of roles, most recent first. Per entry:
  role (required), company, period (free text like "2019 – Present"),
  location (optional), description (optional one-line italic),
  progression (optional list of {title, period} for promotions within
  the role), bullets (list of verb-first, quantified impact statements).
- education.yaml: list of {degree, institution, period}.
- certifications.yaml: list of {name, issuer, year}; only name required.
- publications.yaml: list of {title, venue, year}; only title required.
- languages.yaml: list of {language, proficiency}; proficiency is free text.
- competencies.yaml: list of 6-12 short skill strings (1-3 words each).
- achievements.yaml: list of {year, text} where year is the award name
  (bold headline) and text is the attribution like "— 2024, Organisation".
- referees.yaml: list of {name, title, company, email, phone},
  or [] for "available upon request".
- keywords.yaml (optional): flat list of extra ATS keywords that are
  truthful but not already in my competencies or job titles.
- config.yaml: schemaVersion: 1, theme: teal | coral | mono,
  layout: two-column | single-column.

My CV:
<paste your old CV / LinkedIn profile text here>
```

Save the output files into `cv-content/` (after `npx @hrtips/cvx init` for the folder structure and photo placeholder), then check and render:

```bash
npx @hrtips/cvx validate    # exact errors with file + field paths and fixes
npx @hrtips/cvx build
```

If validate reports problems, paste its output back to the assistant — the findings include the file, the field path, and a suggested fix, so one round trip usually resolves everything.

## Route D — agent-mode assistant, zero local setup

If your assistant can execute commands in a workspace (e.g. ChatGPT's agent mode), you don't need anything installed locally — not even Node. Paste:

```text
In your workspace, install Node if needed, then run:
  npx @hrtips/cvx init
Replace the example content in cv-content/ with my CV below, following
the schema in cv-content/README.md. Keep every fact truthful to my
input — don't invent anything. Then run:
  npx @hrtips/cvx build
and give me BOTH the finished PDF AND a zip of the cv-content folder
as downloads. I need the zip to keep my content for future updates.

My CV:
<paste your old CV / LinkedIn profile text here>
```

The zip matters: agent workspaces are ephemeral, and your `cv-content/` folder is the durable asset. Next time, upload the zip back (or switch to any other route) and ask for the changes you need.

**Privacy note:** CVX itself runs entirely locally and makes zero network calls — but in Route D (and any cloud assistant route) your CV content is processed on the assistant vendor's infrastructure, subject to their terms. If you want your data to never leave your machine, use Route A/C with a local model (e.g. via Ollama) or write the YAML yourself.

---

## Route E — MCP: any client, native tools

CVX ships an MCP stdio server with five tools — `get_schema`, `init_cv`, `validate_cv`, `build_pdf`, `plan_layout` — thin wrappers over the same engine as the CLI. No API keys, fully offline; the server's instructions teach the model the loop and the truthfulness rules.

One-time setup (writes/merges the client's config, never clobbers other servers):

```bash
npx @hrtips/cvx mcp init --client claude          # Claude Code
npx @hrtips/cvx mcp init --client claude-desktop  # Claude Desktop
npx @hrtips/cvx mcp init --client cursor          # Cursor
npx @hrtips/cvx mcp init --client vscode          # VS Code
```

Restart the client, then ask for your CV — e.g. *"Make me a CV from the LinkedIn text below. Use the CVX tools: fetch the schema, scaffold, fill in my real details, validate after every edit, and build both variants."* The assistant passes your workspace folder as `dir` on each call; the YAML lands in `cv-content/`, the PDFs next to it.

## Iterating with the assistant

Useful follow-up prompts once the first PDF renders:

- *"Rewrite the experience bullets to emphasise leadership / data engineering / customer impact."* (retargeting for a specific job ad — paste the ad)
- *"It overflows page 2 — trim the two oldest roles to 2 bullets each."*
- *"Open the PDF and tell me what looks wrong on page 2."*
- *"Generate keywords.yaml for this job description, using only skills I actually list."*
- *"Produce the ATS variant too"* → `npx @hrtips/cvx build --ats` for job portals.

## Reading the layout

**Open the PDF and look at it.** `build_pdf` returns an absolute `path`, and most assistant clients render PDFs natively. Do that first: the defects that matter most — a stranded heading, a page that ends early, a column left near-empty — appear in no diagnostic field at all. A client that genuinely cannot open a PDF should build once and hand off, not iterate on numbers alone.

Measurements complement looking, they don't replace it. The MCP `plan_layout` tool (a dry run — no PDF written) and the `diagnostics` block in `build --json` / `build_pdf` report how the CV paginated.

Per page: how full each column is (`main.fill` / `sidebar.fill` — occupancy, `(fixed + used) / capacity`), why the next block could not start there (`blockedBy`, with `shortByPt` — what an edit would need to free), which roles landed there (with company and period, so two same-titled roles stay apart), which sidebar sections and which of their items, and `overflowPt`. Plus `diagnostics.warnings`, the named conditions — each with a `code` to match on (`overflow` and `page1-no-experience` are defects; `page1-ends-early` is a priced fact that fires on healthy CVs too, carrying the `shortByPt` that turns "make page 1 fuller" into an exact edit; `main-slot-unmeasured` is a fact saying the layout puts a section the planner does not measure in a main column, so these numbers exclude it; and `physical-pages-exceed-plan` is a build-only defect meaning the finished PDF has more sheets than the plan numbered — a dry run can never report it, so a clean plan is not proof of a clean PDF) rather than wording — and `notices`, a separate plain-text list of notes about the run.

Five things worth knowing before you act on any of it:

- **It describes the designed variant only.** The ATS/single-column PDF is auto-flowed by react-pdf and never packed, so it has no plan and its sheet count can differ. There is no dry run for it.
- **`totalPages` is planned pages, not sheets.** A page that overflows spills onto an extra physical sheet the numbering can't count — check `totals.overflowPt` before quoting a page count.
- **`fill` is column occupancy, and it is not a progress signal.** `(fixedPt + usedPt) / capacityPt` (`diagnostics.version: 2`) — the same measurement on every page, so page 1 and page 2 compare honestly. Above 1 exactly when the page is over budget, always alongside `overflowPt` and a warning. Never steer an edit by it: shortening content LOWERS fill until a block moves up, then it jumps (measured: six of eight shortening edits on a real CV lowered it before one worked). The number that moves monotonically with your edit is `blockedBy.shortByPt`.
- **Ranges are 0-based and end-exclusive.** `range: [6, 8)` of `of: 8` is the last two items; `items` already carries the count. Experience entries decompose the same way (`bulletRange` / `bullets` / `ofBullets`).
- **`emptyColumn` is a diagnostic, not a target** — and it means "no packed blocks in that column", not "blank": page 1 can report `emptyColumn: 'main'` and still carry the summary. A final page whose sidebar outlasts the experience list is normal. CVX was measured against a packer tuned to eliminate those, and the result was worse CVs — sections fragmented across five pages, headings with a single bullet under them. Report the number; don't optimise it. The exception is page 1 with no roles on it, which is a real defect and arrives as its own `page1-no-experience` warning.
- **There are no layout levers, so nothing changes between two `plan_layout` calls.** The layout follows the content. If the CV is longer than the user wants, that is a content decision: **never drop content to fit** — surface the trade-off (*"we could drop publications, or trim the two oldest roles to 2 bullets — which would you prefer?"*) and let them choose what goes. Once they've chosen, making the edit is your job; report what you changed as you change it. Don't promise a page count for an edit you haven't planned: cuts don't map to pages the way they look like they should, because sidebar and main are independent flows and the page count is the longer of them — so removing main-column text can leave the total untouched. Make the edit, then re-plan. CVX renders 100% of the YAML and never clips or hides text to save a page.

## For AI assistants reading this

If you are the assistant: fetch the full schema at [docs/cv-schema.md](cv-schema.md) when you can (it includes render behaviour, defaults, and a worked example per file); otherwise the compact schema in Route C is sufficient and accurate. Machine index: [llms.txt](../llms.txt). Never fabricate facts; ask the user for anything missing (dates, metrics, photo).
