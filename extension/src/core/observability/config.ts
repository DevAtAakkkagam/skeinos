// Static egress config for the telemetry pipeline (design D-OBS-1/D-OBS-3). The
// worker POSTs hand-built JSON to PostHog EU Cloud's documented `/capture` HTTP
// ingest — no SDK, no loader, no remote code ([MV3-3]). Centralised here so the
// endpoint is the ONE thing to swap if we later move to self-hosted GlitchTip/
// PostHog (the rest of the pipeline is endpoint-agnostic).
//
// Spike note (tasks 1.1/1.2): PostHog EU `/capture` and `/batch` accept a plain
// CORS `fetch` from an MV3 service worker. MV3's default extension CSP does not
// restrict `connect-src`, and PostHog answers the preflight with permissive CORS
// headers, so NO host permission is required (confirmed — see the change's
// design Open Questions). The `$exception` ingest shape is a normal capture event
// named `$exception` whose properties carry `$exception_list` (one entry with
// `type`/`value`/`stacktrace.frames`); no SDK-only fields are required.

/** The PostHog EU Cloud host. The only telemetry destination (privacy: one host). */
export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

/** The batch ingest path — one POST drains many buffered events. */
export const POSTHOG_BATCH_PATH = '/batch/';

/** The full batch endpoint URL. */
export const POSTHOG_BATCH_URL = `${POSTHOG_EU_HOST}${POSTHOG_BATCH_PATH}`;

/**
 * The PostHog *project* API key (write-only ingest key — NOT a personal/admin
 * key, which must never ship in an extension). Public by design: it only permits
 * event ingestion. Replaced at build time for the real project; the placeholder
 * keeps dev/test builds inert (PostHog drops unknown keys server-side, and the
 * consent gate means nothing is sent at all by default).
 */
export const POSTHOG_PROJECT_KEY = 'phc_SKEINOS_PLACEHOLDER';
