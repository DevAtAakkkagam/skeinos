// Worker-side folder query/mutate handlers (design D-D). The single writer loads
// from the `folders`/`conversations` repos, runs the pure tree ops, and writes the
// result back — rebuilding everything from the store on each call, so a cold worker
// start needs no in-memory state (SW-1/SW-2). Reads and writes ride the existing
// messaging hub via two generic kinds added through the declaration-merging seam;
// after a successful mutation the worker broadcasts `state.changed` so every open
// tab re-queries (multi-tab consistency).

import { broadcast, registerHandler } from '../../core/messaging';
import { workspaceStore, type WorkspaceStore } from '../../core/store';
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
      await store.folders.delete(op.id);
      return { stores: ['folders'] };
    }
    case 'conversation.ingest': {
      // Upsert a minimal ConversationIndex per host conversation, PRESERVING the
      // existing `folderId` so re-ingesting on every page load never unfiles a
      // conversation. Search-index fields stay empty here — indexing is C8.
      for (const ref of op.refs) {
        const id = conversationId(op.platform, ref.nativeId);
        const prev = (await store.conversations.get(id)) as ConversationIndex | undefined;
        await store.conversations.put({
          id,
          platform: op.platform,
          nativeId: ref.nativeId,
          title: ref.title,
          folderId: prev?.folderId ?? null,
          tags: prev?.tags ?? [],
          indexedText: prev?.indexedText ?? '',
          contentHash: prev?.contentHash ?? '',
          // Preserve per-conversation organization state across re-ingest so a page
          // reload never clobbers pin / archive / colour (conversation-context-menu).
          pinned: prev?.pinned,
          archived: prev?.archived,
          color: prev?.color,
          updatedAt: Date.now(),
        });
      }
      return { stores: ['conversations'] };
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
      if (prev && prev.nativeId === op.nativeId && prev.title === op.title) {
        return { stores: [] };
      }
      await store.activeConversations.put({
        platform: op.platform,
        nativeId: op.nativeId,
        title: op.title,
        updatedAt: Date.now(),
      });
      return { stores: ['activeConversations'] };
    }
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
