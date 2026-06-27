# Skeinos — Privacy Policy

_Last updated: 2026-06-27_

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

## Anonymous diagnostics

The only telemetry Skeinos collects is **anonymous diagnostics** — crash reports and
adapter-health signals (when a chat site changes its layout and breaks an
integration) so we can fix breakage quickly. We do **not** collect usage or product
analytics of any kind.

Diagnostics are **opt-in and off by default**. Nothing is sent unless you turn them on
— offered as an explicit choice on the final onboarding step and any time in
**Settings → Privacy & data** — and you can turn them back off at any point. What
diagnostics contain when enabled:

- **Crash reports** — the error type, a **truncated and filtered** error message, and
  stack frames limited to Skeinos's own code. Host-page frames are dropped, and
  sensitive substrings (URLs, emails, tokens) are masked.
- **Adapter-health signals** — which supported platform broke, the integration config
  version, and a fixed code for which page anchor was missing. Every field is a fixed
  category or a version number.

**No conversation content, search queries, prompt/folder/profile/tag names, URLs, or
free text are ever included.**

### How "anonymous" works

Diagnostics events carry **no per-user identifier**. Our processor's ingest requires
every event to include a `distinct_id`, so all events ship a single fixed constant
(`"anonymous"`) that is identical for every install and encodes nothing about you.
Crash reports group by their stack fingerprint, not by person. We hold **no
persistent identifier** for you and therefore maintain no server-side profile to
access or erase.

### Where diagnostics go

When diagnostics are enabled, events are sent by the extension's background service
worker — the single point of egress — to **PostHog Cloud EU**
(`https://eu.i.posthog.com`), our processor, hosted in the European Union. This is
the **only** external endpoint Skeinos contacts. We send hand-built JSON over HTTPS;
the extension bundles **no third-party analytics SDK** and loads no remote code. No
session recording or page/DOM capture ("autocapture") is used.

## Your controls

- Diagnostics are off by default; opting out again is instant and also discards any
  not-yet-sent events from the local buffer.
- Uninstalling the extension removes all local data.

## Contact

Questions about this policy: admin@aakkagam.com

---

Skeinos is offered by Aakkagam. Skeinos is not affiliated with Anthropic, Google,
OpenAI, or Perplexity.
