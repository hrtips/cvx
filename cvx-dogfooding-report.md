# CVX Dogfooding Report

## LinkedIn PDF → CVX YAML → PDF

**Date:** 26 July 2026  
**Project:** [hrtips/cvx](https://github.com/hrtips/cvx)  
**Input:** `Profile.pdf`, a three-page LinkedIn export  
**Generated source:** `ramith-jayasinghe-cvx-source.zip`  
**Final outcome:** CVX source generated; PDF generation did not complete in the assistant environment.

---

## 1. Executive summary

The exercise achieved the content-conversion stage but failed the end-to-end goal.

The assistant produced nine CVX YAML files and packaged them as a reusable source ZIP. The YAML files parse successfully.

The assistant did not produce either requested PDF:

- `ramith-jayasinghe.pdf`
- `ramith-jayasinghe-ats.pdf`

Two separate problems caused this result.

1. **The assistant delayed execution.** It kept inspecting the repository after the LinkedIn PDF became available.
2. **The runtime could not download CVX from npm.** The configured npm proxy returned HTTP 503 responses.

The first problem was an orchestration failure. The second was an environment failure.

The assistant should have detected the environment failure within the first execution step. It could then have generated the source package immediately and reported the precise blocker.

Instead, the conversation required two user interventions:

- “what’s going on?”
- “whats stopping you from doing it?”

That is the primary dogfooding finding.

---

## 2. Intended success criteria

The original request implied this end state:

1. Read the LinkedIn profile.
2. Convert the content into CVX YAML.
3. Validate the YAML with CVX.
4. Generate the designed PDF.
5. Generate the Applicant Tracking System (ATS) PDF.
6. Deliver both PDFs.
7. Deliver the reusable `cv-content/` source.

CVX’s AI guide explicitly describes this flow.[^1]

The final result met steps 1, 2, and 7.

Steps 3, 4, 5, and 6 did not complete.

---

## 3. Inputs

### 3.1 LinkedIn export

The supplied LinkedIn PDF contained:

- contact details;
- a professional summary;
- 11 job titles across several employers;
- one university degree;
- three certifications;
- three award listings;
- three publications;
- two languages;
- a Medium blog address.

The profile also contained a title conflict:

- the profile headline and current experience entry said **Senior Enterprise Architect**;
- the summary said **Director of Solution Architecture**.

That conflict required confirmation before a final CV.

### 3.2 CVX documentation

The assistant inspected these CVX sources:

- `README.md`;
- `docs/ai-guide.md`;
- `docs/cv-schema.md`;
- `schema/v1/cvx.schema.json`;
- `package.json`;
- `.github/workflows/ci.yml`.

The checked repository version was `1.3.0`.[^2]

CVX requires Node.js 20 or later.[^2]

---

## 4. Expected CVX flow

CVX documents the following assistant workflow:[^1]

1. Obtain truthful source content.
2. Fetch the CVX schema.
3. Probe whether CVX can execute.
4. Generate the `cv-content/` files.
5. Run strict validation.
6. Build the designed PDF.
7. Build the ATS PDF.
8. Deliver both PDFs and the source ZIP.

The correct shell probe was:

```bash
npx -y @hrtips/cvx --version
```

That probe should have happened immediately after the PDF became available.

It did not.

---

## 5. What actually happened

### Stage 1 — Initial request

The user supplied:

- the CVX repository URL;
- a LinkedIn profile URL.

The assistant correctly read CVX’s AI instructions.

CVX states that LinkedIn pages should be treated as unavailable to automated assistants. It recommends a LinkedIn PDF export.[^1]

### Stage 2 — Source request

The assistant asked for:

- the LinkedIn PDF;
- an optional square photograph;
- an optional target job advertisement.

This matched CVX’s documented flow.[^1]

### Stage 3 — PDF upload

The user uploaded a three-page LinkedIn PDF.

At this point, the assistant had enough information to begin.

The next action should have been an environment probe.

### Stage 4 — Repository over-investigation

Instead of starting the build, the assistant continued examining the repository.

It fetched documentation that had already established the required flow.

It also attempted GitHub Actions artifact operations without a valid workflow run identifier. Those calls returned HTTP 404 errors.

These operations did not help generate the CV.

This was a research sink: more repository context was gathered after the execution path was already known.

### Stage 5 — No visible progress

The assistant did not explain which stage was running.

The user asked:

> what’s going on?

The assistant replied that it had parsed the PDF and would proceed.

No PDF build followed.

### Stage 6 — Second user intervention

The user asked:

> whats stopping you from doing it?

The assistant replied:

> Nothing technical.

That statement was premature.

The environment had not yet been tested successfully.

A later probe showed that a technical blocker did exist.

### Stage 7 — Source package generated

The assistant generated:

- nine YAML files;
- a `README.md`;
- a `REVIEW-NOTES.md`;
- a `build.sh`;
- a ZIP archive.

This was useful output.

However, the source was not validated by CVX.

The PDFs were not generated.

### Stage 8 — Environment failure verified

During this postmortem, the environment was tested.

Installed runtime:

```text
Node.js: v22.16.0
npm:     10.9.2
```

Node.js met CVX’s minimum requirement.

The command below timed out:

```bash
npx -y @hrtips/cvx --version
```

A direct package query produced this result:

```text
GET .../artifactory/api/npm/npm-public/@hrtips%2fcvx
attempt 1 failed with 503
attempt 2 failed with 503
```

The command was stopped after 20 seconds and returned exit code `124`.

Therefore, the immediate PDF blocker was not Node.js.

The blocker was npm package access through the assistant runtime’s internal package proxy.

---

## 6. Root-cause analysis

### 6.1 Primary process failure

**The assistant had no explicit stage machine.**

It mixed these activities:

- source acquisition;
- documentation inspection;
- execution planning;
- environment testing;
- content generation.

There was no gate such as:

```text
SOURCE_READY → RUNTIME_PROBE → GENERATE → VALIDATE → BUILD → DELIVER
```

Without this structure, repository exploration continued after it stopped adding value.

### 6.2 Primary technical failure

**CVX was not installed, and npm access failed.**

The runtime routed package downloads through an internal Artifactory endpoint.

That endpoint returned HTTP 503.

CVX could not start.

### 6.3 Contributing factor: late runtime probe

The environment probe happened after the source ZIP had already been generated.

It should have happened before repository deep-dives.

An early probe would have reduced uncertainty within 20–30 seconds.

### 6.4 Contributing factor: unsupported confidence

The assistant said there was “nothing technical” blocking execution.

That statement was not based on a completed runtime probe.

The correct statement was:

> I have not tested the CVX runtime yet. I am doing that now.

### 6.5 Contributing factor: connector bias

The GitHub connector made repository inspection easy.

It did not provide a CVX runtime.

The tool encouraged information gathering, while the task required local execution.

### 6.6 Contributing factor: no deterministic fallback

The AI guide defines a fallback when CVX cannot run: create the complete source package and provide build instructions.[^1]

The assistant eventually used that fallback.

It should have switched to it immediately after the first package-access failure.

---

## 7. What worked

### 7.1 LinkedIn acquisition guidance

The request for a LinkedIn PDF was correct.

This avoided inventing profile content from an inaccessible page.

### 7.2 Source parsing

The three-page PDF was parsed successfully.

The parser captured the main text across all pages.

### 7.3 Truthfulness constraint

The generated CV did not invent performance figures.

This followed CVX’s instruction to avoid unsupported metrics.[^3]

### 7.4 Privacy decision

The generated CV used:

```text
Colombo, Sri Lanka
```

It omitted the residential street address.

This reduced unnecessary exposure.

### 7.5 Reusable source

The source ZIP contains the editable CVX content.

That remains useful even without the PDFs.

### 7.6 YAML syntax

All nine YAML files were tested with PyYAML `6.0.3`.

Each file parsed successfully.

This proves YAML syntax validity.

It does **not** prove CVX schema validity.

### 7.7 Executable build script

`build.sh` has Unix mode `755`.

It can run on macOS or Linux after CVX becomes available.

---

## 8. Generated-source audit

The source package is usable as a draft, but it needs review.

### 8.1 Files generated

```text
ramith-cvx/
├── README.md
├── REVIEW-NOTES.md
├── build.sh
└── cv-content/
    ├── achievements.yaml
    ├── competencies.yaml
    ├── config.yaml
    ├── education.yaml
    ├── experience.yaml
    ├── keywords.yaml
    ├── personal.yaml
    ├── referees.yaml
    └── summary.yaml
```

### 8.2 Current-title conflict

`personal.yaml` uses:

```yaml
title: Senior Enterprise Architect
```

That matches the LinkedIn headline and current experience entry.

The LinkedIn summary says **Director of Solution Architecture**.

This conflict remains unresolved.

**Recommendation:** Confirm the official current title before publishing the CV.

### 8.3 Combined WSO2 entry

The recent WSO2 period is represented as one entry:

```yaml
role: Senior Enterprise Architect
period: Aug 2019 - Present
```

Its progression includes:

- Senior Enterprise Architect;
- Director of Engineering.

The headline role and the overall period do not describe the same position.

A reader could interpret the Senior Enterprise Architect role as starting in August 2019.

**Recommendation:** Use an umbrella role headline, or split the two positions.

Example:

```yaml
- role: Solution Architecture and Engineering Leadership
  company: WSO2
  period: Aug 2019 – Present
  progression:
    - title: Senior Enterprise Architect
      period: Feb 2024 – Present
    - title: Director of Engineering
      period: Aug 2019 – Feb 2024
```

### 8.4 Earlier roles were compressed

Five roles were grouped under:

```text
Earlier Engineering, Research, and Telecommunications Roles
```

This reduces page length.

It also weakens ATS extraction.

CVX auto-derives keywords from role titles and progression titles.[^3]

Titles written only inside bullet text may not receive the same treatment.

Affected titles include:

- Consultant;
- Senior Software Engineer;
- Research Fellow;
- Senior Executive — Charging Systems;
- Software Engineer.

**Recommendation:** Keep each earlier job as a separate entry with one bullet.

### 8.5 Award duplication mismatch

The LinkedIn export lists **WSO2 Outstanding Contribution Award** twice.

`REVIEW-NOTES.md` says the duplicate became “received twice.”

The generated `achievements.yaml` lists the award once.

It does not state “received twice.”

This is an internal inconsistency.

**Recommendation:** Either list the award twice with known years, or write:

```yaml
- year: WSO2 Outstanding Contribution Award
  text: "— Received twice, WSO2"
```

Use this only after confirming the duplicate represents two separate awards.

### 8.6 Certifications were mapped as achievements

The following items appear in `achievements.yaml`:

- LFD259: Kubernetes for Developers;
- Product Management Program;
- Product Management: Transforming Opportunities into Great Products.

This is valid under the current schema.

It mixes certifications with awards.

**Recommendation:** CVX should support a dedicated `certifications.yaml` section.

### 8.7 Languages were omitted

The source lists:

- English;
- Sinhalese.

The generated files do not include them.

The current built-in schema has no dedicated language section.

**Recommendation:** Add a language section to CVX, or support it through a custom layout.

### 8.8 Publications were reduced

The LinkedIn export contains three publication titles.

The generated CV mentions their subjects in one summary bullet.

The publication titles are not shown as a section.

**Recommendation:** Add `publications.yaml` support.

### 8.9 Blog URL was omitted

The profile contains:

```text
medium.com/@ramithj
```

`personal.yaml` does not include it.

The current personal schema supports LinkedIn and Facebook, but not arbitrary links.[^3]

**Recommendation:** Replace social-network-specific fields with a general links array.

Example:

```yaml
links:
  - label: LinkedIn
    href: https://www.linkedin.com/in/ramithj
  - label: Writing
    href: https://medium.com/@ramithj
```

### 8.10 Schema headers were omitted

The generated YAML files do not contain `$schema` headers.

These headers are not required for rendering.

They improve editor validation and auto-completion.

**Recommendation:** Include the per-file schema header in generated files.

### 8.11 Package version was not pinned

The script uses:

```bash
npx @hrtips/cvx
```

That resolves the latest available release.

A future release could alter layout or rendering.

CVX promises schema compatibility within schema version 1.[^4]

That does not guarantee identical visual output across package versions.

**Recommendation:** Pin the tested version:

```bash
npx -y @hrtips/cvx@1.3.0
```

### 8.12 No lockfile

The source ZIP has no `package.json` or `package-lock.json`.

Therefore, it does not lock the CVX package and transitive dependencies.

**Recommendation:** Include both files for reproducible builds.

---

## 9. How to generate the PDFs successfully now

## Option A — Build locally with npm

This is the lowest-effort route.

### Requirements

- Node.js 20 or later;
- npm access;
- the extracted source ZIP.

### Commands

```bash
unzip ramith-jayasinghe-cvx-source.zip
cd ramith-cvx

npx -y @hrtips/cvx@1.3.0 validate --strict
npx -y @hrtips/cvx@1.3.0 build
npx -y @hrtips/cvx@1.3.0 build --ats
```

Expected output:

```text
ramith-jayasinghe.pdf
ramith-jayasinghe-ats.pdf
```

Add an optional photograph before building:

```text
cv-content/images/profile.jpg
```

CVX recommends a square image of at least 400 × 400 pixels.[^3]

### Verification

```bash
test -s ramith-jayasinghe.pdf
test -s ramith-jayasinghe-ats.pdf
ls -lh ramith-jayasinghe*.pdf
```

---

## Option B — Add a local project dependency

This route provides better reproducibility.

Create `package.json`:

```json
{
  "name": "ramith-jayasinghe-cv",
  "private": true,
  "scripts": {
    "validate": "cvx validate --strict",
    "build:designed": "cvx build",
    "build:ats": "cvx build --ats",
    "build": "npm run validate && npm run build:designed && npm run build:ats"
  },
  "devDependencies": {
    "@hrtips/cvx": "1.3.0"
  }
}
```

Then run:

```bash
npm install
npm run build
```

Commit the generated `package-lock.json`.

Future builds can use:

```bash
npm ci
npm run build
```

This pins CVX and all resolved dependencies.

---

## Option C — Build through GitHub Actions

This route removes local machine differences.

Create `.github/workflows/build-cv.yml`:

```yaml
name: Build CV

on:
  workflow_dispatch:
  push:
    paths:
      - "cv-content/**"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/build-cv.yml"

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: 22

      - run: npm ci

      - run: npm run validate
      - run: npm run build:designed
      - run: npm run build:ats

      - uses: actions/upload-artifact@v4
        with:
          name: ramith-jayasinghe-cv
          path: |
            ramith-jayasinghe.pdf
            ramith-jayasinghe-ats.pdf
            cv-content/**
```

The workflow produces a downloadable artifact containing both PDFs and the source.

---

## Option D — Build from the CVX repository

This route is appropriate while dogfooding unreleased CVX changes.

```bash
git clone https://github.com/hrtips/cvx.git
cd cvx
npm ci
npm run build:lib
```

Copy the generated CV source beside the repository or into a test directory.

Then invoke the local CLI:

```bash
node /path/to/cvx/bin/cvx.js validate --strict
node /path/to/cvx/bin/cvx.js build
node /path/to/cvx/bin/cvx.js build --ats
```

This tests the repository version rather than the published npm version.

CVX’s own continuous integration performs packaged end-to-end builds across Node.js 20, 22, and 24.[^5]

---

## Option E — Use the CVX MCP server

CVX includes a Model Context Protocol (MCP) server with these tools:[^1]

- `get_schema`;
- `init_cv`;
- `validate_cv`;
- `build_pdf`.

For Visual Studio Code:

```bash
npx @hrtips/cvx mcp init --client vscode
```

After restarting the client, an assistant can execute validation and rendering through CVX’s native tools.

This is the cleanest assistant workflow when npm access exists on the user’s machine.

---

## Option F — Offline or restricted environments

The current assistant environment cannot use the public npm package through its configured proxy.

One of these assets would remove that dependency:

1. a CVX Docker image;
2. a standalone executable;
3. a self-contained package with bundled runtime dependencies;
4. a pre-populated npm cache;
5. a workspace with CVX already installed;
6. a connected CVX MCP server.

Uploading only the `@hrtips/cvx` package tarball may not be enough.

Its runtime dependencies must also be available.

---

## 10. Recommended assistant flow

The assistant should use a strict state machine.

### State 1 — Acquire source

Input priority:

1. existing CV;
2. LinkedIn PDF;
3. pasted profile text;
4. structured interview.

Do not infer inaccessible LinkedIn content.

### State 2 — Probe runtime

Run one command with a bounded timeout:

```bash
timeout 30s npx -y @hrtips/cvx@1.3.0 --version
```

On macOS, use a process-level timeout in the agent runtime.

Do not allow the probe to hang indefinitely.

### State 3A — Runtime available

Run:

```bash
npx -y @hrtips/cvx@1.3.0 init
```

Replace the example content.

Delete the example photograph.

Then run strict validation and both builds.

### State 3B — Runtime unavailable

Do not keep investigating the repository.

Generate the complete `cv-content/` source.

Perform local YAML parsing.

Package the source.

Report the exact runtime error.

Provide a tested handoff command.

### State 4 — Content-quality review

Before rendering, detect:

- conflicting titles;
- missing dates;
- duplicated awards;
- unsupported sections;
- unverified metrics;
- unnecessary private data.

Ask only questions that block publication.

### State 5 — Validate

Run:

```bash
cvx validate --strict --json
```

Fix every error.

Report warnings separately.

### State 6 — Build

Generate both variants:

```bash
cvx build
cvx build --ats
```

### State 7 — Verify outputs

Check:

- both files exist;
- both files have non-zero size;
- the PDFs open;
- the designed version contains the intended photograph;
- the ATS version contains selectable text;
- no Bruce Wayne scaffold content remains.

### State 8 — Deliver

Deliver:

- designed PDF;
- ATS PDF;
- source ZIP;
- a short review note;
- validation output.

---

## 11. Proposed CVX improvements

## Priority 0 — End-to-end reliability

### 11.1 Add `cvx doctor`

Proposed command:

```bash
cvx doctor --json
```

It should report:

- CVX version;
- Node.js version;
- source directory status;
- write permissions;
- font availability;
- schema version;
- output directory status;
- whether a profile image was detected.

For `npx` users, network access remains npm’s responsibility.

The AI guide should still recommend a bounded package probe.

### 11.2 Add `cvx build --both`

Current flow requires two build commands.

Proposed command:

```bash
cvx build --both
```

It should:

1. validate;
2. build the designed PDF;
3. build the ATS PDF;
4. return both output paths.

This reduces assistant orchestration failures.

### 11.3 Add `--validate-first`

Proposed behaviour:

```bash
cvx build --validate-first
```

A build should fail before rendering when strict validation fails.

### 11.4 Publish an official container image

Example:

```bash
docker run --rm \
  -v "$PWD:/work" \
  ghcr.io/hrtips/cvx:1.3.0 \
  build --both
```

This removes local Node.js and npm variability.

### 11.5 Publish a standalone release artifact

A platform executable would avoid npm installation.

Potential targets:

- macOS arm64;
- macOS x64;
- Linux x64;
- Windows x64.

### 11.6 Add bounded-probe guidance

The AI guide currently recommends probing CVX availability.[^1]

It should also specify:

- a timeout;
- one retry;
- the fallback path;
- no repeated repository exploration.

---

## Priority 1 — Better source fidelity

### 11.7 Add dedicated sections

Add built-in support for:

- certifications;
- publications;
- languages;
- projects;
- patents;
- professional memberships;
- arbitrary links.

The LinkedIn export exposed all these schema gaps.

### 11.8 Generalise contact links

Replace fixed social fields with:

```yaml
links:
  - label: LinkedIn
    href: ...
  - label: Blog
    href: ...
```

Keep existing fields for backward compatibility.

### 11.9 Add source-conflict reporting

A machine-readable report could identify:

```json
{
  "conflicts": [
    {
      "field": "currentTitle",
      "values": [
        "Senior Enterprise Architect",
        "Director of Solution Architecture"
      ]
    }
  ]
}
```

This would prevent silent editorial decisions.

### 11.10 Add provenance metadata

Allow each item to retain its source:

```yaml
role: Senior Enterprise Architect
_source:
  document: Profile.pdf
  page: 1
```

The renderer could ignore `_source`.

Validation tooling could use it for review.

### 11.11 Preserve earlier role titles

CVX guidance should warn assistants that grouping old roles may reduce ATS title extraction.

The guide should recommend separate entries with fewer bullets.

### 11.12 Add an import review report

Proposed output:

```text
cv-content/import-report.md
```

It should list:

- imported fields;
- omitted fields;
- transformed fields;
- conflicts;
- unsupported source sections;
- facts requiring confirmation.

---

## Priority 2 — Reproducibility and diagnostics

### 11.13 Generate a project manifest

`cvx init --project` could create:

- `package.json`;
- `package-lock.json`;
- build scripts;
- `.gitignore`;
- a GitHub Actions workflow.

### 11.14 Record renderer version

Embed the CVX version into:

- PDF metadata;
- validation JSON;
- build JSON;
- source manifest.

### 11.15 Add checksums

`cvx build --json` could return:

```json
{
  "outputs": [
    {
      "path": "ramith-jayasinghe.pdf",
      "sha256": "..."
    }
  ]
}
```

CVX already tests byte-identical reproducibility using `SOURCE_DATE_EPOCH` in continuous integration.[^5]

### 11.16 Improve dependency-failure messaging

When used through `npx`, package retrieval can fail before CVX starts.

The documentation should include common npm failures:

- HTTP 401;
- HTTP 403;
- HTTP 404;
- HTTP 429;
- HTTP 503;
- certificate errors;
- proxy errors;
- DNS errors.

---

## 12. Suggested improved `build.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

CVX_VERSION="${CVX_VERSION:-1.3.0}"
CVX_PACKAGE="@hrtips/cvx@${CVX_VERSION}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 20 or later." >&2
  exit 64
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"

if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or later is required. Found $(node --version)." >&2
  exit 64
fi

echo "Using Node.js $(node --version)"
echo "Using ${CVX_PACKAGE}"

npx -y "${CVX_PACKAGE}" validate --strict
npx -y "${CVX_PACKAGE}" build
npx -y "${CVX_PACKAGE}" build --ats

for output in ramith-jayasinghe.pdf ramith-jayasinghe-ats.pdf; do
  if [ ! -s "$output" ]; then
    echo "Expected output was not created: ${output}" >&2
    exit 3
  fi
done

echo "Created:"
ls -lh ramith-jayasinghe.pdf ramith-jayasinghe-ats.pdf
```

For stronger reproducibility, replace `npx` with a locked local dependency.

---

## 13. Proposed dogfooding test matrix

| Test | Expected result |
|---|---|
| LinkedIn URL only | Assistant requests PDF export once |
| LinkedIn PDF, no photo | Designed CV renders without photograph |
| Conflicting current titles | Assistant requests confirmation |
| Duplicate award names | Import report flags duplicates |
| 20-year work history | Older roles remain ATS-visible |
| Publications present | Publication section renders |
| Languages present | Language section renders |
| Blog URL present | Generic link renders |
| Invalid YAML | Strict validation returns file and field |
| Unknown YAML key | Strict validation fails |
| npm unavailable | Assistant switches to source-only fallback |
| npm HTTP 503 | Exact proxy error reported |
| Node.js 18 | Doctor reports unsupported version |
| No write permission | Doctor reports output-directory failure |
| Long first page | Pagination tuning produces two readable pages |
| Placeholder photo remains | Build or validation warns |
| Designed build succeeds | Non-empty PDF exists |
| ATS build succeeds | Non-empty ATS PDF exists |
| Repeated pinned build | Checksums match with fixed source epoch |

---

## 14. Acceptance criteria for the next run

The next dogfooding run should meet these criteria:

1. The assistant probes the CVX runtime immediately after receiving source content.
2. The probe finishes or times out within 30 seconds.
3. The assistant does not repeat repository research after the execution route is known.
4. Source generation begins in the same turn as the runtime result.
5. Every generated YAML file parses.
6. CVX strict validation passes.
7. Both PDFs are generated.
8. Both PDFs are opened or structurally verified.
9. The source ZIP is delivered.
10. The assistant reports every unresolved factual conflict.
11. No performance metric is invented.
12. No scaffolded Bruce Wayne content remains.
13. The CVX package version is recorded.
14. Failure reports contain the command, exit code, and relevant error.
15. The user does not need to ask for status.

---

## 15. Recommended next action

Use **Option A** for the immediate PDF build.

Before publishing the CV, confirm the current title:

- Senior Enterprise Architect; or
- Director of Solution Architecture.

Then review these content decisions:

- separate earlier roles;
- restore languages;
- restore publication titles;
- include the Medium blog;
- confirm whether the duplicated award means it was received twice.

For continued CVX dogfooding, add the GitHub Actions workflow from Option C.

It provides a repeatable build path and produces downloadable PDF artifacts.

---

## 16. Final assessment

### Product result

**Partial success.**

The source format was easy to understand and generate.

The current schema handled core CV content with little friction.

The schema lost information from certifications, publications, languages, and arbitrary links.

### Assistant result

**Failed end-to-end.**

The assistant generated a useful source package.

It did not validate with CVX.

It did not generate either PDF.

It required user prompting before reporting progress.

### Environment result

**Blocked by package infrastructure.**

Node.js was compatible.

The npm proxy returned HTTP 503.

A local build, GitHub Actions build, preinstalled MCP server, container image, or standalone executable would complete the flow.

---

## References

[^1]: CVX AI guide: <https://github.com/hrtips/cvx/blob/main/docs/ai-guide.md>
[^2]: CVX package metadata: <https://github.com/hrtips/cvx/blob/main/package.json>
[^3]: CVX content schema documentation: <https://github.com/hrtips/cvx/blob/main/docs/cv-schema.md>
[^4]: CVX README and schema compatibility promise: <https://github.com/hrtips/cvx/blob/main/README.md>
[^5]: CVX continuous-integration workflow: <https://github.com/hrtips/cvx/blob/main/.github/workflows/ci.yml>
