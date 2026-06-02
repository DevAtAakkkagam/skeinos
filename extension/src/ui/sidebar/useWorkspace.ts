// The sidebar's data layer: a pure view over worker state (PREACT guardrail).
// It reads the folder tree, counts, and conversation list from the worker, holds
// NO authoritative state of its own, and re-queries whenever the worker broadcasts
// `state.changed` — so every open tab converges on the single writer's truth.

import { useCallback, useEffect, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';
import { mutateWorkspaceRemote, queryWorkspaceRemote } from '../../core/folders';
import type { PlatformId } from '../../shared/types';
import type { ConversationIndex } from '../../shared/types';
import type { FolderTreeSnapshot, MutationOp } from '../../shared/workspace';

const EMPTY_TREE: FolderTreeSnapshot = { active: [], pinned: [], archived: [] };

export interface WorkspaceView {
  tree: FolderTreeSnapshot;
  counts: Record<string, number>;
  conversations: ConversationIndex[];
  /** Re-read all selectors from the worker. */
  refresh: () => void;
  /** Apply a mutation; resolves `true` on success. On failure the view stays on
   *  authoritative state (a rejected drag visibly snaps back). */
  mutate: (op: MutationOp) => Promise<boolean>;
}

export function useWorkspace(platform: PlatformId): WorkspaceView {
  const [tree, setTree] = useState<FolderTreeSnapshot>(EMPTY_TREE);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [conversations, setConversations] = useState<ConversationIndex[]>([]);

  const refresh = useCallback(() => {
    void queryWorkspaceRemote({ kind: 'folder.tree' }).then((r) => {
      if (r.ok && r.data.kind === 'folder.tree') setTree(r.data.tree);
    });
    void queryWorkspaceRemote({ kind: 'folder.counts' }).then((r) => {
      if (r.ok && r.data.kind === 'folder.counts') setCounts(r.data.counts);
    });
    void queryWorkspaceRemote({ kind: 'conversation.list', platform }).then((r) => {
      if (r.ok && r.data.kind === 'conversation.list') setConversations(r.data.conversations);
    });
  }, [platform]);

  useEffect(() => {
    refresh();
    // The worker fans `state.changed` after every mutation (from any tab); re-read.
    const dispose = subscribe((msg) => {
      if (msg.kind === 'state.changed') refresh();
    });
    return dispose;
  }, [refresh]);

  const mutate = useCallback(async (op: MutationOp) => {
    const res = await mutateWorkspaceRemote(op);
    if (res.ok) refresh(); // also covered by the broadcast, but refresh immediately
    return res.ok;
  }, [refresh]);

  return { tree, counts, conversations, refresh, mutate };
}
