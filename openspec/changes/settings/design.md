## Context

Settings are small key/values read on nearly every surface and needed before the workspace DB may exist; D4 places them in `chrome.storage.local` to decouple T0.5 from the store (so the options page can ship independently). The privacy-first positioning fixes two defaults up front — telemetry off, theme system (PRD §8.3, §6.11). Theme tokens already exist from bootstrap (`ui-shell`); this change provides the persisted preference that drives them.

## Goals / Non-Goals

**Goals:**
- A typed `Settings` schema + defaults in `chrome.storage.local`.
- Privacy-first defaults: telemetry off, theme = system.
- Typed `get`/`set` accessors + an `onChanged` subscription for live UI updates.
- A WXT options-page entry that opens, shows current settings, and persists a theme change across reload.

**Non-Goals:**
- The full settings UI (per-platform toggles, shortcut customization, sync controls, export/delete) — those land with their owning features (`shortcuts` T3.7, `sync-ui` T5.5, etc.); this is the skeleton.
- Storing workspace data here (folders/prompts live in IndexedDB via `workspace-store`).
- A messaging dependency — settings use `chrome.storage` directly and its `onChanged`; they do not require the messaging hub.

## Decisions

### D-1: `chrome.storage.local`, not IndexedDB (D4)
Small, available before the DB opens, and decoupled from the store so the options page ships independently.
- *Alternative:* settings rows in IndexedDB — rejected per D4 (couples T0.5 to T0.3 and blocks parallelism).

### D-2: A single typed `Settings` object with defaults merged on read
Reads return defaults merged with the stored partial, so missing keys are always defined; writes are shallow-merged partials.
- *Rationale:* forward-compatible as later features add settings keys; old installs stay valid.

### D-3: Privacy-first defaults baked in
`telemetry = false`, `theme = 'system'`. These are product commitments (PRD §8.3), not incidental defaults; tests assert them.

### D-4: Live updates via `chrome.storage.onChanged`
A `subscribe` helper wraps `onChanged` filtered to the settings key, so an options-page change reflects in open overlays without a custom bus.
- *Alternative:* route changes through the messaging hub — rejected as unnecessary coupling.

## Risks / Trade-offs

- **[`chrome.storage.local` is async]** → accessors are async and awaited; settings are tiny so latency is negligible.
- **[Schema drift as features add settings]** → defaults-merge-on-read keeps old installs valid; the schema lives in one documented place.
- **[Options page theming diverges from the overlay]** → both consume the same `ui-shell` tokens and the same settings accessor.

## Migration Plan

Greenfield: defaults apply on first read; nothing to migrate. If a future setting needs a transform, add it to the defaults-merge step. Rollback is removal; no durable workspace data is involved.

## Open Questions

- Whether sync-eligible settings (theme, shortcuts) should later also ride the sync envelope — deferred; the TDD lists Settings as "partial" sync. Not decided here.
