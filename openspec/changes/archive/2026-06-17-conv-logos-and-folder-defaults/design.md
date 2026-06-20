## Context

The Folders tab renders conversations and folder rows in the shadow-DOM side panel
(`ConversationList.tsx`, `Sidebar.tsx`, `SidebarShell.tsx`). Today a conversation row shows a
colour dot **only when the user set a colour** (`ConversationList.tsx:170`), and the row's
`onOpen` calls `openConversation()` which resolves the relative `nativeId` (e.g. `/chat/abc`)
against the **active tab's** URL — correct only when the conversation belongs to the active tab's
platform. The folder dialog opens with `icon=''` / `color=''`, so the clear options are
preselected and new folders read as unbranded. The platform view-filter chips are text-only.

Constraints that shape this design:
- **MV3 — no remote code.** Brand logos must ship as vendored SVG assets/components, not fetched.
- **PRIV.** Cross-platform opens may read only a conversation's own metadata/URL, never page
  content; no new host or `tabs` permission may be added.
- **PREACT.** All UI mounts in the shadow root, styles only from `--sk-*` tokens, is
  keyboard-operable and ARIA-labelled, and is a pure view over worker state.
- Chrome exposes **no extension API for native split view**; the closest scriptable approximation
  is a half-screen window via `chrome.windows.create`.

## Goals / Non-Goals

**Goals:**
- Make a conversation's platform visible on every row and on the filter chips.
- Route a conversation click to the right surface based on platform.
- Give folders a branded default (folder icon + blue) without removing the clear options.

**Non-Goals:**
- True native Chrome split view (not API-accessible) — we approximate with a side-by-side window.
- A data migration: the dormant `ConversationIndex.color` field is left in place.
- New platforms beyond the P0 set (Claude, Gemini, Perplexity); the registry is just extended
  later as adapters ship.
- Per-conversation colour tagging (removed from the UI by decision).

## Decisions

### D1 — Platform branding registry keyed by `PlatformId`
A single `shared/` table maps each `PlatformId` to `{ origin, logo }`, where `logo` is a vendored
Preact SVG component (from lobe-icons) and `origin` is the platform's canonical web origin
(`claude → https://claude.ai`, `gemini → https://gemini.google.com`,
`perplexity → https://www.perplexity.ai`). One table is the single source of truth for both the
logo (conv rows, chips) and the origin (cross-platform URL building).
- *Why one table:* logo and origin are both "what is this platform", consumed together by the
  routing path; splitting them invites drift.
- *Alternative considered:* storing absolute URLs on each `ConversationIndex` instead of an origin
  map — rejected: it bloats every record and duplicates a constant that belongs in one place.

### D2 — `PlatformLogo` is a vendored SVG component, not an `<img>`/remote fetch
Logos render as inline SVG (currentColor where the brand allows, else brand colours baked in),
mounted in the shadow root like the existing `Icon.tsx` set. Keeps MV3 "no remote code" intact and
lets logos inherit sizing/tokens.

### D3 — Conversation row leads with the logo; colour tag removed
The leading slot becomes the platform logo (always present). The colour dot, the `color:` swatch
row in the conversation context menu, the `COLOR_PREFIX` machinery, and the `conversation.recolor`
call site are removed from the UI. The schema field stays (dormant, like `platformScope`) so there
is **no migration**. Pin and archive are untouched.
- *Why drop rather than relocate:* the user chose logo-only rows; a ring/badge to also carry colour
  added affordance weight for a feature being retired.

### D4 — Platform-aware open routing
`openConversation` gains the panel's active `platform` and the conversation's `platform`:

```
open(conv, activePlatform):
  if conv.platform === activePlatform:
        navigate the active tab          (existing relative-nativeId path)
  else:
        url = new URL(conv.nativeId, BRANDING[conv.platform].origin).href
        try   chrome.windows.create({ url, left, top, width: halfScreen, height })
        catch chrome.tabs.create({ url })          // fallback
```

- The "active platform" is the side panel's `platform` prop (`SidePanelApp` already scopes it to
  the active tab — `side-panel` capability).
- Half-screen geometry comes from the current window / `screen` metrics; on any failure (no
  `windows` API, geometry unavailable, rejected promise) we fall back to `tabs.create`.
- *Why a new window, not a tab, for cross-platform:* the user wants the two chats visible together;
  a side-by-side window is the closest scriptable approximation of split view.

### D5 — Folder default icon is a tintable sentinel, distinct from "cleared"
The dialog preselects `icon = <folder sentinel>` and `color = #5aa9e6` (palette blue). To keep
"default" visually distinct from "cleared", the default folder icon is a **stored sentinel value**
(e.g. `'folder'`) that renders as the tintable `FolderIcon` SVG in the folder's colour — not a
render-time fallback (which couldn't tell cleared from default apart). The icon grid's first slot
becomes this tintable folder SVG (replacing the `📁` emoji); the clear (`×`) option still resets to
no icon. Emoji icons remain un-tinted (they cannot take a colour) — an accepted inconsistency.

### D6 — Filter chips render the brand logo
The "All" chip stays text/neutral (no single brand). Each platform chip in `SidebarShell.tsx`
renders `PlatformLogo` before its label, from the same registry.

## Risks / Trade-offs

- **Side-by-side window is an approximation, not native split** → documented behaviour; reliable
  `tabs.create` fallback guarantees the conversation always opens.
- **Window geometry varies (multi-monitor, OS chrome)** → compute from the current window bounds;
  on any uncertainty fall back to a new tab rather than mis-position.
- **Origin map can drift if a platform changes domains** → centralised in one table next to the
  adapter host matches (`manifest.config.ts` P0_MATCHES) for easy audit.
- **Dropping colour is a visible feature removal** → low usage surface; schema retained so it can
  be reinstated without data loss if reversed.
- **Emoji vs tinted-SVG icon inconsistency** → only the default/folder icon tints; acceptable and
  scoped to one glyph.

## Migration Plan

No data migration. `ConversationIndex.color` is left dormant; the `conversation.recolor` mutation
op may remain in the messaging contract unused or be removed in a later cleanup. Roll-back is a
pure UI revert.

## Open Questions

- Should `conversation.recolor` be removed from the messaging contract now or left dormant for a
  later cleanup? (Leaning: leave dormant to keep this change UI-only.)
- Exact half-screen geometry policy on multi-monitor setups (use focused window's display bounds).
