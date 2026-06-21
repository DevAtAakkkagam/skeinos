## 1. Shared contract

- [x] 1.1 Add `shared/profiles.ts`: `ProfileSelector` (`{ kind: 'profile.library' }`),
      `ProfileSnapshot` (`{ kind: 'profile.library'; profiles: InstructionProfile[] }`), and
      `ProfileMutationOp` (`profile.create` / `profile.update` (partial) / `profile.delete`);
      re-export `MutationResult`. Mirror `shared/prompts.ts`.

## 2. Worker CRUD

- [x] 2.1 Add `core/profiles/handlers.ts`: declaration-merge `profiles.query` / `profiles.mutate`
      into the messages map; register handlers over the existing `profiles` `Repo`; broadcast
      `state.changed` naming `profiles` only on a successful mutation. Mirror `core/prompts/handlers.ts`.
- [x] 2.2 Add `core/profiles/client.ts` (`queryProfilesRemote` / `mutateProfilesRemote`) and
      `core/profiles/index.ts` barrel exporting a `registerProfileHandlers()` (mirror
      `registerPromptHandlers`). Wire it into `background/index.ts` — import `registerProfileHandlers`
      and call it at module top level alongside `registerPromptHandlers` (handlers must register on
      every cold start, not inside `initBackground`).

## 3. Controller + view

- [x] 3.1 Add `ui/profiles/useProfilesController.ts` (mirror `usePromptsController`): load status,
      selected profile, create/update/delete via the client, observe-don't-replay reconcile on the
      `profiles` broadcast.
- [x] 3.2 Add `ui/profiles/ProfilesPanel.tsx`: master-detail — a profile list (name + description,
      "New profile") and an inline editor pane. Editor fields: name, description, instruction text,
      per-platform `appliesTo` toggles (rows driven by the shared platform list), and response-style
      segmented controls (verbosity brief/balanced/thorough; format markdown/plain). Token-styled,
      i18n-ready `STR`. Add `ui/profiles/styles.ts`.
- [x] 3.3 Render the per-platform mode indicator as **PREPEND** for every applicable platform; do
      NOT surface a SYSTEM mode (added later with the injection). Editor copy must not claim
      system-prompt support.

## 4. Enable the Profiles tab

- [x] 4.1 In `ui/sidebar/SidebarShell.tsx`: add `'profiles'` to the `ActiveTab` union; instantiate
      the controller once (`const profiles = useProfilesController(...)`, mirroring the `prompts`
      controller held in the shell); make the Profiles tab interactive (remove the disabled-stub
      treatment, wire `setActiveTab('profiles')`).
- [x] 4.2 Convert the shell **body** from the current binary ternary
      (`activeTab === 'folders' ? <Sidebar> : <PromptsPanel>`) to a 3-way switch so `'profiles'`
      renders `<ProfilesPanel controller={profiles} />` — otherwise the Profiles tab falls through to
      `PromptsPanel`. The folder platform-filter row + collapsed-list nudge stay gated to
      `'folders'`; the `PromptCategoryChips` filter slot stays gated to `'prompts'` (Profiles has no
      filter slot).

## 5. Tests (authored by a sub agent)

- [x] 5.1 Worker: `profiles.query` returns non-tombstoned profiles with all fields; `profiles.mutate`
      create/update(partial)/delete stamp the envelope, write a tombstone on delete, and broadcast
      `state.changed` for `profiles` on success.
- [x] 5.2 Controller: reconciles via the `profiles` broadcast (observe-don't-replay); create/update/
      delete drive the client.
- [x] 5.3 View: create → edit (name, instruction, appliesTo toggle, response style) → persists and
      re-renders; delete removes from the list; the mode indicator shows PREPEND for all platforms
      and never SYSTEM.
- [x] 5.4 Shell: the Profiles tab is interactive and renders `ProfilesPanel` (NOT `PromptsPanel` —
      guards the binary-ternary fall-through), hides folder-only chrome and the prompt filter slot,
      and Folders/Prompts switching still works.

## 6. Verification

- [x] 6.1 Run `npm run typecheck` and `npm test`; then `npm run test:browser` for the Profiles view
      (shadow-DOM mount + tab switch + token resolution).

## 7. Apply-time additions (user direction — see design D-2 updated / D-7)

- [x] 7.1 Editor is a **modal** (`ui/profiles/ProfileEditor.tsx`, the `Dialog` primitive) opened by
      clicking a list row or the header `+`, consistent with the prompt/folder editors (replaces the
      inline master-detail pane). Controller mirrors `usePromptsController`'s editor model
      (`openCreate`/`openEdit`/`closeEditor`/`submitProfile`/`deleteProfile`). Single first-run
      empty state (fixes the double "No profiles yet" / "Select a profile" render).
- [x] 7.2 Domain-based seeding: add optional `domain`/`seedId` to `InstructionProfile` (additive);
      `core/profiles/catalog/` (`PROFILE_CATALOG`, `profileSeedsForDomain`) + `core/profiles/seed.ts`
      (`installProfileSeeds`, idempotent by `seedId`); `profiles.install` request + handler
      (broadcast only on >0 inserted) + `installProfileSeedsRemote` client.
- [x] 7.3 Wire onboarding: `OnboardingSurface` `defaultInstallSeeds` installs prompts + profiles in
      parallel for the picked domain.
- [x] 7.4 Tests: catalog + installer + `profiles.install` (`tests/profiles-seed.test.ts`); rewrite
      controller/panel/browser tests for the modal editor + single empty state.
