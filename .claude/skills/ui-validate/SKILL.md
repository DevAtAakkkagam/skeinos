---
name: ui-validate
description: Run the semi-automated UI/selector validation of all supported AI platforms together with the user — launches a normal browser, the user logs in, the script validates every platform's adapter selectors against the live DOM. Use when the user asks to "validate the platforms/UI", after an adapter config fix, before a store release, or when a "Skeinos is paused" banner is reported.
---

# UI validation (semi-automated, user in the loop)

Validates that the adapter selectors in `extension/src/adapters/configs/*.json`
(the single source of truth the extension ships) still resolve on the LIVE DOM
of claude.ai, chatgpt.com, gemini.google.com, and perplexity.ai — using the
user's real signed-in sessions. Full background: `docs/RUNBOOK_SANITY_CHECK.md`.

**This flow requires the user present** (they log in). Never try to fully
automate it: Google blocks sign-in in automation-launched browsers, Cloudflare
challenges automated fingerprints, and repeated automated attempts risk the
user's personal accounts (see the runbook's Account safety section — treat it
as binding).

## Steps

1. Launch in the background (it blocks waiting for the user — that is by design,
   do NOT kill it or pipe stdin):

   ```bash
   cd extension && DISPLAY=:0 node scripts/sanity-check.mjs --interactive
   ```

   Add `--no-alert` only for a debugging round — without it, a genuine breakage
   files a deduped GitHub issue (label `sanity-check`) and pushes to
   ntfy.sh/SET-SKEINOS-NTFY-TOPIC, which is wanted for a real validation round.

2. A NORMAL Chrome window (profile "AI Playwright") opens on the user's screen
   with all four platform tabs. Tell the user: check each tab is signed in, log
   in where needed (Google SSO works here), clear any "Verify you are human"
   box, then say "done".

3. When the user says done: `touch ~/.skeinos-sanity/continue` — the script
   then attaches over CDP and probes each platform (tabs open/close briefly),
   prints one status line per platform, detaches, and exits. Poll the
   background task's output until it shows `detached` (or `fatal`).

4. Report the per-platform statuses to the user:
   - `ok` — all required anchors resolve; nothing to do.
   - `broken` — signed-in page with a missing required anchor = users see the
     "Skeinos is paused" banner. The script already filed/updated the GitHub
     issue and pushed ntfy. Offer to start the fix workflow (below).
   - `signed-out` / `challenge` — that platform wasn't verifiable this round
     (user can fix in the open window; offer to re-run).
   - `error` — navigation failure; show `~/.skeinos-sanity/last-run.json`.

   Failure screenshots: `.playwright-screenshots/sanity/` (gitignored).
   The browser window stays open for the user afterwards — say so.

## If something is broken — fix workflow (summary)

Probe the live DOM for replacement selectors (the extension also exposes
`window.__skeinos.diagnose()` in-page), update the platform's config in
`extension/src/adapters/configs/`, **bump `configVersion`**, align the fixture
(`extension/tests/fixtures/<platform>.html` + `.expected.json`), run
`npm run typecheck && npm test && npm run lint`, push to main — the
deploy-website workflow publishes the config to
`https://skeinos.aakkagam.com/adapters/<platform>.json` and degraded installs
adopt it without a store release. Selector rules: no visible-text/aria-label
value/auth-URL matching (i18n guard test enforces this); prefer `data-testid`
or stable structural classes. Worked example: the 2026-07 Claude dframe rewrite
(commits `9967778`, `d79067b`, `74fdc1e`).
