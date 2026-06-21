// The Profiles tab's data layer: a pure view over worker state (PREACT guardrail),
// mirroring `usePromptLibrary` with the platform/category machinery stripped out. It
// reads the single `profile.library` snapshot from the worker, holds NO authoritative
// profile state of its own, and re-queries whenever the worker broadcasts
// `state.changed` — so every open tab converges on the single writer's truth.
//
// Resilience (mirrors usePromptLibrary): reads ride the transport retry helper, the
// hook tracks an honest `loading | ready | error` status, and `mutate` reconciles by
// re-reading after EVERY attempt (observe-don't-replay): the worker may have committed
// the write even when its ack was lost, so the view recovers by re-reading rather than
// replaying a non-idempotent write.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';
import { mutateProfilesRemote, queryProfilesRemote } from '../../core/profiles';
import type { InstructionProfile } from '../../shared/types';
import type { ProfileMutationOp } from '../../shared/profiles';

/** The slice of a `chrome.tabs` event we use: an argument-agnostic listener. The
 *  panel ignores the payload — it just re-reads worker state. */
interface ChromeEvent {
  addListener(cb: () => void): void;
  removeListener(cb: () => void): void;
}

/** The library's load status. `loading` until the first read resolves; `ready` once a
 *  read succeeds; `error` only if the first read fails after the transport's retry
 *  budget (a later reconcile failure keeps the last good library). */
export type ProfileLibraryStatus = 'loading' | 'ready' | 'error';

/** The outcome of a {@link ProfileLibraryView.mutate}: the transport ack plus whether
 *  the reconciling re-read confirms the change actually took effect in the store. */
export interface ProfileMutateResult {
  ok: boolean;
  applied: boolean;
}

/** The injectable view the controller renders over: the library, an honest load
 *  status, and the reconcile/mutate seams. Tests inject a stub of this shape;
 *  production uses {@link useProfileLibrary}. */
export interface ProfileLibraryView {
  profiles: InstructionProfile[];
  status: ProfileLibraryStatus;
  /** Re-read the library from the worker (reconcile). */
  refresh: () => void;
  /** Re-attempt the read from an `error` state (shows loading, then the result). */
  retry: () => void;
  /** Apply a mutation, then reconcile by re-reading (observe-don't-replay). */
  mutate: (op: ProfileMutationOp) => Promise<ProfileMutateResult>;
}

/** Did `op` take effect, judged against the freshly-reconciled library? Only ops with
 *  a checkable identity are confirmed (create→present, delete→absent); update has no
 *  single checkable identity, so a lost ack is treated as not-applied (surfaced). Only
 *  consulted when the transport ack was `false`. */
function mutationApplied(op: ProfileMutationOp, profiles: InstructionProfile[]): boolean {
  switch (op.op) {
    case 'profile.create':
      return profiles.some((p) => p.id === op.id);
    case 'profile.delete':
      return !profiles.some((p) => p.id === op.id);
    default:
      return false;
  }
}

export function useProfileLibrary(): ProfileLibraryView {
  const [profiles, setProfiles] = useState<InstructionProfile[]>([]);
  const [status, setStatus] = useState<ProfileLibraryStatus>('loading');

  const statusRef = useRef<ProfileLibraryStatus>('loading');
  statusRef.current = status;

  const read = useCallback(async (): Promise<InstructionProfile[] | null> => {
    const res = await queryProfilesRemote({ kind: 'profile.library' });
    if (res.ok && res.data.kind === 'profile.library') {
      setProfiles(res.data.profiles);
      setStatus('ready');
      return res.data.profiles;
    }
    // A failed read only downgrades to `error` before we ever had data; once `ready`,
    // keep the last good library and let the next trigger reconcile.
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

  // Reconcile when the panel returns to view or regains focus — the MV3 worker is torn
  // down on idle, so a panel that missed a broadcast self-heals on return.
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

  // Switching the active browser tab fires no focus/visibilitychange on the always-open
  // side panel; re-read on tab activation/update so a cross-tab change is picked up.
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
    async (op: ProfileMutationOp): Promise<ProfileMutateResult> => {
      // Send exactly once (never replay a non-idempotent write).
      const res = await mutateProfilesRemote(op);
      // Reconcile after EVERY attempt: the worker may have committed the write even
      // when the response/broadcast was lost. The re-read reveals the truth.
      const reconciled = await read();
      if (res.ok) return { ok: true, applied: true };
      const applied = reconciled ? mutationApplied(op, reconciled) : false;
      return { ok: false, applied };
    },
    [read],
  );

  return { profiles, status, refresh, retry, mutate };
}

/** A fresh profile id, fixed once per create so a retry overwrites the same row
 *  instead of duplicating. Mirrors `makePromptId`. */
export function makeProfileId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : `pf_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
