// Worker-side folder query/mutate handlers (design D-D). The single writer loads
// from the `folders`/`conversations` repos, runs the pure tree ops, and writes the
// result back — rebuilding everything from the store on each call, so a cold worker
// start needs no in-memory state (SW-1/SW-2). Reads and writes ride the existing
// messaging hub via two generic kinds added through the declaration-merging seam;
// after a successful mutation the worker broadcasts `state.changed` so every open
// tab re-queries (multi-tab consistency).

import { broadcast, registerHandler } from '../../core/messaging';
import { workspaceStore, type WorkspaceStore } from '../../core/store';
import { getSettings } from '../../core/settings';
import { assertWithinQuota } from '../../core/tier';
import { mutateTags, queryTags } from '../tags';
import { indexConversationTitle, removeConversation } from '../conversation-index/pipeline';
import type { ConversationIndex, Folder } from '../../shared/types';
import {
  conversationId,
  type MutationOp,
  type MutationResult,
  type WorkspaceSelector,
  type WorkspaceSnapshot,
} from '../../shared/workspace';
import {
  FOLDER_ERROR,
  activeFolders,
  archivedFolders,
  assignConversation,
  buildTree,
  canCreateUnder,
  canMove,
  createFolder,
  indexById,
  moveFolder,
  pinnedFolders,
  recolorFolder,
  renameFolder,
  reorderSiblings,
  setArchived,
  setConversationArchived,
  setConversationColor,
  setConversationPinned,
  setPinned,
  type TreeCheck,
} from './tree';

declare module '../../shared/messages' {
  interface RequestContracts {
    'workspace.query': { request: { selector: WorkspaceSelector }; response: WorkspaceSnapshot };
    'workspace.mutate': { request: { op: MutationOp }; response: MutationResult };
  }
}

/** A domain error that survives the messaging boundary with its `code` intact. */
export class FolderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FolderError';
    this.code = code;
  }
}

function rejectIfInvalid(check: TreeCheck): void {
  if (check.ok) return;
  if (check.reason === 'depth') {
    throw new FolderError(FOLDER_ERROR.depth, 'Folders cannot nest more than 5 levels deep');
  }
  throw new FolderError(FOLDER_ERROR.cycle, 'A folder cannot be moved into itself or its subtree');
}

async function requireFolder(store: WorkspaceStore, id: string): Promise<Folder> {
  const f = await store.folders.get(id);
  if (!f) throw new FolderError(FOLDER_ERROR.notFound, `No folder ${id}`);
  return f;
}

async function requireConversation(store: WorkspaceStore, id: string): Promise<ConversationIndex> {
  const c = (await store.conversations.get(id)) as ConversationIndex | undefined;
  if (!c) throw new FolderError(FOLDER_ERROR.notFound, `No conversation ${id}`);
  return c;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function queryWorkspace(
  store: WorkspaceStore,
  selector: WorkspaceSelector,
): Promise<WorkspaceSnapshot> {
  switch (selector.kind) {
    case 'folder.tree': {
      const folders = await store.folders.query();
      return {
        kind: 'folder.tree',
        tree: {
          active: buildTree(activeFolders(folders)),
          pinned: pinnedFolders(folders),
          archived: archivedFolders(folders),
        },
      };
    }
    case 'conversation.list': {
      // The unified library (D28): return EVERY conversation regardless of
      // platform. The folder browser is one library; narrowing to a platform is a
      // UI view-filter, and per-folder counts are derived client-side from this
      // single list — so the badge can never disagree with the rows it labels.
      const all = (await store.conversations.query()) as ConversationIndex[];
      return { kind: 'conversation.list', conversations: all };
    }
    case 'conversation.active': {
      const active = (await store.activeConversations.get(selector.platform)) ?? null;
      return { kind: 'conversation.active', active };
    }
    case 'platform.state': {
      const state = (await store.platformState.get(selector.platform)) ?? null;
      return { kind: 'platform.state', state };
    }
    case 'tag.list':
      // Tags ride the same workspace.query kind; the tag domain owns the read (C7).
      return queryTags(store, selector);
  }
}

// ---------------------------------------------------------------------------
// Writes — each returns the stores it touched (for the broadcast)
// ---------------------------------------------------------------------------

export async function mutateWorkspace(
  store: WorkspaceStore,
  op: MutationOp,
): Promise<MutationResult> {
  switch (op.op) {
    case 'folder.create': {
      const folders = await store.folders.query();
      rejectIfInvalid(canCreateUnder(op.parentId ?? null, indexById(folders)));
      // Tier quota (tier-gate D2/D3): structural validity first (depth/cycle), then
      // the live folder count against the tier limit — the throw aborts before any
      // `put`, so a rejected create writes nothing and emits no broadcast.
      assertWithinQuota('folders', folders.length, (await getSettings()).tier ?? 'PRO');
      await store.folders.put(
        createFolder(folders, {
          id: op.id,
          name: op.name,
          parentId: op.parentId ?? null,
          color: op.color,
          icon: op.icon,
          platformScope: op.platformScope,
        }),
      );
      return { stores: ['folders'] };
    }
    case 'folder.rename': {
      await store.folders.put(renameFolder(await requireFolder(store, op.id), op.name));
      return { stores: ['folders'] };
    }
    case 'folder.recolor': {
      const f = await requireFolder(store, op.id);
      await store.folders.put(recolorFolder(f, { color: op.color, icon: op.icon }));
      return { stores: ['folders'] };
    }
    case 'folder.pin': {
      await store.folders.put(setPinned(await requireFolder(store, op.id), op.pinned));
      return { stores: ['folders'] };
    }
    case 'folder.archive': {
      await store.folders.put(setArchived(await requireFolder(store, op.id), op.archived));
      return { stores: ['folders'] };
    }
    case 'folder.move': {
      const folders = await store.folders.query();
      if (!folders.some((f) => f.id === op.id)) {
        throw new FolderError(FOLDER_ERROR.notFound, `No folder ${op.id}`);
      }
      rejectIfInvalid(canMove(op.id, op.parentId, indexById(folders)));
      await store.folders.put(moveFolder(folders, op.id, op.parentId));
      return { stores: ['folders'] };
    }
    case 'folder.reorder': {
      const folders = await store.folders.query();
      const changed = reorderSiblings(folders, op.orderedIds);
      for (const f of changed) await store.folders.put(f);
      return { stores: ['folders'] };
    }
    case 'folder.delete': {
      // Re-home direct contents so a delete never silently orphans the user's data
      // ([PRIV] never lose input): conversations filed directly in this folder drop
      // to Uncategorized (folderId=null) so they stay reachable under the Unfiled
      // node. Child folders need no move — `buildTree` surfaces parent-less folders
      // as roots, so they promote to the top level on the next read.
      const convs = (await store.conversations.query()) as ConversationIndex[];
      for (const c of convs) {
        if (c.folderId === op.id) await store.conversations.put(assignConversation(c, null));
      }
      await store.folders.delete(op.id);
      return { stores: ['folders', 'conversations'] };
    }
    case 'conversation.ingest': {
      // Upsert a ConversationIndex per host conversation and index its TITLE (C8),
      // so every listed conversation is search-findable by title immediately —
      // before it is ever opened. The title-index path is idempotent (content-hash
      // gated), preserves the existing `folderId` / pin / archive / colour / tags
      // (read-modify-write), and never clobbers a body already indexed from a full
      // read. Message bodies are indexed separately when a conversation is opened.
      //
      // `refs` arrive in host-list DOM order, and every host renders newest-first —
      // so each record is stamped `base - position`, preserving that recency order.
      // (Stamping plain Date.now() per record gave the NEWEST conversation the
      // OLDEST timestamp, so the side panel — sorted by updatedAt desc — showed the
      // whole initial ingest reversed.) Re-ingests of unchanged records are hash-
      // gated no-ops, so these synthetic stamps never churn existing rows.
      const base = Date.now();
      for (const [i, ref] of op.refs.entries()) {
        await indexConversationTitle(store, {
          id: conversationId(op.platform, ref.nativeId),
          platform: op.platform,
          nativeId: ref.nativeId,
          title: ref.title,
          updatedAt: base - i,
        });
      }
      return { stores: ['conversations', 'searchPostings'] };
    }
    case 'conversation.remove': {
      // The user deleted these conversations on the host — drop their index records
      // and search postings so they stop showing in the list and in search. Idempotent:
      // `removeConversation` no-ops on an id we never indexed (already gone, or a stale
      // adapter signal), so a duplicate or unknown id writes nothing.
      for (const nativeId of op.nativeIds) {
        await removeConversation(store, conversationId(op.platform, nativeId));
      }
      return { stores: ['conversations', 'searchPostings'] };
    }
    case 'conversation.assign': {
      const conv = (await store.conversations.get(op.conversationId)) as
        | ConversationIndex
        | undefined;
      if (!conv) throw new FolderError(FOLDER_ERROR.notFound, `No conversation ${op.conversationId}`);
      await store.conversations.put(assignConversation(conv, op.folderId));
      return { stores: ['conversations'] };
    }
    case 'conversation.pin': {
      const conv = await requireConversation(store, op.conversationId);
      await store.conversations.put(setConversationPinned(conv, op.pinned));
      return { stores: ['conversations'] };
    }
    case 'conversation.archive': {
      const conv = await requireConversation(store, op.conversationId);
      await store.conversations.put(setConversationArchived(conv, op.archived));
      return { stores: ['conversations'] };
    }
    case 'conversation.recolor': {
      const conv = await requireConversation(store, op.conversationId);
      await store.conversations.put(setConversationColor(conv, op.color));
      return { stores: ['conversations'] };
    }
    case 'conversation.reportActive': {
      // The content script reports the active tab's conversation (id/title only,
      // never content — PRIV-1) on load and on SPA navigation. Persist one record
      // per platform so the side panel's card survives worker death (SW-2). When
      // nothing changed, return no touched stores so we skip a needless broadcast.
      const prev = await store.activeConversations.get(op.platform);
      const hint = op.listCollapsedHint ?? false;
      // Dedup includes the collapsed-list hint: the open conversation can be
      // unchanged while the drawer is opened/closed, and that transition must still
      // update (or clear) the panel's nudge rather than being skipped as a no-op.
      if (prev && prev.nativeId === op.nativeId && prev.title === op.title && (prev.listCollapsedHint ?? false) === hint) {
        return { stores: [] };
      }
      await store.activeConversations.put({
        platform: op.platform,
        nativeId: op.nativeId,
        title: op.title,
        updatedAt: Date.now(),
        // Only carry the flag when set, so the common record stays at the minimal
        // id/title metadata shape (and a cleared nudge leaves no residue).
        ...(hint ? { listCollapsedHint: true } : {}),
      });
      return { stores: ['activeConversations'] };
    }
    case 'conversation.clearActive': {
      // The active tab left a conversation (a "new chat"/home page with no open
      // conversation). Drop the platform's active record so the side panel stops
      // highlighting a stale chat. No-op (and no broadcast) when none was stored.
      const prev = await store.activeConversations.get(op.platform);
      if (!prev) return { stores: [] };
      await store.activeConversations.delete(op.platform);
      return { stores: ['activeConversations'] };
    }
    case 'platform.reportListState': {
      // The content script reports whether this platform currently hides its
      // conversation list (drawer collapsed) — independent of any open conversation,
      // so the collapsed-list nudge can fire on a new-chat/home page too. Dedup an
      // unchanged report so a steady stream of identical signals raises no broadcast.
      const prev = await store.platformState.get(op.platform);
      if ((prev?.listCollapsed ?? false) === op.listCollapsed) return { stores: [] };
      await store.platformState.put({
        platform: op.platform,
        listCollapsed: op.listCollapsed,
        updatedAt: Date.now(),
      });
      return { stores: ['platformState'] };
    }
    case 'tag.create':
    case 'tag.rename':
    case 'tag.recolor':
    case 'tag.delete':
    case 'conversation.tag':
    case 'prompt.tag':
      // Tags ride the same workspace.mutate kind; the tag domain owns the write and
      // returns the stores it touched (the wrapper below broadcasts on those). C7.
      return mutateTags(store, op);
  }
}

// ---------------------------------------------------------------------------
// Registration (worker) + client helpers (content/UI)
// ---------------------------------------------------------------------------

/** Worker side: register the folder query/mutate handlers and broadcast on writes. */
export function registerFolderHandlers(): void {
  registerHandler('workspace.query', async (req) => {
    return queryWorkspace(await workspaceStore(), req.selector);
  });
  registerHandler('workspace.mutate', async (req) => {
    const result = await mutateWorkspace(await workspaceStore(), req.op);
    // Skip the fan-out when a mutation touched nothing (e.g. an active-conversation
    // report that matched the stored value), so a steady stream of unchanged
    // reports never wakes every tab into a re-query.
    if (result.stores.length > 0) {
      await broadcast({ kind: 'state.changed', stores: result.stores });
    }
    return result;
  });
}
