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
- `referees.yaml`: list of `{name, title, company, email, phone}`, or `[]` for "available upon request".
- `keywords.yaml` (optional): extra truthful ATS keywords not already covered by competencies/titles; embedded in PDF metadata, never printed.
- `config.yaml`: `schemaVersion: 1`, `theme` (`teal`|`coral`|`mono`), `layout` (`two-column`|`single-column`|custom filename); pagination keys only if page 1 overflows.

## Variants

- Designed CV: `build` → two-column, photo sidebar, theme colours.
- Job-portal upload: `build --ats` (or `build_pdf` with `ats: true`) → single column, no colours, machine-friendly, `<name>-ats.pdf`.

## When validation fails

Report the findings to the user in plain language, apply the suggested fixes to the YAML, and re-validate. Unknown keys are typos more often than not — the findings include a "did you mean" suggestion. Do not build until validation passes.
