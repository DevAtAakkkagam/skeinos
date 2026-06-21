// The prompt half of the search overlay's data layer (slice 4, design D-D): a pure
// view over worker state mirroring {@link useSearch}, prompts-only. It takes the
// overlay's query text, debounces it, issues `prompt.search` through the worker,
// drops stale responses via a monotonic ticket, and re-queries on `state.changed`
// (so a prompt added while the overlay is open shows up). Holds no authoritative
// state of its own.
//
// Imports the prompt client from its leaf module (not the feature barrel) so the
// side-panel bundle never pulls the worker-only store/IndexedDB code.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';
import { queryPromptLibraryRemote } from '../../core/prompts/client';
import type { PromptSearchResult, PromptSnapshot } from '../../shared/prompts';
import type { Response } from '../../shared/messages';
import type { SearchStatus } from './useSearch';

export interface PromptSearchView {
  results: PromptSearchResult[];
  status: SearchStatus;
}

type RecentsQueryFn = (
  selector: { kind: 'prompt.recents'; limit: number },
) => Promise<Response<PromptSnapshot>>;

/** The recently-used prompts for the popover's empty state (prompt-recents D-4): one
 *  read on mount via `prompt.recents`, returning up to `limit` rows. Holds no
 *  authoritative state — a transient popover re-reads on each open, so it does not
 *  subscribe to `state.changed` (a use recorded in another tab reconciles on reopen).
 *  Empty until the read resolves and whenever no prompt has been used yet. */
export function useRecentPrompts(
  send: RecentsQueryFn = queryPromptLibraryRemote,
  limit = 5,
): PromptSearchResult[] {
  const [results, setResults] = useState<PromptSearchResult[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      const res = await send({ kind: 'prompt.recents', limit });
      if (live && res.ok && res.data.kind === 'prompt.recents') setResults(res.data.results);
    })();
    return () => {
      live = false;
    };
  }, [send, limit]);
  return results;
}

/** Debounce window for keystrokes before a query is issued (same as `useSearch`). */
const DEBOUNCE_MS = 160;

type QueryFn = (selector: { kind: 'prompt.search'; terms: string[] }) => Promise<Response<PromptSnapshot>>;

export function usePromptSearch(
  queryText: string,
  send: QueryFn = queryPromptLibraryRemote,
): PromptSearchView {
  const [results, setResults] = useState<PromptSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');

  // Drops stale responses: only the most recently issued query may apply.
  const ticket = useRef(0);

  const run = useCallback(async () => {
    const terms = queryText.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      ticket.current++; // cancel any in-flight apply
      setResults([]);
      setStatus('idle');
      return;
    }
    const mine = ++ticket.current;
    setStatus('searching');
    const res = await send({ kind: 'prompt.search', terms });
    if (mine !== ticket.current) return; // a newer query superseded this one
    if (res.ok && res.data.kind === 'prompt.search') {
      setResults(res.data.results);
      setStatus('ready');
    } else {
      setResults([]);
      setStatus('error');
    }
  }, [queryText, send]);

  // Debounced (re)query whenever the query text changes.
  useEffect(() => {
    const id = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [run]);

  // Re-query when the worker's state changes (e.g. a prompt added/edited).
  useEffect(() => {
    const dispose = subscribe((msg) => {
      if (msg.kind === 'state.changed') void run();
    });
    return dispose;
  }, [run]);

  return { results, status };
}
