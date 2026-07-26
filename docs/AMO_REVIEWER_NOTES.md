# AMO — "Notes to Reviewer"

Paste-ready text for the **Notes to Reviewer** box on Firefox Add-ons
(*Submit a New Version → Describe Version*). Private: only you and Mozilla reviewers
see it. The **Release Notes** box above it is public and takes the current version's
section from `CHANGELOG.md`, unchanged.

Build instructions are mandatory whenever a source package is submitted (AMO policy),
because the uploaded bundle is minified by WXT/Vite.

**Before each release:** replace every `<version>` with the version being submitted,
and re-run the reproducibility check so the claim in the first paragraph stays true:

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

BUILD INSTRUCTIONS

A clean build of the attached source package reproduces the uploaded extension
exactly. We ran the steps below and compared the result against what we uploaded:
all 28 files under `.output/firefox-mv2/` were byte-for-byte identical.

Environment: Node.js 22 LTS (our CI builds on 22; 24 works too), npm 10+, Linux. No
other system dependencies. The source package is the repository's `extension/`
directory, so every command runs from the root of the unzipped package.

    1. unzip skeinos-<version>-sources.zip -d skeinos-src
    2. cd skeinos-src
    3. npm ci
    4. npm run zip:firefox

This writes the unpacked extension to `.output/firefox-mv2/` and the packaged one to
`.output/skeinos-<version>-firefox.zip`. Please compare the unpacked directories
rather than zip checksums: the zip container embeds build timestamps, so its hash
differs even when its contents do not.

The build is WXT (https://wxt.dev) over Vite and Rollup. It bundles and minifies; it
does not obfuscate. The same code is public under GPL-3.0 at
https://github.com/DevAtAakkkagam/skeinos, tagged `v<version>`, if diffing against
the repository is easier than building.

TWO THINGS YOU WILL RUN INTO

1. "Unsafe assignment to innerHTML", 2 warnings. Both sit inside Preact's own
   `diffElementNodes`, which the bundler emits twice (shared chunk and content
   script). Skeinos never uses `dangerouslySetInnerHTML`, and never assigns
   `.innerHTML`, `.outerHTML`, or `insertAdjacentHTML` anywhere in its own source.
   Grep the source package to confirm. Of the two flagged statements, only Preact's
   `element.innerHTML = ""` node-clearing path is reachable here, and it assigns a
   static empty string.

2. One outbound request exists, and it carries configuration, not code. When a chat
   site changes its layout, the adapter self-check fails and the extension downloads
   a corrected CSS-selector file:

       GET https://skeinos.aakkagam.com/adapters/<platform>.json

   It sends no request body, no identifiers, no cookies, and no query parameters.
   What comes back is schema-validated JSON, never executable code, and it is what
   lets a broken site be repaired without a full release. The fetch is in
   `src/adapters/runtime/loader.ts`; `src/adapters/resilience/health.ts` gates it
   behind `hotfixWanted`. Nothing else leaves the device: no analytics, no telemetry,
   no crash reporting, no account, no server. This matches the manifest's
   `data_collection_permissions: { required: ["none"] }`.

HOW TO TEST

Most of the UI needs no chat account. A welcome page opens on install, and the
options page (theme, privacy, feedback, and a Source code link) opens from the
toolbar button.

Skeinos activates only on the four sites in `host_permissions`: claude.ai,
chatgpt.com, gemini.google.com, and perplexity.ai. To see the sidebar fill with
conversations, sign in to any one of them with a free account, then open the Skeinos
sidebar from the toolbar (`sidebar_action`). While signed out, Skeinos detects that
and shows a paused state instead of an empty list.

Conversation titles and content, folders, tags, and the search index are stored
locally in IndexedDB and never leave the device, on any tier.
