# Chrome Web Store — Data-use disclosure

This is the source of truth for the **Privacy practices** tab of the Skeinos Chrome
Web Store listing. Keep it in sync with `docs/PRIVACY.md` (DECISIONS D30 — the
extension collects nothing). When the store dashboard form changes, update both.

## Single purpose

Skeinos overlays a unified organization, search, and prompt-library layer on top of
supported LLM chat sites (Claude, ChatGPT, Gemini, Perplexity). It is local-first:
conversation content is read and indexed on the user's device.

(Model comparison is *not* claimed here: it has no capability in `openspec/specs/` and
only a reserved `Comparison` store table exists. Do not describe unshipped features in
a field whose entire job is to state a narrow scope.)

## Permission justifications

- **host permissions (supported chat hosts only)** — read each supported chat page to
  index and organize the user's conversations, and type prompts on request. Never
  `<all_urls>`; the list is exactly the supported platforms' hosts.
- **storage** — persist settings and the local workspace metadata in the browser.
- **alarms** — schedule the adapter-health canary that re-surfaces a broken platform.
- **scripting** — inject the content script into already-open supported tabs on
  install/update; bounded by the host permissions above.
- **sidePanel** — render the workspace UI in the browser side panel.

No credential, `tabs`, `activeTab`, or broad-host permission is requested.

## Data collected

Declare in the store form: **nothing is collected.** Every data type is "No". There is
no analytics, no telemetry, no crash reporting, and no diagnostics. If the reviewer asks
"is any data collected," the answer is a flat "no."

**If a reviewer asks about outbound requests** (they can see one in the bundle, so answer
before they ask): the extension makes no network requests in normal use. The single
exception sends no data — when a chat site changes its layout and the adapter self-check
fails, the extension fetches a corrected selector file with a plain
`GET https://skeinos.aakkagam.com/adapters/<platform>.json`. No request body, no
identifiers, no cookies, no query parameters; it is a one-way *download* of
schema-validated configuration **data**, never remote code, and it is what lets a broken
site be repaired without a store update. See `src/adapters/runtime/loader.ts` and
`src/adapters/resilience/health.ts` (`hotfixWanted` gates it).

| Store data type | Collected? | Notes |
|---|---|---|
| Personally identifiable information | No | No name, email, address, or stable id. No account. |
| Health / financial / payment info | No | — |
| Authentication information | No | We never read or transmit credentials. |
| Personal communications | No | Conversation content/titles/ids never leave the device. |
| Location | No | — |
| Web history / browsing activity | No | No URLs or page paths are sent. |
| Website content | No | No conversation text, search queries, or DOM content is sent. |
| App activity (analytics) | No | No usage or product analytics is collected. |
| Crash / diagnostics data | No | No crash reporting or diagnostics stream exists. |

## Required certifications

- We do **not** sell or transfer user data to third parties.
- We do **not** use or transfer data for purposes unrelated to the single purpose.
- We do **not** use or transfer data to determine creditworthiness or for lending.

## Processor / data destination

None. No user data has a destination: the extension bundles no analytics SDK, loads no
remote code, and sends no data off the device. No session replay or autocapture. The one
outbound request is the selector-config `GET` described above — a download that carries
no request body, identifiers, cookies, or query parameters, so it transfers no user data
in either direction.

## Privacy policy URL

The published version of `docs/PRIVACY.md`:

    https://skeinos.aakkagam.com/privacy/

Keep the page (`website/privacy/index.html`) in sync with `docs/PRIVACY.md`.
