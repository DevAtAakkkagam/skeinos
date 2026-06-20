// The sidebar's data layer: a pure view over worker state (PREACT guardrail).
// It reads the folder tree and the UNIFIED conversation list from the worker,
// holds NO authoritative folder state of its own, and re-queries whenever the
// worker broadcasts `state.changed` — so every open tab converges on the single
// writer's truth. Per-folder counts are derived client-side from the unified list
// (D28), so there is no separate `folder.counts` read. The one piece of view state
// it owns is the ephemeral platform view-filter (default "All"): a narrowing of the
// unified list, never a folder mutation and never persisted.
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

/** The slice of a `chrome.tabs` event we use: add/remove an argument-agnostic
 *  listener. The panel ignores the event payload — it just re-reads worker state. */
interface ChromeEvent {
  addListener(cb: () => void): void;
  removeListener(cb: () => void): void;
}

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

/** The platform view-filter: a single platform, or `'all'` for the unified view.
 *  Ephemeral panel-local state (D28 / D-FSR3) — it never mutates folders or
 *  `Folder.platformScope`, and is not persisted across reopen. */
export type PlatformFilter = PlatformId | 'all';

export interface WorkspaceView {
  tree: FolderTreeSnapshot;
  /** The unified conversation list across every platform (D28). The UI narrows it
   *  by {@link platformFilter} and derives per-folder counts from the result. */
  conversations: ConversationIndex[];
  /** The conversation open in the active tab for this platform, or `null` when
   *  none is resolvable. A pure read of worker state — reconciled like the rest. */
  active: ActiveConversation | null;
  /** The active platform view-filter; defaults to `'all'` (unified). */
  platformFilter: PlatformFilter;
  /** Set the platform view-filter (a view control only — no worker round-trip). */
  setPlatformFilter: (filter: PlatformFilter) => void;
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
  const [conversations, setConversations] = useState<ConversationIndex[]>([]);
  const [active, setActive] = useState<ActiveConversation | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
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

  // The unified conversation list + the per-platform active card are non-fatal: a
  // failure degrades to the last/default value and never flips the whole view to
  // `error`. The list is unified (no platform arg); only the active card is keyed
  // by the active tab's platform.
  // Always reflects the latest active-tab platform, so an in-flight `readAux` from a
  // prior platform can detect that it is stale and skip its `setActive`.
  const platformRef = useRef(platform);
  platformRef.current = platform;

  const readAux = useCallback(async () => {
    const [convRes, activeRes] = await Promise.all([
      queryWorkspaceRemote({ kind: 'conversation.list' }),
      queryWorkspaceRemote({ kind: 'conversation.active', platform }),
    ]);
    // The list is unified (platform-agnostic), so a late-resolving read is always
    // safe to apply.
    if (convRes.ok && convRes.data.kind === 'conversation.list') {
      setConversations(convRes.data.conversations);
    }
    // The active card is keyed by `platform`. Drop this result if the active tab's
    // platform has since changed: a read dispatched for the PREVIOUS platform must
    // not resolve late and overwrite the new platform's card (or the `setActive(null)`
    // the switch just applied). `platform` here is the closure's captured platform.
    if (
      activeRes.ok &&
      activeRes.data.kind === 'conversation.active' &&
      platformRef.current === platform
    ) {
      setActive(activeRes.data.active);
    }
  }, [platform]);

  // The coalesced loop reads through refs so a trailing re-run always uses the
  // LATEST platform's readers — not the closure captured when the loop began. On a
  // platform switch (gemini→perplexity) the previous platform's read may still be in
  // flight when `platform` changes; without this, the swallowed-then-trailing re-run
  // would re-read the OLD platform's active card and leave the panel highlighting the
  // prior tab's conversation.
  const readTreeRef = useRef(readTree);
  readTreeRef.current = readTree;
  const readAuxRef = useRef(readAux);
  readAuxRef.current = readAux;

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
          await Promise.all([readTreeRef.current(), readAuxRef.current()]);
        } while (trailing.current);
      } finally {
        inFlight.current = false;
      }
    })();
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    refresh();
  }, [refresh]);

  // Subscribe once: the worker fans `state.changed` after every mutation (from any
  // tab); re-read on each. `refresh` is stable, so this attaches a single listener.
  useEffect(() => {
    const dispose = subscribe((msg) => {
      if (msg.kind === 'state.changed') refresh();
    });
    return dispose;
  }, [refresh]);

  // Initial load, and re-read whenever the active-tab platform changes. The active-
  // conversation card is keyed by `platform`, so drop the previous platform's card
  // immediately — never linger on the prior tab's highlight — and reconcile the new
  // platform's card from the worker. The unified tree/list are platform-agnostic, so
  // they are simply re-read (not cleared) by the same `refresh`.
  useEffect(() => {
    setActive(null);
    refresh();
  }, [platform, refresh]);

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

  // Switching the active browser tab (or the active tab navigating) changes which
  // conversation is "current", but fires NO focus/visibilitychange on the always-
  // open side panel — so the active-conversation highlight would otherwise go stale
  // until the user clicks the panel. Re-read on tab activation/update so the
  // highlight tracks the focused tab. Coalesced by `refresh`, so the chatty
  // `onUpdated` (any tab's load progress) collapses to one read. Guarded for
  // non-extension/test contexts. (PRIV: this reads no tab content.)
  useEffect(() => {
    const tabs = (
      globalThis as { chrome?: { tabs?: { onActivated?: ChromeEvent; onUpdated?: ChromeEvent } } }
    ).chrome?.tabs;
    if (!tabs) return;
    tabs.onActivated?.addListener(refresh);
    tabs.onUpdated?.addListener(refresh);
    return () => {
      tabs.onActivated?.removeListener(refresh);
      tabs.onUpdated?.removeListener(refresh);
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

  return {
    tree,
    conversations,
    active,
    platformFilter,
    setPlatformFilter,
    status,
    refresh,
    retry,
    mutate,
  };
}
