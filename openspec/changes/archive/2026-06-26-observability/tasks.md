## 1. Spikes (resolve unknowns before wiring egress)

- [x] 1.1 Confirm PostHog EU `/capture` accepts a plain CORS `fetch` from an MV3 service worker with no host permission; record the exact EU endpoint host
- [x] 1.2 Confirm the raw-HTTP `$exception` ingest shape for PostHog error tracking without the SDK (required properties / `$exception_list`)
- [x] 1.3 If a host permission turns out to be required, document the justification per [MV3-1] and add it to the manifest config

## 2. Settings consent flag

- [x] 2.1 Add `diagnosticsOptIn` to the settings schema in `core/settings`, defaulting to **off**
- [x] 2.2 Expose the flag as a toggle on the options page with privacy-first copy
- [x] 2.3 Ensure the live settings-change notification delivers flag changes to the worker before the next gate check
- [x] 2.4 Tests: default off, persistence across reload, live change reaches the worker

## 3. Identity (no per-user id)

- [x] 3.1 Define a fixed anonymous `distinct_id` constant (`"anonymous"`), identical for every install
- [x] 3.2 (removed) No daily-rotating hash / install nonce — the usage stream that needed it is cut
- [x] 3.3 Tests: every built event carries the fixed anonymous id; no per-device id is transmitted

## 4. Event taxonomy + allowlist

- [x] 4.1 Define the closed event-name enum (4 diagnostics events) and per-event property allowlist (value-enums + version/token) in `core/observability`
- [x] 4.2 Implement the event builder that constructs allowlisted payloads and attaches the fixed anonymous `distinct_id`
- [x] 4.3 (removed) No bucketing helpers — the usage events that needed buckets are cut
- [x] 4.4 Implement the `$exception` message scrubber (truncation, denylist filtering, own-bundle frame filtering) and the `$exception_list` Error Tracking shape
- [x] 4.5 Implement the worker-side validator that drops any event violating the allowlist (incl. inside `$exception_list`)

## 5. Egress pipeline (worker = single egress)

- [x] 5.1 Add a telemetry request type to the messaging protocol so content/UI emit through the worker
- [x] 5.2 Implement the consent gate in the worker (drop events when diagnostics is off, including at flush time)
- [x] 5.3 Implement the durable buffer in `chrome.storage.local` and a `chrome.alarms`-driven flush (size threshold + interval; no `setTimeout`)
- [x] 5.4 Implement opt-out behavior: stop at the gate immediately and drop (not drain) buffered events
- [x] 5.5 Implement the PostHog EU `/batch` POST via plain `fetch` of hand-built JSON (no SDK, no loader, no replay/autocapture/flags)

## 6. Emit call sites

- [x] 6.5 Diagnostics: `adapter_selfcheck_failed` / `adapter_fallback_shown` / `adapter_recovered` from `adapters/resilience` (no id, `anchorKey` from the fixed enum)
- [x] 6.6 Diagnostics: `$exception` capture in the service worker, content script, and shadow-DOM UI
- [x] 6.7 (removed) Usage emit call sites (`app_opened`, `platform_active`, `feature_used`, `search_run`, `comparison_run`, `tier_gate_hit`, `upgrade_nudge`, `onboarding_step`, `extension_installed`/`extension_updated`) — usage stream cut

## 7. Onboarding consent surface

- [x] 7.1 Surface the diagnostics toggle on the **final** onboarding step (above "Finish setup"), shown unchecked (opt-in)
- [x] 7.2 Tests: toggle absent on welcome, shown unchecked on the final step, finishing without ticking leaves it off, ticking persists the opt-in

## 8. Guardrail tests + verification

- [x] 8.1 Fake-transport test asserting all allowlist rules over every event type's representative payloads
- [x] 8.2 Scrubber tests: long/denylisted messages truncated & masked; host-page frames dropped
- [x] 8.3 Egress tests: buffer survives worker restart; flush re-checks consent; opt-out drops buffered events
- [x] 8.4 Negative tests: disallowed event name / property key / out-of-enum value are dropped and nothing is sent
- [x] 8.5 Run `typecheck` + `test`, then `test:browser`; confirm `check:size` shows no meaningful bundle delta

## 9. Compliance & docs

- [x] 9.1 Update the privacy policy to declare the PostHog EU endpoint and the single, opt-in diagnostics category
- [x] 9.2 Update the Chrome Web Store data-use disclosure to match
- [x] 9.3 Add a DECISIONS entry recording vendor (PostHog EU), single-egress architecture, single opt-in consent, no-identity policy, and PII-by-allowlist
