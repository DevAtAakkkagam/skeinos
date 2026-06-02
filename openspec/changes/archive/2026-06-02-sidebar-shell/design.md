## Context

The `folders` change renders an interactive tree (`ui/sidebar/Sidebar.tsx`) mounted
in a shadow-DOM overlay via `ui/sidebar/mountSidebar.tsx`. It is a pure view: every
action dispatches a worker mutation through `useWorkspace` and re-renders from the
worker's broadcast (PREACT guardrail). The component currently emits its own chrome —
a "Folders" heading, pinned/archive sections (name-only), and a standalone "Unfiled
conversations" list — directly at the root, with no framing.

The design (`docs/design/Screens Export/02 Sidebar`, screens 01–04) specifies a framed
panel whose chrome is mostly the surface of features that ship later: search (M3),
prompts/profiles (M4), tags (M2), tier (M7), sync (M5). Settings already exist as an
options page and as a typed `chrome.storage.local` schema (`shared/settings.ts`) built
for additive keys. Theme light/dark is already solved by the `--sk-*` token set driven
by `data-theme`, so both mockup variants come for free.

## Goals / Non-Goals

**Goals:**
- Frame the existing folder tree in a shell matching screens 01/02 without changing
  folder behavior or the worker contract.
- Reserve layout slots for later features as visually-present but disabled stubs, so
  each feature drops in without a re-layout.
- Ship two real interactions now: collapse/expand (persisted) and settings-gear →
  options page.
- Keep everything a pure view over worker state, token-styled, keyboard-operable, ARIA-labelled.

**Non-Goals:**
- Implementing search, prompts, profiles, tags, tier gating, or sync (their stubs are
  inert). Those are separate M2–M7 changes.
- Changing the folder data model, mutation ops, store, or messaging hub.
- Re-anchoring how the overlay attaches to the host page (that stays in `ui/mount`
  and the per-platform adapter; unchanged here).

## Decisions

### D1 — `SidebarShell` wraps, `Sidebar` becomes the Folders-tab body
`SidebarShell.tsx` owns the frame (header, tab strip, footer, and the collapsed-rail
swap). The existing `Sidebar.tsx` is refactored to render *only* the folder tree
(active + pinned + archive sections, dialog, context menu) and becomes the body shown
under the active "Folders" tab. `mountSidebar` mounts `SidebarShell` instead of `Sidebar`.
- *Why:* keeps the folder logic intact and isolated; the shell is a thin presentational
  layer. Alternative — folding the chrome into `Sidebar` — would bloat one component and
  entangle inert stubs with live folder state.

### D2 — Disabled stubs, not omitted, for unbuilt features
Search bar, Prompts/Profiles tabs, the tag filter row, the PRO badge, and the sync
status render as visually-complete but `disabled`/`aria-disabled` elements with a
"coming soon" affordance (title/tooltip). They dispatch nothing.
- *Why:* the user chose "establish the layout now." Reserving the real slots means M2–M7
  fill them in place. Alternative — omit until real — avoids dead UI but forces repeated
  re-layout as each feature lands.

### D3 — Collapse state persists in the settings store
Add `sidebarCollapsed?: boolean` to `Settings` (`shared/settings.ts`), default `false`.
The shell reads it via `getSettings()` on mount, toggles via `setSettings({ sidebarCollapsed })`,
and stays in sync through the existing `subscribeSettings` notification.
- *Why:* D4/D-settings already mandates `chrome.storage.local` for tiny UI prefs readable
  before the workspace DB opens, and the schema is explicitly additive (missing key →
  default). Global (not per-platform) keeps the schema minimal; per-platform was considered
  and deferred — no evidence users want divergent collapse per host yet.

### D4 — Settings gear is the one live footer wire-up
The gear button calls `chrome.runtime.openOptionsPage()`. PRO badge and sync status
remain inert stubs.
- *Why:* the options page already exists, so the gear can be real with zero new
  permissions. Tier and sync have no backing feature yet.

### D5 — Collapsed rail is a render-mode swap, not a separate mount
When `sidebarCollapsed` is true, `SidebarShell` renders `CollapsedRail` (an icon-only
column: app icon, search, folders, prompts, profiles, sync, settings) in place of the
expanded body; the same toggle expands it. Both share the same shadow root and tokens.
- *Why:* one mount, one state source, no duplicated mount lifecycle. Rail icons for
  unbuilt features follow D2 (inert except folders + settings).

### D6 — Empty state becomes a card; unfiled list is removed
The active-tree empty branch renders the screen-04 card (folder glyph, copy, "New
folder" CTA wired to the existing create dialog). The standalone unfiled-conversation
list and its conversation context-menu rendering are removed from the sidebar; the
underlying `conversation.assign` / `conversation.ingest` ops are untouched and remain
available to future surfaces.
- *Why:* matches the folder-centric mockup. Assignment-from-sidebar is deferred, not
  deleted — no contract change.

## Risks / Trade-offs

- **Dead UI confuses users** (disabled stubs look broken) → each stub carries a
  "coming soon" title/`aria-disabled`, and is visually de-emphasized via tokens; covered
  by a render test asserting the disabled state.
- **Removing the unfiled list removes the only in-sidebar drag source for assignment**
  → acceptable: the `folders` spec delta records the removal; assignment ops persist and
  a later change (conversation surfacing) re-introduces a source. Folder tests are updated
  rather than left asserting the old list.
- **Collapse pref written on every toggle** → writes are tiny and debounced by user
  intent (a click); `chrome.storage.local` handles this comfortably. No perf budget risk.
- **Shell chrome drifts from real features' needs** (a reserved slot fits poorly when M3/M4
  land) → slots are structural containers only; each later change owns its slot's final
  markup and may adjust it. The shell commits to layout, not to each feature's internals.
