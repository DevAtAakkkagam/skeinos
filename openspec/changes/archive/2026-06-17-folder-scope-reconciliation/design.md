## Context

The side panel renders three things from worker state: the folder **tree**
(`folder.tree`), per-folder **counts** (`folder.counts`), and per-folder
**contents** (`conversation.list`). Today these resolve at three different scopes:

```
 folder.tree      → ALL folders            (no platform filter)        unified
 folder.counts    → countByFolder(ALL)     (every platform)            global
 conversation.list→ filter(c.platform===p) (active tab only)           per-platform
 Folder.platformScope → written at create (creating tab's platform), never read → dead
```

The result is an incoherent hybrid: a folder badge of "5" over an empty body on a
tab whose platform owns none of the five (the five are e.g. Claude conversations,
hidden on a Gemini tab). PRD §6.1 wants unified-or-independent **by user choice**;
D25 made the panel "scoped to the active tab's platform"; D27 added the
per-platform active-conversation seam. No decision reconciles these, so the panel
honors neither PRD mode.

Chosen direction (this change): **unified by default, with an optional platform
view-filter.** The workspace is fundamentally unified; narrowing to one platform is
a view control, not a structural per-folder scope (which stays deferred to M4 /
T4.3).

## Goals / Non-Goals

**Goals:**
- A folder shows **all** conversations assigned to it, across every platform, on any tab.
- The count badge always equals the rows shown under the active filter (no "5 vs empty").
- An optional **platform filter** narrows the unified list to one platform; default "All".
- Eliminate the *class* of bug by sourcing tree-contents and counts from **one** unified read.
- Preserve the per-tab active-conversation card (D27) and all host gating.

**Non-Goals:**
- The M4 structural unified⇄independent per-folder toggle (T4.3) — not built here.
- Tags (C7) and the search platform-filter (D26) — untouched.
- Changing host gating / neutral-state, ingest, the store schema, or any adapter.

## Decisions

### D-FSR1 — Unify the conversation read; drop the hard platform filter

`conversation.list` becomes unscoped: the handler returns the full conversation set
and the UI owns narrowing. The selector's required `platform` field is removed
(`conversation.active` keeps its `platform` — the active card is genuinely per-tab).

*Why:* the folder browser is one library; filtering it to the active tab is what
broke PRD §6.1. *Alternative considered:* keep `platform` but add a `'unified'`
sentinel — rejected as carrying the dead-data smell forward; a clean unscoped read
is simpler and the active-card path already carries the per-platform selector it needs.

### D-FSR2 — Derive counts AND contents from the single unified list (client-side filter)

The panel already fetches the unified list; the platform filter is applied **in the
UI** over that list, and **counts are derived client-side** (`countByFolder` over the
filtered set). The badge therefore equals the visible rows by construction, under
"All" or any platform.

*Why:* the root cause was two queries at two scopes (global counts vs scoped list);
deriving both from one source makes the mismatch unrepresentable, and avoids a worker
round-trip on every filter change. The full list is **uncapped** (the 50-row
`RENDER_CAP` is render-only), so derived counts are accurate. *Consequence:* the
separate `folder.counts` selector becomes redundant for the panel and **may be
retired** (kept only if another caller needs it — none does today). *Alternative
considered:* keep `folder.counts` and add a `folder.counts?platform=` variant —
rejected; it re-introduces two sources of truth for one number.

### D-FSR3 — Platform filter is a view control, not folder scope

The filter is panel-local view state (a chip group in `SidebarShell`, sibling to the
`sk-tags` row), defaulting to "All". Chips are "All" + each platform present in the
unified list. It does not mutate folders and does not read/write `platformScope`.

*Why:* keeps the structural unified⇄independent decision (T4.3) cleanly deferred while
delivering the user-visible "filter by platform" the direction calls for. Filter state
is ephemeral (not persisted) in this change; persistence is a marked follow-up.

### D-FSR4 — Folders are created `platformScope: 'unified'`; field retained, no migration

`Sidebar.tsx` stops passing the creating tab's platform; folder-create uses
`'unified'`. The field stays in the schema as the hook for M4 independent mode.

*Why:* in a unified model a folder is platform-agnostic; stamping the creating
platform was the dead-data source. **No migration needed** — `folder.tree` never
filtered on `platformScope`, so existing folders (carrying a stale platform value)
already render unified; the value is simply ignored. Backfilling old rows to
`'unified'` is optional cosmetic cleanup, deliberately skipped to avoid a schema bump.

### D-FSR5 — Reconcile the specs and log D28

Amend `side-panel` ("scopes to active tab's platform" → only the active-conversation
context and host gating derive from the active tab; the workspace browser is unified),
amend `folders` (contents unified, counts match the filter), extend `sidebar-shell`
(platform filter). Add `docs/DECISIONS.md` **D28** citing PRD §6.1 ↔ D25/D27.

## Risks / Trade-offs

- **Loading the full unified list could grow with library size** → Mitigation: contents
  were already fully loaded per-platform; the delta is other platforms' rows. `RENDER_CAP`
  still bounds DOM nodes per folder, and virtualization remains the marked follow-up
  (with the deferred detail view). Acceptable at PRD's 5k-conversation NFR target.
- **Removing `folder.counts` touches the messaging contract** → Mitigation: it is an
  internal worker selector with one consumer (the panel); grep-verified before removal,
  and its test moves to the client-side derivation. If risk is unwanted, keep the
  selector dormant — retiring it is the recommendation, not a hard requirement.
- **Active-card highlight in a unified list** → the highlighted row may now sit among
  other platforms' rows; the `aria-current` match is on `conversationId(platform,
  nativeId)` so it stays correct — no change, just validated by a test.
- **Filter state not persisted** → a tab switch / panel reopen resets to "All". Accepted
  for this change; persistence is a follow-up, and "All" is the safe default.

## Migration Plan

No data migration. Ship behavior + contract change together; rollback is a straight
revert (the `platformScope` field and store schema are untouched, so reverting cannot
strand data).

## Open Questions

- Should the platform filter **default to the active tab's platform** instead of "All"
  on first open? Direction says default unified ("All"); revisit only if testing shows
  users expect the current-platform view first.
- Should filter selection **persist** (per panel / per platform)? Deferred; out of scope.
- Retire `folder.counts` outright, or leave it dormant for future non-panel callers?
  Lean retire (single consumer today); settle during apply when the grep is in hand.
