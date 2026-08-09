# The two-prompt gauntlet — monthly front-door eval

*From the PM/BA review, 2026-07-25. Zero-telemetry success metric for the "two things" UX: run by hand monthly (and after any front-door doc change), scored here.*

## The prompt (verbatim, no extra hints)

```text
Create my CV with https://github.com/hrtips/cvx — open that page and follow its instructions for AI assistants.
Here is my LinkedIn profile: https://www.linkedin.com/in/<fixture-profile>
```

Also run the **bare variant** (the thesis in its rawest form): `I want to create my CV using https://github.com/hrtips/cvx and here is my linkedin profile: <url>` — the docs must carry this one too.

## Fixture

Use a fixture identity, not your own: the LinkedIn "Save to PDF" export of a test profile (or any consistent fake-person CV PDF kept in `research/fixtures/`). When the assistant asks for the export (stage 2 pass), attach it.

## Score sheet — 4 binary stages per assistant

| Stage | Pass condition |
|---|---|
| S1 Fetch | Assistant fetched the repo and visibly followed CVX instructions (mentions the flow/schema, not generic CV advice) |
| S2 LinkedIn wall | On the unfetchable URL it asked for the Save-to-PDF export / paste / attachment **in one turn, without fabricating any career detail** |
| S3 Valid files | Saved output passes `npx @hrtips/cvx validate --strict` locally with zero errors |
| S4 PDF reached | The session ends with a real CVX-rendered PDF in hand (any path: assistant ran it, or handoff steps worked first try) |

**Instant fail regardless of stages:** any invented fact, or the assistant substituting another PDF generator instead of CVX.

## Log

| Date | Assistant | S1 | S2 | S3 | S4 | Notes |
|---|---|---|---|---|---|---|
| 2026-07-26 | ChatGPT | ✅ | ✅ | ➖ | ❌ | Real-profile run (see `../cvx-dogfooding-report.md`). Followed docs, asked for Save-to-PDF export correctly, truthful, good YAML. Failed S4 on two counts: assistant research-sink + late runtime probe (needed 2 user nudges), and sandbox npm proxy 503 (environment). S3 untested by CVX (files not validated in-session; PyYAML-parse only). Doc fixes shipped same day: bounded probe first, same-turn fallback, no-research-sink rule, $schema headers in generated files, conflict flagging, ATS role-splitting guidance. |
| 2026-07-26 | Claude Code (MCP) | ✅ | ✅ | ✅ | ✅* | MCP-route dogfood (`/tmp/sss/cvx-session-report.md`): full tool loop, validate-first behavior, placeholder photo deleted unprompted. *S4 asterisk: the delivered PDF was silently corrupted by the page1ExperienceCount:4 overflow bug (renderer, not agent) — found, fixed, and warned-for same day (`3d7f6c4`). |
| _(next run)_ | Claude web | | | | | |
| | Gemini | | | | | |

North star: S4 pass rate across the three assistants. Fix the lowest-scoring stage's doc surface before the next run.
