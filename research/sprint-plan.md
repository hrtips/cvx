# CVX sprint plan — consolidated

*2026-07-24. Folds together market research, the PM roadmap, BA use cases, and the reconciliation + red-team + pre-mortem passes. Those four inputs are now in `research/archive/` — they predate everything below and are kept only for the reasoning.*

*Reviewed 2026-07-27 — renamed makecv→cvx throughout; dropped the container/Docker image and the Glama listing (with its gated awesome-mcp-servers PR).*

*Reviewed 2026-08-01 — v1.5.0 shipped; hostile-build quality track recorded; non-Latin rendering formally scoped out.*

*Reviewed 2026-08-09 — reconciled against the source after v1.6.0–v1.7.2. Version labels dropped from unbuilt work (they had gone stale twice); shipped history moved to `CHANGELOG.md`; known defects recorded explicitly instead of living only in commit messages.*

**How to read this file.** Everything above "Not built yet" is history and standing
decisions. Everything below it is unbuilt. What actually shipped, and when, is in
`CHANGELOG.md` at the repo root — this file is deliberately not a changelog, because
keeping two of them in sync is how the version labels went wrong in the first place.

---

## Where things actually stand *(2026-08-09)*

**Shipped:** **v1.7.2** on npm `latest`. Six releases since this section was first
written — the layout engine (v1.6.0), MCP layout diagnostics and the ATS
glyph-loss fix (v1.7.0), version-pinned scaffolds and packaged docs (v1.7.1), and
the `validate` crash fix (v1.7.2). Details in `CHANGELOG.md`. **658 tests**,
`npm run check` green, byte-reproducible across architectures in CI.

**Layout engine: effectively done.** C0–C3 and C6a shipped; **C4 was prototyped,
measured and deferred** with evidence (the metric it optimises is anti-correlated
with quality); **C5 is closed** as a consequence. Only C6b (levers) and C7
(docs/close) remain — both listed under "Not built yet".

**The quality gates are real now, which they were not before.** The per-file
coverage gate had been checked against the *aggregate* since the hostile-build
track — a project-wide average wearing the name of a per-file rule. Fixed in
v1.7.2, with zero exceptions; `docs/hostile-baseline.md` is the *before* snapshot
and is marked as such.

**Quality track (not previously in this plan — recorded now):** a hostile-build hardening sprint ran Phases 0–7 and merged via PR #1 (`fcdb7a2`). Baseline in `docs/hostile-baseline.md`. Delivered: per-file **90%** coverage gate on shipped runtime code (209 → 345 tests), `tsc --noEmit` with `checkJs` + full `strict` at **0 errors**, lint gate (biome + oxlint), package-correctness gates (knip/publint/attw), security hardening, and CI wiring. **These are now standing gates on every commit** — factor them into every future chunk's "done."

**▶ Active track: the layout engine sprint** (`sprint-layout-engine.md`). C0 ✅, C1 ⛔ (premise disproven, folded into C3), C2 ✅, **C3 is next and unblocked**.

**Scope decision (2026-08-01): CV rendering is English/Western-European Latin only.** The bundled Lato covers no Cyrillic/Greek/Vietnamese/Turkish/CJK/Indic script and CVX registers no fallback font; `validate`/`build` warn loudly on unsupported glyphs, and that detect-and-warn is the **final** answer, not a stopgap. Fallback fonts would blow the <500 kB tarball budget many times over — same solo-maintainer logic that dropped the container image and the Ollama recipe. **The multilingual landing page is deliberate and not a contradiction:** website reach and renderer script support are independent. Now stated in the README ("Script support"). Revisit only on real issue demand.

**Correction to the record (2026-08-01):** the "forced overflow clips content" claim that appeared in warnings, schema text, docs, and several code comments was **wrong** — react-pdf `wrap: true` **flows** overflow onto extra physical pages. Re-verified by direct render (~541pt forced overflow → 3 pages, all 20 bullets present, no overprinting). All copies reworded. **Invariant 0 is currently holding**; the layout sprint is about wasted space, not content loss.

**Still open (no owner assigned):** Claude plugin marketplace repo · **the 2.7 launch (demo GIF + Show HN)** · hero PNG regeneration (cosmetic) · deprioritized fill-ins (`cvx doctor`, version+sha256 in `build --json`, Ollama recipe, standalone executable).

**Closed since this line was written:** the two-architecture repro CI leg shipped with C4 — `repro-arch` renders a pinned scaffold on ubuntu x86_64 and macos arm64 and compares byte-for-byte on every run, and it pins an exact node build because the divergence turned out to be zlib, not CPU.

**The launch is the one that matters.** Everything else on that list is capability; the demo GIF and Show HN are the only items whose absence affects whether anyone finds the tool at all. It has been open since before v1.4, through six releases.

---

## Ground rules (from principles + pre-mortem)

- Solo maintainer pacing: **publicly commit only to Sprint 0–2**; Sprints 3–4 are "when it's ready."
- Success floor, stated: a sustainable niche tool that developers and local-LLM users rely on **is success**. Fizzle = quietly stalling, not smallness.
- Positioning (red-team corrected): *"the only complete, validated CV workflow an AI agent can drive locally — schema in, designed PDF out — with zero dependencies beyond Node."* Never claim "only local MCP PDF renderer" (falsified: mcp-z/mcp-pdf, Reactive Resume MCP, cf-rendercv).
- Every sprint ends with: tests green on CI matrix, packaged E2E green, reproducibility gate green, no tarball-size regression (<500 kB).

---

## Sprint 0 — "Stop the bleeding" (hours, immediately)

| # | Item | Why (source) |
|---|---|---|
| 0.1 | Tag + push v1.2.0 → stable publish; verify `latest` dist-tag moves off the canary | Live hazard: `npx cvx` currently installs 1.2.0-next (pre-mortem inversion) |
| 0.2 | README hero image: Bruce Wayne two-column PDF page-1 screenshot (+ ATS thumbnail) above the fold; same into npm page | Design tool with zero visual proof (pre-mortem #4) |
| 0.3 | Repro runtime guard: `setupReproducibility` verifies its patch points took effect and the pdfkit dep is in the tested range; loud warning + non-reproducible exit note otherwise | Silent nondeterminism risk (pre-mortem #2) |
| 0.4 | CI: add alert-only job rendering against `@react-pdf/renderer@next` (allowed to fail, notifies) | Early warning for upstream breaks (pre-mortem #2) |

## Sprint 0.1 — Branding (hours, between Sprint 0 and Sprint 1)

*Inserted 2026-07-24. The CVX branding kit (`assets/brand/`, from `cvx-branding-kit.zip`) supersedes the design brief in `branding-plan.md`: approved concept is the dark-navy CV with document-V and signal-blue superscript X; palette ink navy `#0B1220` / signal blue `#2563EB` / terminal mint `#22D3A8` / pale `#F5F7FA`; typography Inter. The surface map and the hard rule (logo never on user output) from `branding-plan.md` still apply.*

Already done (rename commit): kit committed under `assets/brand/` (wordmark, lockups, standalone icon, 16–512 px icons, reference board); README header uses the horizontal lockup; `assets/` stays out of the npm tarball (`files` allowlist).

| # | Item | Why (source) |
|---|---|---|
| 0.1.1 | Compose `assets/brand/social-preview.png` (1280×640) from the lockup-with-tagline on pale background; set it in GitHub repo Settings → Social preview | Link unfurls + Show HN card (branding-plan surface map; feeds Sprint 2.7) |
| 0.1.2 | Upload `cvx-standalone-icon-1024.png` as GitHub org + repo avatar (manual) | MCP directories (Smithery) pull the GitHub avatar — recognition compounds across Sprint 2.5 |
| 0.1.3 | Verify the npm package page renders the README lockup (relative path → raw.githubusercontent rewrite); if not, switch the README `<img>` to an absolute URL | npm page is a primary landing (pre-mortem #4) |
| 0.1.4 | Mark `branding-plan.md` superseded by the kit (keep the hard rule + surface map); update its makecv-era specifics (teal anchor, lowercase wordmark, SVG file list) | Stale brief vs approved artwork |
| 0.1.5 | Housekeeping: extract `cvx-assets-preview.png` into `assets/brand/reference/`, then delete `cvx-branding-kit.zip` from the repo root; commit the `bin/cvx.js` +x mode change | Clean tree; zip contents otherwise fully committed |
| 0.1.6 | Backlog (non-blocking): trace an SVG master from the approved icon — the kit is raster-only, so crisp favicons at odd sizes and a `currentColor` dark variant aren't possible yet | branding-plan "must survive 16 px / monochrome" is only partially met |

**Hard rule restated:** the logo never appears on user output — no watermark, footer, or metadata branding in generated CVs.

**Status (2026-07-25): COMPLETE.** Commits `c1c66d0` (card + housekeeping), `f49e07d` (org avatar, full-bleed rebuild — GitHub double-rounds baked corners), `81e084e` (README drops "formerly makecv"). Manual steps confirmed done by maintainer: social preview set, org avatar uploaded, npm page renders the lockup. 0.1.6 (SVG master) remains backlog.

## Sprint 1 — v1.3 "It tells you what's wrong" (~2 weeks, target mid-Aug)

**Status (2026-07-25): code + docs COMPLETE, pushed through `a704ad0`.** 1.1 `c286f89` (schema, adversarially verified) · 1.2 `eb041e5` (validate; ajv now a runtime dep; schema/ ships in tarball) · 1.3 `97e8232` (--json + exit codes 0/2/3/64) · 1.4 `list` · 1.5+1.6 `396bb3d` ($schema headers, AGENTS.md/CLAUDE.md in scaffold, schemaVersion, README compat promise) · QA `a704ad0` (packaged E2E extended, docs synced from schema, docsSync tripwire test). 101 tests. **Shipped:** v1.3.0 released 2026-07-25 — tag `v1.3.0` → publish workflow → npm `latest` 1.3.0 (provenance); GitHub release "CVX v1.3.0 — it tells you what's wrong". 1.7 submitted: SchemaStore/schemastore#6130 (10 catalog entries, alphabetical slot; external review latency is theirs). Renderer bugs deferred: loadLayout.js:29 null-slot crash, layout.js text-less bullet crash, missing-file crashes (validate now fronts all three).

Order matters: schema first, everything else derives from it (red-team R-2: schema is the single source of truth).

| # | Item | Scope notes |
|---|---|---|
| 1.1 | **JSON Schema** for every content file + config, versioned URL (repo raw), authored as the canonical definition | Generate/check the other schema copies (docs/cv-schema.md tables, ai-guide Route C block, scaffold README, future SKILL.md) from it — CI check that they're in sync |
| 1.2 | **`cvx validate`** | All errors at once, file + field paths, suggested fixes. Catches (BA UC-T2): unknown content files, unknown keys per file, missing `personal.name`, unknown theme/layout, wrong types (bullets/progression), photo problems (basename, extension, missing). **Unknown keys = warnings by default; `--strict` promotes to errors** (agents use strict; humans don't get broken — pre-mortem #3) |
| 1.3 | **Agent-legible CLI**: `--json` on validate/build/init (stable stdout schema, logs→stderr), structured error codes, semantic exit codes (0 ok / 2 validation / 3 render / 64 usage), non-interactive everywhere, rewritten `--help` | BA: today bin exits 1 for everything |
| 1.4 | **`cvx list themes\|layouts [--json]`** | BA gap G-1 |
| 1.5 | **Scaffold upgrades**: `$schema` yaml-language-server headers in init output; init also writes AGENTS.md + CLAUDE.md into the user's folder | A2/A3; AGENTS.md read by 30+ tools |
| 1.6 | **`schemaVersion`** in config + written compatibility promise in README ("content files never break within a major") | Pre-mortem #3 |
| 1.7 | **SchemaStore PR** (fileMatch scoped `**/cv-content/*.yaml` + layouts) — submit early, external review latency is not ours | A2; non-blocking for release |
| QA | Extend packaged E2E: validate catches seeded errors, `--json` parses, exit codes correct; update docs from schema | |

**Release story:** exact errors in your terminal, autocomplete in your editor, structured output for your agent.

## Sprint 2 — v1.4 "Plug it into your agent" (2–3 weeks, Sep; canary-first)

**SHIPPED: v1.4.0 stable, 2026-07-26** — npm `latest` 1.4.0 (provenance), GitHub release "plug it into your agent". Post-canary additions: overflow fix `3d7f6c4`, mcp init version pinning, init_cv placeholder-photo nextSteps, skill/ai-guide review→brainstorm→pre-build-preview flow (`9a3fdf5`). Both dogfoods (ChatGPT docs path, Claude Code MCP path) logged in gauntlet.md.

**Post-1.4.0 progress (2026-07-27):**
- ✅ **MCP registry**: `io.github.hrtips/cvx` live (`status: active`), auto-published via OIDC workflow `.github/workflows/publish-mcp-registry.yml` (`3e065a2`) — interactive login can't do org namespaces; OIDC grants by repository_owner.
- ✅ **Landing page**: https://hrtips.github.io/cvx/ live via `.github/workflows/pages.yml` (`1d758c7`); Pages enabled once via admin API (workflow token can't self-enable first run).
- ❌ **awesome-mcp-servers PR** ([#11002](https://github.com/punkpeye/awesome-mcp-servers/pull/11002)): **DROPPED (2026-07-27).** Its only merge path is the Glama bot gate (Glama listing + score badge), and Glama's health check needs a container/GHCR image for the `mcp` subcommand start. We've decided against both the Glama listing and the container image, so the gate is unpassable. PR closed on GitHub (2026-07-27). The official MCP registry listing stays our curated presence.
- **Still open:** Claude plugin marketplace repo · 2.6 remainder (Ollama recipe; offline kit via standalone executable — container image dropped) · 2.7 launch (demo GIF + Show HN) · dogfood-triaged v1.4.x quick wins (`build --all`, `cvx doctor`, version+sha256 in `build --json`) · Sprint 3 schema sections (certifications/publications/languages/links — real-dogfood gap).

- **▶ NEXT UP — v1.5 "Nothing gets dropped" (DECIDED 2026-07-27, PM + BA brainstorm):** top priority is the silent content-loss hole — the only tested failure that is CVX's own fault. On a real senior profile the schema dropped 3 certifications (→ mixed into achievements), 3 publications (→ one summary bullet), 2 languages (→ gone), and a Medium blog link (no home in `personal.yaml`). Ship, all additive under the compat promise: `certifications.yaml`, `publications.yaml`, `languages.yaml`, a generalized `links:` array in `personal.yaml` (**keep** existing `linkedin`/`facebook` fields — additive, don't remove), and `build --all` (validate → designed + ATS in one command). **Deprioritized by the same brainstorm:** Ollama recipe + standalone executable (narrow segment, disproportionate solo burden — same logic that dropped the container), `cvx doctor` + version/sha256 (no observed pain — fill-in only). **Launch stays gated** on the gauntlet going green for ChatGPT + Claude web (both must reach a PDF).
  - **BUILT (2026-07-27, code complete — not yet committed/released):** schema $defs + 3 stub files (all sections optional; only the identifying field per entry required; `links` requires only `href`); 3 sidebar section components + registry; wired both silent-drop boundaries (`CVDocument` data bag + `ATSDocument` props); slots in both default layouts + all four `layouts/*.yaml`; `personal.links` in the two-column contact block (new globe icon) and both ATS contact lines; `build --all`; Bruce Wayne example content in both `cv-content/` dirs; docs synced (cv-schema, ai-guide, SKILL, scaffold README + AGENTS, llms.txt) + docsSync `CONTENT_DEFS`/per-key coverage extended. **131 tests green**; both variants verified visually + via lib-built PDF text. **Discovered, NOT fixed (pre-existing, out of scope):** the two-column engine inserts a spurious blank page on multi-page CVs (present before this change) — separate layout-engine bug. **⚠ v1.5 BLOCKER found by C0's content oracle (2026-07-27):** `build --all` renders both variants in one Node process, and @react-pdf/renderer leaks font-subset state across renders → the **second PDF (ATS) has a silently corrupted text layer** (glyphs look fine; text extraction / ATS parsing is garbled, e.g. "First Place"→"ir t Place"). Independently reproduced; standalone `build`/`build --ats` are clean. **Fix before shipping v1.5:** render each variant in isolation in `bin/cvx.js buildAll()` (separate process, or reset the font registry between renders). Details: `c0-retro.md`. Next: fix this blocker → commit + cut v1.5.0.
  - **▶ Layout engine track (researched + designed + the-fool-reviewed 2026-07-27):** the two-column packer wastes space / adds empty pages because it measures only the main column and never the sidebar. Full write-ups: `layout-packing-research.md` (evidence + citations) and `layout-packing-design.md` (algorithm). **Decided (post pre-mortem):** build the **full generic engine** (measurement-driven two-flow penalty optimizer, paracol/multicol/Knuth-Plass/galley/glue unified); **default fill = front-load**, balancing is an **LLM-hookable lever**; the **AI layout-tuning loop** (`plan_layout` + levers + diagnostics over MCP) is **on the roadmap** (after the engine). **QA owns an algorithm-correctness suite that gates every phase** (combinations × text-lengths × edge cases). Phases: 0 badge-fix → A font-measurement (**keep a shrunk safety margin, don't delete it**) → minimal "measure-sidebar + P=max + front-load" **shippable checkpoint** → B objective/glue engine (**time-boxed 1 wk; fall back to checkpoint if tuning stalls**) → C optimal DP (defer) → D MCP AI-loop. Guardrails: measure-vs-render diff test incl. non-Latin fallback; integer-quantized determinism + two-arch repro test; content-drop guard in `validate`. **Independent of v1.5** (never blocks it). **Full scoped sprint (7 work chunks C0–C7, harness-first, accuracy > speed): `sprint-layout-engine.md`.**

**Status (2026-07-25): code complete, canary out.** 2.1+2.2 `3b1cfbe` (mcp server on @modelcontextprotocol/sdk v1, 4 tools, mcp init for claude/claude-desktop/cursor/vscode, protocol tests) · 2.4-2.6+QA `900eea1` (skills/cvx/SKILL.md in tarball + tripwire, mcpName/server.json/topics, README+ai-guide Route E, CI MCP-handshake E2E). 112 tests; tarball 326 kB. **Canary published: `@hrtips/cvx@1.3.0-next.900eea1` (--tag next), smoke-tested via npx.** Open (need maintainer): dogfood in Claude Desktop + one IDE agent → then stable v1.4; mcp-publisher registry submit (interactive GitHub auth); Claude plugin marketplace repo; awesome-mcp-servers PR; 2.6 remainder (Ollama recipe, offline kit); 2.7 launch (demo GIF + Show HN). Stretch not started (.mcpb, cvx.dev one-pager).

| # | Item | Scope notes |
|---|---|---|
| 2.1 | **`npx cvx mcp`** stdio server, **4 tools only** (red-team: compressed): `get_schema` (returns schema + themes/layouts inventory), `init_cv`, `validate_cv`, `build_pdf` — thin wrappers over Sprint-1 CLI; no API keys, fully offline | The moat is the integrated loop, not tool count |
| 2.2 | **`cvx mcp init --client claude\|cursor\|vscode`** writes client config (shadcn pattern) | Best-in-class friction remover |
| 2.3 | **Canary first** (`--tag next`), dogfood end-to-end in Claude Desktop + one IDE agent before stable | Pre-mortem #1: small, provable increments |
| 2.4 | **SKILL.md** (agentskills.io format) generated from the JSON Schema + truthfulness rules; Claude plugin marketplace repo bundling skill + `.mcp.json`; submit to official directory | Nx split: MCP = actions, skill = knowledge |
| 2.5 | **Registry ops**: `mcpName` in package.json, `mcp-publisher` to official MCP registry, GitHub topics | Curated listings only; directories are bonus, not plan. (awesome-mcp-servers PR dropped 2026-07-27 — Glama-gated.) |
| 2.6 | **Docs wave**: tested Ollama recipe (P1 made demonstrable); Route D re-led with the durable-zip story ("the YAML is what you keep"); offline-install kit (BA G-5 — standalone executable; container image dropped) | Red-team #3: sell re-use, not formatting |
| 2.7 | **Launch**: demo GIF (agent interview → validate loop → PDF) + Show HN | Pre-mortem #4: listings without landings |
| Stretch | `.mcpb` one-click bundle on the GitHub release; cvx.dev one-pager + privacy policy (unblocks Claude Connectors submission later) | Only if sprint is ahead |

**Release story:** any agent — Claude, Cursor, VS Code, Gemini CLI, ChatGPT's own container — drives cvx end-to-end, locally.

**MCP dogfood (2026-07-26, `/tmp/sss` — Claude Code + cvx MCP server, real profile): PASSED the loop** (schema→init→edit→validate→build, placeholder photo deleted unprompted, pagination follow-up honored) **and found the best bug yet:** forced `page1ExperienceCount` overflow → yoga compressed fixed-height columns → silent glyph soup with build reporting success. Fixed same day (`3d7f6c4`): template columns minHeight (overflow now clips visibly), calibrated `page1-overflow` warning in validate/build/build_pdf (threshold 220, empirical), warnings array in build --json + MCP build_pdf, schema/doc semantics for pagination keys. Session-report friction triaged: pages count + preview tool + example-content hash warning → v1.4.x list below; init_cv nextSteps photo line + mcp init version pinning → v1.4.0 cut.

**Dogfood report triage (2026-07-26, `cvx-dogfooding-report.md` — real ChatGPT run, real profile):** front door held (fetched docs, correct LinkedIn ask, truthful); failed end-to-end on assistant dithering + sandbox npm 503. Doc fixes shipped same day (bounded probe, same-turn fallback, no-research-sink, $schema headers, conflict flagging, ATS role-splitting). Product items triaged:
- **v1.4.x (post-stable, small):** `build --all` (validate → designed + ATS in one command; report's #11.2/11.3 — note plan 4.3 already wanted `build --all`); CVX version + output sha256 in `build --json` (#11.14/11.15); `cvx doctor --json` (#11.1).
- **Sprint 3 additions (schema v1 additive — compat promise allows):** `certifications.yaml`, `publications.yaml`, `languages.yaml` sections; generalized `links:` array in personal (keep existing fields) (#11.7/11.8). Real-profile evidence: all four hit on one LinkedIn export.
- **Sprint 2.6 offline kit, validated + specified (#Option F):** standalone executable (container image dropped 2026-07-27); assistant sandboxes with broken npm proxies are a real, observed segment.
- **Sprint 4 alignment:** import review report / conflict JSON / provenance metadata (#11.9/11.10/11.12) folds into 4.2 `cvx import`.
- **`init --project` manifest** (package.json + lockfile + Actions workflow, #11.13) — candidate for Sprint 3.

---

# Not built yet

Everything below this line is **unbuilt**. Nothing here carries a version
number, deliberately: the old plan labelled these "v1.5" and "v1.6", both of
which then shipped as entirely different work (content sections, then the layout
packer), leaving headings that actively misled. Ship order is a decision at the
time, not a label written months earlier. What has shipped is in `CHANGELOG.md`.

## Next up — "The manual loop, perfected" *(when-ready)*

| # | Item | Note |
|---|---|---|
| M.1 | `cvx watch`: file-watch + incremental rebuild + auto-refreshing localhost preview (loopback only; lightweight deps — tarball guardrail) | The one users ask for; the edit→see loop today is re-running `build` by hand |
| M.2 | User-space themes: auto-discover `cv-content/themes/*.js` + `cvx new theme <name>` scaffold; README community-themes section (links out, no registry we control) | |
| M.3 | Claude Connectors Directory submission | Needs the privacy page (still unbuilt) |
| M.4 | `init --project` manifest: package.json + lockfile + Actions workflow, so a CV repo rebuilds itself in CI | From the ChatGPT dogfood (#11.13) |

## Later — "Your content, many targets" *(when-ready)*

| # | Item | Note |
|---|---|---|
| T.1 | **`build --ats --docx`**: DOCX output of the single-column variant via pure-JS `docx` | Red-team hit: Taleo/Workday parse DOCX more reliably than PDF. Until shipped, the docs note the limitation |
| T.2 | `cvx import resume.json` (JSON Resume → cv-content; lossy fields reported, never dropped) | Folds in the import-review/conflict/provenance items from the dogfood triage (#11.9/11.10/11.12) |
| T.3 | `cvx tailor`: variant dirs per job ad, diff vs base, `build --all`, staleness flag | CVX never writes the words |

## Layout engine — the remaining two chunks

Tracked in full in `sprint-layout-engine.md`; C0–C3 and C6a shipped, C4 was
measured and deferred, C5 is closed.

| # | Item | Note |
|---|---|---|
| C6b | MCP layout **levers** (`fill`, `density`, `order`, `targetPages` as a goal) | **Read C4's outcome note first.** C4 measured that optimising the obvious metric makes CVs visibly worse, so the `balance` lever as originally specified should not ship. A lever needs four things in one commit — schema key, `resolveDocument` whitelist, `plan_layout`/`build_pdf` input schema, and a fixture axis — or it is dead code that looks tested. The injection guard already exists |
| C7 | Docs/schema close-out for the engine | The `config.layout.*` schema, and regenerating the demo/hero images |

## Known defects and debt, recorded not fixed

| Item | Where |
|---|---|
| A summary taller than the whole column still adds an unnumbered sheet; it warns rather than failing silently | Closing it means making the summary a packable block — a contract change to what `pages.first.main` means |
| `validate` packs via `planTwoColumn` with the raw config and no layout, bypassing `resolveDocument` — so `validate` and `build` can describe different documents with a custom layout | Noted at `resolveDocument.js`; matters most when C6b adds levers |
| `entryH` predicts each experience entry ~6.7pt taller than react-pdf lays it out | Safe direction, bounded by a test. Fixing it moves page breaks and therefore the baseline |
| Split heads are never render-differenced (only tails are); the post-slice component reorder gap is uncovered | Both stated in the source docblocks that own them |
| The packaged `ai-guide.md` still links to `main` for its sibling docs | Pinning those needs pack-time rewriting — a decision, not an oversight |
| Hero images are the 1.5.0 render; the caption says so | Cosmetic. Worth redoing whenever the demo CV stops ending on a near-empty page |

## Standing tracks (no release gate)

- **Community**: label good-first-issues from Sprint 1 onward; aim for a co-maintainer conversation before Sprint 3 (pre-mortem #1).
- **Metrics** (all public, zero telemetry): npm weekly downloads = guarded vanity (container/CI inflated); honest signals = GitHub referrers from chat domains, issue diversity, community themes, external contributors/quarter.
- **Upstream**: file the deterministic-rendering issue/PR against react-pdf so reproducibility stops depending on monkey-patches.

## Cut / never (unchanged)

Hosted anything (self-hostable-only backlog behind the four-point gate) · telemetry · paid tiers · cvx calling LLMs · embellishment features · GPT Actions · further llms.txt investment · hosted GUI · registries we control · container/Docker image · Glama directory listing (and its awesome-mcp-servers PR).
