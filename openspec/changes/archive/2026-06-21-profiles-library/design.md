## Context

`InstructionProfile` (`shared/types.ts`) and the synced `profiles` object store (`core/store/schema.ts`)
already exist; `SidebarShell` already declares a disabled `Profiles` tab stub. The design screen
(`09 Instruction profiles`) shows a side-panel master-detail view: a profile list (left/middle) and
an inline editor (right) with the instruction text, a per-platform APPLY TO section (mode badge +
toggle), and a response-style control.

The `prompts` capability is the template to mirror exactly: declaration-merged `prompts.query` /
`prompts.mutate` kinds (`core/prompts/handlers.ts`), a leaf `client.ts`, a `usePromptLibrary` /
`usePromptsController` pair, and `PromptsPanel` surfaced by switching the shell's `ActiveTab`. The
single-writer + broadcast-on-change + sync-envelope rules come for free from `Repo` and the
messaging hub.

Decisions carried in from exploration: this slice is **CRUD + view only** (no activation, no
injection), and the per-platform mode indicator is **PREPEND-only** until the system-prompt slice
(D13 honesty).

## Goals / Non-Goals

**Goals:**
- Worker CRUD for profiles over the existing store, mirroring `prompts`.
- A Profiles list + modal editor with instruction text, `appliesTo` toggles, and response style.
- Enable the previously-stubbed Profiles tab.
- Domain-based profile seeding from onboarding's domain pick (D-7).

**Non-Goals (later slices / changes):**
- Activation state and the input-bar Profile chip — `profile-activation`.
- Any injection (prepend or system) into a chat — `profile-activation` / `profile-system-prompt`.
- The `SYSTEM` mode indicator and `setSystemPrompt` adapter seam — `profile-system-prompt`.
- Free-tier 3-profile cap — depends on `tier-gate` (C9); enforced when that ships.
- Sync itself (M5) — records already carry the envelope; nothing extra here.

## Decisions

### D-1: Mirror the `prompts` worker seam
Add `shared/profiles.ts` with `ProfileSelector` (`{ kind: 'profile.library' }`), `ProfileSnapshot`
(`{ kind: 'profile.library'; profiles: InstructionProfile[] }`), and `ProfileMutationOp`
(`profile.create` / `profile.update` / `profile.delete`). Declaration-merge `profiles.query` /
`profiles.mutate` into the messages map inside `core/profiles/handlers.ts` (the messaging seam, no
hub edit), reusing `MutationResult`. The client `client.ts` mirrors `queryPromptLibraryRemote` /
`mutatePromptLibraryRemote`. Rationale: profiles are structurally a sibling of prompts (synced
workspace records); copying the proven seam keeps single-writer/broadcast/envelope invariants
intact and the review surface small.

### D-2: UI mirrors `PromptsPanel` with a MODAL editor
`ProfilesPanel` renders a full-width profile list (uniform with `PromptsPanel`); clicking a row —
or the header `+` — opens a **modal `ProfileEditor`** (the same `Dialog` primitive the prompt and
folder editors use), so the Profiles tab is visually consistent with the rest of the overlay
rather than diverging into a master-detail inline pane. *(Updated from the original inline
master-detail screen during apply, on user direction — consistency with Prompts/Folders won over
matching the static screen.)* A `useProfilesController` (mirroring `usePromptsController`) owns load
status, the editor open/editing state, and the create/update/delete mutations with the
observe-don't-replay reconcile. Editor fields: name, description, instruction text, per-platform
`appliesTo` toggles, and the response-style segmented controls (verbosity + format), all
token-styled and i18n-ready. The list shows a single first-run empty state (no separate
no-selection pane).

### D-3: Mode indicator is PREPEND-only, derived but capped to implemented behavior
The APPLY TO rows list the supported platforms with an on/off `appliesTo` toggle and a mode label.
The label reflects what the system will actually do — **PREPEND for every platform** in this slice,
because no system-prompt injection exists. `supportsSystemPrompt` is *not* surfaced as `SYSTEM`
here; that indicator and the matching behavior arrive together in `profile-system-prompt`, so the
UI never advertises a mode it can't perform (D13). Rationale: honesty over forward-advertising.

### D-4: Enable the Profiles tab
Add `'profiles'` to the shell's interactive `ActiveTab` union and render `ProfilesPanel` when
active, removing the disabled-stub treatment for that tab. The Folders/Prompts switching pattern is
unchanged; this is the minimal `sidebar-shell` modification.

### D-5: No activation, no injection, no cap
A profile created here changes no chat. There is no "active profile" concept yet and nothing reads
`appliesTo` for injection — those are `profile-activation`. The Free-tier cap is gated on
`tier-gate` (C9); this slice stores any number of profiles.

### D-7: Domain-based profile seeding (added during apply, on user direction)
Onboarding's domain pick seeds the **profile** library alongside the prompt library. A read-only
`PROFILE_CATALOG` (one curated standing-instruction profile per `DomainId`) is installed by an
idempotent worker installer (`installProfileSeeds`, dedupe by `seedId` presence) over a new
`profiles.install` request — mirroring `core/prompts/seed.ts` exactly. `InstructionProfile` gains
optional `domain`/`seedId` provenance fields (additive, no migration). `OnboardingSurface`'s
`defaultInstallSeeds` now installs prompts and profiles in parallel for the picked domain; the
confirmation still previews seeded prompt titles (profiles ride alongside). Re-installing a domain,
or picking a second domain, never duplicates, and hand-created profiles (no `seedId`) are untouched.
This is seeding only — still no activation or injection.

### D-6: Tests authored by a sub agent
Per repo convention, a sub agent authors the suite against the contracts pinned in tasks.md: the
`profiles.query`/`profiles.mutate` worker behavior (create/update/delete, broadcast on change,
envelope stamped), the controller reconcile, and the editor (appliesTo toggles, response style,
PREPEND-only indicator).

## Risks / Trade-offs

- **[Risk] Forward-advertising `SYSTEM` would violate D13** → mitigated by D-3: PREPEND-only until
  the injection exists. The editor copy must not claim system support.
- **[Trade-off] No cap means a Free user could exceed 3 profiles until C9** → accepted and noted;
  enforcing a cap before `tier-gate` exists would duplicate logic C9 owns. Low risk pre-launch.
- **[Risk] `appliesTo` platform list drift** → drive the toggle rows from the shared platform list
  so adding a platform doesn't strand the editor.
- **[Trade-off] Inline editor diverges from Prompts' modal** → intentional per the screen; the
  controller/seam are still shared, so only the presentation differs.
