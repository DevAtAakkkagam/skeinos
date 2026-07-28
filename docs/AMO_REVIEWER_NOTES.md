# AMO — "Notes to Reviewer"

Paste-ready text for the **Notes to Reviewer** box on Firefox Add-ons
(*Submit a New Version → Describe Version*). Private to you and Mozilla reviewers.
The **Release Notes** box above it is public and takes the current version's section
from `CHANGELOG.md`, unchanged.

Build instructions are mandatory with any source submission (AMO policy), since the
uploaded bundle is minified by WXT/Vite.

**Before each release:** replace every `<version>`, and re-run the reproducibility
check so the first sentence stays true:

```bash
cd extension && npm run zip:firefox                    # the package you upload
mkdir -p /tmp/amo && cd /tmp/amo && rm -rf ./*
unzip -q <repo>/extension/.output/skeinos-<version>-sources.zip
npm ci && npm run zip:firefox
diff -r <repo>/extension/.output/firefox-mv2 .output/firefox-mv2   # must be silent
```

Last verified: 0.1.6 on 2026-07-26, all 28 files identical.

---

## Paste this

BUILD

A clean build of the attached source reproduces the upload exactly: we ran these
steps and diffed the result against the uploaded package, and all 28 files under
`.output/firefox-mv2/` were identical.

Node.js 22 LTS (24 works too), npm 10+, Linux, no other dependencies. The source
package is the repository's `extension/` directory; run from the root of the unzip.

    unzip skeinos-<version>-sources.zip -d skeinos-src
    cd skeinos-src && npm ci && npm run zip:firefox

That writes `.output/firefox-mv2/` (unpacked) and
`.output/skeinos-<version>-firefox.zip`. Please compare the unpacked directories,
not zip checksums: the container embeds timestamps, so hashes differ while contents
match.

Built with WXT (https://wxt.dev) over Vite and Rollup: bundled and minified, never
obfuscated. The same code is public under GPL-3.0 at
https://github.com/aakkagam/skeinos, tagged `v<version>`, if diffing is easier
than building.

TWO THINGS YOU WILL RUN INTO

1. "Unsafe assignment to innerHTML", 2 warnings. Both are Preact's own
   `diffElementNodes`, emitted twice (shared chunk and content script). Skeinos
   never uses `dangerouslySetInnerHTML` and never assigns `.innerHTML`,
   `.outerHTML`, or `insertAdjacentHTML` in its own source; grep to confirm. Only
   Preact's `element.innerHTML = ""` clear-path is reachable, a static empty string.

2. One outbound request, and it carries configuration, not code:

       GET https://skeinos.aakkagam.com/adapters/<platform>.json

   It fires when a chat site changes its layout and the adapter self-check fails.
   The schema-validated JSON it returns repairs the broken selectors without a full
   release. No request body, identifiers, cookies, or query parameters. See
   `src/adapters/runtime/loader.ts`, gated by `hotfixWanted` in
   `src/adapters/resilience/health.ts`. Nothing else leaves the device: no
   analytics, telemetry, crash reporting, account, or server. Conversations,
   folders, tags, and the search index stay in local IndexedDB. This matches
   `data_collection_permissions: { required: ["none"] }`.

TESTING

The welcome page (opens on install) and the options page (toolbar button) need no
account. Skeinos activates only on the four `host_permissions` sites: claude.ai,
chatgpt.com, gemini.google.com, perplexity.ai. For the sidebar to fill, sign in to
any one of them with a free account and open it from the toolbar
(`sidebar_action`). Signed out, Skeinos shows a paused state rather than an empty
list.
