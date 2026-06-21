## Context

`profiles-library` shipped the profile data + view (`queryProfilesRemote`, `InstructionProfile`
with `instructionText`, `appliesTo`, `responseStyle`). `input-bar` (C13) ships the bar with a
disabled Profile stub (`InputBar.tsx`: `sk-ib-stub`), an append-only `onInsert` wired in
`content/index.ts` to `adapter.insertText` (never `submit()`), and an injectable `query` fn pattern
for prompt reads. The content script mounts the bar per platform (`remountInputBar`) and already
knows `platformId`. `Settings` uses additive optional keys read through `getSettings`/`setSettings`
with a live `subscribeSettings`, in `chrome.storage.local` (multi-context, survives worker death).

Decisions carried in from exploration: **M1 insert-on-activate** (no host-send interception; the
bar only appends), **global active gated by `appliesTo`**, and **PREPEND-only** injection (the
`SYSTEM` mode is the next slice).

## Goals / Non-Goals

**Goals:**
- A functional Profile chip in the bar: list profiles, mark active, activate-and-inject.
- Compose instruction (+ response-style directive) and insert via the existing `onInsert`.
- Persist a single global active profile, reflected across tabs.

**Non-Goals (later / out):**
- `SYSTEM`-mode (true system prompt) and the `setSystemPrompt` adapter seam — `profile-system-prompt`.
- Auto-seeding on new conversations (M2) and any host-send interception.
- True prepend-before-an-existing-draft (the adapter appends; M1 targets an empty composer).
- Per-platform active selection (chosen: global gated by `appliesTo`).
- Free-tier profile cap (depends on `tier-gate` C9).
- The model selector (C24) stub stays disabled.

## Decisions

### D-1: Active selection is a global, device-local `Settings.activeProfileId`
Add an additive optional `activeProfileId?: string`. It is a UI preference, not workspace data, so
it lives in settings (not the synced store) — device-local by intent (the active profile shouldn't
follow you between machines). The chip reads it via `getSettings`, writes via `setSettings`, and
re-renders across tabs via `subscribeSettings` (same pattern onboarding used). Alternative — a
store record — was rejected: it would sync and need the worker awake to read.

### D-2: Insert-on-activate (M1), composing instruction + response style
Selecting a profile in the chip menu: (a) writes `activeProfileId`; (b) if the profile's
`appliesTo` includes the current platform, composes the injected text and calls `onInsert`. The
composed text is `instructionText`, optionally followed by a response-style directive derived from
`responseStyle` (e.g. a line like "Respond briefly, in Markdown."). A small pure `composeProfileText`
helper builds it (unit-testable). Injection is append-only and never auto-submits — identical to the
prompt-insert contract. Chosen over auto-seeding (M2) because the bar cannot hook the host's send;
M1 is the simplest faithful "instruction leads the next message" behavior.

### D-3: Global active, gated by `appliesTo` at the point of activation
The menu lists all profiles; one is marked active. Profiles whose `appliesTo` does not include the
current platform are rendered disabled (cannot be activated/injected on this platform) — so the
gating is visible and injection only ever happens where the profile applies. The active selection
persists globally regardless of platform, so the chip shows it on every tab; on a platform the
active profile doesn't apply to, the chip indicates it is inactive there.

### D-4: Thread `platform` and a `queryProfiles` fn into the bar
`InputBar` gains a `platform: PlatformId` prop (to resolve `appliesTo`/mode) and a `queryProfiles`
fn (default `queryProfilesRemote`, injectable for tests), passed through `mountInputBar` from the
content script (which already has `platformId` and calls `remountInputBar`). The chip surface reuses
`useFloating` (and the menu primitive) like the slash popover, rendered in the bar's shadow root.

### D-5: PREPEND only; mode shown consistently with slice A
Injection is always prepend here; the chip/menu does not present a `SYSTEM` mode. This matches
`profiles-library`'s PREPEND-only indicator and keeps D13 honesty — `SYSTEM` arrives with its real
mechanism in `profile-system-prompt`.

### D-6: Tests authored by a sub agent
Per repo convention, a sub agent authors the suite against the contracts pinned in tasks.md:
`composeProfileText` (instruction + each response-style combination), the chip (lists profiles,
marks active, disables non-applicable, activate writes `activeProfileId` + calls `onInsert` with the
composed text, no `submit`), the `appliesTo` gating, and the settings `activeProfileId` round-trip
+ live cross-tab update.

## Risks / Trade-offs

- **[Risk] Append lands the instruction after an existing draft (not before)** → accepted: M1
  targets activation before composing; true prepend would need an adapter change (out of scope).
  Documented behavior: activate, then type.
- **[Risk] Active profile not applicable to the current platform confuses users** → mitigated by
  D-3: the chip shows it inactive-here and the menu disables non-applicable profiles, so behavior is
  visible rather than silent.
- **[Trade-off] Global (not per-platform) active is less precise** → matches the single-chip design
  and `appliesTo` already scopes where it injects; per-platform state can come later if needed.
- **[Risk] `activeProfileId` points at a deleted profile** → the chip treats a missing id as "no
  active profile" (defensive read), and may clear it on next write; never throws.
