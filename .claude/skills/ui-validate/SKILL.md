---
name: ui-validate
description: Semi-automated validation that Skeinos' adapter selectors still work on the live claude.ai, chatgpt.com, gemini.google.com, and perplexity.ai pages — launches a normal browser, the user logs in, then a script probes every platform's selectors against the real DOM. Use this whenever the user wants to validate, sanity-check, or verify the platforms, the UI, the selectors, or the extension against the live sites ("validate the platforms", "run the check", "is claude broken?", "did chatgpt change their UI?", "one round of UI validation"), after fixing an adapter config, before a store release or publish, or when a "Skeinos is paused" banner or adapter self-check failure is reported. Requires the user present to log in — do not use for unattended or scheduled runs.
---

# UI validation (semi-automated, user in the loop)

Validates that the adapter selectors in `extension/src/adapters/configs/*.json`
(the single source of truth the extension ships) still resolve on the LIVE DOM
of all supported platforms, using the user's real signed-in sessions. A `broken`
result here is what users experience as the "Skeinos is paused" banner, so this
is the pre-release / post-fix confidence check. Deep reference:
`docs/RUNBOOK_SANITY_CHECK.md`.

**The user must be present** — they perform the logins. Never try to fully
automate this or run it headless/scheduled: Google rejects sign-in in any
automation-launched browser, Cloudflare challenges automated fingerprints, and
repeated automated attempts risk the user's personal accounts. The runbook's
"Account safety" section is binding: one round per request, no retry loops.
(The script may only attach to a browser a human drove — that ordering is the
entire trick that makes this work.)

## Flow

1. Launch the script as a background task (NOT foreground — it blocks until the
   user is ready):

   ```bash
   cd extension && DISPLAY=:0 node scripts/sanity-check.mjs --interactive
   ```

   Keep alerts ON for a real validation round — a genuine breakage then files a
   deduped GitHub issue (label `sanity-check`) and notifies
   ntfy.sh/SET-SKEINOS-NTFY-TOPIC automatically. Add `--no-alert` only when
   debugging the script itself.

   The task will sit waiting on input by design — the harness may warn that it
   "appears to be waiting for interactive input" and suggest killing it. Do
   not: that idle wait IS the login window. The release valve is a file touch
   (step 3), not stdin.

2. A NORMAL Chrome window (profile "AI Playwright") opens on the user's screen
   with all four platform tabs. Tell the user: check each tab is signed in,
   log in where needed (Google SSO works in this window — it has no automation
   flags), clear any "Verify you are human" box, and say "done". Sessions
   persist in the profile, so on repeat rounds this is usually just a glance.

3. When the user says done, trigger the validation:

   ```bash
   touch ~/.skeinos-sanity/continue
   ```

   Then poll the background task's output until it prints `detached` (or
   `fatal`). The script attaches to the user's browser over the local debug
   port, probes each platform in briefly-opened tabs, prints one status line
   per platform, and detaches — the window stays open for the user.

4. Report results, leading with the overall verdict. Use this shape:

   | Platform | Status |
   |---|---|
   | claude | ok |
   | chatgpt | ok |
   | gemini | ok |
   | perplexity | ok |

   Then, only for non-`ok` rows, one sentence each on meaning and next step:
   - `broken` — signed-in page, required selector missing: users see the
     banner. The issue/ntfy alert already fired. Offer to start the fix
     workflow (below).
   - `signed-out` / `challenge` — that platform was not verifiable this round;
     the user can log in / clear the challenge in the still-open window, then
     offer ONE re-run (not a loop).
   - `error` — navigation failure; read `~/.skeinos-sanity/last-run.json` and
     the screenshots in `.playwright-screenshots/sanity/` before concluding
     anything.

## Failure modes

- **"debug endpoint never came up"** — another Chrome window already owns the
  profile (often a Claude Code Playwright MCP session). Ask the user to close
  it (or close the MCP browser), then relaunch.
- Screenshots of every non-`ok` platform are saved to
  `.playwright-screenshots/sanity/` (gitignored) — read them before theorizing.

## If something is broken — fix workflow (summary)

Probe the live DOM for replacement selectors (the extension exposes
`window.__skeinos.diagnose()` in every build — run it in the affected tab's
content-script console context), update the platform's config in
`extension/src/adapters/configs/`, **bump `configVersion`**, align the fixture
(`extension/tests/fixtures/<platform>.html` + `.expected.json`), run
`npm run typecheck && npm test && npm run lint`, push to main — the
deploy-website workflow publishes the config to
`https://skeinos.aakkagam.com/adapters/<platform>.json` and degraded installs
adopt it without a store release. Selector rules (enforced by the i18n guard
test): never match on visible text, aria-label values, or auth/route URLs —
prefer `data-testid` or stable structural classes. Worked example: the 2026-07
Claude dframe rewrite (commits `9967778`, `d79067b`, `74fdc1e`).
