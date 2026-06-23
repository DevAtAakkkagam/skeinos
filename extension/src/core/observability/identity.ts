// Diagnostics identity (design D-OBS-6). Diagnostics is the only telemetry stream,
// and it carries NO per-user identity: every event ships a single fixed constant as
// its `distinct_id`. PostHog's ingest rejects events with no `distinct_id` (HTTP
// 400), but a constant shared by ALL installs encodes zero per-user information — it
// cannot link crashes across users, and PostHog Error Tracking groups by stack
// fingerprint, not by person. (The former daily-rotating-hash identity existed only
// for the usage stream, which has been removed.)

/** The fixed, non-identifying `distinct_id` carried by every diagnostics event. */
export const ANON_DISTINCT_ID = 'anonymous';
