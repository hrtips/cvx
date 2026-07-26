# CVX content schema — complete reference

This document is self-contained: with only this file and a person's CV facts, you can generate a complete, valid `cv-content/` folder for [CVX](https://github.com/hrtips/cvx). It is written for both humans and AI assistants.

## How CVX works

- `npx @hrtips/cvx init` scaffolds `cv-content/` with a complete example CV (Bruce Wayne's).
- `npx @hrtips/cvx validate` checks every file at once and reports exact errors with suggested fixes (`--strict` also fails on unknown keys, `--json` for machine-readable output; exit `0` ok / `2` problems found). Run it after every edit.
- `npx @hrtips/cvx build` renders `cv-content/` to a PDF in the current directory.
- `npx @hrtips/cvx build --ats` renders an ATS-safe single-column variant instead.
- Every content file is validated against the [canonical JSON Schema](../schema/v1/cvx.schema.json); the scaffolded files carry `$schema` headers for editor autocomplete.
- The output PDF is named from `personal.yaml`'s `name`: lowercased, spaces → hyphens (`Bruce Wayne` → `bruce-wayne.pdf`; the ATS variant appends `-ats`).
- Every `.yaml` file in `cv-content/` is auto-discovered by filename. A missing file, an empty file, or `[]` simply drops that section from the CV — no error. (Required in practice: `personal.yaml`, `summary.yaml`, `experience.yaml` — `validate` checks this.)
- `init` is a convenience, not a prerequisite — `build` renders any `cv-content/` folder with valid YAML; built-in themes and layouts need no extra files. A missing photo renders fine (the sidebar simply omits it).
- All rendering is local; no network calls, no accounts.

## YAML rules that matter here

- Quote any string containing a colon (`"Director: Operations"`) or starting with a special character.
- Periods/date ranges are free text — the convention in the example content is an en-dash: `2005 – Present`, `Jan 2022 – Dec 2023`.
- Do not invent facts. Every entry must be truthful to the source CV; this especially matters for `keywords.yaml` (ATS parsers cross-check keywords against body text).

---

## File: `personal.yaml` (object)

Identity header + contact block. Only the keys listed here render — arbitrary extra keys are ignored.

| Key | Type | Required | Renders |
|---|---|---|---|
| `name` | string | **yes** | Header name; also derives the output filename |
| `title` | string | recommended | Job title line under the name |
| `company` | string | optional | Company line under the title |
| `phone` | string | optional | Contact row (phone icon) |
| `phoneHref` | string | optional | Makes the phone row clickable, e.g. `"tel:+12015552283"` |
| `email` | string | optional | Contact row (envelope icon); clickable automatically via `mailto:` |
| `linkedin` | string | optional | Contact row (LinkedIn icon), display text e.g. `linkedin.com/in/brucewayne` |
| `linkedinHref` | string | optional | Makes the LinkedIn row clickable (full URL) |
| `facebook` | string | optional | Contact row (Facebook icon) |
| `facebookHref` | string | optional | Makes the Facebook row clickable |
| `location` | string | optional | Contact row (pin icon), e.g. `"Gotham City, USA"` |

Contact rows appear only for keys that are present. The ATS layout's header uses `phone`, `email`, `linkedin`, `location` (not `facebook`).

```yaml
name: Bruce Wayne
title: Founder & Field Commander – Gotham Operations
company: Wayne Enterprises
phone: "+1 (201) 555-2283"
phoneHref: "tel:+12015552283"
email: bruce.wayne@wayne-enterprises.com
linkedin: linkedin.com/in/brucewayne
linkedinHref: "https://www.linkedin.com/in/brucewayne"
```

## File: `summary.yaml` (list of bullets)

The professional-summary bullets at the top of page 1. Aim for 3–6 bullets, each a single sentence focused on scope, specialisation, or headline achievements.

```yaml
- "Strategic operations leader with 20+ years' experience, progressing from solo field operative to Field Commander of a citywide security network."
- "Specialised in recruiting and developing elite field talent."
```

A bullet is usually a plain string, but any bullet (here or in `experience[].bullets`) may instead be an object embedding a clickable link: `text` (before the link), `link` — an object of `href` + `label` (the clickable part) — and optional `suffix` (after it):

```yaml
- text: "Published the "
  link: { href: "https://example.com/report", label: "annual security report" }
  suffix: " read by 40k+ practitioners."
```

## File: `experience.yaml` (list of entries)

Work history, most recent first. Keep each role its own entry — ATS keywords are auto-derived from `role` and `progression` titles, so roles merged into one "earlier roles" entry (or mentioned only in bullet text) drop out of the keyword metadata. Older roles can simply carry fewer bullets. Per entry:

| Key | Type | Required | Renders |
|---|---|---|---|
| `role` | string | **yes** | Bold role headline |
| `company` | string | recommended | Left side of the meta line |
| `period` | string | recommended | Right side of the meta line, free text |
| `location` | string | optional | Muted line under the meta line |
| `description` | string | optional | One-line italic company/role description |
| `progression` | list of `{title, period}` | optional | Indented title-history block (promotions within the role) |
| `bullets` | list of bullets | optional | Impact bullets — start with a verb, quantify where truthful; 3–6 per recent role, fewer for older ones. Plain strings, or the `{text, link, suffix}` object form (see `summary.yaml`) |

```yaml
- role: Founder & Field Commander – Gotham Operations
  company: The Batman
  period: 2005 – Present
  description: Self-directed vigilante operation safeguarding Gotham City.
  progression:
    - title: Commander, Batman Incorporated
      period: 2011 – Present
    - title: Solo Operative, The Dark Knight
      period: 2005 – 2008
  bullets:
    - Established and scaled a citywide security operation from a solo initiative to a franchised network.
    - Reduced organised-crime activity in Gotham by an estimated 60% through data-driven surveillance.
```

## File: `education.yaml` (list of entries)

Most recent first. Per entry: `degree` (string), `institution` (string), `period` (string).

```yaml
- degree: BSc, Criminology & Chemistry
  institution: Gotham University
  period: 1994 – 1998
```

## File: `competencies.yaml` (list of strings)

Skill tags rendered as pills in the sidebar. Keep each 1–3 words; 6–12 items reads best.

```yaml
- Strategic Planning
- Criminal Investigation
- Crisis Response
```

## File: `achievements.yaml` (list of entries)

Awards and recognitions. Field names are historical: `year` is the **bold headline** (usually the award name, not a year), `text` is the muted attribution line, conventionally `"— Year, Awarding Organisation"`.

```yaml
- year: Key to the City
  text: "— Office of the Mayor, Gotham City"
```

## File: `referees.yaml` (list of entries, or `[]`)

Per entry: `name`, `title`, `company`, `email`, `phone` (all strings). An explicit empty list `[]` prints "available upon request".

```yaml
- name: Diana Prince
  title: Founding Member, Justice League
  company: Themysciran Embassy
  email: d.prince@justiceleague.org
  phone: "+1 (202) 555-0177"
```

## File: `keywords.yaml` (optional; list of strings, or map of group → list)

Extra ATS/AI-parser keywords embedded in the PDF's `Keywords` metadata field (never printed on the page). Competencies and job titles are auto-derived already, so list only what those don't cover. Groups are flattened; headings are not printed. **Keep every keyword truthful to the CV body.**

```yaml
- Operations Management
- Risk Management
# or grouped:
Leadership: [Executive Leadership, Team Building]
```

## File: `config.yaml` (object)

| Key | Type | Default | Meaning |
|---|---|---|---|
| `schemaVersion` | integer | `1` | Content schema major version — content files never break within a major |
| `theme` | `teal` \| `coral` \| `mono` | `teal` | Colour scheme (`mono` is black-and-white, ATS-optimised) |
| `layout` | `two-column` \| `single-column` \| custom layout filename | `two-column` | Page structure |
| `page1ExperienceCount` | integer | auto | Experience entries on page 1 — entry N+1 starts page 2. If the count doesn't fit, `validate`/`build` warn and the overflow is clipped; automatic packing (omit the key) never overflows |
| `page1SplitBullets` | integer | off | Show only N bullets of page 1's last entry; the rest continue on page 2 |
| `atsKeywords.enabled` | boolean | `true` | Master switch for keyword metadata |
| `atsKeywords.autoDerive` | boolean | `true` | Also derive keywords from competencies + job titles |
| `atsKeywords.max` | integer | all | Cap on embedded keywords (body-derived terms kept first) |

## File: `images/profile.<ext>`

Square photo, 400×400px or larger. Extensions auto-detected in precedence order: `jpg`, `jpeg`, `png`, `webp` (case-insensitive). Used by the two-column layout; the ATS variant has no photo.

## Directory: `layouts/` (optional custom layouts)

A `.yaml` file here becomes selectable as `layout: <filename>`. Structure:

```yaml
template: two-column        # or single-column — the page shell to use
pages:
  first:                    # page 1
    sidebar: [identity-photo, contact, achievements]
    main:    [summary, spacer: 27, experience]
  continuation:             # middle pages (repeat as needed)
    sidebar: [identity-compact, education, competencies]
    main:    [experience:continued]
  last:                     # final page
    sidebar: [identity-compact, referees]
    main:    [experience:continued]
```

Valid section keys: `identity-photo`, `identity-compact`, `contact`, `achievements`, `education`, `competencies`, `referees` (sidebar); `summary`, `experience`, `experience:continued`, `header-ats` (main); `spacer: N` (N points of vertical space, either slot).

---

## Checklist for generating a complete cv-content/

1. `personal.yaml` — name (required), title, contact details with `*Href` links where known.
2. `summary.yaml` — 3–6 single-sentence bullets.
3. `experience.yaml` — every role, most recent first, with quantified truthful bullets.
4. `education.yaml`, `competencies.yaml`, `achievements.yaml`, `referees.yaml` — or `[]` / omit to drop.
5. `keywords.yaml` — only truthful terms not already covered by competencies/titles.
6. `config.yaml` — usually just `theme` + `layout`; add pagination keys only if page 1 overflows.
7. Ask for the photo in your **first** message to the user (it can't be generated) — but never block on it; the CV renders cleanly without one. If you ran `init`, replace or delete the scaffolded example photo at `images/profile.jpg` (it's Bruce Wayne's) before building. Then run `npx @hrtips/cvx build`.
