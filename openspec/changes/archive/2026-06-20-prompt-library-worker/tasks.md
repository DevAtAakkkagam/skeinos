## 1. Messaging contract

- [x] 1.1 Create `extension/src/shared/prompts.ts` mirroring `shared/workspace.ts`: `PromptSelector`
  (`{ kind: 'prompt.library' }`), `PromptSnapshot` (`{ kind: 'prompt.library'; prompts: Prompt[];
  folders: PromptFolder[] }`), and `PromptMutationOp` (the prompt + category ops below). Reuse the
  existing `MutationResult` (`{ stores: string[] }`).
- [x] 1.2 Define the op union: `prompt.create` (id + title + body + optional description/tags/targetModels
  /slug/promptFolderId), `prompt.update` (id + partial editable patch), `prompt.delete` (id);
  `promptFolder.create` (id, name, order, parentId: null), `promptFolder.rename` (id, name),
  `promptFolder.delete` (id). Clients never carry `variables`.

## 2. Worker handlers (single writer)

- [x] 2.1 Create `extension/src/core/prompts/handlers.ts`; declaration-merge `prompts.query` /
  `prompts.mutate` into `RequestContracts` (the messaging seam), and add a `PromptError` with a `code`
  (`notFound`) that survives the boundary (mirror `FolderError`).
- [x] 2.2 Implement `queryPromptLibrary(store)` for the `prompt.library` selector: return all non-deleted
  prompts + categories as the snapshot (no counts).
- [x] 2.3 Implement `prompt.create`: derive `variables` via `parseVariables(body)` from
  `core/prompts/template.ts`, set `usageCount: 0`, persist through `store.prompts.put`; return
  `{ stores: ['prompts'] }`.
- [x] 2.4 Implement `prompt.update` as read-modify-write: apply the patch, re-derive `variables` only when
  `body` is in the patch, preserve `usageCount`/`lastUsedAt`; `notFound` on a missing id.
- [x] 2.5 Implement `prompt.delete` (tombstone via `store.prompts.delete`).
- [x] 2.6 Implement `promptFolder.create` / `promptFolder.rename` / `promptFolder.delete`; on delete,
  reassign matching prompts to `promptFolderId: null` and return `['promptFolders']` (empty category) or
  `['promptFolders','prompts']` (had prompts).
- [x] 2.7 Implement `registerPromptHandlers()`: register `prompts.query` and `prompts.mutate`; broadcast
  `state.changed` with the result's stores after a write, skipping the broadcast when `stores` is empty.

## 3. Client + barrel + registration

- [x] 3.1 Create `extension/src/core/prompts/client.ts`: `queryPromptLibrary` (via `sendWithRetry` —
  idempotent read) and `mutatePromptLibrary` (via `send` — single attempt, observe-don't-replay).
- [x] 3.2 Create/extend `extension/src/core/prompts/index.ts` to export `registerPromptHandlers` and the
  client helpers alongside the existing `template` exports.
- [x] 3.3 In `extension/src/background/index.ts`, call `registerPromptHandlers()` at module top level,
  before `installMessageHub()` (SW-3) and alongside the other `register*Handlers()` calls.

## 4. Tests (Vitest + fake-indexeddb)

- [x] 4.1 `prompt.create` persists the record and derives `variables` from the body (incl. a select var);
  `usageCount` is 0.
- [x] 4.2 `prompt.update`: body change re-derives variables; metadata-only update leaves variables +
  usage fields untouched; updating a missing id throws `notFound`.
- [x] 4.3 `prompt.delete` tombstones (the prompt drops out of a `prompt.library` read).
- [x] 4.4 Category lifecycle: create + rename surface via `prompt.library`; deleting a non-empty category
  reassigns its prompts to `null` and reports both stores; deleting an empty category reports only
  `promptFolders`.
- [x] 4.5 `prompt.library` returns the unified prompts + categories with no count fields; an empty store
  returns `{ prompts: [], folders: [] }`.
- [x] 4.6 Broadcast semantics: each write broadcasts `state.changed` with the right store names; a
  no-change mutation emits no broadcast (mirror the folder-handler broadcast test).

## 5. Verify

- [x] 5.1 Run `npm run typecheck`, `npm run lint`, and `npm test`; all green.
