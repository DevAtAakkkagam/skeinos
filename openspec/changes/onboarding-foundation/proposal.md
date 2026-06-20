## Why

A fresh install drops the user straight into the side panel's neutral/empty state —
there is no first-run moment, no place to seed starter prompts, and no persisted notion
of "has this user been onboarded yet." The `prompt-seed-catalog` change deliberately
defers that flow, leaving only a temporary "Add starter prompts" button. Before the D17
onboarding screens (welcome, privacy pitch, domain picker, first-action CTA) can be built,
the extension needs the load-bearing spine they all hang off: a durable first-run gate and
the settings fields it reads. This change ships that spine — and nothing else — so the
later flow is a pure-UI slice.

## What Changes

- Add two additive, optional `Settings` fields: `onboardingCompleted` (boolean, default
  `false`) and `domain` (`DomainId | undefined`, the field `prompt-seed-catalog`'s design
  names as deferred to onboarding). Both fall back to defaults on existing installs, so the
  bump never invalidates a stored settings object.
- Add a first-run gate read on side-panel mount: a typed helper that resolves "is onboarding
  complete?" from settings and survives worker death (settings live in `chrome.storage.local`,
  not worker memory — [SW]).
- Add a router branch in `SidePanelApp` that, when onboarding is **not** complete, renders an
  onboarding surface **before** the existing `platform == null ? empty : SidebarShell` branch.
  In this slice that surface is a minimal placeholder with a single "Get started" action that
  marks onboarding complete and hands off to the normal panel — the real D17 screens replace
  it in the next slice.
- Re-scope when settings change live (`subscribeSettings`), so completing onboarding in one
  surface updates the panel without a reload.
- Tests for all of the above are authored by a sub agent (see tasks.md).

## Capabilities

### New Capabilities

- `onboarding`: the first-run gate — a persisted completion flag plus the chosen domain,
  read on panel mount, the router branch that shows the onboarding surface before the
  workspace, and the action that marks onboarding complete. The D17 welcome/priming/domain-
  picker screens and the starter-seed handoff are explicitly **out of scope** here and land
  in `onboarding-flow`.

### Modified Capabilities

- `settings`: the `Settings` schema gains the optional, additive `onboardingCompleted` and
  `domain` fields, read and written through the existing accessors, defaulting cleanly on
  installs that predate them.

## Impact

- **Code:** `shared/settings.ts` (two fields + defaults), `core/settings/index.ts` (no shape
  change — fields ride the existing merge), new `ui/onboarding/**` (gate helper + placeholder
  surface), `entrypoints/sidepanel/SidePanelApp.tsx` (gate read + router branch + live re-scope).
- **Data:** none in the workspace store — settings only; the additive fields default on read,
  so no migration and no backfill.
- **Privacy:** none — `onboardingCompleted`/`domain` are local preferences in
  `chrome.storage.local`; no new data boundary, no network. `domain` is the same value
  `installSeeds` already consumes.
- **Dependencies:** builds on `settings` (C3, ✅) and `prompts`/`prompt-catalog`
  (`DomainId` from `shared/domains.ts`, already present). Unblocks `onboarding-flow` (the D17
  screens) and `onboarding-permission-priming`.
