## 1. Settings field

- [x] 1.1 Add optional `activeProfileId?: string` to `Settings` in `shared/settings.ts` (additive,
      documented as device-local / not synced); confirm `core/settings` needs no change (rides the
      existing merge). Leave it absent from `DEFAULT_SETTINGS` so it defaults to undefined.

## 2. Compose helper

- [x] 2.1 Add a pure `composeProfileText(profile)` helper (e.g. `ui/profiles/compose.ts` or in the
      bar): returns `instructionText`, optionally followed by a response-style directive derived
      from `responseStyle` (verbosity brief/balanced/thorough + format markdown/plain). No directive
      when `responseStyle` is absent. Unit-testable, no I/O.

## 3. Profile chip (input bar)

- [x] 3.1 Thread a `platform: PlatformId` prop and a `queryProfiles` fn (default
      `queryProfilesRemote`, injectable) into `InputBar` via `mountInputBar`; pass `platformId` from
      `content/index.ts`'s `remountInputBar`.
- [x] 3.2 Replace the disabled Profile `sk-ib-stub` with a functional chip: a `useFloating`/menu
      surface (mirroring the slash popover) that lists profiles from `queryProfiles`, marks the
      active one, and disables profiles whose `appliesTo` excludes `platform`.
- [x] 3.3 Read/write the active profile via `getSettings`/`setSettings` (`activeProfileId`) and
      subscribe with `subscribeSettings` so the chip updates across tabs; treat a missing/dangling
      id as "no active profile" (defensive, never throws).
- [x] 3.4 On selecting an applicable profile: write `activeProfileId`, then
      `onInsert(composeProfileText(profile))` (append-only, no `submit`). The model-selection stub
      stays disabled.

## 4. Tests (authored by a sub agent)

- [x] 4.1 `composeProfileText`: instruction only when no response style; instruction + correct
      directive for each verbosity/format combination.
- [x] 4.2 Settings: `activeProfileId` defaults undefined, round-trips, and notifies subscribers;
      missing key does not invalidate other settings.
- [x] 4.3 Chip: lists profiles, marks the active one, disables profiles not applicable to the
      current platform; opening reflects the persisted active profile.
- [x] 4.4 Activation: selecting an applicable profile writes `activeProfileId` and calls `onInsert`
      with the composed text (append, no `submit`); a profile with no response style inserts only
      the instruction; a non-applicable profile cannot be activated/injected.
- [x] 4.5 Cross-tab: an `activeProfileId` change surfaces in the chip via the settings subscription;
      a dangling `activeProfileId` renders as no active profile without throwing.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm test`; then `npm run test:browser` for the bar chip
      (shadow-DOM menu mount, token resolution, insertion path).
