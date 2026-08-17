# Running CVX inside a Custom GPT

A Custom GPT can drive CVX end to end — draft the YAML, render the PDF, **look at
the PDF it just rendered**, fix the layout, and hand back a finished CV. That loop
is the point: an assistant that only writes YAML has to pass the build back to the
user and never sees what it produced.

> **You build your own — it takes about three minutes.** Everything it needs is a
> public URL, and nothing here has to be updated when CVX releases a new version.
>
> **No ChatGPT Plus, or would rather not build one?** You do not need a GPT at all:
> download `cvx.bundle.min.js.zip` from the
> [latest release](https://github.com/hrtips/cvx/releases/latest), upload it into
> an ordinary ChatGPT conversation, and ask it to unzip and run — see
> [Route D](ai-guide.md#route-d--agent-mode-assistant-zero-local-setup). The only
> difference is that you re-upload it each conversation; a GPT's action does that
> for you.

## Three-minute setup

1. **Create a GPT** → Configure
2. **Instructions:** paste the whole of
   `https://hrtips.github.io/cvx/gpt/instructions.txt`
3. **Actions → Import from URL:** `https://hrtips.github.io/cvx/gpt/openapi.json`
4. **Actions → Privacy policy:** `https://hrtips.github.io/cvx/privacy`
5. **Capabilities:** tick **Code Interpreter & Data Analysis**
6. **Knowledge:** leave empty — the action delivers CVX

Sharing, if you want it, is behind **··· → Edit GPT → Share** rather than the
Create button; step 4 is what makes any option other than "Only me" available.

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

That last field is not optional if you ever want the GPT to be anything other than
private: **a GPT with a custom action cannot be shared or listed without a
privacy-policy URL.** The page it points at is
[site/privacy.html](../site/privacy.html), and it can be short and truthful here
because the endpoints are static files — they accept no input, so no CV content can
reach them even in principle.

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
