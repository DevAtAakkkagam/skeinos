## Why

`profiles-library` (slice A) lets users create instruction profiles, but a profile does nothing
yet — there is no way to activate one and apply it to a chat. The input action bar (C13) already
ships a **disabled Profile stub** reserving the spot. This slice makes that stub a working chip:
pick a profile and its instruction is inserted into the composer, so the standing instruction
("act as a senior staff engineer; be terse") rides the next message — PRD §6.4 / LLD T3.5. It is
the **PREPEND** path that works on every platform; the true-system-prompt mode (D13 `SYSTEM`) stays
in the later `profile-system-prompt` slice.

## What Changes

- Replace the input bar's disabled Profile stub with a **functional Profile chip**: it shows the
  active profile's name and opens a menu of saved profiles (read via the existing
  `queryProfilesRemote`).
- **Insert-on-activate (M1)**: selecting a profile composes its instruction text — plus a response-
  style directive when set (verbosity + format) — and inserts it into the host composer through the
  bar's existing `onInsert` seam (append-only, never auto-submitted), so the instruction leads the
  next message.
- **Global active selection, gated by `appliesTo`**: the chosen profile is remembered globally in a
  new additive `Settings.activeProfileId` (device-local, not synced) and reflected in the chip
  across tabs via the existing settings subscription. In the menu, profiles whose `appliesTo` does
  not include the current platform are shown disabled (they cannot be activated/injected there);
  applicable profiles activate and inject.
- The chip pass-through requires the content script to give the bar the current **platform id** (to
  resolve `appliesTo`) and a **profiles query** fn (defaulted to `queryProfilesRemote`, injectable
  for tests).
- Injection mode is **PREPEND** for every platform in this slice — consistent with
  `profiles-library`'s PREPEND-only indicator; the `SYSTEM` mode is not introduced here (D13).
- Tests for all of the above are authored by a sub agent (see tasks.md).

## Capabilities

### Modified Capabilities

- `input-bar`: the Profile control changes from a disabled stub to a functional chip that lists
  profiles, marks the active one, disables profiles not applicable to the current platform, and on
  selection composes (instruction + response style) and inserts via `onInsert`, persisting the
  global active selection.
- `settings`: the schema gains an additive optional `activeProfileId` recording the globally active
  instruction profile (device-local; not part of the synced set).

## Impact

- **Code:** `shared/settings.ts` (+`activeProfileId?`); `ui/input-bar/InputBar.tsx` (Profile stub →
  chip: a `useFloating`/menu surface, reads profiles + active state, composes + inserts) and
  `ui/input-bar/mountInputBar.tsx` + `content/index.ts` (thread the `platform` id and a
  `queryProfiles` fn into the bar); a small compose helper (instruction + response-style directive).
  Reuses `queryProfilesRemote`, `getSettings`/`setSettings`/`subscribeSettings`, and the existing
  `onInsert` → `adapter.insertText` path.
- **Data:** none in the workspace store — `activeProfileId` is a local settings preference; profile
  records are unchanged. No migration.
- **Privacy:** none — no new permission, no network; the bar still only writes the composer
  (append) and reads local profile/settings data. No host-keystroke interception.
- **Dependencies:** builds on `profiles-library` (✅, the profile data + `queryProfilesRemote`),
  `input-bar` (✅, the bar + stub + `onInsert`), and `settings` (✅). Unblocks
  `profile-system-prompt` (the D13 `SYSTEM` mode + `setSystemPrompt` adapter seam).
