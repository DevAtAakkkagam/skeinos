## 1. Platform branding registry

- [x] 1.1 Vendor the lobe-icons brand SVGs for the P0 platforms (Claude, Gemini, Perplexity) as in-bundle Preact components under `ui/components/PlatformLogo.tsx` (shadow-DOM safe, no remote fetch).
- [x] 1.2 Add a `PlatformId → { origin, logo }` branding registry in `shared/` (origins: `claude → https://claude.ai`, `gemini → https://gemini.google.com`, `perplexity → https://www.perplexity.ai`); export a `PlatformLogo` lookup and the origin map.
- [x] 1.3 Unit-test the registry: every present `PlatformId` resolves a logo component and an origin; a relative `nativeId` resolves to the expected absolute URL against the origin.

## 2. Conversation row: logo + drop colour

- [x] 2.1 In `ConversationList.tsx`, replace the leading colour dot (`sk-conv-row__dot`) with `PlatformLogo` keyed by `c.platform` as the row's leading mark.
- [x] 2.2 Remove the colour UI: the `color:` swatch row in the conversation context menu, the `COLOR_PREFIX` machinery, and the `conversation.recolor` call site; keep Move to…, Pin, Archive.
- [x] 2.3 Leave `ConversationIndex.color` dormant in the schema (no migration); confirm no UI path sets or reads it.
- [x] 2.4 Update conversation-list / sidebar tests for the dropped colour affordance and the new logo leading mark.

## 3. Platform-aware open routing

- [x] 3.1 Extend `openConversation.ts` to take the panel's active `platform`; when `conv.platform === activePlatform`, keep the existing active-tab navigation (relative `nativeId`).
- [x] 3.2 For a cross-platform open, build the absolute URL from the branding origin and open a side-by-side window via `chrome.windows.create` at ~half screen width (geometry from the focused window/display bounds).
- [x] 3.3 Fall back to `chrome.tabs.create({ url })` when `windows` is unavailable, geometry is unresolved, or window creation rejects.
- [x] 3.4 Thread the active `platform` from `SidePanelApp` → `SidebarShell` → `Sidebar` → `ConversationList` `onOpen` so routing knows the active platform.
- [x] 3.5 Test all three branches (same-tab, side-by-side window, new-tab fallback) with a chrome shim; assert no page content is read and no new permission is used.

## 4. Folder dialog defaults + tintable icon

- [x] 4.1 In `Sidebar.tsx` `FolderDialog`, default `icon` to the folder sentinel and `color` to palette blue (`#5aa9e6`) for the create mode; keep edit mode reading the folder's stored values.
- [x] 4.2 Make the icon grid's first slot the tintable folder SVG (sentinel value), replacing the `📁` emoji; keep the clear (`×`) option resetting to no icon.
- [x] 4.3 Render the folder icon: when the icon is the folder sentinel, draw the tintable `FolderIcon` SVG in the folder's colour; emoji icons render un-tinted; cleared = no icon (in `renderNode` and `renderLeaf`).
- [x] 4.4 Update folder-dialog / sidebar tests for the new defaults, the tintable default-icon render, and the still-available clear options.

## 5. Filter chips show brand logos

- [x] 5.1 In `SidebarShell.tsx`, render `PlatformLogo` before each platform chip's label from the branding registry; keep the "All" chip neutral.
- [x] 5.2 Update `sidebar-shell` tests to assert each platform chip shows its logo and "All" shows none, with chips still keyboard-operable and labelled.

## 6. Verify

- [x] 6.1 Run `npm run typecheck` and `npm test`; fix fallout from the dropped colour API and new signatures.
- [x] 6.2 Run `npm run test:browser` to confirm logos render and tint correctly in the real shadow-DOM mount.
- [x] 6.3 Update `openspec/specs/**` deltas are reflected; run `openspec validate "conv-logos-and-folder-defaults"`.
