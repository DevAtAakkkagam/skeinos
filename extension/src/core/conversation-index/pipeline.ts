// The ingest pipeline: adapter messages → normalized text → contentHash →
// `ConversationIndex` + postings. Runs in the service worker (the single writer);
// the content-script adapter only reads the DOM and ships message text over the
// messaging hub. Two invariants make it safe under MV3's crash-on-idle worker:
//   · idempotent — an unchanged `contentHash` is a no-op, so re-visiting a
//     conversation costs one hash and writes nothing (D-3);
//   · crash-safe — postings are written before the record, and a re-index always
//     re-derives a document's postings and scrubs them by `docId` first, so an
//     interrupted run leaves indexed conversations queryable and the rest
//     re-indexable with no duplicate postings (D-4).
//
// Privacy: `ConversationIndex`, `indexedText`, and the postings are all local-only
// and never enter the sync envelope (PRIV-1) — `conversations` and `searchPostings`
// are `synced: false` stores.

import type { ConversationIndex, IndexInput, SearchEngine, SearchShard } from '../../shared/types';
import type { Repo } from '../store/repo';
import { hashContent, indexableText } from '../search/normalize';
import {
  applyPostingsBatch,
  indexPostings,
  removePostings,
  runSearch,
  type IndexEntry,
} from '../search/engine';

import { bodyFromMessages, type IndexableMessage } from './pipeline-types';

interface StoreLike {
  searchPostings: Repo<SearchShard>;
  conversations: Repo<ConversationIndex>;
}

export { bodyFromMessages, type IndexableMessage };

/** Default chunk size for bulk indexing — small enough to yield often, large
 *  enough that per-shard batching amortizes hot-shard writes (D-4). */
const BULK_CHUNK = 25;

/** Build the persisted record, overwriting only content-derived fields and
 *  preserving every local organization field from the previous record (D-3). */
function buildRecord(
  input: IndexInput,
  indexedText: string,
  titleTokenCount: number,
  contentHash: string,
  prev: ConversationIndex | undefined,
): ConversationIndex {
  return {
    id: input.id,
    platform: input.platform,
    nativeId: input.nativeId,
    // Content-derived fields (overwritten on re-index):
    title: input.title,
    indexedText,
    titleTokenCount,
    contentHash,
    updatedAt: input.updatedAt ?? Date.now(),
    // Local organization state — preserved verbatim, never reset by indexing:
    folderId: prev?.folderId ?? null,
    tags: prev?.tags ?? [],
    pinned: prev?.pinned,
    archived: prev?.archived,
    color: prev?.color,
  };
}

/** Recover the previously-indexed body text (normalized tokens) from a stored
 *  record, using its `titleTokenCount` boundary. Empty when never content-indexed.
 *  Returns `null` for a legacy record that carries content but no boundary — the
 *  caller then leaves that richer index untouched rather than guessing the split. */
function recoverBody(prev: ConversationIndex | undefined): string | null {
  if (!prev || !prev.indexedText) return '';
  if (prev.titleTokenCount === undefined) return null; // legacy content — don't downgrade
  return prev.indexedText.split(' ').slice(prev.titleTokenCount).join(' ');
}

/**
 * Index (or re-index) one conversation. Resolves `true` when it wrote, `false` on
 * an idempotent no-op (unchanged `contentHash`). Writes postings before the record
 * so a crash between the two is recovered by the next re-index (which scrubs by
 * `docId`), never leaving duplicate postings.
 */
export async function indexConversation(store: StoreLike, input: IndexInput): Promise<boolean> {
  const { text: indexedText, titleTokenCount } = indexableText(input.title, input.body);
  const contentHash = hashContent(indexedText);
  const prev = await store.conversations.get(input.id);
  if (prev && prev.contentHash === contentHash) return false;

  await indexPostings(store, input.id, prev?.indexedText, indexedText, titleTokenCount);
  await store.conversations.put(buildRecord(input, indexedText, titleTokenCount, contentHash, prev));
  return true;
}

/**
 * Index a conversation known only by its list metadata (title, no message bodies) —
 * the list-ingest path. Makes every listed conversation title-searchable
 * immediately, even before it is opened, while PRESERVING any body already indexed
 * from a full read (so a title-only ingest never downgrades a richer index). A
 * legacy record that carries content but no `titleTokenCount` boundary is left
 * untouched (its title is already in its title+body index).
 */
export async function indexConversationTitle(
  store: StoreLike,
  meta: { id: string; platform: IndexInput['platform']; nativeId: string; title: string; updatedAt?: number },
): Promise<boolean> {
  const prev = await store.conversations.get(meta.id);
  const body = recoverBody(prev);
  if (body === null) return false; // legacy content record — leave it intact
  return indexConversation(store, { ...meta, body });
}

/** Convenience wrapper for callers holding adapter `Message[]`. */
export function indexConversationFromMessages(
  store: StoreLike,
  input: Omit<IndexInput, 'body'> & { messages: IndexableMessage[] },
): Promise<boolean> {
  const { messages, ...rest } = input;
  return indexConversation(store, { ...rest, body: bodyFromMessages(messages) });
}

/**
 * Remove a conversation from the index: subtract its postings (derived by
 * re-tokenizing its stored `indexedText`) and delete its `ConversationIndex`
 * record. A no-op when the conversation was never indexed.
 */
export async function removeConversation(store: StoreLike, id: string): Promise<void> {
  const prev = await store.conversations.get(id);
  if (!prev) return;
  await removePostings(store, id, prev.indexedText);
  await store.conversations.delete(id);
}

/** Yield to the macrotask queue between chunks so a bulk run never monopolizes the
 *  worker (and so the SW can service other messages). */
function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Bulk-index many conversations in synchronous chunks, persisting each chunk before
 * yielding (best-effort — D-4). Within a chunk, postings for all changed documents
 * are applied per shard in one pass so a hot prefix is written once per chunk, not
 * once per document. `onProgress(done, total)` fires after each chunk so the worker
 * can broadcast `index.progress`.
 */
export async function bulkIndex(
  store: StoreLike,
  inputs: IndexInput[],
  onProgress?: (done: number, total: number) => void,
  chunkSize: number = BULK_CHUNK,
): Promise<{ done: number; total: number }> {
  const total = inputs.length;
  let done = 0;
  for (let i = 0; i < inputs.length; i += chunkSize) {
    const chunk = inputs.slice(i, i + chunkSize);
    const entries: IndexEntry[] = [];
    const records: ConversationIndex[] = [];
    for (const input of chunk) {
      const { text: indexedText, titleTokenCount } = indexableText(input.title, input.body);
      const contentHash = hashContent(indexedText);
      const prev = await store.conversations.get(input.id);
      if (prev && prev.contentHash === contentHash) continue; // idempotent skip
      entries.push({ docId: input.id, prevIndexedText: prev?.indexedText, newIndexedText: indexedText, titleTokenCount });
      records.push(buildRecord(input, indexedText, titleTokenCount, contentHash, prev));
    }
    if (entries.length > 0) {
      await applyPostingsBatch(store, entries);
      for (const record of records) await store.conversations.put(record);
    }
    done += chunk.length;
    onProgress?.(done, total);
    await yieldToLoop();
  }
  return { done, total };
}

/** Bundle the pipeline + query into the {@link SearchEngine} contract. */
export function createSearchEngine(store: StoreLike): SearchEngine {
  return {
    index: (input) => indexConversation(store, input),
    remove: (id) => removeConversation(store, id),
    search: (query) => runSearch(store, query),
  };
}
