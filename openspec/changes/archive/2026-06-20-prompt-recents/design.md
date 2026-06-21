## Context

The prompt popover (`SlashPopover.tsx`) renders `STR.idle` ("Type to search your prompts.") whenever
the search field is empty, and a ranked list once the user types. `Prompt` already carries
`usageCount: number` and `lastUsedAt?: number`, the store has a `lastUsedAt` index, and
`handlers.ts` defines `recencyOf(p) = p.lastUsedAt ?? p.updatedAt ?? 0` as a search tiebreak — but
no code ever sets `lastUsedAt`/`usageCount` (deferred to C25 `usage`). Reads/writes go through the
existing `prompts.query` / `prompts.mutate` request kinds and the `queryPromptLibraryRemote` /
`mutatePromptLibraryRemote` leaf clients; the worker is the single writer.

## Goals / Non-Goals

**Goals:**
- Truthful "Last used" list in the popover's empty state, selectable via the existing flow.
- The minimal usage-write needed to make that list real: stamp `lastUsedAt`/`usageCount` on insert.
- A small padding increase on the bar.

**Non-Goals (left to C25 `usage`):**
- Popularity / most-used sorting, usage analytics, decay, or any usage UI beyond this list.
- Recording usage from anywhere other than the input-bar insertion (e.g. the library view).
- A configurable recents count or pinning.

## Decisions

### D-1: Bring forward the minimal usage write as `prompt.recordUse`
Add `{ op: 'prompt.recordUse'; id }` to `PromptMutationOp`. The worker read-modify-writes the prompt
setting `lastUsedAt = Date.now()` and `usageCount = (prev.usageCount ?? 0) + 1`, then `put`s. This is
the smallest slice of C25 that the recents list needs; C25 builds its richer surface on the same
fields. (`Date.now()` in the worker is ordinary app code — fine here.)

### D-2: Record use at the real insertion moments, fire-and-forget
`recordUse(id)` is fired where text is actually committed: the no-variable branch of `handleSelect`
and the variable-modal `onConfirm` — **not** on pick, so a cancelled variable modal never counts.
The call is fire-and-forget through `mutatePromptLibraryRemote` and never blocks insertion; per the
"observe-don't-replay" rule a lost ack is fine — the next `state.changed` re-read reconciles. The
prompt id is threaded into `Pending` so the modal-confirm site has it.

### D-3: `prompt.recents` read returns only actually-used prompts, as result rows
Add `{ kind: 'prompt.recents'; limit }` to `PromptSelector` and `{ kind: 'prompt.recents'; results:
PromptSearchResult[] }` to `PromptSnapshot`. The worker filters to prompts whose `lastUsedAt` is
set, sorts by `lastUsedAt` descending, takes `limit`, and maps each to a `PromptSearchResult` with a
leading body/description excerpt as the snippet (no match highlight — there is no query). Reusing the
search-result shape lets the popover render recents with the existing row component unchanged.
Excludes tombstones like the other reads.

### D-4: Recents are the popover's default result set; empty hint is the fallback
On open with an empty query, the popover fetches recents once (a `useRecentPrompts` hook over the
recents selector) and shows them under a "Last used" heading, feeding them into the same
`results`/`active`/keyboard-nav/select path so arrow keys, Enter, mouse, and the variable-fill flow
all work without new logic. When the user types, the live search results replace them. When there
are no recorded uses yet (new user), the list is empty and the existing `STR.idle` hint is shown —
"Last used" only appears once something has been used.

### D-5: Padding polish on the bar
`.sk-input-bar` padding goes from `var(--sk-space-1) var(--sk-space-2)` to a larger, more even value
on all sides (e.g. `var(--sk-space-2) var(--sk-space-3)`), staying on `--sk-*` tokens. Cosmetic only;
no layout-contract change.

## Risks / Trade-offs

- **[Trade-off] Usage now syncs.** Recording a use bumps the sync envelope, so usage propagates as
  ciphertext metadata across devices. Accepted and arguably desirable (last-used follows the user);
  it pre-commits C25 to usage being syncable, which is consistent with prompts being syncable
  metadata. Flagged for C25.
- **[Risk] Double-counting / churn on rapid re-insert.** Each insert is one write; re-inserting the
  same prompt repeatedly writes repeatedly. Acceptable — the list only needs ordering, and `put`
  cost is small; C25 can debounce if it matters.
- **[Trade-off] Recents fetched once on open, not live.** If a use is recorded in another tab while
  the popover is open, its recents list is stale until reopened. Acceptable for a transient popover;
  reopening re-reads.
