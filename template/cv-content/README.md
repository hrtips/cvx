# Your CV content

Everything in this folder is Bruce Wayne's CV — working starter content for you to replace. Run `npx makecv build` right now to see the finished PDF, then swap his details for yours one file at a time and rebuild to see each change land.

| File | What it controls |
|---|---|
| `personal.yaml` | Name, title, company, and the contact block (phone, email, LinkedIn) |
| `summary.yaml` | The bullet list at the top of page 1 |
| `experience.yaml` | Work history — one entry per role; `progression:` is an optional title history, `bullets:` are your impact points |
| `education.yaml` | Degrees, institutions, years |
| `competencies.yaml` | Skill pills in the sidebar |
| `achievements.yaml` | Awards and recognitions (sidebar) |
| `referees.yaml` | Referee contacts — set to `[]` to print "available upon request" |
| `keywords.yaml` | Extra ATS/AI-parser keywords embedded in PDF metadata (optional; keep them truthful) |
| `config.yaml` | Theme (`teal` / `coral` / `mono`), layout, and page-1 pagination |
| `images/profile.jpg` | Your photo — square, 400×400px+; `jpg`, `jpeg`, `png`, or `webp` all work |

## The workflow

```bash
# edit any file above, then:
npx makecv build          # designed two-column PDF
npx makecv build --ats    # plain single-column PDF for job portals
```

The output PDF is named after `personal.yaml`'s `name` (e.g. `bruce-wayne.pdf` — it'll switch to your name automatically).

## Tips

- Delete what you don't need: an empty file (or `[]`) simply drops that section.
- Start with `experience.yaml` — it's the bulk of the CV and the structure is self-explanatory once you see Bruce's entries next to the built PDF.
- `config.yaml` controls how many experience entries fit on page 1 (`page1ExperienceCount` / `page1SplitBullets`); tune those last, after your content is in.

Full docs: https://github.com/ramith/makecv#readme
