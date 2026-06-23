// The tags layer's data hook: a pure view over worker state (PREACT guardrail),
// mirroring `usePromptLibrary` / `useProfileLibrary` (design D-6). It reads the
// unified `tag.list` snapshot from the worker, holds NO authoritative tag state of
// its own, and re-queries whenever the worker broadcasts `state.changed` — so every
// open tab converges on the single writer's truth. Tag *counts* are NOT read here:
// they are derived client-side from the conversation list (`countByTag`, design D-4),
// so a badge can never disagree with the rows it labels.
//
// Resilience (mirrors the sibling hooks): reads ride the transport retry helper, the
// hook tracks an honest `loading | ready | error` status so a failed/in-flight load is
// never shown as an empty library, and `mutate` reconciles by re-reading after EVERY
// attempt (observe-don't-replay): the worker may have committed the write even when its
// ack was lost, so the view recovers by re-reading rather than replaying.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';
import { extApi } from '../../core/platform/ext-api';
import { mutateWorkspaceRemote, queryWorkspaceRemote } from '../../core/folders';
import type { Tag } from '../../shared/types';
import type { MutationOp } from '../../shared/workspace';
import type { AppError } from '../../shared/messages';

/** The tag ops a tags-library view dispatches (the `MutationOp` subset it owns). */
export type TagMutationOp = Extract<
  MutationOp,
  { op: 'tag.create' | 'tag.rename' | 'tag.recolor' | 'tag.delete' | 'conversation.tag' | 'prompt.tag' }
>;

/** The slice of a `chrome.tabs` event we use: an argument-agnostic listener. */
interface ChromeEvent {
  addListener(cb: () => void): void;
  removeListener(cb: () => void): void;
}

export type TagLibraryStatus = 'loading' | 'ready' | 'error';

/** The outcome of a {@link TagLibraryView.mutate}: the transport ack plus whether the
 *  reconciling re-read confirms the change actually took effect in the store. */
export interface TagMutateResult {
  ok: boolean;
  applied: boolean;
  /** The typed error envelope when the worker rejected the mutation (e.g. a tier
   *  `quota_exceeded`), so the create flow can branch on `error.code` and keep the
   *  typed label. Absent on success or a merely-lost ack. */
  error?: AppError;
}

/** The injectable view the tag surfaces render over. Tests inject a stub of this
 *  shape; production uses {@link useTagLibrary}. */
export interface TagLibraryView {
  tags: Tag[];
  status: TagLibraryStatus;
  refresh: () => void;
  retry: () => void;
  mutate: (op: TagMutationOp) => Promise<TagMutateResult>;
}

/** Did `op` take effect, judged against the freshly-reconciled tag set? Only ops with
 *  a checkable identity are confirmed; the rest treat a lost ack as not-applied
 *  (surfaced, not swallowed). Only consulted when the transport ack was `false`. */
function mutationApplied(op: TagMutationOp, tags: Tag[]): boolean {
  switch (op.op) {
    case 'tag.create':
      return tags.some((t) => t.id === op.id);
    case 'tag.delete':
      return !tags.some((t) => t.id === op.id);
    case 'tag.rename':
      return tags.find((t) => t.id === op.id)?.label === op.label;
    default:
      // recolor / assignment have no single checkable identity in the tag set.
      return false;
  }
}

export function useTagLibrary(): TagLibraryView {
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState<TagLibraryStatus>('loading');

  const read = useCallback(async (): Promise<Tag[] | null> => {
    const res = await queryWorkspaceRemote({ kind: 'tag.list' });
    if (res.ok && res.data.kind === 'tag.list') {
      setTags(res.data.tags);
      setStatus('ready');
      return res.data.tags;
    }
    setStatus((s) => (s === 'loading' ? 'error' : s));
    return null;
  }, []);

  const readRef = useRef(read);
  readRef.current = read;

  // Coalesced reconcile: one read in flight at a time; trailing calls collapse to a
  // single re-run, so rapid triggers never fan out into a read storm.
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

  // Subscribe once: re-read on every `state.changed`. `refresh` is stable.
  useEffect(() => {
    const dispose = subscribe((msg) => {
      if (msg.kind === 'state.changed') refresh();
    });
    return dispose;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reconcile when the panel returns to view/focus (the MV3 worker is torn down on
  // idle, so a panel that missed a broadcast self-heals on return). Guarded for
  // non-extension/test contexts.
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
    async (op: TagMutationOp): Promise<TagMutateResult> => {
      // Send exactly once (never replay a non-idempotent write).
      const res = await mutateWorkspaceRemote(op);
      const reconciled = await read();
      if (res.ok) return { ok: true, applied: true };
      const applied = reconciled ? mutationApplied(op, reconciled) : false;
      return { ok: false, applied, error: res.error };
    },
    [read],
  );

  return { tags, status, refresh, retry, mutate };
}
