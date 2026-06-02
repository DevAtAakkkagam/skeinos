// folders spec coverage — pure tree logic (Vitest, no IndexedDB). Each `describe`
// maps to a requirement in openspec/changes/folders/specs/folders/spec.md.

import { describe, expect, it } from 'vitest';
import {
  MAX_DEPTH,
  activeFolders,
  archivedFolders,
  assignConversation,
  buildTree,
  canCreateUnder,
  canMove,
  countByFolder,
  createFolder,
  depthOf,
  indexById,
  moveFolder,
  nextOrder,
  pinnedFolders,
  reorderSiblings,
} from '../src/core/folders/tree';
import type { ConversationIndex, Folder } from '../src/shared/types';

function folder(id: string, over: Partial<Folder> = {}): Folder {
  return {
    id,
    name: id,
    parentId: null,
    platformScope: 'unified',
    order: 0,
    rev: 1,
    updatedAt: 0,
    deviceId: 'd',
    hash: 'h',
    ...over,
  };
}

/** Build a linear chain a→b→c→… of the given depth, each nested in the prior. */
function chain(n: number): Folder[] {
  return Array.from({ length: n }, (_, i) =>
    folder(`f${i}`, { parentId: i === 0 ? null : `f${i - 1}` }),
  );
}

function conv(id: string, folderId: string | null): ConversationIndex {
  return {
    id,
    platform: 'claude',
    nativeId: id,
    title: id,
    folderId,
    tags: [],
    indexedText: '',
    contentHash: '',
    updatedAt: 0,
  };
}

describe('Nestable folder tree with a depth limit', () => {
  it('builds a nested, order-sorted tree', () => {
    const folders = [
      folder('root', { order: 0 }),
      folder('b', { parentId: 'root', order: 1 }),
      folder('a', { parentId: 'root', order: 0 }),
    ];
    const tree = buildTree(folders);
    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(1);
    expect(tree[0].children.map((c) => c.folder.id)).toEqual(['a', 'b']); // ordered
    expect(tree[0].children[0].depth).toBe(2);
  });

  it('allows creating within the depth limit', () => {
    const byId = indexById(chain(MAX_DEPTH - 1)); // deepest existing folder is at depth 4
    expect(canCreateUnder(`f${MAX_DEPTH - 2}`, byId)).toEqual({ ok: true });
  });

  it('rejects creating beyond five levels', () => {
    const byId = indexById(chain(MAX_DEPTH)); // deepest folder f4 is already at depth 5
    expect(depthOf(`f${MAX_DEPTH - 1}`, byId)).toBe(MAX_DEPTH);
    expect(canCreateUnder(`f${MAX_DEPTH - 1}`, byId)).toEqual({ ok: false, reason: 'depth' });
  });
});

describe('Move with cycle prevention', () => {
  it('re-parents a folder under a valid new parent', () => {
    const folders = [folder('a'), folder('b'), folder('c', { parentId: 'a' })];
    const byId = indexById(folders);
    expect(canMove('c', 'b', byId)).toEqual({ ok: true });
    const moved = moveFolder(folders, 'c', 'b');
    expect(moved.parentId).toBe('b');
  });

  it('rejects moving a folder into itself', () => {
    const byId = indexById([folder('a')]);
    expect(canMove('a', 'a', byId)).toEqual({ ok: false, reason: 'self' });
  });

  it('rejects moving a folder into its own descendant (cycle)', () => {
    const folders = [folder('a'), folder('b', { parentId: 'a' }), folder('c', { parentId: 'b' })];
    const byId = indexById(folders);
    expect(canMove('a', 'c', byId)).toEqual({ ok: false, reason: 'cycle' });
  });

  it('rejects a move that would exceed the depth limit', () => {
    // chain f0..f3 (depth 4); a separate two-level subtree x→y (height 2).
    const folders = [...chain(4), folder('x'), folder('y', { parentId: 'x' })];
    const byId = indexById(folders);
    // Moving x under f3 (depth 4) makes y land at depth 6.
    expect(canMove('x', 'f3', byId)).toEqual({ ok: false, reason: 'depth' });
  });
});

describe('Rename, recolor, pin, and archive', () => {
  it('pin and archive partition the folder set', () => {
    const folders = [
      folder('a', { pinned: true }),
      folder('b', { archived: true }),
      folder('c'),
    ];
    expect(activeFolders(folders).map((f) => f.id)).toEqual(['a', 'c']);
    expect(pinnedFolders(folders).map((f) => f.id)).toEqual(['a']);
    expect(archivedFolders(folders).map((f) => f.id)).toEqual(['b']);
  });
});

describe('Sibling ordering', () => {
  it('appends a new folder after its siblings', () => {
    const folders = [folder('a', { order: 0 }), folder('b', { order: 1 })];
    expect(nextOrder(folders, null)).toBe(2);
    const created = createFolder(folders, { id: 'c', name: 'C' });
    expect(created.order).toBe(2);
  });

  it('reorder updates only the siblings whose order changed', () => {
    const folders = [
      folder('a', { order: 0 }),
      folder('b', { order: 1 }),
      folder('c', { order: 2 }),
    ];
    const changed = reorderSiblings(folders, ['c', 'a', 'b']);
    // a:0→1, b:1→2, c:2→0 — all three move.
    expect(changed.map((f) => [f.id, f.order])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
  });
});

describe('Conversation assignment and counts', () => {
  it('assigning replaces the previous folder; clearing removes it', () => {
    const c = conv('x', 'f1');
    expect(assignConversation(c, 'f2').folderId).toBe('f2');
    expect(assignConversation(c, null).folderId).toBeNull();
  });

  it('counts reflect current assignments and ignore unfiled', () => {
    const counts = countByFolder([conv('1', 'f1'), conv('2', 'f1'), conv('3', 'f2'), conv('4', null)]);
    expect(counts).toEqual({ f1: 2, f2: 1 });
  });
});
