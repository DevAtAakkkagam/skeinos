// The Prompts tab's data layer: a pure view over worker state (PREACT guardrail),
// mirroring `useWorkspace` but with the platform machinery stripped out (design
// D-C). It reads the single unified `prompt.library` snapshot from the worker, holds
// NO authoritative prompt state of its own, and re-queries whenever the worker
// broadcasts `state.changed` — so every open tab converges on the single writer's
// truth. Category/tag counts are NOT read here: they are derived client-side by the
// panel from `prompts` (D-B), so a badge can never disagree with the rows it labels.
//
// Resilience (mirrors useWorkspace): reads ride the transport retry helper, the hook
// tracks an honest `loading | ready | error` status so a failed/in-flight load is
// never shown as an empty library, and `mutate` reconciles by re-reading after EVERY
// attempt (observe-don't-replay): the worker may have committed the write even when
// its ack was lost, so the view recovers by re-reading rather than replaying a
// non-idempotent write.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';
import { extApi } from '../../core/platform/ext-api';
import { mutatePromptLibraryRemote, queryPromptLibraryRemote } from '../../core/prompts';
import type { Prompt, PromptFolder } from '../../shared/types';
import type { PromptMutationOp } from '../../shared/prompts';
import type { AppError } from '../../shared/messages';

/** The slice of a `chrome.tabs` event we use: an argument-agnostic listener. The
 *  panel ignores the payload — it just re-reads worker state. */
interface ChromeEvent {
  addListener(cb: () => void): void;
  removeListener(cb: () => void): void;
}

/** The library's load status. `loading` until the first read resolves; `ready` once
 *  a read succeeds; `error` only if the first read fails after the transport's retry
 *  budget (a later reconcile failure keeps the last good library). */
export type PromptLibraryStatus = 'loading' | 'ready' | 'error';

/** The outcome of a {@link PromptLibraryView.mutate}: the transport ack plus whether
 *  the reconciling re-read confirms the change actually took effect in the store. */
export interface PromptMutateResult {
  /** The mutation's transport acknowledgement (`false` if the response was lost). */
  ok: boolean;
  /** Whether the reconciling re-read confirms the change is present in worker state
   *  (`true` even when `ok` is false if the worker committed despite a lost ack). */
  applied: boolean;
  /** The typed error envelope when the worker rejected the mutation (e.g. a tier
   *  `quota_exceeded`), so the caller can branch on `error.code` without re-deriving
   *  it. Absent on success or a merely-lost ack. */
  error?: AppError;
}

/** The injectable view the panel renders over (like `WorkspaceView`): the unified
 *  library, an honest load status, and the reconcile/mutate seams. Tests inject a
 *  stub of this shape; production uses {@link usePromptLibrary}. */
export interface PromptLibraryView {
  prompts: Prompt[];
  folders: PromptFolder[];
  status: PromptLibraryStatus;
  /** Re-read the library from the worker (reconcile). */
  refresh: () => void;
  /** Re-attempt the read from an `error` state (shows loading, then the result). */
  retry: () => void;
  /** Apply a mutation, then reconcile by re-reading (observe-don't-replay). The
   *  mutation is sent exactly once; the view recovers the truth from the re-read. */
  mutate: (op: PromptMutationOp) => Promise<PromptMutateResult>;
}

/** Did `op` take effect, judged against the freshly-reconciled library? Only ops with
 *  a checkable identity are confirmed (create→present, delete→absent, rename→new
 *  name); for the rest a lost ack is treated as not-applied (surfaced, not swallowed).
 *  Only consulted when the transport ack was `false`. */
function mutationApplied(op: PromptMutationOp, prompts: Prompt[], folders: PromptFolder[]): boolean {
  switch (op.op) {
    case 'prompt.create':
      return prompts.some((p) => p.id === op.id);
    case 'prompt.delete':
      return !prompts.some((p) => p.id === op.id);
    case 'promptFolder.create':
      return folders.some((f) => f.id === op.id);
    case 'promptFolder.delete':
      return !folders.some((f) => f.id === op.id);
    case 'promptFolder.rename':
      return folders.find((f) => f.id === op.id)?.name === op.name;
    default:
      // prompt.update has no single checkable identity (a body edit may legitimately
      // equal the prior body); a lost ack is treated as not-applied (surfaced).
      return false;
  }
}

export function usePromptLibrary(): PromptLibraryView {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [folders, setFolders] = useState<PromptFolder[]>([]);
  const [status, setStatus] = useState<PromptLibraryStatus>('loading');

  // Read through the latest status without re-creating the read callback (the status
  // decides whether a failed read flips to `error` or keeps last-good).
  const statusRef = useRef<PromptLibraryStatus>('loading');
  statusRef.current = status;

  // Read the library, update state + status, and return the snapshot so a caller
  // (mutate) can inspect whether its change took effect.
  const read = useCallback(async (): Promise<{ prompts: Prompt[]; folders: PromptFolder[] } | null> => {
    const res = await queryPromptLibraryRemote({ kind: 'prompt.library' });
    if (res.ok && res.data.kind === 'prompt.library') {
      setPrompts(res.data.prompts);
      setFolders(res.data.folders);
      setStatus('ready');
      return { prompts: res.data.prompts, folders: res.data.folders };
    }
    // A failed read only downgrades to `error` before we ever had data; once `ready`,
    // keep the last good library and let the next trigger reconcile.
    setStatus((s) => (s === 'loading' ? 'error' : s));
    return null;
  }, []);

  const readRef = useRef(read);
  readRef.current = read;

  // Coalesced reconcile: one read in flight at a time; trailing calls collapse to a
  // single re-run, so rapid triggers (focus + visibility + broadcast) never fan out
  // into a read storm.
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
          await readRef.current();
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

  // Initial load.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reconcile when the panel returns to view or regains focus — the MV3 worker is
  // torn down on idle, so a panel that missed a broadcast self-heals on return,
  // without a remount. Guarded for non-extension/test contexts with no document/window.
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

  // Switching the active browser tab fires no focus/visibilitychange on the always-
  // open side panel; re-read on tab activation/update so a cross-tab change is picked
  // up promptly. Coalesced by `refresh`. Guarded for non-extension/test contexts.
  useEffect(() => {
    const tabs = extApi<{
      tabs?: { onActivated?: ChromeEvent; onUpdated?: ChromeEvent };
    }>()?.tabs;
    if (!tabs) return;
    tabs.onActivated?.addListener(refresh);
    tabs.onUpdated?.addListener(refresh);
    return () => {
      tabs.onActivated?.removeListener(refresh);
      tabs.onUpdated?.removeListener(refresh);
    };
  }, [refresh]);

  const mutate = useCallback(
    async (op: PromptMutationOp): Promise<PromptMutateResult> => {
      // Send exactly once (never replay a non-idempotent write).
      const res = await mutatePromptLibraryRemote(op);
      // Reconcile after EVERY attempt: the worker may have committed the write even
      // when the response/broadcast was lost. The re-read reveals the truth.
      const reconciled = await read();
      if (res.ok) return { ok: true, applied: true };
      // Ack lost: trust the reconciled library to decide whether it actually applied.
      const applied = reconciled
        ? mutationApplied(op, reconciled.prompts, reconciled.folders)
        : false;
      // Carry the typed error so the editor can branch on `quota_exceeded` and keep
      // the user's draft (block-with-nudge) rather than reporting a generic failure.
      return { ok: false, applied, error: res.error };
    },
    [read],
  );

  return { prompts, folders, status, refresh, retry, mutate };
}

/** A fresh id (prompt or category), fixed once per create so a retry overwrites the
 *  same row (after a possibly-committed-but-unacknowledged attempt) instead of
 *  duplicating. Mirrors `makeFolderId`. */
export function makePromptId(prefix = 'p'): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
