## Why

The Folders tab gives no at-a-glance signal of which platform a conversation belongs to, and a
filed conversation only opens in the active tab — clicking a Gemini chat from a Claude tab
navigates the wrong site away. Folders also open with "no icon / no colour" preselected, so the
default tree reads as a flat, unbranded list. This change makes platform identity visible
everywhere a conversation or filter appears, routes a click to the right surface, and gives
folders a sensible default look.

## What Changes

- Conversation rows lead with the **platform brand logo** (Claude / Gemini / Perplexity) instead
  of a colour dot, keyed by `conversation.platform`.
- **BREAKING (UI):** the per-conversation **colour tag is removed** from the conversation row and
  its context menu (the `color` field stays in the schema, dormant — no migration). Pin and
  archive are unchanged.
- Clicking a conversation routes by platform: **same tab** when the conversation's platform
  matches the panel's active-tab platform; otherwise a **side-by-side window** at half screen
  width, **falling back to a new tab** when window creation is unavailable or fails.
- A new **platform branding registry** keyed by `PlatformId` provides each platform's brand logo
  (vendored SVG, no remote code) and its web **origin**, the latter used to resolve a relative
  `nativeId` into an absolute URL for cross-platform opens.
- The platform **view-filter chips** (All / Gemini / Claude …) show each platform's brand logo.
- The New/Edit **folder dialog** preselects a **folder icon + blue colour** by default (the
  clear/no-icon and clear/no-colour options remain available). The default folder icon is a
  **tintable SVG** rendered in the folder's colour; emoji icons stay un-tinted.

## Capabilities

### New Capabilities
- `platform-branding`: a per-`PlatformId` identity registry — brand logo (vendored SVG component)
  and canonical web origin — consumed by conversation rows, filter chips, and cross-platform
  URL resolution.

### Modified Capabilities
- `conversation-filing`: conversation rows show the platform logo as their leading mark; clicking
  a row opens it via platform-aware routing (same tab / side-by-side window / new tab).
- `conversation-organization`: the per-conversation colour state and its context-menu swatch row
  are removed from the UI; pin and archive are retained.
- `folders`: the folder dialog defaults to a folder icon and blue colour; the default icon renders
  as a tintable SVG in the folder's colour.
- `sidebar-shell`: the platform view-filter chips render each platform's brand logo.

## Impact

- UI: `ui/sidebar/ConversationList.tsx` (logo, drop colour, routing), `ui/sidebar/Sidebar.tsx`
  (folder dialog defaults, tintable default icon render), `ui/sidebar/SidebarShell.tsx` (chip
  logos), `ui/sidebar/openConversation.ts` (platform-aware routing).
- New: `ui/components/PlatformLogo.tsx` (vendored lobe-icons SVGs) and a `PlatformId → { origin }`
  branding table in `shared/`.
- No new permissions: `chrome.windows.create` / `chrome.tabs.create` to any URL need none, and
  cross-platform opens never read page content (PRIV intact).
- Tests: `sidebar.test.tsx`, `sidebar-shell.test.tsx`, conversation-list and folder-dialog tests
  adjust for the dropped colour affordance, the logos, and the routing branch.
