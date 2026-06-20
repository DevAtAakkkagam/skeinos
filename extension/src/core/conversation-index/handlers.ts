// Worker-side search + indexing handlers. The single writer owns the
// `searchPostings` + `conversations` repos; content scripts/UI reach them only
// through these request kinds, added to the open `RequestContracts` map via
// declaration merging (the messaging seam — the hub is never edited).
//
//   · `search.run`           — run a query, return ranked results (read-only).
//   · `conversation.index`   — index/re-index one conversation (runtime path).
//   · `conversation.indexBulk` — chunked bulk index, emitting `index.progress`.
//
// After a write that changed the index, the worker broadcasts `state.changed` so
// every open tab's search overlay re-queries (multi-tab consistency). Bulk runs
// additionally broadcast `index.progress` per chunk for the future C11 indicator.

import { broadcast, registerHandler } from '../messaging';
import { workspaceStore } from '../store';
import { runSearch } from '../search';
import type { IndexInput, Query, SearchResult } from '../../shared/types';
import { bulkIndex, indexConversation } from './pipeline';

declare module '../../shared/messages' {
  interface RequestContracts {
    'search.run': { request: { query: Query }; response: SearchResult[] };
    'conversation.index': { request: { input: IndexInput }; response: { indexed: boolean } };
    'conversation.indexBulk': {
      request: { inputs: IndexInput[] };
      response: { done: number; total: number };
    };
  }
}

/** The stores a (re)index touches — the search overlay re-queries on this. */
const INDEX_STORES = ['conversations', 'searchPostings'];

/** Register the search/index handlers (worker). Call at module load (SW-3). */
export function registerSearchHandlers(): void {
  registerHandler('search.run', async (req) => {
    return runSearch(await workspaceStore(), req.query);
  });

  registerHandler('conversation.index', async (req) => {
    const indexed = await indexConversation(await workspaceStore(), req.input);
    // Only fan out when the index actually changed — an unchanged re-visit
    // (idempotent no-op) must not wake every tab into a re-query.
    if (indexed) await broadcast({ kind: 'state.changed', stores: INDEX_STORES });
    return { indexed };
  });

  registerHandler('conversation.indexBulk', async (req) => {
    const result = await bulkIndex(await workspaceStore(), req.inputs, (done, total) => {
      void broadcast({ kind: 'index.progress', done, total });
    });
    if (result.done > 0) await broadcast({ kind: 'state.changed', stores: INDEX_STORES });
    return result;
  });
}
