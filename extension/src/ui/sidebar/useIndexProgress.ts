// Live bulk-index progress for the indexing indicator (loading-states, D-3). A
// self-contained subscriber over the existing `index.progress` broadcast — the same
// `subscribe()` seam `useWorkspace` uses for `state.changed`. It keeps only the
// latest `{ done, total }` and exposes it ONLY while indexing is genuinely in flight
// (`total > 0 && done < total`), clearing on completion (`done >= total`) or when
// nothing is indexing (`total === 0`).
//
// No persistence by design ([SW] no memory-only state to recover): the worker
// re-broadcasts from scratch on each bulk run, so a fresh subscription catches the
// next run, and a run already in flight at mount surfaces on its next chunk. The
// subscription is disposed on unmount.

import { useEffect, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';

/** A snapshot of bulk-index progress: how many of `total` conversations are done. */
export interface IndexProgress {
  done: number;
  total: number;
}

/**
 * Subscribe to `index.progress` and return the live progress while indexing is in
 * flight, or `null` when nothing is indexing (idle, or just completed). The returned
 * value is safe to render directly: a non-null result always satisfies
 * `total > 0 && done < total`.
 */
export function useIndexProgress(): IndexProgress | null {
  const [progress, setProgress] = useState<IndexProgress | null>(null);

  useEffect(() => {
    const dispose = subscribe((msg) => {
      if (msg.kind !== 'index.progress') return;
      const { done, total } = msg;
      // In flight → surface it; completed or empty → clear (auto-dismiss on done).
      setProgress(total > 0 && done < total ? { done, total } : null);
    });
    return dispose;
  }, []);

  return progress;
}
