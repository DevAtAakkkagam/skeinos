// Pure folder-tree logic (LLD T2.1, design D-A). No IndexedDB, no DOM, no
// messaging — just records in, records out — so every invariant (the nest-≤5
// depth guard and cycle prevention) is exhaustively unit-testable in isolation.
// The worker handler loads the flat `Folder` rows, calls these functions, and
// writes the returned records back through the store; this module never persists.

import type { ConversationIndex, Folder, FolderTreeNode, PlatformId } from '../../shared/types';

/** Maximum nesting depth (1-based): a root folder is depth 1, its child 2, … */
export const MAX_DEPTH = 5;

/** Stable error codes raised when a mutation would break a tree invariant. */
export const FOLDER_ERROR = {
  depth: 'folder_depth_exceeded',
  cycle: 'folder_cycle',
  notFound: 'folder_not_found',
} as const;

/** A move/create validity verdict. `reason` names the violated invariant. */
export type TreeCheck = { ok: true } | { ok: false; reason: 'self' | 'cycle' | 'depth' };

type FolderMap = Map<string, Folder>;

/** Index folders by id for O(1) parent/child walks. */
export function indexById(folders: Folder[]): FolderMap {
  return new Map(folders.map((f) => [f.id, f]));
}

function childrenOf(folders: Folder[]): Map<string | null, Folder[]> {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const sibs = byParent.get(f.parentId) ?? [];
    sibs.push(f);
    byParent.set(f.parentId, sibs);
  }
  for (const sibs of byParent.values()) sibs.sort((a, b) => a.order - b.order);
  return byParent;
}

/**
 * Build the nested tree from flat rows, each sibling group ordered by `order`.
 * Pass whichever rows should appear (e.g. only non-archived for the main tree);
 * folders whose `parentId` is absent from the set surface as roots so a filtered
 * subtree never disappears.
 */
export function buildTree(folders: Folder[]): FolderTreeNode[] {
  const byParent = childrenOf(folders);
  const present = new Set(folders.map((f) => f.id));

  const build = (folder: Folder, depth: number): FolderTreeNode => ({
    folder,
    depth,
    children: (byParent.get(folder.id) ?? []).map((c) => build(c, depth + 1)),
  });

  // Roots = folders with no parent, or whose parent is not in this set.
  return folders
    .filter((f) => f.parentId === null || !present.has(f.parentId))
    .sort((a, b) => a.order - b.order)
    .map((f) => build(f, 1));
}

/** Non-archived folders — the main tree. */
export function activeFolders(folders: Folder[]): Folder[] {
  return folders.filter((f) => !f.archived);
}

/** Pinned folders — the pinned strip (independent of archive state). */
export function pinnedFolders(folders: Folder[]): Folder[] {
  return folders.filter((f) => f.pinned && !f.archived).sort((a, b) => a.order - b.order);
}

/** Archived folders — the collapsed archive section. */
export function archivedFolders(folders: Folder[]): Folder[] {
  return folders.filter((f) => f.archived).sort((a, b) => a.order - b.order);
}

/** Depth of a folder (1-based). Guarded against malformed cyclic data. */
export function depthOf(id: string, byId: FolderMap): number {
  let depth = 0;
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur !== null && !seen.has(cur)) {
    seen.add(cur);
    const node: Folder | undefined = byId.get(cur);
    if (!node) break;
    depth += 1;
    cur = node.parentId;
  }
  return depth;
}

/** Height of a folder's subtree (the folder itself counts as 1). */
export function heightOf(id: string, byId: FolderMap): number {
  const children = [...byId.values()].filter((f) => f.parentId === id);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((c) => heightOf(c.id, byId)));
}

/** Is `id` a descendant of `ancestorId` (walking parent links upward)? */
function isDescendant(id: string, ancestorId: string, byId: FolderMap): boolean {
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur !== null && !seen.has(cur)) {
    if (cur === ancestorId) return true;
    seen.add(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return false;
}

/** Can a new leaf folder be created under `parentId` without exceeding MAX_DEPTH? */
export function canCreateUnder(parentId: string | null, byId: FolderMap): TreeCheck {
  const parentDepth = parentId ? depthOf(parentId, byId) : 0;
  return parentDepth + 1 > MAX_DEPTH ? { ok: false, reason: 'depth' } : { ok: true };
}

/**
 * Can `moverId` move under `targetParentId` (or to root when null)? Rejects a
 * move onto itself or into its own subtree (cycle), and any move whose resulting
 * subtree would nest deeper than MAX_DEPTH.
 */
export function canMove(
  moverId: string,
  targetParentId: string | null,
  byId: FolderMap,
): TreeCheck {
  if (targetParentId === moverId) return { ok: false, reason: 'self' };
  if (targetParentId !== null && isDescendant(targetParentId, moverId, byId)) {
    return { ok: false, reason: 'cycle' };
  }
  const parentDepth = targetParentId ? depthOf(targetParentId, byId) : 0;
  if (parentDepth + heightOf(moverId, byId) > MAX_DEPTH) return { ok: false, reason: 'depth' };
  return { ok: true };
}

/** Next `order` for a new child of `parentId` (append after current siblings). */
export function nextOrder(folders: Folder[], parentId: string | null): number {
  const orders = folders.filter((f) => f.parentId === parentId).map((f) => f.order);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

// ---------------------------------------------------------------------------
// Pure ops — each returns the record(s) to persist (envelope is stamped by the
// store's `put`, so callers leave those fields as placeholders).
// ---------------------------------------------------------------------------

const blankEnvelope = { rev: 0, updatedAt: 0, deviceId: '', hash: '' };

export interface CreateFolderInput {
  id: string;
  name: string;
  parentId?: string | null;
  platformScope?: PlatformId | 'unified';
  color?: string;
  icon?: string;
}

/** Build a new folder appended after its siblings. Validate depth first via `canCreateUnder`. */
export function createFolder(folders: Folder[], input: CreateFolderInput): Folder {
  const parentId = input.parentId ?? null;
  return {
    ...blankEnvelope,
    id: input.id,
    name: input.name,
    parentId,
    platformScope: input.platformScope ?? 'unified',
    color: input.color,
    icon: input.icon,
    order: nextOrder(folders, parentId),
  };
}

export function renameFolder(folder: Folder, name: string): Folder {
  return { ...folder, name };
}

export function recolorFolder(folder: Folder, patch: { color?: string; icon?: string }): Folder {
  return { ...folder, color: patch.color, icon: patch.icon };
}

export function setPinned(folder: Folder, pinned: boolean): Folder {
  return { ...folder, pinned };
}

export function setArchived(folder: Folder, archived: boolean): Folder {
  return { ...folder, archived };
}

/** Re-parent a folder and append it after its new siblings. Validate via `canMove` first. */
export function moveFolder(folders: Folder[], moverId: string, targetParentId: string | null): Folder {
  const mover = folders.find((f) => f.id === moverId);
  if (!mover) throw new Error(`unknown folder ${moverId}`);
  return { ...mover, parentId: targetParentId, order: nextOrder(folders, targetParentId) };
}

/**
 * Re-sequence a parent's children to match `orderedIds`. Returns only the
 * folders whose `order` actually changed, so the worker persists the minimum.
 */
export function reorderSiblings(folders: Folder[], orderedIds: string[]): Folder[] {
  const byId = indexById(folders);
  const changed: Folder[] = [];
  orderedIds.forEach((id, idx) => {
    const f = byId.get(id);
    if (f && f.order !== idx) changed.push({ ...f, order: idx });
  });
  return changed;
}

/** Set (or clear, with `null`) a conversation's folder. At most one folder. */
export function assignConversation(conv: ConversationIndex, folderId: string | null): ConversationIndex {
  return { ...conv, folderId, updatedAt: Date.now() };
}

// Conversation organization helpers (conversation-context-menu) — pure record
// transforms mirroring the folder `setPinned` / `setArchived` / `recolorFolder`
// shapes. Each bumps `updatedAt` like `assignConversation` so the row re-sorts.

/** Pin (or unpin) a conversation. */
export function setConversationPinned(conv: ConversationIndex, pinned: boolean): ConversationIndex {
  return { ...conv, pinned, updatedAt: Date.now() };
}

/** Archive (or unarchive) a conversation — retains the row and its folder. */
export function setConversationArchived(conv: ConversationIndex, archived: boolean): ConversationIndex {
  return { ...conv, archived, updatedAt: Date.now() };
}

/** Set (or clear, with `undefined`) a conversation's colour. */
export function setConversationColor(conv: ConversationIndex, color?: string): ConversationIndex {
  return { ...conv, color, updatedAt: Date.now() };
}

/** Count conversations per folder id (direct membership only). */
export function countByFolder(conversations: ConversationIndex[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of conversations) {
    if (c.folderId) counts[c.folderId] = (counts[c.folderId] ?? 0) + 1;
  }
  return counts;
}
