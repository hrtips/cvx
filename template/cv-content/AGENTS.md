# Working with this cv-content/ folder

This folder is [CVX](https://github.com/hrtips/cvx) content: YAML in, pixel-perfect CV PDF out. Everything runs locally.

## The loop

```bash
npx @hrtips/cvx validate --strict --json   # machine-readable findings, exit 2 on any problem
npx @hrtips/cvx build --json               # writes <name>.pdf, prints {filename, bytes, theme, layout}
```

Edit → validate → build. Always validate before building; it reports every problem at once with file + field paths and suggested fixes.

## Contract

- Exit codes: `0` ok · `2` validation failed · `3` render failed · `64` usage error.
- With `--json`, stdout is exactly one JSON object; logs go to stderr.
- `npx @hrtips/cvx list --json` shows available themes and layouts.
- Every file here carries a `# yaml-language-server: $schema=…` header — the JSON Schema is the authoritative contract for keys and shapes. Full field reference: [docs/cv-schema.md](https://github.com/hrtips/cvx/blob/main/docs/cv-schema.md).

## Rules

1. **Never invent facts.** Every entry must be truthful to the person's real history. This especially matters for `keywords.yaml` — ATS parsers cross-check keywords against the CV body, and stuffing gets CVs auto-rejected. A linkedin.com URL is unfetchable even when public — ask for the profile's **More → Save to PDF** export or pasted text instead of inferring.
2. **Don't rename the YAML files.** Sections are discovered by filename (`personal.yaml`, `summary.yaml`, `experience.yaml`, `education.yaml`, `competencies.yaml`, `achievements.yaml`, `referees.yaml`, `keywords.yaml`, `config.yaml`).
3. **Quote strings containing colons** (`"Director: Operations"`). Date ranges are free text (`2019 – Present`).
4. The profile photo goes at `images/profile.jpg` (or `.jpeg`/`.png`/`.webp`) — ask the user for it early; it can't be generated. The scaffolded `images/profile.jpg` is Bruce Wayne's example photo: replace it with the user's or delete it before building (the CV renders fine without one).
5. `config.yaml` usually needs only `theme` + `layout`; add pagination keys only if page 1 overflows.
6. **Review, then preview, then build.** After drafting: check grammar/prose (verb-first bullets, consistent tense) and gaps (missing dates, metrics, certifications/publications/languages the source mentions), and bring findings to the user as a few batched questions. Before building, show a plain-language rundown of everything the CV will contain — sections, entries, page-1 split, ATS keywords, theme/photo — and get an OK. Nothing ships that the user hasn't seen; never pad with invented metrics.
