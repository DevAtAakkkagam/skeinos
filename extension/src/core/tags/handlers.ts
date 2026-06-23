// Worker-side tag query/mutate handlers (C7/M2, design D-2/D-3/D-5). The single
// writer loads from the `tags` Repo (and the carrier stores for deletion cleanup),
// runs the pure ops in `./tags`, and writes the result back — rebuilding from the
// store on each call, so a cold worker start needs no in-memory state (SW-1/SW-2).
//
// Tags ride the SAME `workspace.query` / `workspace.mutate` request kinds as folders
// (the declared M2 extension seam in `shared/workspace.ts`): the folders handler owns
// the registration and delegates the `tag.*` selector/op variants here. Each mutation
// returns the stores it touched; the folders wrapper broadcasts `state.changed` so
// every open tab re-queries (multi-tab consistency).

import { type WorkspaceStore } from '../../core/store';
import { getSettings } from '../../core/settings';
import { assertWithinQuota } from '../../core/tier';
import type { ConversationIndex, Prompt, Tag } from '../../shared/types';
import type { MutationOp, MutationResult, WorkspaceSnapshot } from '../../shared/workspace';
import { TAG_ERROR, createTag, detachTag, recolorTag, renameTag, toggleTag } from './tags';

/** The mutation variants this module owns (delegated from the folders handler). */
export type TagOp = Extract<
  MutationOp,
  { op: 'tag.create' | 'tag.rename' | 'tag.recolor' | 'tag.delete' | 'conversation.tag' | 'prompt.tag' }
>;

/** A domain error that survives the messaging boundary with its `code` intact
 *  (mirrors `FolderError`). */
export class TagError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TagError';
    this.code = code;
  }
}

async function requireTag(store: WorkspaceStore, id: string): Promise<Tag> {
  const t = await store.tags.get(id);
  if (!t) throw new TagError(TAG_ERROR.notFound, `No tag ${id}`);
  return t;
}

/** Trim a label and reject when it is empty/whitespace-only. */
function requireLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new TagError(TAG_ERROR.emptyLabel, 'A tag needs a non-empty label');
  return trimmed;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function queryTags(
  store: WorkspaceStore,
  _selector: { kind: 'tag.list' },
): Promise<Extract<WorkspaceSnapshot, { kind: 'tag.list' }>> {
  // Rebuild from the store on every call (SW-2) — no cached tag set survives a
  // worker restart, so the read is always the single writer's current truth.
  const tags = await store.tags.query();
  return { kind: 'tag.list', tags };
}

// ---------------------------------------------------------------------------
// Writes — each returns the stores it touched (for the broadcast)
// ---------------------------------------------------------------------------

export async function mutateTags(store: WorkspaceStore, op: TagOp): Promise<MutationResult> {
  switch (op.op) {
    case 'tag.create': {
      const label = requireLabel(op.label);
      // Tier quota (tier-gate D5): the live tag count against the limit — the throw
      // aborts before any `put`, so a rejected create writes nothing and emits no
      // broadcast. PRO is unlimited (the guard is a no-op).
      const live = await store.tags.query();
      assertWithinQuota('tags', live.length, (await getSettings()).tier ?? 'PRO');
      await store.tags.put(createTag({ id: op.id, label, color: op.color }));
      return { stores: ['tags'] };
    }
    case 'tag.rename': {
      const tag = await requireTag(store, op.id);
      await store.tags.put(renameTag(tag, requireLabel(op.label)));
      return { stores: ['tags'] };
    }
    case 'tag.recolor': {
      const tag = await requireTag(store, op.id);
      await store.tags.put(recolorTag(tag, op.color));
      return { stores: ['tags'] };
    }
    case 'tag.delete': {
      // Eager cleanup (design D-3): tombstone the Tag, then detach its id from every
      // carrier found through the `tags` multiEntry index — never a full-table scan,
      // and never leaving a carrier referencing a deleted tag. All in this one
      // single-writer call before the broadcast.
      await requireTag(store, op.id);
      await store.tags.delete(op.id);
      const touched = ['tags'];
      const convs = (await store.conversations.query(
        'tags',
        IDBKeyRange.only(op.id),
      )) as ConversationIndex[];
      let convChanged = false;
      for (const c of convs) {
        const next = detachTag(c, op.id);
        if (next !== c) {
          await store.conversations.put(next);
          convChanged = true;
        }
      }
      if (convChanged) touched.push('conversations');
      const prompts = (await store.prompts.query('tags', IDBKeyRange.only(op.id))) as Prompt[];
      let promptChanged = false;
      for (const p of prompts) {
        const next = detachTag(p, op.id);
        if (next !== p) {
          await store.prompts.put(next);
          promptChanged = true;
        }
      }
      if (promptChanged) touched.push('prompts');
      return { stores: touched };
    }
    case 'conversation.tag': {
      // Assignment references only existing tag ids — a just-deleted tag can't be
      // re-attached (the post-delete broadcast re-queries every tab; the validation
      // here is the belt-and-braces under the single writer).
      await requireTag(store, op.tagId);
      const conv = (await store.conversations.get(op.id)) as ConversationIndex | undefined;
      if (!conv) throw new TagError(TAG_ERROR.notFound, `No conversation ${op.id}`);
      const next = toggleTag(conv, op.tagId, op.assigned);
      if (next === conv) return { stores: [] }; // idempotent add / no-op remove
      await store.conversations.put(next);
      return { stores: ['conversations'] };
    }
    case 'prompt.tag': {
      await requireTag(store, op.tagId);
      const prompt = await store.prompts.get(op.id);
      if (!prompt) throw new TagError(TAG_ERROR.notFound, `No prompt ${op.id}`);
      const next = toggleTag(prompt, op.tagId, op.assigned);
      if (next === prompt) return { stores: [] };
      await store.prompts.put(next);
      return { stores: ['prompts'] };
    }
  }
}
