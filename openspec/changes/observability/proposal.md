## Why

We currently ship blind: when an adapter breaks because a host site changed its DOM, or when the
service worker throws during a migration, we learn about it only from support tickets — if at all. The
adapter architecture is explicitly "config-driven, hot-fixable without a store release," but you cannot
hot-fix what you cannot see break. We need a minimal, privacy-first signal for two things: crashes and
adapter breakage — without betraying the local-first / privacy-first promise that is the brand.

## What Changes

- Introduce a **diagnostics-only** observability layer with a **single consent toggle** (*diagnostics* —
  crashes + adapter health), **opt-in and off by default** (PRD §8.3, [PRIV-4]). It is surfaced as an
  explicit opt-in on the **final onboarding step** (above "Finish setup," shown unchecked) and in Settings.
- **No usage / product analytics.** The usage stream (feature counts, platform mix, onboarding funnel,
  DAU) and its anonymous-DAU identity are explicitly **out of scope** — cut for privacy surface and
  consent/disclosure simplicity.
- The **service worker becomes the single telemetry egress**, mirroring the single-writer rule.
  Content scripts and the shadow-DOM UI never send directly — they message the worker, which gates on
  consent, builds an allowlisted payload, batches via `chrome.alarms`, and POSTs to **PostHog EU Cloud**.
- **No vendor SDK and no loader script** — a plain CORS `fetch` of PostHog's documented HTTP ingest
  endpoint ([MV3-3], near-zero bundle, no new host permission).
- **PII-by-construction**: a closed 4-event enum (`adapter_selfcheck_failed`, `adapter_fallback_shown`,
  `adapter_recovered`, `$exception`); every property is categorical-from-a-fixed-enum or a strict
  version/token. The single free-text field in the whole system is the scrubbed `$exception.message`.
  A fake-transport CI test enforces the allowlist, turning [PRIV-1] from manual review into a gate.
- **No identity**: diagnostics carry no per-user id. PostHog's ingest requires a `distinct_id` on every
  event, so all events ship a fixed constant (`"anonymous"`) identical for every install — it encodes
  nothing about the user, and crashes group by stack fingerprint.
- **Error Tracking shape**: crashes are sent as PostHog's canonical `$exception_list` structure so they
  render as issues; the allowlist validator re-applies the message-denylist and own-bundle-frame rules
  inside the structure.
- **No backend, no erasure infrastructure** — with no persistent identifier there is nothing to erase
  server-side. Ships fully client-side, independent of the M5 sync backend. Opt-out = flip flag + drop
  the batched queue.
- Update the **privacy policy and Chrome Web Store data-use disclosure** to declare the PostHog EU
  endpoint and the single, opt-in diagnostics data category.

Non-goals (explicitly out of scope): any usage / product analytics, PostHog session replay / autocapture
(DOM capture = conversation content = [PRIV-1] violation), PostHog feature flags (remote-influence
vector), and any per-user or cross-day identity.

## Capabilities

### New Capabilities
- `observability`: diagnostics-only telemetry — the single opt-in (off-by-default) consent toggle, the service-worker
  single-egress pipeline, the no-identity policy (fixed anonymous `distinct_id`), the closed event taxonomy
  with its allowlist guardrail, and the diagnostics stream (crashes + adapter health) to PostHog EU.

### Modified Capabilities
- `settings`: add the diagnostics consent flag (`diagnosticsOptIn`), defaulting **off**, as a durable
  setting the worker reads before any egress.
- `onboarding`: the final step surfaces the diagnostics toggle (shown unchecked) as an explicit opt-in
  above "Finish setup."
- `adapter-resilience`: `selfCheck` failure, fallback-banner display, and recovery emit diagnostics
  events (gated, no id) so broken platforms become visible for hot-fixing.

## Impact

- **New code**: `core/observability/` (consent gate, event allowlist + builder, batched egress via
  `chrome.alarms`, exception scrubber). Wired into the background worker as the sole sender; content/UI
  emit via the messaging hub.
- **Touched**: `core/settings` (one flag), `ui/options` + `ui/onboarding` (consent toggle + privacy
  copy), `adapters/resilience` (emit diagnostics), the messaging protocol (a telemetry request type).
- **External dependency**: PostHog EU Cloud `/capture`+`/batch` HTTP endpoint (CORS, no SDK); no manifest
  host permission required.
- **Docs/compliance**: privacy policy + CWS data-use declaration; a DECISIONS entry (D29) recording the
  vendor, single-egress architecture, single opt-in consent, no-identity policy, and PII-by-allowlist.
- **No impact** on the sync backend, IndexedDB schema, or `check:size` budgets.
