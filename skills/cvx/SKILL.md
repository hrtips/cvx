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

If the CVX MCP server is connected, use its tools: `get_schema` → `init_cv` → edit YAML → `validate_cv` → `build_pdf` (pass the workspace folder as `dir`, absolute path). Otherwise use the CLI:

```bash
npx @hrtips/cvx init                      # scaffold cv-content/ with a complete example CV
npx @hrtips/cvx validate --strict --json  # every problem at once: file + field paths + fixes
npx @hrtips/cvx build --json              # writes <name>.pdf; add --ats for the ATS-safe variant
npx @hrtips/cvx list --json               # available themes and layouts
```

Exit codes: `0` ok · `2` validation failed · `3` render failed · `64` usage error. With `--json`, stdout is exactly one JSON object; logs go to stderr.

Always validate after every edit and before every build. Findings include the file, the field path, and a suggested fix — apply the fix and re-validate.

If `npx` is unreachable (no network in your sandbox), write the `cv-content/*.yaml` files from the schema and deliver them with the handoff from the [AI guide's default flow](https://raw.githubusercontent.com/hrtips/cvx/main/docs/ai-guide.md) — never substitute another PDF renderer. A linkedin.com URL is unfetchable even when public: ask for the profile's **More → Save to PDF** export or pasted text instead of inferring.

## Review, then brainstorm — before the final build

After converting the user's material into YAML (and passing validation), review the *content* and bring your findings to the user as a short brainstorm — never silently ship the first draft:

1. **Grammar and prose.** Strong action verbs, verb-first bullets (*managed*, *shipped*, *cut* — not *responsible for*); consistent tense (past for former roles, present for the current one); no typos, no filler words; quantify only where the source supports it. Translate insider jargon into plain-language impact a non-specialist recruiter understands. Fix what's unambiguous silently; list notable rewrites for the user to approve.
2. **Gaps and quality.** Missing dates, roles with no outcomes or metrics, thin one-line descriptions, unexplained employment gaps, an unprofessional email address (flag it, suggest `first.last@…`), a `competencies` list that is all hard or all soft skills (aim for a truthful mix, weighted to the target role), and sections the source hints at but the draft lacks (certifications, publications, languages). Turn these into **3–5 targeted questions, batched into one message** — e.g. *"Your CEO role lists no outcomes — any truthful numbers on users, revenue, or funding? And your LinkedIn mentions three publications; want them on the CV?"*
3. **Conflicts.** Contradictory titles or dates between sources — present both options and ask which is correct; never pick silently.

4. **Pre-build preview.** Before calling `build_pdf` (or running `build`), show the user a plain-language rundown of exactly what the CV will contain and get their OK: each section with its entries — roles with companies and periods (and which land on page 1), education, the competency pills, achievements, referees or *"available upon request"*, which keywords go into the (invisible) ATS metadata — plus the theme, layout, and photo status. Summarize the YAML; don't dump it. Nothing goes on the CV the user hasn't seen.

Apply the answers, re-validate, then build both variants. A truthful thin bullet always beats an embellished one — never pad with invented metrics.

## Tailoring to a job posting

If the user gives you a target job description, tailor **truthfully** — never invent experience to match it:

- Mirror the posting's own wording for skills and duties the user genuinely has; recruiters and ATS match on exact terms. Add real, posting-relevant skills to `competencies.yaml` and truthful terms to `keywords.yaml`.
- Lead with and expand the experience bullets most relevant to the role; keep the rest but trim them.
- Point `summary.yaml` at the target role.
- Recent graduate or career-changer with thin experience: make `education.yaml` and `competencies.yaml` do more of the work, and keep the experience section tight.

Keep the base `cv-content/` intact and tailor a copy — the durable YAML is reusable for the next application.

## Rules that are not optional

1. **Never invent facts.** Every entry must be truthful to the user's real history. This matters most for `keywords.yaml`: ATS parsers cross-check keywords against the CV body, and stuffing false terms gets CVs auto-rejected.
2. **Don't rename the YAML files.** Sections are discovered by filename: `personal.yaml`, `summary.yaml`, `experience.yaml`, `education.yaml`, `competencies.yaml`, `achievements.yaml`, `referees.yaml`, `keywords.yaml`, `config.yaml`.
3. **Quote strings containing colons** (`"Director: Operations"`). Date ranges are free text (`2019 – Present`).
4. The photo goes at `cv-content/images/profile.jpg` (or `.jpeg`/`.png`/`.webp`) — ask the user for it; it cannot be generated.

## Content files (summary — the schema is authoritative)

Every scaffolded file carries a `$schema` header; the canonical JSON Schema lives at `schema/v1/` in the repo and is returned by the MCP `get_schema` tool.

- `personal.yaml` (object): `name` (required — drives the output filename), `title`, `company`, `phone`+`phoneHref`, `email`, `linkedin`+`linkedinHref`, `facebook`+`facebookHref`, `location`.
- `summary.yaml`: list of 3–6 single-sentence bullets. A bullet may also be `{text, link: {href, label}, suffix}` to embed a clickable link (same form works in experience bullets).
- `experience.yaml`: list of roles, most recent first — `role` (required), `company`, `period`, `location`, `description`, `progression` (list of `{title, period}`), `bullets` (verb-first, quantified, truthful).
- `education.yaml`: list of `{degree, institution, period}`.
- `competencies.yaml`: 6–12 short skill strings.
- `achievements.yaml`: list of `{year, text}` — `year` is the bold headline (often the award name), `text` the attribution.
- `referees.yaml`: list of `{name, title, company, email, phone}`, or `[]` to print "References available upon request." Modern guidance treats even that line as filler — offer to drop the section (a layout without the `referees` slot) and reclaim the space.
- `keywords.yaml` (optional): extra truthful ATS keywords not already covered by competencies/titles; embedded in PDF metadata, never printed.
- `config.yaml`: `schemaVersion: 1`, `theme` (`teal`|`coral`|`mono`), `layout` (`two-column`|`single-column`|custom filename); pagination keys only if page 1 overflows.

## Variants

- Designed CV: `build` → two-column, photo sidebar, theme colours.
- Job-portal upload: `build --ats` (or `build_pdf` with `ats: true`) → single column, no colours, machine-friendly, `<name>-ats.pdf`.

## When validation fails

Report the findings to the user in plain language, apply the suggested fixes to the YAML, and re-validate. Unknown keys are typos more often than not — the findings include a "did you mean" suggestion. Do not build until validation passes.
