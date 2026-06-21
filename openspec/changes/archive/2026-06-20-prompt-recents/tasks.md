## 1. Usage write (prompts capability)

- [x] 1.1 In `shared/prompts.ts`, add `{ op: 'prompt.recordUse'; id: string }` to `PromptMutationOp`.
- [x] 1.2 In `core/prompts/handlers.ts`, handle `prompt.recordUse` in `mutatePromptLibrary`:
      read-modify-write the prompt with `lastUsedAt = Date.now()` and
      `usageCount = (prev.usageCount ?? 0) + 1`; no-op for a missing/tombstoned id; return
      `{ stores: ['prompts'] }`.

## 2. Recents read (prompts capability)

- [x] 2.1 In `shared/prompts.ts`, add `{ kind: 'prompt.recents'; limit: number }` to `PromptSelector`
      and `{ kind: 'prompt.recents'; results: PromptSearchResult[] }` to `PromptSnapshot`.
- [x] 2.2 In `core/prompts/handlers.ts`, answer `prompt.recents`: filter to prompts with a defined
      `lastUsedAt`, sort by `lastUsedAt` descending, take `limit`, and map each to a
      `PromptSearchResult` with a leading body/description excerpt as the snippet (no highlight);
      exclude tombstones.

## 3. Popover empty state (input-bar capability)

- [x] 3.1 Add a `useRecentPrompts` fetch (one read on open via
      `queryPromptLibraryRemote({ kind: 'prompt.recents', limit: 5 })`) and show its results in
      `SlashPopover` when the query is empty, under a "Last used" heading (`STR`), feeding them into
      the existing `results`/`active`/keyboard-nav/select path.
- [x] 3.2 When recents are empty (no usage yet), keep the existing `STR.idle` hint; when the user
      types, show live search results as today.
- [x] 3.3 Add the "Last used" string to `ui/input-bar/strings.ts` (no inline literal).

## 4. Record use on insert (input-bar capability)

- [x] 4.1 Thread the prompt id into `Pending`; fire `mutatePromptLibraryRemote({ op: 'prompt.recordUse',
      id })` (fire-and-forget, never awaited before insert) at the no-variable insert branch and the
      variable-modal `onConfirm`. Do NOT fire on modal cancel.

## 5. Padding polish (input-bar capability)

- [x] 5.1 In `ui/input-bar/styles.ts`, increase `.sk-input-bar` padding on all sides (e.g.
      `var(--sk-space-1) var(--sk-space-2)` → `var(--sk-space-2) var(--sk-space-3)`), tokens only.

## 6. Tests

- [x] 6.1 Handler tests: `prompt.recordUse` stamps `lastUsedAt`/increments `usageCount` and no-ops on
      a missing id; `prompt.recents` returns only used prompts, most-recent first, capped at `limit`,
      empty before any use.
- [x] 6.2 Popover tests: empty state lists recents under "Last used" and they are selectable;
      empty-with-no-usage shows the hint; typing switches to search results.
- [x] 6.3 Insertion tests: direct insert and variable-modal confirm each fire `prompt.recordUse`;
      cancelling the modal fires nothing and inserts nothing.
