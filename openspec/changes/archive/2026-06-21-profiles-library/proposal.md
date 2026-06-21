## Why

Instruction profiles (PRD §6.4 / LLD T3.5) let users save and reuse named standing instructions
("act as a senior staff engineer; be terse") instead of re-pasting them into every chat — pain #2
in the PRD. The data model (`InstructionProfile`) and the synced `profiles` store already exist, and
the side-panel shell already reserves a **disabled `Profiles` tab stub**. This change builds the
foundation: a Profiles library view with full CRUD and the per-platform editor shown in the design
(`docs/design/Screens Export/09 Instruction profiles`). It deliberately ships **no activation and
no injection** — a profile can be created and edited but does not yet affect any chat. That makes
this slice independent and buildable now; activation (the input-bar chip + prepend injection) and
the true-system-prompt mode land in later slices.

## What Changes

- Add worker CRUD for profiles: declaration-merged `profiles.query` / `profiles.mutate` request
  kinds handled in a new `core/profiles` module over the existing synced `profiles` store —
  mirroring `core/prompts` (single writer, broadcast on change, sync envelope per `put`).
- Enable the **Profiles tab** in the side-panel shell (today a disabled stub) and add a
  `ProfilesPanel`: a profile list whose rows (and a header `+`) open a **modal `ProfileEditor`**
  (the same `Dialog` style as the prompt/folder editors) with **name**, **description**,
  **instruction text**, per-platform **APPLY TO** toggles (`appliesTo`), and a **response style**
  (verbosity: brief/balanced/thorough; format: markdown/plain).
- Seed the profile library from onboarding's domain pick: a bundled per-domain `PROFILE_CATALOG`
  installed by an idempotent worker `profiles.install` request (dedupe by `seedId`), mirroring the
  prompt seed installer. `InstructionProfile` gains optional `domain`/`seedId` provenance (additive,
  no migration). Onboarding installs prompts + profiles together for the chosen domain.
- Show a per-platform **mode indicator** in the editor. Per D13's honesty rule, it reflects the
  *implemented* behavior: **PREPEND on every platform** in this slice (no system-prompt injection
  exists yet). The `SYSTEM` indicator is introduced later, together with the actual system-prompt
  injection, so the UI never claims a mode it doesn't perform.
- Tier limit (Free = 3 profiles) is **out of scope** — it depends on `tier-gate` (C9, unbuilt) and
  will be enforced when that lands; this slice imposes no cap.
- Tests for all of the above are authored by a sub agent (see tasks.md).

## Capabilities

### New Capabilities

- `profiles`: the instruction-profile data model operations (create/update/delete read through the
  worker over the synced `profiles` store) and the Profiles library view + editor (instruction
  text, per-platform `appliesTo`, response style). Activation and injection are explicitly not
  part of this capability slice.

### Modified Capabilities

- `sidebar-shell`: the `Profiles` tab becomes interactive (previously a disabled stub) and renders
  the Profiles view when active.

## Impact

- **Code:** new `shared/profiles.ts` (selector/snapshot/mutation-op + install types + declaration-
  merged kinds); new `core/profiles/{handlers,client,index,seed}.ts` + `core/profiles/catalog/`
  (mirror `core/prompts`); new `ui/profiles/**` (`ProfilesPanel`, `ProfileEditor` modal, controller,
  styles); `ui/sidebar/SidebarShell.tsx` (add `'profiles'` to the interactive `ActiveTab` union and
  render `ProfilesPanel`); `ui/onboarding/OnboardingSurface.tsx` (seed profiles alongside prompts).
- **Data:** the `profiles` object store and `InstructionProfile` type already exist;
  `InstructionProfile` gains optional `domain`/`seedId` fields — additive, no migration. Records
  carry the existing sync envelope.
- **Privacy:** none — profile text is workspace metadata that rides the existing sync envelope (it
  *is* syncable on paid tiers, like prompts); no content boundary change, no network here.
- **Dependencies:** builds on `workspace-store` (the `profiles` store ✅), the `prompts` worker
  pattern (✅), and `sidebar-shell` (✅). Unblocks `profile-activation` (the input-bar chip +
  prepend injection) and `profile-system-prompt` (the D13 SYSTEM mode).
