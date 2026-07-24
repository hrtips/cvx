# makecv

[![CI](https://github.com/ramith/makecv/actions/workflows/ci.yml/badge.svg)](https://github.com/ramith/makecv/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/makecv)](https://www.npmjs.com/package/makecv)
[![npm downloads](https://img.shields.io/npm/dm/makecv)](https://www.npmjs.com/package/makecv)
[![install size](https://packagephobia.com/badge?p=makecv)](https://packagephobia.com/result?p=makecv)
[![node](https://img.shields.io/node/v/makecv)](https://github.com/ramith/makecv/blob/main/package.json)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Write your CV in plain YAML files, run one command, get a pixel-perfect PDF. No Word, no Google Docs, no design tool, no account — your data never leaves your machine.

---

## Create your CV in two minutes

```bash
npx makecv init     # scaffold cv-content/ with a complete example CV
npx makecv build    # render it to a PDF
```

`init` gives you a finished, working CV — **Bruce Wayne's**, and yes, really. Open `bruce-wayne.pdf` and you're looking at a designed two-page CV: photo, sidebar, achievements, the lot.

Now make it yours. Open the `cv-content/` folder, and replace Bruce's details with your own, one file at a time:

```
cv-content/
  personal.yaml       ← start here: your name, title, contact details
  summary.yaml        ← the bullet points at the top of page 1
  experience.yaml     ← your work history (the bulk of the CV)
  education.yaml      ← degrees, institutions, years
  competencies.yaml   ← skill pills in the sidebar
  achievements.yaml   ← awards and recognitions
  referees.yaml       ← referees, or [] for "available upon request"
  images/profile.jpg  ← your photo (square, 400×400px or larger)
```

Re-run `npx makecv build` after each file and watch the PDF update — seeing Bruce's entry next to yours makes the format self-explanatory. The output file is named after you automatically (`jane-doe.pdf`).

Applying through a job portal? Generate the ATS-safe variant too — single column, no colours, machine-friendly:

```bash
npx makecv build --ats
```

### CLI reference

| Command | Does |
|---|---|
| `npx makecv init` | Scaffold `cv-content/` with the example CV (won't overwrite an existing one) |
| `npx makecv build` | Render `cv-content/` to `<your-name>.pdf` |
| `npx makecv build --ats` | Render the ATS-safe single-column variant |
| `npx makecv --help` / `--version` | Help / version |

---

## What goes in each file

These are excerpts from the scaffolded example — build it once and you can see exactly where each snippet lands on the page.

**personal.yaml** — the header and contact block:
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

**experience.yaml** — one entry per role; `progression` (optional) renders a title history inside the entry:
```yaml
- role: Founder & Field Commander – Gotham Operations
  company: The Batman
  period: 2005 – Present
  description: Self-directed vigilante operation safeguarding Gotham City through deterrence, investigation, and crisis response.
  progression:
    - title: Commander, Batman Incorporated
      period: 2011 – Present
    - title: Solo Operative, The Dark Knight
      period: 2005 – 2008
  bullets:
    - Established and scaled a citywide security operation from a solo initiative to a franchised network (Batman Incorporated).
    - Recruited, trained, and led a high-performing field team including Robin, Nightwing, and Batgirl.
    - Reduced organised-crime activity in Gotham by an estimated 60% through data-driven surveillance and rapid incident response.
```

**summary.yaml** — the bullet list at the top of page 1:
```yaml
- "Strategic operations leader with 20+ years' experience, progressing from solo field operative to Field Commander of a citywide security network."
- "Co-founded the Justice League as a global response coalition, serving as chief strategist and contingency planner for existential-scale threats."
```

**education.yaml**
```yaml
- degree: "Applied Sciences & Criminology (self-directed)"
  institution: League of Shadows
  period: 1998 – 2004

- degree: BSc, Criminology & Chemistry
  institution: Gotham University
  period: 1994 – 1998
```

**competencies.yaml** — rendered as skill pills in the sidebar:
```yaml
- Strategic Planning
- Criminal Investigation
- Crisis Response
- Surveillance & Intelligence
```

**achievements.yaml**
```yaml
- year: Gotham's Most Influential Citizen
  text: "— 2024, Gotham Gazette"

- year: Key to the City
  text: "— Office of the Mayor, Gotham City"
```

**referees.yaml** (use `[]` to print "available upon request"):
```yaml
- name: Diana Prince
  title: Founding Member, Justice League
  company: Themysciran Embassy
  email: d.prince@justiceleague.org
  phone: "+1 (202) 555-0177"
```

Delete what you don't need — an empty file (or `[]`) simply drops that section from the CV. Any new `.yaml` file you drop into `cv-content/` is auto-discovered as a content key.

### Your photo

Drop it into `cv-content/images/` as `profile.<ext>` — `jpg`, `jpeg`, `png`, or `webp` are auto-detected (that order wins if several exist). Square crop, at least 400×400px.

---

## Themes, layouts, and page flow

Everything visual is controlled by `cv-content/config.yaml`:

```yaml
theme: teal               # teal | coral | mono
layout: two-column        # two-column | single-column
page1ExperienceCount: 2   # experience entries on page 1
page1SplitBullets: 2      # split the last entry: N bullets on page 1, rest continue
```

Change a value, re-run `npx makecv build`, done.

**Themes** control colour and styling:

| Theme | Accent | Description |
|---|---|---|
| `teal` | `#1a6070` | Professional teal (default) |
| `coral` | `#c0534a` | Warm coral red |
| `mono` | `#000000` | Black and white, ATS-optimised |

**Layouts** control page structure:

| Layout | Structure | Description |
|---|---|---|
| `two-column` | Sidebar + main column | Designed CV with photo, identity block, achievements |
| `single-column` | Full width | ATS-safe, no sidebar, no decorative elements |

**Pagination** — experience entries are distributed across pages automatically (greedy bin-packing). Set `page1ExperienceCount` / `page1SplitBullets` to control page 1 explicitly. Example with 6 entries and the config above:

- **Page 1** — Summary + Entry 1 (full) + Entry 2 (first 2 bullets)
- **Page 2** — Entry 2 (cont'd) + Entries 3–6

### Custom layouts

You can define your own page structure — drop a `.yaml` file into `cv-content/layouts/` and reference it by filename:

```yaml
# cv-content/layouts/compact.yaml
template: two-column

pages:
  first:
    sidebar:
      - identity-photo
      - contact
    main:
      - summary
      - spacer: 27
      - experience

  continuation:
    sidebar:
      - identity-compact
      - education
      - competencies
      - achievements
    main:
      - experience:continued

  last:
    sidebar:
      - identity-compact
      - referees
    main:
      - experience:continued
```

Then set `layout: compact` in `config.yaml`. Available section keys:

| Key | Renders |
|---|---|
| `identity-photo` | Name, title, company + profile photo (sidebar) |
| `identity-compact` | Name, title, company without photo (sidebar) |
| `contact` | Phone, email, LinkedIn, location with icons (sidebar) |
| `achievements` | Year + description list (sidebar) |
| `education` | Degree, institution, period (sidebar) |
| `competencies` | Skill tags as pills (sidebar) |
| `referees` | Referee contact details (sidebar) |
| `summary` | Bullet point list (main column) |
| `experience` | Experience entries for page 1 (main column) |
| `experience:continued` | Continuation experience entries (main column) |
| `header-ats` | Full-width name/title/contact header (single-column) |
| `spacer: N` | Vertical spacer of N points |

---

## ATS & AI-parser keywords

Both PDFs embed a keyword list into the standard **`Keywords` metadata field** — the field some applicant tracking systems (ATS) and AI CV parsers read. Keywords live in metadata, **not** as hidden text on the page.

> **Reality check:** most mainstream ATS rank on text extracted from the CV *body*, and support for the PDF `Keywords`/XMP field is inconsistent. Treat this as a best-effort supplement to a keyword-rich body — not a substitute, and not a reliable ranking lever on its own. Keep every keyword **truthful**; stuffing false or irrelevant terms causes a metadata/body mismatch that gets a CV auto-rejected.

Keywords come from two sources, merged and de-duplicated (body-derived terms first):

1. **Auto-derived** from your `competencies.yaml` and job titles (company names are deliberately excluded as low-signal).
2. **Curated** in `cv-content/keywords.yaml` — a flat list, or grouped under headings:

```yaml
# cv-content/keywords.yaml
- Operations Management
- Risk Management
# …or grouped:
Leadership: [Executive Leadership, Team Building]
```

Configure in `config.yaml`:

```yaml
atsKeywords:
  enabled: true       # master switch                                  (default: true)
  autoDerive: true    # also derive from competencies + job titles      (default: true)
  max: 40             # optional cap; body-derived terms are kept first (default: all)
```

---
---

# For developers

Everything below is about hacking on makecv itself — custom themes, the rendering pipeline, and contributing. You don't need any of it to create a CV.

## Working from a clone

```bash
git clone git@github.com:ramith/makecv.git
cd makecv
npm install
npm run dev        # live browser preview at http://localhost:5173
npm run pdf        # generate PDF (same pipeline as `makecv build`)
npm run pdf:ats    # generate the ATS variant
npm test           # unit tests
npm run build:lib  # build the publishable lib/ (what the CLI runs)
```

The repo's `cv-content/` carries the same Bruce Wayne example, so a clone builds out of the box. A photo crop helper is included: `python3 scripts/crop-profile.py path/to/photo.jpg`.

## Custom themes

> Themes ship inside the package, so custom themes currently require working from a clone — the `npx` CLI offers the three built-ins.

Drop a `.js` file in `src/pdf/themes/` — it's auto-discovered, no registration needed:

```js
// src/pdf/themes/navy.js
import { tealTheme } from './teal.js'

export const navyTheme = {
  ...tealTheme,
  name: 'navy',
  palette: {
    ...tealTheme.palette,
    accent:    '#1e3a5f',
    sidebarBg: '#eef1f5',
    tagBg:     '#d0d8e8',
    tagText:   '#1e3a5f',
    divider:   '#b8c4d4',
  },
}
```

Set `theme: navy` in `config.yaml`. The theme object has five namespaces you can override:

| Namespace | Controls |
|---|---|
| `palette` | All colours — accent, backgrounds, text, tags, dividers, semantic opacity colours |
| `typography` | Font sizes, weights, letter spacing, line heights per element |
| `spacing` | Gaps, margins, padding values used by all components |
| `chrome` | Decorative dimensions — border radii, divider widths, photo size, corner badge |
| `geometry` | Page dimensions, column fractions, padding objects |

## Auto-discovery

Convention over registration — drop a file in the right folder and it's picked up:

| What | Where to drop it | How it's found |
|---|---|---|
| **Content** | `cv-content/*.yaml` | Any `.yaml` file (except `config.yaml`) becomes a content key matching its filename |
| **Themes** | `src/pdf/themes/*.js` | Any `.js` file exporting an object with a `name` property |
| **Layouts** | `cv-content/layouts/*.yaml` | Any `.yaml` file with a `template` and `pages` structure |
| **Profile photo** | `cv-content/images/profile.*` | First match of `.jpg`, `.jpeg`, `.png`, `.webp` |

To add a whole new content section (e.g. publications): create `cv-content/publications.yaml` (auto-available as `content.publications`), build a section component in `src/pdf/sections/`, register it in `registry.js`, then reference it from a layout.

## Architecture

Three concerns, independently swappable:

```
Content (YAML)  ×  Theme (JS)  ×  Layout (YAML)
     ↓                ↓               ↓
  what to say    how it looks    where it goes
```

The rendering pipeline:

```
config.yaml → resolves theme + layout
    ↓
cv-content/*.yaml → auto-loaded into data bag
    ↓
layout.js → packs experience entries across pages (using theme metrics)
    ↓
CVDocument → picks template (TwoColumn or SingleColumn)
    ↓
template → renders slots from layout config via section registry
    ↓
sections → read theme from React context, render content
    ↓
@react-pdf/renderer → PDF buffer → file
```

## Project structure

```
cv-content/                      ← content (the repo carries the example CV)
  *.yaml                         ← auto-discovered content files
  config.yaml                    ← theme, layout, pagination
  layouts/                       ← auto-discovered layout definitions
  images/profile.<ext>           ← photo (jpg/jpeg/png/webp)

src/pdf/                         ← framework
  CVDocument.jsx                 ← unified config-driven document
  ATSDocument.jsx                ← standalone ATS document
  ThemeContext.jsx               ← React context + useStyles hook
  render.js                      ← shared render pipeline (CLI + scripts)
  layout.js                      ← theme-aware page-packing + sidebar resolution
  keywords.js                    ← ATS/AI-parser keyword metadata
  reproducible.js                ← SOURCE_DATE_EPOCH support (see below)
  profilePhoto.js                ← shared profile-image extension precedence
  loadContent.js                 ← auto-discovers cv-content/*.yaml
  loadLayout.js                  ← normalizes layout YAML → slot config
  fonts.js                       ← Lato font registration
  *.test.js                      ← Vitest unit tests (co-located)
  themes/                        ← auto-discovered themes (teal, coral, mono)
  templates/                     ← page shells (TwoColumn, SingleColumn)
  sections/                      ← content sections + registry
  components/                    ← shared leaf components

scripts/
  export-pdf.js                  ← npm run pdf
  export-pdf-ats.js              ← npm run pdf:ats
  build-lib.js                   ← npm run build:lib (publishing build)
  crop-profile.py                ← photo crop helper

bin/makecv.js                    ← npx CLI (init / build)
template/cv-content/             ← starter content scaffolded by `makecv init`
lib/                             ← generated: published transform of src/pdf (gitignored)
```

## Testing

```bash
npm test
```

Unit tests cover the pure logic modules — keyword building, page packing, sidebar resolution, reproducibility helpers, and the profile-photo picker. Tests live next to the code they cover (`src/pdf/*.test.js`) plus `test/` for cross-cutting checks. CI runs the suite on Linux and macOS across Node 20/22/24 (plus Windows on Node 22), then packs the tarball and exercises the installed CLI end-to-end, including a byte-identical reproducibility gate.

## Reproducible builds

Set [`SOURCE_DATE_EPOCH`](https://reproducible-builds.org/docs/source-date-epoch/) (seconds since the Unix epoch) to make PDF output byte-identical run after run — useful for CI checks and for verifying that a content change is the *only* thing that changed:

```bash
SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) npx makecv build   # or npm run pdf
```

This pins the PDF's `CreationDate` (and with it the trailer file ID), the font-subset names, and the object write order — the things that otherwise vary per run. Unset, builds behave normally and stamp the current time.

Byte-identical output is guaranteed for the same platform and Node version. Builds from different OSes or Node majors are visually identical but not byte-identical (font subsets embed in a platform-dependent order, and zlib output varies across Node versions).

## Tech stack

- **[@react-pdf/renderer](https://react-pdf.org/)** — renders React to PDF (no headless browser)
- **[Vite](https://vitejs.dev/) + React** — live browser preview
- **[js-yaml](https://github.com/nodeca/js-yaml)** — YAML parsing (pinned to 4.x to match `@rollup/plugin-yaml`)
- **[esbuild](https://esbuild.github.io/)** — transform-only build of `lib/` for publishing
- **[tsx](https://github.com/privatenumber/tsx)** — runs the repo export scripts
- **[Vitest](https://vitest.dev/)** — unit tests
- **[Lato](https://fonts.google.com/specimen/Lato)** — embedded font (Light 300, Regular 400, Bold 700)

---

## License

[Apache-2.0](LICENSE) © ramith.

The bundled [Lato](https://fonts.google.com/specimen/Lato) fonts are licensed separately under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).
