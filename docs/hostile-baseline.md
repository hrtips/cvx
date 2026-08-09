# Hostile-build baseline (Phase 0)

> **Point-in-time record — 2026-08-01. Do not read these numbers as current.**
>
> This is the *before* snapshot that justified the quality work, and its value is
> being exactly that. Today's figures are far better (statements 70% → 98%), and
> refreshing them here would erase the comparison the document exists to make.
> For current state run `npm run check`.
>
> **One correction, added 2026-08-09.** The "per-file, no exceptions" gate
> described below was the *intent*, not what ran. `vitest.config.js` declared the
> thresholds under a `**` glob without `perFile: true`, and without that flag a
> glob threshold is checked against the **aggregate** of matching files — so it
> was a project-wide average wearing the name of a per-file rule. One file sat at
> 75% branches under a declared 85% bar and the gate still passed. It became
> genuinely per-file in **v1.7.2**, and the one documented waiver
> (`validateContent.js`) was removed by earning the coverage rather than
> relocating it, so the gate now has zero exceptions. The tests written to close
> that gap are what found the `validate` crash fixed in the same release.

Measured on `main` before any quality gate was added, Node v26, so the ratchet
targets are grounded in real numbers. Regenerate any figure with the commands shown.

## Coverage — `vitest run --coverage` (v8, `include: src/**,bin/**`)

| Metric | Baseline | Target |
|---|---|---|
| Statements | 70.06% (742/1059) | 90% per file |
| Branches | 52.10% (457/877) | 85% per file |
| Functions | 77.11% (155/201) | 90% per file |
| Lines | 72.11% (649/900) | 90% per file |

**Hard-zero / low files (drive Phase 4):**

| File | Lines % | Why it's low | Path to 90% |
|---|---|---|---|
| `src/main.jsx` | 0 | Vite **browser** dev-preview entry; **not shipped** in npm `files` | Exclude from coverage universe (not product) |
| `bin/cvx.js` | 0 | CLI entry, only exercised by E2E **subprocess** (out-of-process → no v8 data) | Refactor to export `main(argv)`, unit-test in-process |
| `src/mcp/server.js` | 0 | stdio server bootstrap, only hit by subprocess smoke | Import + drive transport in-process |
| `src/pdf/ATSDocument.jsx` | 10 | ATS render path under-fixtured | Add ATS render fixtures |
| `src/pdf/sections/HeaderATS.jsx` | 16 | " | " |
| `src/pdf/templates/*Template.jsx` | 33 | template variant not rendered in tests | Add template-variant render test |

> **Coverage universe decision:** per-file 90% "no exceptions" applies to **shipped
> runtime code** (`src/**` except the browser entry, plus `bin/**`). `scripts/**`,
> `lib/**` (build output), `test/**`, `*.config.js`, and `src/main.jsx` (browser dev
> harness, absent from the published package) are *scoped out of the universe* — this
> is scoping, not a per-file waiver.

## Lint

- **Oxlint** (`oxlint src bin test scripts`): ~6 warnings — all trivial
  (`no-unused-vars` needing `_` prefix, one `no-new-array`, one `no-unused-expressions`).
- **Biome lint** (recommended, report-only): 30 infos.
- **Biome format**: nearly every file differs from Biome style (~2157 diff lines) →
  one mechanical `biome format --write` normalization commit, no logic change.

## Type-checking — `tsc --noEmit --allowJs --checkJs`

| Config | Errors | Dominant categories |
|---|---|---|
| `checkJs`, `strict: false` | **126** | TS2591 ×93 (`Buffer`/`process` → add `@types/node`), TS2339 ×21 |
| `checkJs`, `strict: true` | **898** | TS7006 ×344 + TS7031 ×188 (implicit-any params → JSDoc), TS2591 ×93, TS2339 ×74, TS7016 ×58 (untyped deps → `@types/js-yaml`), TS18046 ×24 |

**Read:** adding `@types/node` + `@types/js-yaml` and `"types":["node"]` removes ~150
errors immediately. The loose gate is then ~33 real fixes. Strict adds ~530 implicit-any
JSDoc annotations — the mechanical bulk, ratcheted flag-by-flag in Phase 3.

**Outcome (Phase 3 done):** `tsc --noEmit` with `checkJs` + full `strict` → **0 errors**.
Type model authored at `src/pdf/types.d.ts` (derived from the JSON schema) + a minimal
`src/pdf/fontkit.d.ts` ambient decl (fontkit ships no types). `lib/` is `@ts-nocheck`
(generated transform of src; bin loads it at runtime). `src/main.jsx` stays IN the gate.
Byte-identical reproducibility held throughout (JSDoc/cast changes are runtime-inert) —
final PDF hash unchanged from baseline. Explicit `any` used only for genuinely-dynamic
ajv error data and arbitrary user JSON (never on public params with a knowable shape).

## Existing suite (must stay green throughout)

18 test files, 209 passing + 4 todo, ~16s.

## Lint-rule decisions (reviewed by react-specialist + javascript-pro + the-fool)

Every rule *not* enforced was adjudicated. Guiding test: **a global disable is only
honest when the rule is a false-positive for the whole codebase uniformly; "true for most
files" means a scoped override, not a global off.**

| Rule | Decision | Why |
|---|---|---|
| `react/react-in-jsx-scope` (oxlint) | **off** (global) | Automatic JSX runtime (`jsx: react-jsx`); zero `React` imports repo-wide. Uniform false-positive |
| `no-unused-vars` (oxlint) | **off** → Biome owns it | Verified 1:1 coverage vs Biome `noUnusedVariables`+`noUnusedImports`+`noUnusedFunctionParameters`. Avoids double-report |
| `complexity/noForEach` (biome) | **off** (global) | Only 2 uses, both small build-time accumulation loops, no early-return footgun. Style-only |
| `suspicious/noArrayIndexKey` (biome) | **error** + content keys + 4 documented inline ignores | Free content keys applied (`c.name`, `p.title`, `edu.degree`, `ref.name`, `role-company`); index kept only for dup-text bullet/achievement loops + page-ordinal identity |
| `correctness/useExhaustiveDependencies` (biome) | **error** (re-enabled) | Premise was wrong — `ThemeContext.useStyles()` `useMemo` fans out to 18 components; 0 violations today, free stale-PDF-bug guard |
| `react/iframe-missing-sandbox` (oxlint) | **error** + fixed | `sandbox="allow-same-origin"` on `main.jsx` preview blocks navigation/popups at zero cost |
| `suspicious/noConsole` (biome) | **error** in `src/**` w/ `allow:[warn,error]`; **off** in bin/scripts/test/mcp-server | Blocks stdout-polluting `console.log` (MCP JSON-RPC corruption risk); permits stderr diagnostics |
| `no-underscore-dangle` (oxlint) | **error** w/ allow-list `[__dir, require_, _discovered, _hasPdftoppm]` | Only tripwire for dead `_`-prefixed vars (both linters ignore `_` as "unused"). Caught 2 dead vars, now deleted |

**Gaps the reviewers found and I enabled** (0 violations today, high value):
`react-hooks/rules-of-hooks` (no hooks-order enforcement existed) and oxlint's **vitest plugin**
`no-focused-tests` (a stray `.only` silently guts the suite with green CI). `vitest/warn-todo`
+ `valid-title` disabled (deliberate `.todo` roadmap; dynamic `describe(dir)` titles).

**Code fixes made during review:** `import { openSync } from 'fontkit'` (default import *crashes* —
fontkit 2.x is ESM-named-only); 4 `no-shadow`, 3 `import/no-named-as-default-member`, 1 throw→`expect()`
(keeps `expect-expect` enforcing), 2 dead vars removed.
