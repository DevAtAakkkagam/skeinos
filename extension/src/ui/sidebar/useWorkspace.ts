// The sidebar's data layer: a pure view over worker state (PREACT guardrail).
// It reads the folder tree, counts, and conversation list from the worker, holds
// NO authoritative state of its own, and re-queries whenever the worker broadcasts
// `state.changed` — so every open tab converges on the single writer's truth.
//
// Resilience (workspace-view-recovery): reads ride the transport retry helper
// (messaging-resilience), the hook tracks an honest `loading | ready | error`
// status so a failed/in-flight load is never shown as an empty workspace, and
// `mutate` reconciles by re-reading after EVERY attempt (observe-don't-replay):
// the worker may have committed the write even when its ack was lost, so the view
// recovers by re-reading rather than replaying a non-idempotent write.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';
import { mutateWorkspaceRemote, queryWorkspaceRemote } from '../../core/folders';
import type {
  ActiveConversation,
  ConversationIndex,
  Folder,
  FolderTreeNode,
  PlatformId,
} from '../../shared/types';
import type { FolderTreeSnapshot, MutationOp } from '../../shared/workspace';

const EMPTY_TREE: FolderTreeSnapshot = { active: [], pinned: [], archived: [] };

/** The folder view's load status. `loading` until the first tree read resolves;
 *  `ready` once a read succeeds; `error` only if the first read fails after the
 *  transport's retry budget (a later reconcile failure keeps the last good tree). */
export type WorkspaceStatus = 'loading' | 'ready' | 'error';

/** The outcome of a {@link WorkspaceView.mutate}: the transport ack plus whether
 *  the reconciling re-read confirms the change actually took effect in the store. */
export interface MutateResult {
  /** The mutation's transport acknowledgement (`false` if the response was lost). */
  ok: boolean;
  /** Whether the reconciling re-read confirms the change is present in worker
   *  state. `true` even when `ok` is false if the worker committed despite a lost
   *  ack; `false` when the change is confirmed absent (a genuine failure). */
  applied: boolean;
}

export interface WorkspaceView {
  tree: FolderTreeSnapshot;
  counts: Record<string, number>;
  conversations: ConversationIndex[];
  /** The conversation open in the active tab for this platform, or `null` when
   *  none is resolvable. A pure read of worker state — reconciled like the rest. */
  active: ActiveConversation | null;
  /** Load status driving the loading/empty/error rendering. */
  status: WorkspaceStatus;
  /** Re-read all selectors from the worker (reconcile). */
  refresh: () => void;
  /** Re-attempt the read from an `error` state (shows loading, then the result). */
  retry: () => void;
  /** Apply a mutation, then reconcile by re-reading (observe-don't-replay). The
   *  mutation is sent exactly once; the view recovers the truth from the re-read. */
  mutate: (op: MutationOp) => Promise<MutateResult>;
}

/** Is `id` present anywhere in the folder snapshot (active subtree, pinned, archived)? */
function treeHasFolder(tree: FolderTreeSnapshot, id: string): boolean {
  const inNodes = (nodes: FolderTreeNode[]): boolean =>
    nodes.some((n) => n.folder.id === id || inNodes(n.children));
  return (
    inNodes(tree.active) ||
    tree.pinned.some((f) => f.id === id) ||
    tree.archived.some((f) => f.id === id)
  );
}

/** Locate a folder anywhere in the snapshot (for verifying a rename took effect). */
function findInTree(tree: FolderTreeSnapshot, id: string): Folder | undefined {
  const walk = (nodes: FolderTreeNode[]): Folder | undefined => {
    for (const n of nodes) {
      if (n.folder.id === id) return n.folder;
      const found = walk(n.children);
      if (found) return found;
    }
    return undefined;
  };
  return (
    walk(tree.active) ??
    tree.pinned.find((f) => f.id === id) ??
    tree.archived.find((f) => f.id === id)
  );
}

/** Did `op` take effect, judged against the freshly-reconciled `tree`? Only the
 *  ops with a checkable identity are confirmed; for the rest we cannot positively
 *  verify from the tree, so a lost ack is treated as not-applied (surfaced, not
 *  silently swallowed). Only consulted when the transport ack was `false`. */
function mutationApplied(op: MutationOp, tree: FolderTreeSnapshot): boolean {
  switch (op.op) {
    case 'folder.create':
      return treeHasFolder(tree, op.id);
    case 'folder.delete':
      return !treeHasFolder(tree, op.id);
    case 'folder.rename':
      return findInTree(tree, op.id)?.name === op.name;
    case 'folder.recolor': {
      const f = findInTree(tree, op.id);
      return !!f && f.color === op.color && f.icon === op.icon;
    }
    case 'folder.pin':
      return findInTree(tree, op.id)?.pinned === op.pinned;
    case 'folder.archive':
      return findInTree(tree, op.id)?.archived === op.archived;
    case 'folder.move':
      return findInTree(tree, op.id)?.parentId === op.parentId;
    default:
      // reorder / conversation ops have no single checkable identity in the tree;
      // a lost ack is treated as not-applied (surfaced rather than swallowed).
      return false;
  }
}

export function useWorkspace(platform: PlatformId): WorkspaceView {
  const [tree, setTree] = useState<FolderTreeSnapshot>(EMPTY_TREE);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [conversations, setConversations] = useState<ConversationIndex[]>([]);
  const [active, setActive] = useState<ActiveConversation | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>('loading');

  // Always read through the latest status without re-creating the read callback
  // (the status decides whether a failed read flips to `error` or keeps last-good).
  const statusRef = useRef<WorkspaceStatus>('loading');
  statusRef.current = status;

  // Read the folder tree, update state + status, and return the snapshot so a
  // caller (mutate) can inspect whether its change took effect.
  const readTree = useCallback(async (): Promise<FolderTreeSnapshot | null> => {
    const res = await queryWorkspaceRemote({ kind: 'folder.tree' });
    if (res.ok && res.data.kind === 'folder.tree') {
      setTree(res.data.tree);
      setStatus('ready');
      return res.data.tree;
    }
    // A failed read only downgrades to `error` before we ever had data; once
    // `ready`, keep the last good tree and let the next trigger reconcile.
    setStatus((s) => (s === 'loading' ? 'error' : s));
    return null;
  }, []);

  // Counts/conversations are non-fatal: a failure degrades to the last/default
  // value and never flips the whole view to `error`.
  const readAux = useCallback(async () => {
    const [countsRes, convRes, activeRes] = await Promise.all([
      queryWorkspaceRemote({ kind: 'folder.counts' }),
      queryWorkspaceRemote({ kind: 'conversation.list', platform }),
      queryWorkspaceRemote({ kind: 'conversation.active', platform }),
    ]);
    if (countsRes.ok && countsRes.data.kind === 'folder.counts') setCounts(countsRes.data.counts);
    if (convRes.ok && convRes.data.kind === 'conversation.list') {
      setConversations(convRes.data.conversations);
    }
    if (activeRes.ok && activeRes.data.kind === 'conversation.active') {
      setActive(activeRes.data.active);
    }
  }, [platform]);

  // Coalesced reconcile: one read in flight at a time; trailing calls collapse to
  // a single re-run, so rapid triggers (focus + visibility + broadcast) never fan
  // out into a read storm.
  const inFlight = useRef(false);
  const trailing = useRef(false);
  const refresh = useCallback(() => {
    if (inFlight.current) {
      trailing.current = true;
      return;
    }
    inFlight.current = true;
    void (async () => {
      try {
        do {
          trailing.current = false;
          await Promise.all([readTree(), readAux()]);
        } while (trailing.current);
      } finally {
        inFlight.current = false;
      }
    })();
  }, [readTree, readAux]);

  const retry = useCallback(() => {
    setStatus('loading');
    refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    // The worker fans `state.changed` after every mutation (from any tab); re-read.
    const dispose = subscribe((msg) => {
      if (msg.kind === 'state.changed') refresh();
    });
    return dispose;
  }, [refresh]);

  // Reconcile when the panel returns to view or regains focus. Broadcast delivery
  // is best-effort and the MV3 worker is torn down on idle, so a panel left open
  // while its worker died (and missed the broadcast) self-heals the moment the user
  // comes back to it — without a remount. Guarded for non-extension/test contexts
  // that have no `document`/`window`. (useWorkspace only ever runs in the panel.)
  useEffect(() => {
    const doc = (globalThis as { document?: Document }).document;
    const win = (globalThis as { window?: Window }).window;
    if (!doc && !win) return;
    const onVisible = () => {
      if (!doc || doc.visibilityState === 'visible') refresh();
    };
    doc?.addEventListener('visibilitychange', onVisible);
    win?.addEventListener('focus', refresh);
    return () => {
      doc?.removeEventListener('visibilitychange', onVisible);
      win?.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const mutate = useCallback(
    async (op: MutationOp): Promise<MutateResult> => {
      // Send exactly once (never replay a non-idempotent write).
      const res = await mutateWorkspaceRemote(op);
      // Reconcile after EVERY attempt: the worker may have committed the write
      // even when the response/broadcast was lost. The re-read reveals the truth.
      const reconciled = await readTree();
      void readAux();
      if (res.ok) return { ok: true, applied: true };
      // Ack lost: trust the reconciled tree to decide whether it actually applied.
      const applied = reconciled ? mutationApplied(op, reconciled) : false;
      return { ok: false, applied };
    },
    [readTree, readAux],
  );

  return { tree, counts, conversations, active, status, refresh, retry, mutate };
}
