// Content/UI-side search + indexing client. Imports only `send`/`sendWithRetry`
// and payload types — never the engine or the store — so the content-script and
// side-panel bundles stay free of IndexedDB and the postings code. The request-kind
// contracts are declared in `handlers.ts`; declaration merging is global, so these
// calls are fully typed here without importing the worker module.

import { sendWithRetry } from '../messaging';
import type { Response } from '../../shared/messages';
import type { IndexInput, Query, SearchResult } from '../../shared/types';
import { bodyFromMessages, type IndexableMessage } from './pipeline-types';

/** Run a search against the worker. Reads are idempotent, so they opt into the
 *  transport's transient-retry — a cold/waking worker recovers transparently. */
export function searchRemote(query: Query): Promise<Response<SearchResult[]>> {
  return sendWithRetry({ kind: 'search.run', query });
}

/** Index one conversation through the worker (the single writer). Indexing is
 *  idempotent (content-hash gated), so a lost ack is safe to retry. */
export function indexConversationRemote(
  input: IndexInput,
): Promise<Response<{ indexed: boolean }>> {
  return sendWithRetry({ kind: 'conversation.index', input });
}

/** Build an {@link IndexInput} from adapter-read messages and index it. Lets the
 *  content script ship `Message[]` without the worker importing `adapters/`. */
export function indexConversationFromMessagesRemote(
  input: Omit<IndexInput, 'body'> & { messages: IndexableMessage[] },
): Promise<Response<{ indexed: boolean }>> {
  const { messages, ...rest } = input;
  return indexConversationRemote({ ...rest, body: bodyFromMessages(messages) });
}

/** Bulk-index many conversations. Idempotent, so retry-safe. */
export function indexBulkRemote(
  inputs: IndexInput[],
): Promise<Response<{ done: number; total: number }>> {
  return sendWithRetry({ kind: 'conversation.indexBulk', inputs });
}
