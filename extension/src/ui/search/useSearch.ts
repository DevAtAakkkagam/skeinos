// The search overlay's data layer: a pure view over worker state (PREACT
// guardrail). It debounces the query, issues `search.run` through the worker, and
// holds NO authoritative state — it re-queries whenever the query/filters change
// and whenever the worker broadcasts `state.changed` (so a result list reflects an
// index that grew while the overlay was open). A monotonic ticket drops stale
// responses so a slow earlier query never overwrites a newer one.
//
// Imports the search client from its leaf module (not the feature barrel) so the
// side-panel bundle never pulls the worker-only engine/handlers (and IndexedDB).

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { subscribe } from '../../core/messaging';
import { searchRemote } from '../../core/conversation-index/client';
import type { Query, SearchFilters, SearchResult } from '../../shared/types';
import type { Response } from '../../shared/messages';

/** Idle until the first non-empty query; `searching` while a request is in flight;
 *  `ready` once results land; `error` if the request fails after the retry budget. */
export type SearchStatus = 'idle' | 'searching' | 'ready' | 'error';

export interface SearchView {
  queryText: string;
  setQueryText: (s: string) => void;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  results: SearchResult[];
  status: SearchStatus;
}

/** Debounce window for keystrokes before a query is issued. */
const DEBOUNCE_MS = 160;

type SearchFn = (query: Query) => Promise<Response<SearchResult[]>>;

export function useSearch(send: SearchFn = searchRemote): SearchView {
  const [queryText, setQueryText] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [results, setResults] = useState<SearchResult[]>([]);
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
    const res = await send({ terms, filters });
    if (mine !== ticket.current) return; // a newer query superseded this one
    if (res.ok) {
      setResults(res.data);
      setStatus('ready');
    } else {
      setResults([]);
      setStatus('error');
    }
  }, [queryText, filters, send]);

  // Debounced (re)query whenever the query text or filters change.
  useEffect(() => {
    const id = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [run]);

  // Re-query when the worker's state changes (e.g. new conversations indexed),
  // holding no authoritative state in the view.
  useEffect(() => {
    const dispose = subscribe((msg) => {
      if (msg.kind === 'state.changed') void run();
    });
    return dispose;
  }, [run]);

  return { queryText, setQueryText, filters, setFilters, results, status };
}
