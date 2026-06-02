// Workspace query/mutate payloads carried by the `workspace.query` and
// `workspace.mutate` request kinds (LLD §7). `folders` (C6) is the first feature
// to introduce these generic kinds; later M2 changes (tags, search) extend the
// `WorkspaceSelector` / `MutationOp` unions here. The request-kind contracts are
// registered via declaration merging in `core/folders/handlers.ts` (the messaging
// seam), so adding ops never edits the hub.

import type { ConversationIndex, Folder, FolderTreeNode, PlatformId } from './types';

/** A lightweight conversation reference ingested from a platform adapter. */
export interface ConversationRefLite {
  nativeId: string;
  title: string;
}

/** A read request against the workspace, discriminated by `kind`. */
export type WorkspaceSelector =
  | { kind: 'folder.tree' }
  | { kind: 'folder.counts' }
  | { kind: 'conversation.list'; platform: PlatformId };

/** The folder hierarchy split into the sections the sidebar renders. */
export interface FolderTreeSnapshot {
  active: FolderTreeNode[];
  pinned: Folder[];
  archived: Folder[];
}

/** The result of a {@link WorkspaceSelector}, discriminated by the same `kind`. */
export type WorkspaceSnapshot =
  | { kind: 'folder.tree'; tree: FolderTreeSnapshot }
  | { kind: 'folder.counts'; counts: Record<string, number> }
  | { kind: 'conversation.list'; conversations: ConversationIndex[] };

/** A write request against the workspace, discriminated by `op`. */
export type MutationOp =
  | { op: 'folder.create'; id: string; name: string; parentId?: string | null; color?: string; icon?: string; platformScope?: PlatformId | 'unified' }
  | { op: 'folder.rename'; id: string; name: string }
  | { op: 'folder.recolor'; id: string; color?: string; icon?: string }
  | { op: 'folder.pin'; id: string; pinned: boolean }
  | { op: 'folder.archive'; id: string; archived: boolean }
  | { op: 'folder.move'; id: string; parentId: string | null }
  | { op: 'folder.reorder'; orderedIds: string[] }
  | { op: 'folder.delete'; id: string }
  | { op: 'conversation.ingest'; platform: PlatformId; refs: ConversationRefLite[] }
  | { op: 'conversation.assign'; conversationId: string; folderId: string | null };

/** The result of a successful mutation: the stores that changed (for the broadcast). */
export interface MutationResult {
  stores: string[];
}

/** Canonical conversation id: platform-scoped so native ids never collide across hosts. */
export function conversationId(platform: PlatformId, nativeId: string): string {
  return `${platform}::${nativeId}`;
}
