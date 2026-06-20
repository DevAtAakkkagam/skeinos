// search engine query/rank/highlight coverage (OpenSpec task 4.6).
// Vitest + fake-indexeddb. Each `it` maps to roughly one spec scenario:
// AND-only matching, title>body ranking, filters (platform/folder/date),
// archived default-exclude/opt-in, score-ordered paging, inert tag filter,
// and bounded highlighted snippets.
//
// Terms are chosen to survive the light stemmer in src/core/search/normalize.ts
// unchanged (no trailing -s/-ies/-ses, length-stable) so assertions stay exact:
// e.g. "kestrel", "obsidian", "tungsten", "marigold", "zephyr", "quartz".

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { runSearch, indexPostings } from '../src/core/search/engine';
import { indexConversation } from '../src/core/conversation-index/pipeline';
import { stem } from '../src/core/search/normalize';
import type { IndexInput, PlatformId, Query, SearchResult } from '../src/shared/types';

let dbCounter = 0;

async function freshStore(): Promise<WorkspaceStore> {
  const name = `skeinos-search-${dbCounter++}`;
  const db = await openDb(name);
  return makeWorkspaceStore(db);
}

const FIXED = 1_700_000_000_000; // a stable epoch so recency is identical across docs

function input(over: Partial<IndexInput> & { id: string }): IndexInput {
  return {
    platform: 'claude',
    nativeId: `native-${over.id}`,
    title: '',
    body: '',
    updatedAt: FIXED,
    ...over,
  };
}

async function index(store: WorkspaceStore, over: Partial<IndexInput> & { id: string }) {
  await indexConversation(store, input(over));
}

function ids(results: SearchResult[]): string[] {
  return results.map((r) => r.docId);
}

describe('AND-only matching (4.6)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('returns only docs containing BOTH terms; single-term docs are excluded', async () => {
    await index(store, { id: 'both', body: 'the kestrel and the obsidian rested here' });
    await index(store, { id: 'only-a', body: 'a lonely kestrel circled overhead' });
    await index(store, { id: 'only-b', body: 'a polished obsidian blade lay flat' });
    await index(store, { id: 'neither', body: 'nothing relevant appears in this body' });

    const results = await runSearch(store, { terms: ['kestrel', 'obsidian'] });
    expect(ids(results).sort()).toEqual(['both']);
  });
});

describe('Title outranks equivalent body match (4.6)', () => {
  it('a title-field match scores higher than the same term only in body (recency cancels)', async () => {
    const store = await freshStore();
    // Same updatedAt => identical recency factor, so the only differentiator is
    // the field boost (title 3.0 vs body 1.0).
    await index(store, { id: 'in-title', title: 'tungsten', body: 'unrelated filler words here today' });
    await index(store, { id: 'in-body', title: 'unrelated filler', body: 'tungsten appears once below' });

    const results = await runSearch(store, { terms: ['tungsten'] });
    expect(ids(results)).toEqual(['in-title', 'in-body']);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});

describe('Filters constrain results (4.6)', () => {
  let store: WorkspaceStore;
  const TERM = 'marigold';

  beforeEach(async () => {
    store = await freshStore();
    // A spread of platforms, folders, and timestamps — all share TERM.
    await index(store, { id: 'claude-f1', platform: 'claude', body: `${TERM} alpha`, updatedAt: 1000 });
    await index(store, { id: 'gemini-f1', platform: 'gemini', body: `${TERM} beta`, updatedAt: 2000 });
    await index(store, { id: 'claude-f2', platform: 'claude', body: `${TERM} gamma`, updatedAt: 3000 });
    await index(store, { id: 'claude-unfiled', platform: 'claude', body: `${TERM} delta`, updatedAt: 4000 });
    // Assign folders by read-modify-write on the conversation record.
    await setFolder(store, 'claude-f1', 'F1');
    await setFolder(store, 'gemini-f1', 'F1');
    await setFolder(store, 'claude-f2', 'F2');
    // claude-unfiled keeps folderId: null
  });

  async function setFolder(s: WorkspaceStore, id: string, folderId: string) {
    const rec = await s.conversations.get(id);
    await s.conversations.put({ ...rec!, folderId });
  }

  it('filters.platform narrows to one platform', async () => {
    const platform: PlatformId = 'gemini';
    const results = await runSearch(store, { terms: [TERM], filters: { platform } });
    expect(ids(results)).toEqual(['gemini-f1']);
  });

  it('filters.folderId narrows to one folder', async () => {
    const results = await runSearch(store, { terms: [TERM], filters: { folderId: 'F1' } });
    expect(ids(results).sort()).toEqual(['claude-f1', 'gemini-f1']);
  });

  it('filters.folderId === null returns only unfiled conversations', async () => {
    const results = await runSearch(store, { terms: [TERM], filters: { folderId: null } });
    expect(ids(results)).toEqual(['claude-unfiled']);
  });

  it('updatedAfter / updatedBefore bound the date range (inclusive)', async () => {
    const results = await runSearch(store, {
      terms: [TERM],
      filters: { updatedAfter: 2000, updatedBefore: 3000 },
    });
    expect(ids(results).sort()).toEqual(['claude-f2', 'gemini-f1']);
  });
});

describe('Archived excluded by default, returned when requested (4.6)', () => {
  it('default query hides archived; filters.archived:true surfaces it, postings intact', async () => {
    const store = await freshStore();
    await index(store, { id: 'arc', body: 'a zephyr drifted past the window' });

    // Mark archived via read-modify-write; the record (and its postings) stay indexed.
    const rec = await store.conversations.get('arc');
    await store.conversations.put({ ...rec!, archived: true });

    const def = await runSearch(store, { terms: ['zephyr'] });
    expect(ids(def)).toEqual([]); // hidden by default

    const opted = await runSearch(store, { terms: ['zephyr'], filters: { archived: true } });
    expect(ids(opted)).toEqual(['arc']); // surfaced on request

    // Postings still exist underneath — archiving never scrubbed the index.
    const shard = await store.searchPostings.get('ze'); // prefixOf('zephyr')
    expect(shard?.terms['zephyr']?.some((p) => p.docId === 'arc')).toBe(true);
  });
});

describe('Paging is score-ordered (4.6)', () => {
  it('offset/limit slice the descending-score list', async () => {
    const store = await freshStore();
    const N = 25; // > default limit of 20
    // Give each doc a distinct term frequency so scores are strictly ordered:
    // doc k has the term repeated (N - k) times => higher k ranks lower.
    for (let k = 0; k < N; k++) {
      const reps = N - k;
      await index(store, { id: `d${k}`, body: Array(reps).fill('quartz').join(' ') });
    }

    const full = await runSearch(store, { terms: ['quartz'], limit: N });
    expect(full).toHaveLength(N);
    // Strictly descending scores overall.
    for (let i = 1; i < full.length; i++) {
      expect(full[i - 1].score).toBeGreaterThanOrEqual(full[i].score);
    }

    // Default page caps at 20.
    const firstPage = await runSearch(store, { terms: ['quartz'] });
    expect(firstPage).toHaveLength(20);
    expect(ids(firstPage)).toEqual(ids(full).slice(0, 20));

    // offset+limit window matches the same slice of the full ordering.
    const page = await runSearch(store, { terms: ['quartz'], offset: 5, limit: 7 });
    expect(ids(page)).toEqual(ids(full).slice(5, 12));
  });
});

describe('Tag filter inert with no tags (4.6)', () => {
  it('filters.tag is a no-op while no conversation carries tags', async () => {
    const store = await freshStore();
    await index(store, { id: 'a', body: 'the kestrel soared above' });
    await index(store, { id: 'b', body: 'another kestrel nearby' });

    const baseline = await runSearch(store, { terms: ['kestrel'] });
    const withTag = await runSearch(store, { terms: ['kestrel'], filters: { tag: 'x' } });
    expect(ids(withTag).sort()).toEqual(ids(baseline).sort());
    expect(withTag).toHaveLength(2);
  });
});

describe('Snippet highlights matched positions within a bounded window (4.6)', () => {
  it('a snippet is a {text,match}[] with a matched segment equal to the query term', async () => {
    const store = await freshStore();
    const filler = Array(40).fill('padding').join(' ');
    await index(store, { id: 's', body: `${filler} obsidian ${filler}` });

    const [hit] = await runSearch(store, { terms: ['obsidian'] });
    expect(hit).toBeDefined();
    expect(Array.isArray(hit.snippet)).toBe(true);

    const matched = hit.snippet.filter((seg) => seg.match);
    expect(matched.length).toBeGreaterThan(0);
    // The matched segment equals the normalized/stemmed query term.
    expect(matched.some((seg) => seg.text === stem('obsidian'))).toBe(true);

    // Window is bounded — not the whole ~80-token document.
    expect(hit.snippet.length).toBeLessThanOrEqual(13); // SNIPPET_WINDOW*2 + 1
    expect(hit.snippet.length).toBeLessThan(40);
  });
});

describe('Empty / unmatched queries (4.6, defensive)', () => {
  it('an empty term list returns no results', async () => {
    const store = await freshStore();
    await index(store, { id: 'a', body: 'kestrel here' });
    expect(await runSearch(store, { terms: [] })).toEqual([]);
  });

  it('a term with no postings returns no results', async () => {
    const store = await freshStore();
    await index(store, { id: 'a', body: 'kestrel here' });
    expect(await runSearch(store, { terms: ['nonexistentword'] })).toEqual([]);
  });

  // Sanity: indexPostings is exercised indirectly above; assert the export exists
  // so a refactor that drops it from the engine surface is caught here too.
  it('engine exposes indexPostings', () => {
    expect(typeof indexPostings).toBe('function');
  });
});

// Keep a reference to Query type so the import is used and type errors surface.
const _typecheck: Query = { terms: ['x'] };
void _typecheck;

describe('Prefix (type-ahead) matching', () => {
  it('matches an indexed term by a typed prefix ("ite" finds "iterative")', async () => {
    const store = await freshStore();
    await index(store, { id: 'it1', title: 'Iterative data model design' });
    await index(store, { id: 'other', title: 'Photo gallery layout' });

    // The full word matches…
    expect(ids(await runSearch(store, { terms: ['iterative'] }))).toContain('it1');
    // …and so does an in-progress prefix of it.
    expect(ids(await runSearch(store, { terms: ['ite'] }))).toContain('it1');
    expect(ids(await runSearch(store, { terms: ['iter'] }))).toContain('it1');
    // A prefix that no indexed term starts with returns nothing.
    expect(await runSearch(store, { terms: ['itez'] })).toEqual([]);
    // The unrelated doc is never pulled in by the prefix.
    expect(ids(await runSearch(store, { terms: ['ite'] }))).not.toContain('other');
  });

  it('AND still holds across prefix terms', async () => {
    const store = await freshStore();
    await index(store, { id: 'both', title: 'iterative modeling workshop' });
    await index(store, { id: 'one', title: 'iterative cooking class' });
    // "iter" + "model" → only the doc whose words match BOTH prefixes.
    expect(ids(await runSearch(store, { terms: ['iter', 'model'] }))).toEqual(['both']);
  });

  it('highlights the full matched word for a prefix query', async () => {
    const store = await freshStore();
    await index(store, { id: 'h1', title: 'iterative design', body: 'we iterate often' });
    const [hit] = await runSearch(store, { terms: ['iter'] });
    expect(hit).toBeDefined();
    const marked = hit.snippet.filter((s) => s.match).map((s) => s.text);
    // The stored token (full word) is highlighted, not the typed fragment.
    expect(marked).toContain(stem('iterative'));
  });
});
