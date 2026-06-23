# Chrome Web Store — Data-use disclosure

This is the source of truth for the **Privacy practices** tab of the Skeinos Chrome
Web Store listing. Keep it in sync with `docs/PRIVACY.md` and the `observability`
change (DECISIONS D29). When the store dashboard form changes, update both.

## Single purpose

Skeinos overlays a unified organization, search, prompt-library, and model-comparison
layer on top of supported LLM chat sites. It is local-first: conversation content is
read and indexed on the user's device.

## Permission justifications

- **host permissions (supported chat hosts only)** — read each supported chat page to
  index and organize the user's conversations, and type prompts on request. Never
  `<all_urls>`; the list is exactly the supported platforms' hosts.
- **storage** — persist settings and the local workspace metadata in the browser.
- **alarms** — schedule the adapter-health canary and the diagnostics telemetry flush.
- **scripting** — inject the content script into already-open supported tabs on
  install/update; bounded by the host permissions above.
- **sidePanel** — render the workspace UI in the browser side panel.

No credential, `tabs`, `activeTab`, or broad-host permission is requested.

## Data collected

Declare in the store form: **only the single diagnostics category below is collected,
and only when the user opts in. It is off by default, carries no identifier, and never
includes conversation content.** No usage or product analytics is collected. If the
reviewer asks "is any data collected," the honest answer is "only with explicit,
off-by-default opt-in."

| Store data type | Collected? | Notes |
|---|---|---|
| Personally identifiable information | No | No name, email, address, or stable id. Diagnostics carry a fixed `"anonymous"` constant identical for every install — no per-user id. |
| Health / financial / payment info | No | — |
| Authentication information | No | We never read or transmit credentials. |
| Personal communications | No | Conversation content/titles/ids never leave the device. |
| Location | No | — |
| Web history / browsing activity | No | No URLs or page paths are sent. |
| Website content | No | No conversation text, search queries, or DOM content is sent. |
| App activity (analytics) | No | No usage or product analytics is collected. |
| **Crash / diagnostics data** | **Yes — opt-in, off by default** | Only if the user enables diagnostics: anonymous crash reports (scrubbed, truncated message; own-bundle stack frames only) and adapter-health events. No identifier, no content. Enabled on the final onboarding step or in Settings → Privacy & data. |

## Required certifications

- We do **not** sell or transfer user data to third parties (beyond the processor
  below acting on our behalf).
- We do **not** use or transfer data for purposes unrelated to the single purpose.
- We do **not** use or transfer data to determine creditworthiness or for lending.

## Processor / data destination

Diagnostics telemetry is sent only to **PostHog Cloud EU** (`https://eu.i.posthog.com`),
our processor, hosted in the European Union — the single external endpoint.
Transmitted over HTTPS as hand-built JSON; no analytics SDK is bundled and no remote
code is loaded; no session replay or autocapture is used.

## Privacy policy URL

Link the published version of `docs/PRIVACY.md`.
