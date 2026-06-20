// The postings engine: shard add/remove (incremental, per document) and query
// (intersect → filter → rank → highlight → page). Runs in the service worker (the
// single writer) over the `searchPostings` + `conversations` repos. The shard math
// is the load-bearing part: a document's postings are fully derivable from its
// normalized text, so removal re-tokenizes the *previous* text rather than keeping
// a reverse index that could drift under the single-writer + crash-on-idle model
// (D-2).

import type {
  ConversationIndex,
  Posting,
  Query,
  SearchResult,
  SearchShard,
  SnippetSegment,
} from '../../shared/types';
import type { Repo } from '../store/repo';
import { prefixOf, tokenize } from './normalize';

/** Field-frequency boost — title matches outrank equivalent body matches (D-5). */
const FIELD_BOOST: Record<Posting['field'], number> = { title: 3.0, body: 1.0 };
/** Recency half-life in days — a mild decay so newer conversations rank higher. */
const RECENCY_HALF_LIFE_DAYS = 30;
const DAY_MS = 86_400_000;
/** Default page size when a query omits `limit`. */
const DEFAULT_LIMIT = 20;
/** Hard ceiling on a page so a hostile/huge `limit` can't force a giant slice. */
const MAX_LIMIT = 200;
/** Cap on query terms processed — bounds shard loads + intersections per query. */
const MAX_TERMS = 32;
/** Snippet half-window: tokens kept on each side of the first match. */
const SNIPPET_WINDOW = 6;
/** Cap on stored positions per (doc, term, field). A term occurring more than this
 *  in one document is already maximally frequent for ranking; bounding the array
 *  caps shard-record size and per-query scoring cost (the design's "cap positions
 *  stored" mitigation for the <500ms@5k budget). */
const MAX_POSITIONS_PER_POSTING = 64;

interface StoreLike {
  searchPostings: Repo<SearchShard>;
  conversations: Repo<ConversationIndex>;
}

/** Read a term's postings by OWN property only. Shard `terms` maps are plain
 *  objects (and survive an IndexedDB round-trip as such), so a term equal to an
 *  inherited `Object.prototype` key — notably `"constructor"`, which survives
 *  normalization — must never resolve to a prototype member. Guarding the read
 *  keeps such a term a normal miss instead of returning a function and crashing
 *  the index/query paths. */
function ownPostings(terms: Record<string, Posting[]>, term: string): Posting[] | undefined {
  return Object.prototype.hasOwnProperty.call(terms, term) ? terms[term] : undefined;
}

/**
 * Collect postings for a query term with **prefix (type-ahead) matching**: every
 * indexed term in the shard that starts with the query term contributes. Because a
 * term is sharded by its first two characters, all terms sharing the query term's
 * 2-char prefix live in this one shard, so a single shard scan finds every prefix
 * match (e.g. `"ite"` → `"iterative"`, `"item"`). A query term ≥2 chars expands;
 * a 1-char term lands in its own 1-char shard and so degrades to an exact match.
 * `Object.keys` yields own keys only, so an inherited name like `constructor` can
 * never leak in.
 */
function collectPrefixPostings(terms: Record<string, Posting[]>, term: string): Posting[] {
  const out: Posting[] = [];
  for (const key of Object.keys(terms)) {
    if (key === term || key.startsWith(term)) out.push(...terms[key]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Postings — build, add, remove
// ---------------------------------------------------------------------------

/** Group one document's tokens into `prefix → term → postings`, assigning each
 *  token a `title`/`body` field by its position relative to `titleTokenCount`. */
function computeDocPostings(
  docId: string,
  indexedText: string,
  titleTokenCount: number,
): Map<string, Record<string, Posting[]>> {
  const byPrefix = new Map<string, Record<string, Posting[]>>();
  for (const { term, position } of tokenize(indexedText)) {
    const field: Posting['field'] = position < titleTokenCount ? 'title' : 'body';
    const prefix = prefixOf(term);
    let terms = byPrefix.get(prefix);
    if (!terms) byPrefix.set(prefix, (terms = {}));
    let postings = ownPostings(terms, term);
    if (!postings) terms[term] = postings = [];
    let posting = postings.find((p) => p.field === field);
    if (!posting) postings.push((posting = { docId, field, positions: [] }));
    // Cap positions per posting — a runaway repeated term can't unbound the shard.
    if (posting.positions.length < MAX_POSITIONS_PER_POSTING) posting.positions.push(position);
  }
  return byPrefix;
}

/** The set of shard prefixes a document's text touches (for cleanup on update). */
function affectedPrefixes(indexedText: string): Set<string> {
  const set = new Set<string>();
  for (const { term } of tokenize(indexedText)) set.add(prefixOf(term));
  return set;
}

/** Read-modify-write one shard: drop every posting from `removeDocIds`, then merge
 *  `additions`. Returns the next shard, or `null` when it ends up empty (delete). */
function reshapeShard(
  shard: SearchShard | undefined,
  prefix: string,
  removeDocIds: Set<string>,
  additions: Record<string, Posting[]> | undefined,
): SearchShard | null {
  const terms: Record<string, Posting[]> = {};
  // Carry over surviving postings from other documents.
  for (const [term, postings] of Object.entries(shard?.terms ?? {})) {
    const kept = postings.filter((p) => !removeDocIds.has(p.docId));
    if (kept.length > 0) terms[term] = kept;
  }
  // Merge this batch's additions (own-property reads — never through the proto).
  for (const [term, postings] of Object.entries(additions ?? {})) {
    terms[term] = [...(ownPostings(terms, term) ?? []), ...postings];
  }
  return Object.keys(terms).length === 0 ? null : { prefix, terms };
}

/** One document's diff inputs for a batched shard apply. */
export interface IndexEntry {
  docId: string;
  /** Previous normalized text (re-tokenized to find postings to remove), if any. */
  prevIndexedText?: string;
  newIndexedText: string;
  titleTokenCount: number;
}

/**
 * Apply many documents' postings in one pass, touching each affected shard exactly
 * once (the hot-shard contention guard from the design's risks). Used by both the
 * single-document path (a batch of one) and bulk indexing.
 */
export async function applyPostingsBatch(store: StoreLike, entries: IndexEntry[]): Promise<void> {
  // Per prefix: which docIds to scrub, and the postings to add.
  const removeByPrefix = new Map<string, Set<string>>();
  const addByPrefix = new Map<string, Record<string, Posting[]>>();

  const touch = (prefix: string, docId: string) => {
    let set = removeByPrefix.get(prefix);
    if (!set) removeByPrefix.set(prefix, (set = new Set()));
    set.add(docId);
  };

  for (const entry of entries) {
    // Old prefixes must be scrubbed even when the new text no longer uses them.
    if (entry.prevIndexedText) {
      for (const prefix of affectedPrefixes(entry.prevIndexedText)) touch(prefix, entry.docId);
    }
    const docPostings = computeDocPostings(entry.docId, entry.newIndexedText, entry.titleTokenCount);
    for (const [prefix, terms] of docPostings) {
      touch(prefix, entry.docId);
      const target = addByPrefix.get(prefix) ?? {};
      for (const [term, postings] of Object.entries(terms)) {
        target[term] = [...(ownPostings(target, term) ?? []), ...postings];
      }
      addByPrefix.set(prefix, target);
    }
  }

  const prefixes = new Set([...removeByPrefix.keys(), ...addByPrefix.keys()]);
  for (const prefix of prefixes) {
    const shard = await store.searchPostings.get(prefix);
    const next = reshapeShard(
      shard,
      prefix,
      removeByPrefix.get(prefix) ?? new Set(),
      addByPrefix.get(prefix),
    );
    if (next) await store.searchPostings.put(next);
    else if (shard) await store.searchPostings.delete(prefix);
  }
}

/** Add/replace a single document's postings (re-tokenizing `prevIndexedText` to
 *  scrub the old ones first). */
export function indexPostings(
  store: StoreLike,
  docId: string,
  prevIndexedText: string | undefined,
  newIndexedText: string,
  titleTokenCount: number,
): Promise<void> {
  return applyPostingsBatch(store, [{ docId, prevIndexedText, newIndexedText, titleTokenCount }]);
}

/** Remove a single document's postings, derived from its previous normalized text. */
export async function removePostings(
  store: StoreLike,
  docId: string,
  prevIndexedText: string,
): Promise<void> {
  const removeByPrefix = new Map<string, Set<string>>();
  for (const prefix of affectedPrefixes(prevIndexedText)) {
    removeByPrefix.set(prefix, new Set([docId]));
  }
  for (const [prefix, removeDocIds] of removeByPrefix) {
    const shard = await store.searchPostings.get(prefix);
    if (!shard) continue;
    const next = reshapeShard(shard, prefix, removeDocIds, undefined);
    if (next) await store.searchPostings.put(next);
    else await store.searchPostings.delete(prefix);
  }
}

// ---------------------------------------------------------------------------
// Query — intersect, filter, rank, highlight, page
// ---------------------------------------------------------------------------

/** Recency multiplier in `(0.5, 1]`: 1.0 for a just-updated conversation, decaying
 *  by half every `RECENCY_HALF_LIFE_DAYS` toward a 0.5 floor (a mild tilt, never a
 *  dominating term). */
function recencyFactor(updatedAt: number, now: number): number {
  const ageDays = Math.max(0, (now - updatedAt) / DAY_MS);
  return 0.5 + 0.5 * Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

/** Does `conv` satisfy every supplied filter? Archived are excluded unless the
 *  filter opts them in; the tag filter is inert until tags ship (C7). */
function passesFilters(conv: ConversationIndex, filters: Query['filters']): boolean {
  if (!filters) return !conv.archived; // default: hide archived
  if (filters.platform && conv.platform !== filters.platform) return false;
  if (filters.updatedAfter != null && conv.updatedAt < filters.updatedAfter) return false;
  if (filters.updatedBefore != null && conv.updatedAt > filters.updatedBefore) return false;
  if (filters.folderId !== undefined && conv.folderId !== filters.folderId) return false;
  // Archived stay indexed and queryable; surface them only when asked.
  if (!filters.archived && conv.archived) return false;
  // C7 seam: forward-compatible tag filter. Inert while no conversation carries
  // tags — an untagged conversation is never excluded, so this is a no-op today.
  if (filters.tag && conv.tags.length > 0 && !conv.tags.includes(filters.tag)) return false;
  return true;
}

/** Build a fixed-window highlighted snippet around the first matched position. */
function buildSnippet(indexedText: string, matchPositions: Set<number>): SnippetSegment[] {
  if (matchPositions.size === 0) return [];
  const tokens = indexedText.split(' ');
  const first = Math.min(...matchPositions);
  const start = Math.max(0, first - SNIPPET_WINDOW);
  const end = Math.min(tokens.length, first + SNIPPET_WINDOW + 1);
  const segments: SnippetSegment[] = [];
  for (let i = start; i < end; i++) {
    segments.push({ text: tokens[i], match: matchPositions.has(i) });
  }
  return segments;
}

/**
 * Run a query: normalize terms with the same pipeline used at index time, load the
 * shards by prefix, intersect each term's posting lists smallest-first (AND), apply
 * filters, score (tf × field-boost × recency), and return the requested page in
 * score order with highlighted snippets. Each query term **prefix-matches** indexed
 * terms (type-ahead): typing `"ite"` finds `"iterative"`, while AND across terms
 * still requires every query term to match something in a document.
 */
export async function runSearch(store: StoreLike, query: Query): Promise<SearchResult[]> {
  // Normalize + de-dupe query terms through the identical tokenizer, then bound the
  // count so a hostile many-term query can't force unbounded shard loads.
  const terms = [...new Set(query.terms.flatMap((t) => tokenize(t).map((x) => x.term)))].slice(
    0,
    MAX_TERMS,
  );
  if (terms.length === 0) return [];

  // Load each distinct shard once.
  const shards = new Map<string, SearchShard | undefined>();
  for (const prefix of new Set(terms.map(prefixOf))) {
    shards.set(prefix, await store.searchPostings.get(prefix));
  }

  // For each term, map docId → its (prefix-matched) postings. A term that matches
  // nothing means the AND can never be satisfied, so the whole query is empty.
  const perTerm: { docMap: Map<string, Posting[]> }[] = [];
  for (const term of terms) {
    const shardTerms = shards.get(prefixOf(term))?.terms;
    const postings = shardTerms ? collectPrefixPostings(shardTerms, term) : [];
    if (postings.length === 0) return [];
    const docMap = new Map<string, Posting[]>();
    for (const p of postings) {
      const list = docMap.get(p.docId);
      if (list) list.push(p);
      else docMap.set(p.docId, [p]);
    }
    perTerm.push({ docMap });
  }

  // Intersect smallest-list-first (AND semantics).
  perTerm.sort((a, b) => a.docMap.size - b.docMap.size);
  let candidates = [...perTerm[0].docMap.keys()];
  for (let i = 1; i < perTerm.length && candidates.length > 0; i++) {
    const next = perTerm[i].docMap;
    candidates = candidates.filter((docId) => next.has(docId));
  }
  if (candidates.length === 0) return [];

  // Fetch candidate metadata in parallel so idb pipelines the reads, rather than
  // serializing one awaited round-trip per candidate.
  const convs = await Promise.all(candidates.map((docId) => store.conversations.get(docId)));

  const now = Date.now();
  const scored: SearchResult[] = [];
  for (let c = 0; c < candidates.length; c++) {
    const docId = candidates[c];
    const conv = convs[c];
    if (!conv || !passesFilters(conv, query.filters)) continue;

    let raw = 0;
    const matchPositions = new Set<number>();
    for (const { docMap } of perTerm) {
      for (const posting of docMap.get(docId) ?? []) {
        raw += posting.positions.length * FIELD_BOOST[posting.field];
        for (const pos of posting.positions) matchPositions.add(pos);
      }
    }
    scored.push({
      docId,
      platform: conv.platform,
      nativeId: conv.nativeId,
      title: conv.title,
      score: raw * recencyFactor(conv.updatedAt, now),
      snippet: buildSnippet(conv.indexedText, matchPositions),
      folderId: conv.folderId,
      updatedAt: conv.updatedAt,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  return scored.slice(offset, offset + limit);
}
