## Why

The `folders` change shipped the interactive folder tree — the busiest part of the
sidebar — but it renders as a bare list with no surrounding chrome. The product
design (`docs/design/Screens Export/02 Sidebar`) calls for a framed panel: a
branded header, a search launcher, Folders/Prompts/Profiles tabs, a tag filter,
pinned/archive sections with icons and counts, a footer (tier · sync · settings),
a collapsed icon rail, and a polished empty state. Most of that chrome is the
visible surface of features that land later (search M3, prompts/profiles M4, tags
M2, tier M7, sync M5). We need the *shell* now so the layout is real and each
later feature drops into a reserved slot instead of forcing a re-layout.

## What Changes

- Add a **sidebar shell** that frames the existing folder tree: branded header
  (wordmark + workspace label + collapse toggle), a tab strip, the folder body,
  and a footer.
- Add a **collapsed icon rail** (design screen 03) toggled from the header; the
  expanded/collapsed state persists across reloads.
- Wire the footer **settings gear** to `chrome.runtime.openOptionsPage()` (real).
- Render **disabled "coming soon" stubs** for not-yet-built features so the layout
  is established: search bar + ⌘K hint (M3), Prompts/Profiles tabs (M4), tag
  filter row (M2), PRO badge (M7), sync status (M5).
- **Pinned and archive rows gain icon · color · count**, matching the active tree.
- Replace the plain "No folders yet" text with the **empty-state card** (icon +
  copy + "New folder" CTA) from design screen 04.
- **Remove the standalone "Unfiled conversations" list** from the sidebar — the
  panel is folder-centric, matching the mockup. The underlying assignment
  mutations are unchanged and remain available for later surfaces.
- Add a `sidebarCollapsed` UI preference to the settings schema (additive; missing
  key falls back to default).

## Capabilities

### New Capabilities
- `sidebar-shell`: The framed sidebar panel — header with branding and collapse
  toggle, tab strip, footer (tier/sync/settings), collapsed icon rail, the
  disabled feature stubs, and the empty-state card. The panel docks outboard on
  the right edge and reflows the host page left (design "07 Host coexistence").
  Everything is a pure view over worker state, styled only from `--sk-*` tokens,
  keyboard-operable and ARIA-labelled.

### Modified Capabilities
- `ui-shell`: Bundle the Lattice Design System typefaces (Urbanist, Handjet,
  Spline Sans Mono) as font tokens injected into every shadow root, replacing the
  prior system-font stack so the overlay matches the design exactly across OSes.
- `settings`: Add a `sidebarCollapsed` boolean UI preference (additive schema key
  with a default; no migration, no behavior change to existing keys).
- `folders`: The folder tree now renders as the **body of the Folders tab** inside
  the shell; pinned and archive rows render icon · color · count like the active
  tree; the standalone unfiled-conversation list is removed from the sidebar.

## Impact

- **Code:** `extension/src/ui/sidebar/` — new `SidebarShell.tsx` and
  `CollapsedRail.tsx`; refactor `Sidebar.tsx` into the Folders-tab body; extend
  `styles.ts` with token-based CSS for the shell, rail, footer, and empty state.
  New strings added to the in-file string table (i18n-ready).
- **Settings:** `extension/src/shared/settings.ts` — one additive field; read/write
  via existing `core/settings` accessors.
- **No changes** to the store, messaging hub, service worker, or platform adapters.
- **Tests:** new shell render/interaction tests; folder tests updated for the
  removed unfiled list and the icon/color/count on pinned/archive rows.
- **Permissions:** none added (`openOptionsPage` needs no extra permission).
