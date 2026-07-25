# Skeinos — Privacy Policy

_Last updated: 2026-07-24_

Skeinos is **local-first and privacy-first**. The extension organizes your AI chats
(folders, search, prompts, instruction profiles) by reading the pages you already
have open. Your conversation content stays on your device.

## What never leaves your device

- **Conversation content, titles, and ids**, your search index (`searchPostings`),
  your `ConversationIndex`, and any model `Comparison` records. These are processed
  and stored only in your browser (IndexedDB / `chrome.storage.local`) and are
  **never** transmitted, on any tier.
- We never read or transmit credentials, cookies, or authentication tokens for any
  site.

## No data collection at all

Skeinos **sends nothing off your device, on any tier**. There is no analytics, no
telemetry, no crash reporting, and no diagnostics stream. There is no opt-in to
make, because there is nothing to opt in to.

In normal use the extension makes **no network requests at all**. There is exactly
one exception, and it never carries anything of yours: when a chat site changes its
layout and Skeinos detects that its own selectors have stopped working, it fetches a
corrected selector file — a plain `GET` of
`https://skeinos.aakkagam.com/adapters/<site>.json`, with no request body, no
identifiers, no cookies, and no query parameters. It is how a broken site can be
fixed the same day instead of waiting on a store review. A healthy site never
triggers it, the request contains nothing about you or your conversations, and the
extension works fully offline without it by falling back to its bundled selectors.

Consequently:

- We hold **no data about you** — no account, no identifier, no server-side profile
  to access, export, or erase.
- The extension bundles **no third-party analytics SDK** and loads no remote code.
  No session recording and no page/DOM capture ("autocapture") is used.
- Everything the extension reads from a chat page is processed and stored locally, in
  your own browser.

## Your controls

- Nothing is collected, so there is nothing to turn off.
- Uninstalling the extension removes all local data.

## Contact

Questions about this policy: admin@aakkagam.com

---

Skeinos is offered by Aakkagam. Skeinos is not affiliated with Anthropic, Google,
OpenAI, or Perplexity.
