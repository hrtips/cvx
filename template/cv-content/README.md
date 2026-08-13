# Your CV content

Everything in this folder is Bruce Wayne's CV — working starter content for you to replace. Run `npx @hrtips/cvx build` right now to see the finished PDF, then swap his details for yours one file at a time and rebuild to see each change land.

| File | What it controls |
|---|---|
| `personal.yaml` | Name, title, company, and the contact block (phone, email, LinkedIn, extra `links`) |
| `summary.yaml` | The bullet list at the top of page 1 |
| `experience.yaml` | Work history — one entry per role; `progression:` is an optional title history, `bullets:` are your impact points |
| `education.yaml` | Degrees, institutions, years |
| `certifications.yaml` | Professional certifications — name, issuer, year |
| `publications.yaml` | Publications and written work — title, venue, year |
| `languages.yaml` | Languages spoken and proficiency |
| `competencies.yaml` | Skill pills in the sidebar |
| `achievements.yaml` | Awards and recognitions (sidebar) |
| `referees.yaml` | Referee contacts — set to `[]` to print "available upon request" |
| `keywords.yaml` | Extra ATS/AI-parser keywords embedded in PDF metadata (optional; keep them truthful) |
| `config.yaml` | Theme (`teal` / `coral` / `mono`), layout, and page-1 pagination |
| `images/profile.jpg` | Your photo — square, 400×400px+; `jpg`, `jpeg`, `png`, or `webp` all work |

## The workflow

```bash
# edit any file above, then:
npx @hrtips/cvx build          # designed two-column PDF
npx @hrtips/cvx build --ats    # plain single-column PDF for job portals
npx @hrtips/cvx build --all    # validate, then build both variants in one step
```

The output PDF is named after `personal.yaml`'s `name` (e.g. `bruce-wayne.pdf` — it'll switch to your name automatically).

## Tips

- Delete what you don't need: an empty file (or `[]`) simply drops that section.
- Start with `experience.yaml` — it's the bulk of the CV and the structure is self-explanatory once you see Bruce's entries next to the built PDF.

## Schema reference (for tools & AI assistants)

If you are an AI assistant replacing this example content with the user's real CV: keep every fact truthful to their input, write valid YAML (quote strings containing colons), and use these exact fields — unknown keys are ignored.

- **personal.yaml** (object): `name` (required — also names the output PDF), `title`, `company`, `phone` + `phoneHref`, `email` (auto-`mailto:`), `linkedin` + `linkedinHref`, `facebook` + `facebookHref`, `location`, `links` (list of `{label, href}` for blog/portfolio/GitHub; `label` optional, falls back to the URL). Contact rows render only for keys present.
- **summary.yaml**: list of strings (3–6 single-sentence bullets).
- **experience.yaml**: list of entries, most recent first — `role` (required), `company`, `period` (free text, e.g. `2005 – Present`), `location` (optional), `description` (optional italic one-liner), `progression` (optional list of `{title, period}` for promotions), `bullets` (list of strings; verb-first, quantified, truthful).
- **education.yaml**: list of `{degree, institution, period}`.
- **certifications.yaml**: list of `{name, issuer, year}` — only `name` required; kept separate from achievements.
- **publications.yaml**: list of `{title, venue, year}` — only `title` required.
- **languages.yaml**: list of `{language, proficiency}` — `proficiency` is free text (Native, Professional, …).
- **competencies.yaml**: list of short strings (1–3 words; rendered as pills).
- **achievements.yaml**: list of `{year, text}` — `year` is the bold headline (usually the award name), `text` the attribution, e.g. `"— 2024, Gotham Gazette"`.
- **referees.yaml**: list of `{name, title, company, email, phone}`, or `[]` for "available upon request".
- **keywords.yaml** (optional): flat list, or map of group → list (groups are flattened). PDF-metadata only; competencies and job titles are auto-derived, so list only what those miss — truthful terms only.
- **config.yaml**: `theme` (`teal`|`coral`|`mono`), `layout` (`two-column`|`single-column`|custom layout filename), `atsKeywords: {enabled, autoDerive, max}`.
- **layouts/*.yaml** (optional): `template` + `pages: {first, continuation, last}`, each with `sidebar`/`main` lists of section keys (`identity-photo`, `identity-compact`, `contact`, `achievements`, `education`, `certifications`, `publications`, `languages`, `competencies`, `referees`, `summary`, `experience`, `experience:continued`, `header-ats`, `spacer: N`). The three **sidebar** lists are concatenated into one ordered flow and paginated by measurement — `last.sidebar: [referees]` means "referees comes last in the sidebar", not "referees renders on the last page". The **main** lists stay per-page-kind.
- **images/profile.<ext>**: square photo ≥400×400px; `jpg`/`jpeg`/`png`/`webp` (that precedence). Ask the user to supply it — don't fabricate.

Full schema with examples: https://github.com/hrtips/cvx/blob/main/docs/cv-schema.md

Full docs: https://github.com/hrtips/cvx#readme
