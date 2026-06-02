## 1. Settings preference

- [x] 1.1 Add optional `sidebarCollapsed: boolean` to the `Settings` interface in `shared/settings.ts`; default `false` in `DEFAULT_SETTINGS`
- [x] 1.2 Add a settings test: fresh-install default is `false`, a stored `true` round-trips, and a stored object missing the key falls back to `false` while preserving other keys

## 2. Refactor folder body

- [x] 2.1 Strip the chrome out of `Sidebar.tsx`: remove the "Folders" heading row and the standalone unfiled-conversation list (and its per-conversation context menu); keep the active tree, dialog, folder context menu, and drag-reorder/re-parent
- [x] 2.2 Render icon · color · count on pinned and archive rows to match the active tree
- [x] 2.3 Replace the plain "No folders yet" text with an empty-state card (folder glyph, copy, "New folder" CTA wired to the create dialog)
- [x] 2.4 Update existing folder tests for the removed unfiled list/conversation menu and assert icon/color/count on pinned/archive rows and the empty-state card

## 3. Shell frame

- [x] 3.1 Create `SidebarShell.tsx`: header (brand wordmark + workspace label + collapse toggle), tab strip, body region, footer; render the folder body under the active Folders tab
- [x] 3.2 Add the tab strip — Folders active; Prompts and Profiles as disabled `aria-disabled` "coming soon" tabs that dispatch nothing
- [x] 3.3 Add the disabled search launcher with a ⌘K hint (inert) and the disabled tag filter row (inert)
- [x] 3.4 Add the footer: inert PRO badge, inert sync-status indicator, and a settings gear that calls `chrome.runtime.openOptionsPage()`
- [x] 3.5 Add new user-facing strings to the in-file string table (no inline literals); ensure every control is token-styled, ARIA-labelled, and keyboard-operable

## 4. Collapse + rail

- [x] 4.1 Wire the collapse toggle to read `sidebarCollapsed` via `getSettings()` on mount, persist via `setSettings`, and stay in sync through `subscribeSettings`
- [x] 4.2 Create `CollapsedRail.tsx`: icon-only column (app, search, folders, prompts, profiles, sync, settings); folders + settings operable (settings → `openOptionsPage`), the rest inert
- [x] 4.3 In `SidebarShell`, swap the expanded body for `CollapsedRail` when `sidebarCollapsed` is true; toggle expands it back

## 5. Mount + styles

- [x] 5.1 Update `mountSidebar.tsx` to mount `SidebarShell` instead of `Sidebar`
- [x] 5.2 Extend `styles.ts` with token-based CSS for the header, tab strip, footer, collapsed rail, disabled stubs, and empty-state card (light + dark via existing `--sk-*` tokens; no hard-coded colors)

## 6. Tests

- [x] 6.1 Shell render test: header, tab strip, footer, and the folder body all present in the expanded state
- [x] 6.2 Stub test: search launcher, Prompts/Profiles tabs, PRO badge, and sync status are present and disabled/inert
- [x] 6.3 Collapse test: toggling persists state and renders `CollapsedRail`; a remount reads the persisted state and starts collapsed
- [x] 6.4 Settings-gear test: activating the footer gear (and the rail settings icon) calls `chrome.runtime.openOptionsPage()`
- [x] 6.5 Run `openspec validate sidebar-shell`, lint, type-check, and the full test suite green

## 7. Right-dock + design-system fonts (design alignment)

- [x] 7.1 Dock the panel outboard on the right edge via a fixed body-level container and reflow the host page left (`dockSidebar` in `mountSidebar.tsx`); content script docks instead of mounting into the host nav anchor
- [x] 7.2 Bundle the Lattice typefaces (Urbanist, Handjet, Spline Sans Mono) as woff2 data-URIs in `ui/theme/fonts.ts`; inject `@font-face` into each shadow root via the mount harness
- [x] 7.3 Add `--sk-font-ui` / `--sk-font-dot` / `--sk-font-mono` tokens and the Lattice type scale (body 13/500); apply the dot font + wide tracking to overlines and the wordmark
- [x] 7.4 Rebuild and re-run the full unit + browser suites green
