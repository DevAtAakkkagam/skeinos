## 1. Shared contract (`shared/workspace.ts`)

- [x] 1.1 Extend `WorkspaceSelector` with `{ kind: 'tag.list' }` and `WorkspaceSnapshot` with `{ kind: 'tag.list'; tags: Tag[] }`
- [x] 1.2 Extend `MutationOp` with `tag.create | tag.rename | tag.recolor | tag.delete`
- [x] 1.3 Extend `MutationOp` with `conversation.tag` and `prompt.tag` (`{ id, tagId, assigned: boolean }`)
- [x] 1.4 Add client-side `countByTag(conversations)` and a `filterByTags(list, selected)` (AND semantics) helper next to the existing platform-filter helpers

## 2. Worker handlers (`core/tags/`)

- [x] 2.1 Create `core/tags/` module; register the `tag.list` query handler (loads from the `tags` Repo, rebuilds on each call — no memory-only state)
- [x] 2.2 Implement `tag.create`: trim/validate label, `assertWithinQuota('tags', liveCount, tier)`, write through Repo (envelope stamped), broadcast `state.changed`
- [x] 2.3 Implement `tag.rename` and `tag.recolor` (set/clear color) through the Repo + broadcast
- [x] 2.4 Implement `tag.delete`: write tombstone, walk carriers via the `tags*` multiEntry index on `conversations` and `prompts`, drop the id from each, return all touched `stores`, broadcast
- [x] 2.5 Implement `conversation.tag` / `prompt.tag` assign/unassign: idempotent add, no-op remove, reject unknown tag ids; broadcast
- [x] 2.6 Wire the handlers into the worker's handler registration alongside folders

## 3. UI — tag library + chrome

- [x] 3.1 Add a `useTagLibrary` hook (mirrors `usePromptLibrary` / `useProfileLibrary`) wrapping the tag query/mutate client
- [x] 3.2 Add ephemeral `tagFilter` selection state to the UI workspace store (sibling to `platformFilter`); narrow the rendered list by platform AND selected tags
- [x] 3.3 `SidebarShell`: activate the `sk-chip--add` "+ Tag" seam — enabled affordance opening a picker over existing tags; selected tags render as toggleable filter chips (carrying tag color), Folders tab only
- [x] 3.4 Make tag filter chips keyboard-operable with an accessible group label (parity with the platform filter)
- [x] 3.5 Build the dedicated tags view: list every tag with its live count (`countByTag`), with rename / recolor / delete actions
- [x] 3.6 Add a tag-assignment affordance on conversation rows (and the prompt editor) dispatching `conversation.tag` / `prompt.tag`
- [x] 3.7 Catch `quota_exceeded` in the create flow and render `<UpgradeNudge resource="tags" />` without discarding the typed label

## 4. Tests

- [x] 4.1 Worker: create persists + broadcasts; empty/whitespace label rejected
- [x] 4.2 Worker: create blocked at FREE=10 with `quota_exceeded` detail `{ resource:'tags', count:10, limit:10 }`; PRO unlimited
- [x] 4.3 Worker: rename/recolor propagate (bumped `rev`); color set then cleared
- [x] 4.4 Worker: delete writes tombstone and detaches the id from every carrier conversation and prompt
- [x] 4.5 Worker: assignment is idempotent, unassign removes, unknown tag id rejected, multi-tag per record
- [x] 4.6 UI/selector: tag filter narrows (single + AND intersection), resets on reload (not persisted), composes with platform filter
- [x] 4.7 UI/selector: tags-view counts equal rendered rows; per-tag management actions present
- [x] 4.8 `sidebar-shell` deltas: "+ Tag" affordance is live, chip group keyboard-operable + labelled, hidden off the Folders tab
- [x] 4.9 Run `npm run typecheck` + `npm test`, then `npm run test:browser`

## 5. Spec sync

- [x] 5.1 Verify each `#### Scenario` in `specs/tags` and `specs/sidebar-shell` maps to a test; check all task boxes before archive
