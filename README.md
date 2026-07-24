# makecv

[![CI](https://github.com/ramith/makecv/actions/workflows/ci.yml/badge.svg)](https://github.com/ramith/makecv/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/makecv)](https://www.npmjs.com/package/makecv)
[![npm downloads](https://img.shields.io/npm/dm/makecv)](https://www.npmjs.com/package/makecv)
[![install size](https://packagephobia.com/badge?p=makecv)](https://packagephobia.com/result?p=makecv)
[![node](https://img.shields.io/node/v/makecv)](https://github.com/ramith/makecv/blob/main/package.json)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

A config-driven CV generator with swappable themes and layouts. Write your content in YAML, pick a theme and layout in one config file, and generate pixel-perfect PDFs — no Word, no Google Docs, no headless browser.

Built with [React](https://react.dev/) and [@react-pdf/renderer](https://react-pdf.org/).

---

## Quick start

```bash
npx makecv init         # scaffold cv-content/ with starter content
npx makecv build        # render <your-name>.pdf
npx makecv build --ats  # render the ATS-safe variant (single-column, no colour)
```

`init` scaffolds a complete working CV — Bruce Wayne's, and yes, really — so your first `build` produces a finished two-page PDF before you've written a word. Then open `cv-content/`, replace his details with yours file by file, and re-run `npx makecv build` after each change to see exactly what each file controls. No accounts, no cloud — your data never leaves your machine.

### Working from a clone (live preview + development)

```bash
git clone git@github.com:ramith/makecv.git
cd makecv
npm install
npm run dev        # live preview at http://localhost:5173
npm run pdf        # generate PDF
npm run pdf:ats    # generate ATS-safe PDF (single-column, no colour)
npm test           # run the unit tests
```

---

## How it works

Everything is driven by `cv-content/config.yaml`:

```yaml
theme: teal              # teal | coral | mono  (or any custom theme)
layout: two-column        # two-column | single-column  (or any custom layout)
page1ExperienceCount: 2   # entries on page 1
page1SplitBullets: 2      # truncate last entry's bullets, continue on next page

atsKeywords:              # keywords embedded in PDF metadata (see below)
  enabled: true
  autoDerive: true
```

Change `theme` or `layout` and run `npm run pdf` — the output changes instantly.

---

## Content

All content lives in `cv-content/`. Drop a YAML file and it's auto-discovered.

| File | What it contains |
|---|---|
| `personal.yaml` | Name, title, company, phone, email, LinkedIn, location, or any other contact details |
| `summary.yaml` | Professional summary bullet points |
| `experience.yaml` | Work history — roles, companies, periods, bullet points |
| `education.yaml` | Degrees, institutions, years |
| `competencies.yaml` | Skill tags shown as pills in the sidebar |
| `achievements.yaml` | Awards and recognitions |
| `referees.yaml` | Referee details (use `[]` to show "available upon request") |
| `keywords.yaml` | ATS/AI-parser keywords embedded in PDF metadata (optional) |
| `config.yaml` | Theme, layout, and pagination settings |
| `images/profile.<ext>` | Your photo — `jpg`, `jpeg`, `png`, or `webp` (square, 400x400px+) |

### Content file examples

These are excerpts from the starter content `makecv init` scaffolds — build it once and you can see exactly where each snippet lands on the page.

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

---

## Themes

Themes control colours, typography, and visual styling. Three built-in themes are included:

| Theme | Accent | Description |
|---|---|---|
| `teal` | `#1a6070` | Professional teal (default) |
| `coral` | `#c0534a` | Warm coral red |
| `mono` | `#000000` | Black and white, ATS-optimised |

### Creating a custom theme

> Custom themes currently require [working from a clone](#working-from-a-clone-live-preview--development) — the `npx` CLI ships the three built-ins.

Drop a `.js` file in `src/pdf/themes/` — it's auto-discovered, no registration needed.

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

Then set `theme: navy` in `config.yaml`. That's it.

The theme object has four namespaces you can override:

| Namespace | Controls |
|---|---|
| `palette` | All colours — accent, backgrounds, text, tags, dividers, semantic opacity colours |
| `typography` | Font sizes, weights, letter spacing, line heights per element |
| `spacing` | Gaps, margins, padding values used by all components |
| `chrome` | Decorative dimensions — border radii, divider widths, photo size, corner badge |
| `geometry` | Page dimensions, column fractions, padding objects |

---

## Layouts

Layouts control page structure — where sections appear on each page. Two built-in layouts:

| Layout | Template | Description |
|---|---|---|
| `two-column` | Sidebar + main column | Designed CV with photo, identity block, achievements |
| `single-column` | Full width | ATS-safe, no sidebar, no decorative elements |

### Creating a custom layout

Drop a `.yaml` file in `cv-content/layouts/` — auto-discovered.

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

Then set `layout: compact` in `config.yaml`.

### Available sections

These keys can be placed in any sidebar or main slot:

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
| `spacer:N` | Vertical spacer of N points |

---

## Pagination

The page-packing algorithm automatically distributes experience entries across pages. You can control this in `config.yaml`:

```yaml
page1ExperienceCount: 2       # how many entries fit on page 1
page1SplitBullets: 2           # truncate the last entry, continue on next page
```

**Example** with 6 experience entries and the above config:
- **Page 1** — Summary + Entry 1 (full) + Entry 2 (first 2 bullets)
- **Page 2** — Entry 2 (cont'd) + Entries 3–6

If omitted, the algorithm uses greedy bin-packing to fill pages automatically.

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

## Reproducible builds

Set [`SOURCE_DATE_EPOCH`](https://reproducible-builds.org/docs/source-date-epoch/) (seconds since the Unix epoch) to make PDF output byte-identical run after run — useful for CI checks and for verifying that a content change is the *only* thing that changed:

```bash
SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) npm run pdf
```

This pins the PDF's `CreationDate` (and with it the PDF trailer file ID) and the embedded font-subset names, the two things that otherwise vary per run. Unset, exports behave normally and stamp the current time.

Byte-identical output is guaranteed for the same platform and Node version. Builds from different OSes or Node majors are visually identical but not byte-identical (font subsets embed in a platform-dependent order, and zlib output varies across Node versions).

---

## Profile photo

Drop your photo into `cv-content/images/` as `profile.<ext>` — `jpg`, `jpeg`, `png`, or `webp` are auto-detected (highest-precedence match wins, in that order). Square crop, at least 400x400px. Both the browser preview and the PDF export resolve the photo the same way, so any supported extension just works.

A crop helper is included:

```bash
python3 scripts/crop-profile.py path/to/your-photo.jpg
```

---

## Project structure

```
cv-content/                      ← your content (edit this)
  *.yaml                         ← auto-discovered content files
  config.yaml                    ← theme, layout, pagination
  keywords.yaml                  ← ATS/AI-parser keywords (optional)
  images/profile.<ext>           ← your photo (jpg/jpeg/png/webp)
  layouts/                       ← auto-discovered layout definitions
    two-column.yaml
    single-column.yaml

src/pdf/                         ← framework (don't edit unless extending)
  CVDocument.jsx                 ← unified config-driven document
  ATSDocument.jsx                ← standalone ATS document
  ThemeContext.jsx                ← React context + useStyles hook
  layout.js                      ← theme-aware page-packing + sidebar resolution
  keywords.js                    ← builds the ATS/AI-parser keyword metadata
  profilePhoto.js                ← shared profile-image extension precedence
  loadContent.js                 ← auto-discovers cv-content/*.yaml
  loadLayout.js                  ← normalizes layout YAML → slot config
  fonts.js                       ← Lato font registration
  *.test.js                      ← Vitest unit tests (co-located)
  themes/                        ← auto-discovered theme files
    teal.js                      ← default theme (single source of truth)
    coral.js                     ← coral variant (overrides palette)
    mono.js                      ← monochrome variant
    index.js                     ← theme discovery + registry
  templates/                     ← page shells (slot-based)
    TwoColumnTemplate.jsx        ← sidebar + main + corner badge
    SingleColumnTemplate.jsx     ← full-width page
  sections/                      ← content sections (registry-driven)
    registry.js                  ← maps string keys → React components
    IdentityPhoto.jsx            ← name/title/photo block
    IdentityCompact.jsx          ← name/title without photo
    ContactSection.jsx           ← phone/email/LinkedIn with icons
    SummarySection.jsx           ← bullet point summary
    ExperienceSection.jsx        ← work history entries
    EducationSection.jsx         ← degrees
    CompetenciesSection.jsx      ← skill tag pills
    AchievementsSection.jsx      ← awards list
    RefereesSection.jsx          ← referee contacts
    HeaderATS.jsx                ← full-width ATS header
  components/                    ← shared leaf components
    SectionTitle.jsx             ← styled section heading
    BulletList.jsx               ← dash-prefixed bullet list
    ExpItem.jsx                  ← single experience entry

scripts/
  export-pdf.js                  ← PDF generation (npm run pdf)
  export-pdf-ats.js              ← ATS PDF generation (npm run pdf:ats)
  build-lib.js                   ← builds lib/ for publishing (npm run build:lib)
  crop-profile.py                ← photo crop helper

bin/makecv.js                    ← npx CLI (init / build)
template/cv-content/             ← starter content scaffolded by `makecv init`
lib/                             ← generated: published transform of src/pdf (gitignored)
```

---

## Architecture

The system separates three concerns that can be changed independently:

```
Content (YAML)  ×  Theme (JS)  ×  Layout (YAML)
     ↓                ↓               ↓
  what to say    how it looks    where it goes
```

- **Content** is pure data — YAML files with no styling
- **Themes** control visual tokens — colours, typography, spacing, geometry
- **Layouts** control page structure — which sections go in which slots on which pages

The rendering pipeline:

```
config.yaml → resolves theme + layout
    ↓
content/*.yaml → auto-loaded into data bag
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

All discovery is automatic — drop files in the right folders and they're picked up.

---

## Testing

Unit tests cover the pure logic modules — keyword building, page packing, sidebar resolution, and the profile-photo picker.

```bash
npm test
```

Tests live next to the code they cover (`src/pdf/*.test.js`) plus a `test/` directory for cross-cutting checks (e.g. asserting both content-loading paths resolve the same `js-yaml` major).

---

## Advanced: auto-discovery

The system uses convention-based auto-discovery — no index files or import lists to maintain. Drop a file in the right folder and it's picked up automatically.

| What | Where to drop it | Format | How it's found |
|---|---|---|---|
| **Content** | `cv-content/*.yaml` | YAML | Any `.yaml` file (except `config.yaml`) becomes a content key matching its filename |
| **Themes** | `src/pdf/themes/*.js` | ES module | Any `.js` file exporting an object with a `name` property is registered as a theme |
| **Layouts** | `cv-content/layouts/*.yaml` | YAML | Any `.yaml` file with a `template` and `pages` structure becomes a selectable layout |
| **Profile photo** | `cv-content/images/profile.*` | Image | First match of `.jpg`, `.jpeg`, `.png`, or `.webp` is used |

### Adding a new content section

1. Create `cv-content/publications.yaml` with your data
2. The data is automatically available as `content.publications` in the rendering pipeline
3. To display it, create a section component in `src/pdf/sections/`, register it in `registry.js`, and reference it in your layout YAML

### Adding a new theme

1. Create `src/pdf/themes/forest.js`:
   ```js
   import { tealTheme } from './teal.js'
   export const forestTheme = {
     ...tealTheme,
     name: 'forest',
     palette: { ...tealTheme.palette, accent: '#2d5f2d', sidebarBg: '#eef5ee' },
   }
   ```
2. Set `theme: forest` in `config.yaml`
3. Run `npm run pdf` — no other files need editing

### Adding a new layout

1. Create `cv-content/layouts/academic.yaml`:
   ```yaml
   template: two-column
   pages:
     first:
       sidebar: [identity-photo, contact, education]
       main: [summary, spacer: 27, experience]
     continuation:
       sidebar: [identity-compact, competencies, achievements]
       main: [experience:continued]
     last:
       sidebar: [identity-compact, referees]
       main: [experience:continued]
   ```
2. Set `layout: academic` in `config.yaml`
3. Run `npm run pdf` — no other files need editing

---

## Tech stack

- **[@react-pdf/renderer](https://react-pdf.org/)** — renders React to PDF (no headless browser)
- **[Vite](https://vitejs.dev/) + React** — live browser preview
- **[js-yaml](https://github.com/nodeca/js-yaml)** — YAML parsing (pinned to 4.x to match `@rollup/plugin-yaml`)
- **[tsx](https://github.com/privatenumber/tsx)** — runs export scripts in Node
- **[Vitest](https://vitest.dev/)** — unit tests (`npm test`)
- **[Lato](https://fonts.google.com/specimen/Lato)** — embedded font (Light 300, Regular 400, Bold 700)

---

## Using this as a template

1. Fork or clone this repo
2. `npm install`
3. Replace all YAML files in `cv-content/` with your own content
4. Replace `cv-content/images/profile.jpg` with your photo
5. Pick a theme in `config.yaml` (or create your own)
6. `npm run dev` to preview, `npm run pdf` to export

---

## License

[Apache-2.0](LICENSE) © ramith.

The bundled [Lato](https://fonts.google.com/specimen/Lato) fonts are licensed separately under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).
