## Context

Skeinos is local-first and privacy-first — not incidentally, but as a brand promise and a
release-blocking rule ([PRIV-1]: shipping `ConversationIndex` / `searchPostings` / `Comparison`
off-device is a release blocker; [PRIV-4]: telemetry is opt-in and off by default). Yet we operate
blind: adapters break silently when host sites change their DOM, and the service worker can fail during
migrations. The adapter design promises hot-fixable configs "without a store release," which is only true
if we can *see* breakage.

This design adds the smallest off-device signal that earns its keep — **diagnostics only** (crashes +
adapter health); no usage/product analytics — structured so that leaking user content is impossible by
construction rather than prevented by review. It is **opt-in and off by default** ([PRIV-4]), surfaced as
an explicit opt-in on the final onboarding step (see D-OBS-4). It builds on three existing load-bearing
rules: the service worker is the single writer (we extend it to be the single *egress*), no memory-only
worker state ([SW-2]), and config/consent live in durable storage the worker rehydrates.

## Goals / Non-Goals

**Goals:**
- Capture two diagnostics signals: crashes (SW + content + UI) and adapter breakage
  (selfCheck/fallback/recovery).
- Make content leakage structurally impossible: a closed event enum, allowlisted properties, one
  audited free-text field, enforced by CI.
- Opt-in, off by default ([PRIV-4]) — surfaced as an explicit opt-in on the final onboarding step.
- Ship fully client-side — no backend, no new permission, no `check:size` impact.

**Non-Goals:**
- Any usage / product analytics (feature counts, platform mix, onboarding funnel, conversion, DAU) and
  the per-user/anonymous-DAU identity such a stream would need.
- Any per-user or cross-day identity (would require a stable/identity-bearing id).
- PostHog session replay and autocapture (DOM capture = conversation content = [PRIV-1] violation).
- PostHog feature flags (a remote-influence vector; out of scope).
- A telemetry backend or server-side erasure pipeline (unnecessary without a persistent identifier).
- Performance tracing / profiling beyond crash and adapter-health events.

## Decisions

### D-OBS-1 — Vendor: PostHog EU Cloud
PostHog EU ingests crashes (as `$exception` events) and adapter-health events through the `/capture`+
`/batch` HTTP endpoint, with an Error Tracking surface for grouping crashes by fingerprint. One vendor =
one endpoint, one DPA, one privacy-policy line, one CWS disclosure — itself a privacy win (smaller
network surface). Enable only Product Analytics + Error Tracking in the project; never Session Replay or
Feature Flags. EU region satisfies PRD §8.3 data residency.
- *Alternatives:* Sentry (best-in-class errors but weak for analytics → would need a 2nd vendor);
  self-hosted GlitchTip/PostHog (best brand fit but ops burden — deferred; the HTTP-ingest design keeps
  this swappable later by changing the endpoint). Roll-your-own (most work, no analytics UI).

### D-OBS-2 — The service worker is the single telemetry egress
Content scripts and the shadow-DOM UI never POST to PostHog. They emit events through the messaging
hub to the worker; the worker is the *only* code that checks consent, builds payloads, and sends.
This mirrors the single-writer rule and gives exactly one choke point to audit for [PRIV-1], one place
that holds consent state, and a uniform path for SW-origin and UI-origin events (solving the "no
`window` in the SW" problem — nothing here depends on `window`).
- *Alternative:* per-context SDKs (one in the SW, one in the UI) — rejected: two egress points to audit,
  two consent checks, bundle cost, and the browser SDK assumes a DOM the SW lacks.

### D-OBS-3 — Plain HTTP ingest, no SDK, no loader
We POST hand-built JSON to PostHog's documented `/capture` endpoint via `fetch`. No bundled SDK
(~30–90 KB) and no CDN loader (which would be remote code).
- *Why:* [MV3-3] no remote code is satisfied trivially; near-zero bundle (no `check:size` hit); and we
  control every field that goes out — PII-by-construction (D-OBS-5) instead of scrub-after.
- *Permission:* MV3's default extension CSP does not restrict `connect-src`, and PostHog `/capture`
  supports CORS, so this likely needs **no host permission**. Confirmed by a spike (see Open Questions);
  bundled config fallback is not relevant since there is no remote config here.

### D-OBS-4 — Single consent toggle, off by default (opt-in)
`diagnosticsOptIn` gates the only stream (crashes + adapter health). It defaults **off** ([PRIV-4]) and is
surfaced as an explicit **opt-in** on the **final onboarding step** (above "Finish setup," shown
unchecked) and in Settings; the worker drops every event while the flag is off — including buffered
events on opt-out.
- *Why one toggle:* the usage stream that justified a second, separately-consented purpose was cut, so a
  single purpose-scoped flag is all that remains.
- *Why opt-in:* we considered on-by-default (diagnostics carry no identity/content), but kept opt-in to
  stay unambiguously [PRIV-4]-compliant and store-reviewer-safe.

### D-OBS-5 — PII-by-construction via a closed event taxonomy + CI allowlist
A fixed enum of 4 event names (`adapter_selfcheck_failed`, `adapter_fallback_shown`, `adapter_recovered`,
`$exception`); every property value is categorical (from a fixed value-enum) or a strict version/token.
No code path assigns free user text to any property — **except** the scrubbed, truncated
`$exception.message`, which is therefore the *entire* content-leak audit surface. A fake-transport unit
test asserts, for every captured payload: (1) event name ∈ enum; (2) every property key ∈ that event's
allowlist; (3) every string value ∈ that property's value-enum except `$exception.message` (and the
message/frames inside `$exception_list`); (4) `$exception.message` passes a sensitive-substring denylist;
(5) `distinct_id` equals the fixed anonymous constant. This converts [PRIV-1] from a manual review burden
into a CI gate.

### D-OBS-6 — Identity: none (fixed anonymous constant)
Diagnostics events carry no per-user identity. PostHog's ingest requires a `distinct_id` on every event
(a missing one is a hard HTTP 400), so every event ships a single fixed constant (`"anonymous"`)
identical for every install — it encodes zero per-user information, crashes group by stack fingerprint,
and adapter health is aggregate. Copy can honestly say "anonymous," and there is no persistent identifier
to erase server-side.
- *Alternative:* a daily-rotating salted hash (`SHA-256(daily_salt + install_nonce)`) for per-day DAU —
  rejected along with the usage stream it served. A stable per-device UUID is also rejected (pseudonymous
  personal data needing server-side deletion infrastructure). The fixed constant needs zero erasure.

### D-OBS-7 — No backend, client-side opt-out
With no persistent identifier there is nothing to erase server-side, so observability ships fully
client-side, independent of the M5 sync backend. Opt-out is local-authoritative and instant: flip the
flag (the worker stops at the gate immediately) and **drop** the batched queue for that category rather
than draining it. No reset-id control, no uninstall ping.

### D-OBS-8 — Batching via `chrome.alarms`, durable buffer
Events queue in `chrome.storage.local` (not memory — [SW-2]) and flush on a `chrome.alarms` tick or at a
size threshold, never via `setTimeout` ([SW-1]). The buffer survives worker death; on flush the worker
re-checks consent. On consent withdrawal the buffer is cleared.

## Risks / Trade-offs

- **The exception message can smuggle content** (e.g. `parse failed: <prompt text>`) → Mitigation: send
  only `error.name` + a truncated, denylist-filtered message, with stack frames limited to our own bundle
  files; this one field is the focus of every release audit; the CI denylist scan backstops it.
- **PostHog autocapture / session replay default to capturing the DOM** → Mitigation: we ship no SDK at
  all, so there is nothing to disable — autocapture cannot exist on a hand-built `/capture` POST.
- **No usage/product signal at all** by cutting that stream → Trade-off accepted: pre-launch the
  release-critical signal is breakage visibility (adapter health + crashes); product analytics can be
  revisited later behind a conscious, separately-consented, disclosed decision.
- **Vendor lock-in / trust in a third party despite a privacy brand** → Mitigation: HTTP-ingest design is
  endpoint-swappable (PostHog EU → self-hosted GlitchTip/PostHog later) with no app-logic change; full
  disclosure in privacy policy + CWS; everything opt-in and off by default.
- **CORS/permission assumption could be wrong** → Mitigation: spike before building; if a host permission
  is required, it is platform-justified and added with rationale per [MV3-1].

## Migration Plan

Purely additive. New `core/observability/` module; one new off-by-default settings flag; consent UI in
options + the final onboarding step; resilience emits diagnostics events. No IndexedDB schema change, no
data migration. Rollback = remove the module and the flag; absence of consent means nothing was ever sent.

## Open Questions (resolved)

1. ~~Confirm PostHog EU `/capture` accepts a plain CORS `fetch` from an MV3 SW with no host permission.~~
   Confirmed — `https://eu.i.posthog.com`, no host permission needed.
2. ~~Confirm the raw-HTTP `$exception` ingest shape.~~ Confirmed: a `$exception` event whose
   `$exception_list` carries `{ type, value, mechanism, stacktrace.frames }`. PostHog also requires a
   `distinct_id` on every event (a missing one is a hard 400) — satisfied by the fixed anonymous constant.
3. `$exception.message` scrubbing finalized (256-char truncation, denylist patterns, own-bundle frame
   filtering) with test fixtures.
4. Batching thresholds finalized (30-min alarm interval, size threshold of 20 events).
