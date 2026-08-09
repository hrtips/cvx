# SchemaStore submission — prepared, awaiting go

Sprint 1.7. Everything below is ready to submit; the PR itself is a public action
under your GitHub account, so it ships on your word.

## What the PR adds

SchemaStore (github.com/SchemaStore/schemastore) drives schema resolution for
editors *without* per-file `$schema` headers (our scaffold has headers, so this
covers hand-made files and other tools that consume the catalog).

Catalog entries (src/api/json/catalog.json), one per content file so editors
get precise validation — the union-schema alternative gives useless
autocomplete because yaml-language-server can't branch on filename:

```json
{
  "name": "CVX personal.yaml",
  "description": "Identity and contact details for a CVX-generated CV",
  "fileMatch": ["**/cv-content/personal.yaml"],
  "url": "https://raw.githubusercontent.com/hrtips/cvx/main/schema/v1/personal.schema.json"
}
```

…repeated for: summary, experience, education, competencies, achievements,
referees, keywords, config, and one layouts entry with
`"fileMatch": ["**/cv-content/layouts/*.yaml"]` →
`schema/v1/layout.schema.json`. (10 entries total. If maintainers push back on
count, fall back to config.yaml + layouts only — the two files users most
often hand-edit.)

## Submission checklist (SchemaStore CONTRIBUTING requirements)

1. Fork SchemaStore, branch `cvx-cv-content`.
2. Add the 10 catalog entries (alphabetical position: under "C").
3. Add positive/negative test files: `src/test/cvx-personal/` etc. — copy
   from our template/cv-content/*.yaml (positive) and the seeded-error
   fixtures in test/validateContent.test.js (negative).
4. `npm run build` in the SchemaStore repo runs their validation suite
   (checks URL resolves, schema compiles, tests pass).
5. PR title: "Add CVX cv-content schemas". Body: what CVX is, link to repo,
   note that schemas are versioned under /schema/v1/ and the compatibility
   promise (files never break within a major).

## Prerequisites already met

- Schemas live at stable versioned raw URLs (pushed to main) ✓
- Draft 2020-12, compile clean under ajv strict ✓ (test/schema.test.js)
- Per-file stubs exist so each catalog URL is a small, single-purpose schema ✓
