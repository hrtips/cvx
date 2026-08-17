# Running CVX inside a Custom GPT

A Custom GPT can drive CVX end to end — draft the YAML, render the PDF, **look at
the PDF it just rendered**, fix the layout, and hand back a finished CV. That loop
is the point: an assistant that only writes YAML has to pass the build back to the
user and never sees what it produced.

> **There is no CVX GPT to install.** Nobody publishes one, so this page is the
> recipe for building your own — about three minutes, every input a public URL,
> and nothing here needs updating when CVX releases a new version.
>
> **Check you can build one before you start.** OpenAI restricts who may create
> and publish GPTs, and the restriction has moved more than once
> ([Troubleshooting GPTs](https://help.openai.com/en/articles/11325361-troubleshooting-gpts)
> is the current word). If your account cannot, nothing below will help — but the
> next paragraph will.
>
> **You do not need a GPT at all.** Download `cvx.bundle.min.js.zip` (0.92 MB) from
> the [latest release](https://github.com/hrtips/cvx/releases/latest), upload it
> into an ordinary ChatGPT conversation, and ask it to unzip and run — see
> [Route D](ai-guide.md#route-d--agent-mode-assistant-zero-local-setup). This works
> on any account with no builder involved, and you get the same thing that matters:
> the assistant renders the PDF, looks at the pages, and fixes the layout before
> you see it. The only cost is re-uploading once per conversation, which is
> precisely the chore a GPT's action removes.

## Three-minute setup

1. **Create a GPT** → Configure
2. **Instructions:** paste the whole of
   `https://hrtips.github.io/cvx/gpt/instructions.txt`
3. **Actions → Import from URL:** `https://hrtips.github.io/cvx/gpt/openapi.json`
4. **Actions → Privacy policy:** `https://hrtips.github.io/cvx/privacy`
5. **Capabilities:** tick **Code Interpreter & Data Analysis**
6. **Knowledge:** leave empty — the action delivers CVX

That is a working GPT, for you. Sharing it with anyone else is a separate question
with its own answer — see [Sharing it](#sharing-it) below; do step 4 regardless,
because it is a precondition and costs nothing.

Name, description and conversation starters are below; the rest of this page
explains why it is built this way.

## The design, and why it is this one

**The GPT downloads CVX at run time. Nothing is attached to it.**

The obvious approach — ship the bundle as a Knowledge file — does not survive
contact with releases. A Custom GPT's Knowledge attachments can only be changed by
hand: there is no ChatGPT API for them, so no workflow can refresh one. Every CVX
release would mean re-uploading a file manually, and between releases the GPT would
silently serve a stale build with no way for anyone to notice.

So instead an **Action** hands the bundle over as a file:

```
GPT calls  https://hrtips.github.io/cvx/gpt/bundle.json
              ↓  (openaiFileResponse: the zipped bundle, base64)
ChatGPT materialises the file for Code Interpreter
              ↓  unzip, then `node cvx.bundle.min.js build`
```

Two properties fall out of that, and both matter:

- **No version appears anywhere in the GPT.** The Action schema and the
  instructions name a fixed URL that always yields the newest release, so a CVX
  release needs *no change to the GPT at all*.
- **No server.** The endpoint is a static file. CI regenerates it from the
  published release and GitHub Pages serves it, so there is nothing to run, pay
  for, or keep up. It accepts no input and carries no CV content.

The file travels as an `openaiFileResponse`, which ChatGPT materialises for Code
Interpreter rather than reading into the conversation — which is the only reason a
megabyte-scale artifact can go this way at all.

## Setup

### 1. Create the GPT

**Name**

```
CVX — CV & Résumé Builder
```

**Description**

```
Turns your existing CV or LinkedIn export into a designed, pixel-perfect PDF — plus an ATS-safe version — and hands back the YAML source so you can update it any time. Every fact stays yours: it invents nothing.
```

**Conversation starters** — one per real capability, each inviting the user to
bring their material, which is what the first reply asks for anyway:

```
Turn my current CV into a polished PDF
Tailor my CV for a specific job ad
Make an ATS-safe version of my resume
Build my CV from my LinkedIn export
```

**Knowledge:** leave empty. That is the design — the bundle arrives through the
action, so there is nothing to attach and nothing to re-upload on a release.

**Capabilities:** enable **Code Interpreter & Data Analysis**. It is what runs
`node`, and what lets the GPT open the PDF it produced. Web Browsing is not
needed, and cannot substitute for it.

**Recommended model:** pick a strong reasoning model rather than leaving it open.
Reading a rendered page and deciding what to tighten is judgement work, and the
smallest models do it badly.

### 2. Add the Action

**Configure → Actions → Create new action**

- **Authentication:** None
- **Schema:** *Import from URL* →
  `https://hrtips.github.io/cvx/gpt/openapi.json`
- **Privacy policy URL:** `https://hrtips.github.io/cvx/privacy`

Fill in that last field even if the GPT is only ever for you: **a GPT with a custom
action cannot be shared or listed without a privacy-policy URL**, so it is a
precondition you would otherwise discover later. It points at
[site/privacy.html](../site/privacy.html), the project's own privacy statement —
deliberately general rather than written around this integration, since it has to
hold for the CLI and the npm package too.

You should see two operations appear:

| Operation | What it does |
|---|---|
| `downloadCvxBundle` | returns the current bundle as a file |
| `getCvxRelease` | returns version, Node floor and download URLs (~800 bytes) |

### 3. Paste the instructions

The instructions live in **one file of their own**, so that pasting them is a
whole-file copy with nothing to trim:

- in the repo: [site/gpt/instructions.txt](../site/gpt/instructions.txt)
- or fetch the published copy:

      curl -s https://hrtips.github.io/cvx/gpt/instructions.txt | pbcopy

Paste all of it into the GPT's **Instructions** box. It is ~5.5 KB, inside the
builder's 8000-character limit.

> Do **not** paste this page. This document is ~9.8 KB and will be rejected —
> which is exactly why the instructions are kept in their own file.

## Sharing it

A GPT you build is private by default, and that is enough if you only want it for
yourself. Making it available to anyone else depends on your ChatGPT account, not
on anything in this repository.

**What is required either way:** a GPT that uses a custom action cannot be shared
or listed without a **privacy-policy URL** — step 4 above. Publishing publicly may
also ask you to complete a **builder profile** (a verified name, or a domain you
control).

**What may not be possible at all:** OpenAI's documentation states that personal
accounts — Free, Go, Plus and Pro — cannot create or publish new GPTs, and that
Business, Enterprise and Edu workspaces can, subject to workspace settings.
Observed on 2026-08-18 on a personal account: creating a GPT worked, and the only
visibility offered was "Only me", with *"Sharing GPTs with the public is no longer
available."*

Treat that as a moving target rather than a settled rule — it has changed more than
once, and the answer you get in the product beats anything written here. The
practical consequence does not move, though: **do not build a plan on a shareable
GPT.** If you want other people to use CVX through ChatGPT, point them at the
upload route in [Route D](ai-guide.md#route-d--agent-mode-assistant-zero-local-setup),
which needs no GPT, no subscription and no builder; or at
[`npx @hrtips/cvx`](../README.md) if they have a terminal; or at the
[MCP server](../README.md#plug-it-into-your-agent-mcp) if they use Claude, Cursor
or VS Code. None of those depend on a product decision at OpenAI.

## Verifying it

In a fresh conversation, before uploading anything:

> Fetch CVX, show me its `--version`, then run `init` and `build --json` in a
> scratch directory and show me the rendered pages.

Expect: the action fires, a zip arrives, `1.9.2` (or newer), and a two-page Bruce
Wayne PDF with page images shown back to you. If the GPT reaches for `npx`, the
"NEVER run npm/npx" line is not being followed — that is the one that matters most.

Check what the endpoint is serving at any time:

```bash
curl -s https://hrtips.github.io/cvx/gpt/version.json
```

## How a release reaches the GPT

Nothing manual:

1. `publish.yml` publishes to npm and creates the GitHub release with the bundles.
2. On success it dispatches `pages.yml`.
3. `pages.yml` downloads `cvx.bundle.min.js.zip` from `releases/latest`, and
   `scripts/gpt-endpoints.js` regenerates `gpt/version.json` and `gpt/bundle.json`.
4. The GPT picks up the new bundle on its next call. No re-upload, no edit.

The bundle is taken **from the release** rather than rebuilt, so what a GPT
receives is provably the published bytes.

## Known limits

- **`cvx mcp` is not in the bundle** (it exits 64). Use the npm package for MCP.
- **Drop-in `.js` theme files are ignored** next to the bundle, deliberately: that
  directory belongs to the user, so scanning it would execute arbitrary
  neighbouring code. The three built-in themes and `cv-content/layouts/*.yaml`
  work normally.
- **The zip is ~0.92 MB, ~1.23 MB as base64 in the response.** If ChatGPT ever
  caps action responses below that, the fallback is to split the payload across
  several entries and have the GPT concatenate them.
