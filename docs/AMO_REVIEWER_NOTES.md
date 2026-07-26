# AMO — "Notes to Reviewer"

Paste-ready text for the **Notes to Reviewer** box on Firefox Add-ons
(*Submit a New Version → Describe Version*). Private: only you and Mozilla reviewers
see it. The **Release Notes** box above it is public — that one takes the current
version's section from `CHANGELOG.md`, unchanged.

Build instructions are mandatory whenever a source package is submitted (AMO policy),
because the uploaded bundle is minified by WXT/Vite. Re-verify the commands below
before each release; the byte-for-byte claim is only worth making if it is true.

Last verified against 0.1.6 (2026-07-26): a clean `npm ci && npm run zip:firefox`
from the sources zip produced `.output/firefox-mv2/` identical to the uploaded build
across all 28 files.

---

## Paste this

Build instructions (produces an exact copy of the uploaded package):

Environment: Node.js 22 LTS (CI builds on 22; 24 also works) and npm 10+, on Linux.
No other system dependencies. The source package is the repository's `extension/`
directory; all commands run from its root.

  1. unzip skeinos-0.1.6-sources.zip -d skeinos-src
  2. cd skeinos-src
  3. npm ci
  4. npm run zip:firefox

Output: `.output/firefox-mv2/` is the unpacked extension, and
`.output/skeinos-0.1.6-firefox.zip` is the packaged one. We verified that this
produces `.output/firefox-mv2/` byte-for-byte identical to the uploaded package
(all 28 files). The zip container itself differs only in embedded timestamps, so
please compare the unpacked directories rather than zip checksums.

The build is WXT (https://wxt.dev) over Vite + Rollup: it bundles and minifies, but
applies no obfuscation. Everything is also public on GitHub under GPL-3.0 —
https://github.com/DevAtAakkkagam/skeinos, tagged `v0.1.6` — so you can diff the
source package against the public repository if that is easier than building.

Two things you will likely see, answered up front:

1. "Unsafe assignment to innerHTML" (2 warnings). Both are inside Preact's own
   `diffElementNodes`, bundled twice (shared chunk + content script). Skeinos never
   uses `dangerouslySetInnerHTML` and never assigns `.innerHTML` / `.outerHTML` /
   `insertAdjacentHTML` anywhere in its own source — grep the source package to
   confirm. The only reachable one of the two flagged statements is Preact's
   `element.innerHTML = ""` node-clearing path, a static empty string.

2. One outbound network request exists, and it is data, not code. When a chat site
   changes its layout, the adapter self-check fails and the extension downloads a
   corrected CSS-selector file:
   `GET https://skeinos.aakkagam.com/adapters/<platform>.json`. No request body, no
   identifiers, no cookies, no query parameters — a one-way download of
   schema-validated *configuration*, never executable code, which is what lets a
   broken site be repaired without a full release. See
   `src/adapters/runtime/loader.ts` (the fetch) and `src/adapters/resilience/health.ts`
   (`hotfixWanted`, which gates it). There are no other network requests: no
   analytics, no telemetry, no crash reporting, no account, no server of any kind.
   This matches the manifest's `data_collection_permissions: { required: ["none"] }`.

How to test:

Most of the UI needs no chat account. On install a welcome page opens; the options
page is reachable from the add-on's toolbar button (theme, privacy, feedback, and a
Source code link). Skeinos only activates on the four sites in `host_permissions`:
claude.ai, chatgpt.com, gemini.google.com, perplexity.ai. To see the sidebar populate
with conversations, sign in to any one of them with a free account and open the
Skeinos sidebar (`sidebar_action`, from the toolbar). While signed out, Skeinos
detects this and shows a paused state rather than an empty list.

All conversation data — titles, content, folders, tags, and the search index — is
stored locally in IndexedDB and never leaves the device on any tier.
