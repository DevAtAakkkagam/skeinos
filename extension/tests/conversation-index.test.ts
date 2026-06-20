// conversation-index ingest pipeline coverage (OpenSpec task 3.7).
// Vitest + fake-indexeddb. Each `describe` maps to roughly one scenario:
// fixture round-trip, idempotent no-op, edited re-submit (postings replaced,
// org-state preserved), removal, interrupted-then-resumed bulk, and progress.

import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { prefixOf } from '../src/core/search';
import { runSearch } from '../src/core/search/engine';
import {
  bulkIndex,
  indexConversation,
  indexConversationFromMessages,
  indexConversationTitle,
  removeConversation,
} from '../src/core/conversation-index/pipeline';
import type { IndexInput, SearchResult } from '../src/shared/types';

let dbCounter = 0;

async function freshStore(): Promise<WorkspaceStore> {
  const name = `skeinos-cidx-${dbCounter++}`;
  const db = await openDb(name);
  return makeWorkspaceStore(db);
}

/** Did `runSearch` for `term` return a hit for `docId`? `includeArchived` opts in
 *  the archived docs the engine hides by default (used when a doc is archived). */
async function found(
  store: WorkspaceStore,
  term: string,
  docId: string,
  includeArchived = false,
): Promise<boolean> {
  const results: SearchResult[] = await runSearch(store, {
    terms: [term],
    filters: includeArchived ? { archived: true } : undefined,
  });
  return results.some((r) => r.docId === docId);
}

describe('Fixture index round-trip (3.7)', () => {
  it('indexes title + message bodies and makes both queryable, persisting the record', async () => {
    const store = await freshStore();
    const updatedAt = 1_700_000_000_000;
    await indexConversationFromMessages(store, {
      id: 'c1',
      platform: 'claude',
      nativeId: 'native-c1',
      title: 'Photosynthesis explained',
      updatedAt,
      messages: [
        { text: 'Chloroplasts absorb sunlight to drive carbon fixation.' },
        { text: 'The byproduct is molecular oxygen released into the air.' },
      ],
    });

    // A title term and a body term both resolve to the doc.
    expect(await found(store, 'photosynthesis', 'c1')).toBe(true);
    expect(await found(store, 'chloroplasts', 'c1')).toBe(true);

    // The persisted ConversationIndex record carries the expected fields.
    const rec = await store.conversations.get('c1');
    expect(rec).toBeDefined();
    expect(rec!.id).toBe('c1');
    expect(rec!.platform).toBe('claude');
    expect(rec!.nativeId).toBe('native-c1');
    expect(rec!.title).toBe('Photosynthesis explained');
    expect(rec!.folderId).toBeNull();
    expect(rec!.tags).toEqual([]);
    expect(rec!.indexedText.length).toBeGreaterThan(0);
    expect(rec!.contentHash.length).toBeGreaterThan(0);
    expect(rec!.updatedAt).toBe(updatedAt);
  });
});

describe('Unchanged re-submit writes nothing (3.7)', () => {
  it('returns false and leaves the record + postings byte-identical', async () => {
    const store = await freshStore();
    const input: IndexInput = {
      id: 'c2',
      platform: 'gemini',
      nativeId: 'native-c2',
      title: 'Tides and the moon',
      body: 'Gravitational pull from the moon raises ocean tides twice daily.',
      updatedAt: 1_700_000_111_000,
    };

    const firstWrote = await indexConversation(store, input);
    expect(firstWrote).toBe(true);

    const recBefore = await store.conversations.get('c2');
    const postingsBefore = await store.searchPostings.query();

    // Identical content → idempotent no-op.
    const secondWrote = await indexConversation(store, { ...input });
    expect(secondWrote).toBe(false);

    const recAfter = await store.conversations.get('c2');
    const postingsAfter = await store.searchPostings.query();

    expect(recAfter).toEqual(recBefore);
    expect(postingsAfter).toEqual(postingsBefore);
  });
});

describe('Edited re-submit replaces postings and preserves org-state (3.7)', () => {
  it('swaps content terms while keeping pinned/archived/color/folderId/tags', async () => {
    const store = await freshStore();
    await indexConversation(store, {
      id: 'c3',
      platform: 'claude',
      nativeId: 'native-c3',
      title: 'Original notes',
      body: 'discussing kangaroo migration patterns across grassland',
      updatedAt: 1,
    });
    expect(await found(store, 'kangaroo', 'c3')).toBe(true);

    // The user sets organization state directly on the record.
    const rec = await store.conversations.get('c3');
    expect(rec).toBeDefined();
    await store.conversations.put({
      ...rec!,
      pinned: true,
      archived: true,
      color: '#abc',
      folderId: 'f1',
      tags: ['t'],
    });

    // Re-index the SAME id with changed body text.
    const wrote = await indexConversation(store, {
      id: 'c3',
      platform: 'claude',
      nativeId: 'native-c3',
      title: 'Original notes',
      body: 'discussing penguin nesting habits along antarctic shoreline',
      updatedAt: 2,
    });
    expect(wrote).toBe(true);

    // New content terms are queryable; old-only terms are gone. The doc is
    // archived, so opt archived docs into the result set for these checks.
    expect(await found(store, 'penguin', 'c3', true)).toBe(true);
    expect(await found(store, 'kangaroo', 'c3', true)).toBe(false);
    expect(await found(store, 'grassland', 'c3', true)).toBe(false);

    // Organization state survives the re-index.
    const updated = await store.conversations.get('c3');
    expect(updated!.pinned).toBe(true);
    expect(updated!.archived).toBe(true);
    expect(updated!.color).toBe('#abc');
    expect(updated!.folderId).toBe('f1');
    expect(updated!.tags).toEqual(['t']);
  });
});

describe('Removal clears only that doc’s postings (3.7)', () => {
  it('drops the removed doc but keeps the other for a shared term', async () => {
    const store = await freshStore();
    const shared = 'photon'; // a term both docs carry, won't be stemmed
    await indexConversation(store, {
      id: 'docA',
      platform: 'claude',
      nativeId: 'na',
      title: 'Quantum A',
      body: `a photon travels through wormhole alpha`,
      updatedAt: 1,
    });
    await indexConversation(store, {
      id: 'docB',
      platform: 'gemini',
      nativeId: 'nb',
      title: 'Quantum B',
      body: `a photon travels through wormhole beta`,
      updatedAt: 1,
    });

    expect(await found(store, shared, 'docA')).toBe(true);
    expect(await found(store, shared, 'docB')).toBe(true);

    await removeConversation(store, 'docA');

    // Removed doc's record is gone and it no longer matches.
    expect(await store.conversations.get('docA')).toBeUndefined();
    expect(await found(store, shared, 'docA')).toBe(false);
    expect(await found(store, 'alpha', 'docA')).toBe(false);

    // The other doc still matches the shared term — its postings survived.
    expect(await found(store, shared, 'docB')).toBe(true);
  });
});

describe('Interrupted bulk run resumes without duplicate postings (3.7)', () => {
  it('re-processing the first chunk produces no duplicate postings', async () => {
    const store = await freshStore();
    const TOTAL = 60;
    const inputs: IndexInput[] = [];
    for (let i = 0; i < TOTAL; i++) {
      // Each doc carries a globally-unique body term `uniqterm<i>` (no stemming:
      // ends in a digit) so we can locate its single shard precisely.
      inputs.push({
        id: `bulk-${i}`,
        platform: 'claude',
        nativeId: `nb-${i}`,
        title: `Bulk doc ${i}`,
        body: `common shared text uniqterm${i} trailing words`,
        updatedAt: 1,
      });
    }

    // Simulate interruption: only the first 30 are indexed.
    await bulkIndex(store, inputs.slice(0, 30));
    for (let i = 0; i < 30; i++) {
      expect(await found(store, `uniqterm${i}`, `bulk-${i}`)).toBe(true);
    }
    expect(await found(store, `uniqterm45`, `bulk-45`)).toBe(false);

    // Resume over ALL 60 — the first 30 are re-processed (idempotent skips).
    await bulkIndex(store, inputs);
    for (let i = 0; i < TOTAL; i++) {
      expect(await found(store, `uniqterm${i}`, `bulk-${i}`)).toBe(true);
    }

    // For an early doc's unique term, the shard holds exactly one posting per
    // field for that docId — no duplication from re-processing.
    const earlyTerm = 'uniqterm5';
    const shard = await store.searchPostings.get(prefixOf(earlyTerm));
    expect(shard).toBeDefined();
    const postings = shard!.terms[earlyTerm] ?? [];
    const forDoc = postings.filter((p) => p.docId === 'bulk-5');
    expect(forDoc).toHaveLength(1);
    expect(forDoc[0].field).toBe('body');

    // The shared term across all 60 docs has exactly one posting per doc.
    const sharedShard = await store.searchPostings.get(prefixOf('shared'));
    const sharedPostings = sharedShard!.terms['shared'] ?? [];
    const docIds = sharedPostings.map((p) => p.docId);
    expect(new Set(docIds).size).toBe(docIds.length); // no duplicate docIds
    expect(docIds.length).toBe(TOTAL);
  });
});

describe('Progress signal (3.7)', () => {
  it('calls onProgress with strictly increasing done up to total', async () => {
    const store = await freshStore();
    const TOTAL = 60;
    const inputs: IndexInput[] = [];
    for (let i = 0; i < TOTAL; i++) {
      inputs.push({
        id: `prog-${i}`,
        platform: 'claude',
        nativeId: `np-${i}`,
        title: `Progress doc ${i}`,
        body: `body content number ${i}`,
        updatedAt: 1,
      });
    }

    const onProgress = vi.fn<(done: number, total: number) => void>();
    const result = await bulkIndex(store, inputs, onProgress, 25);

    expect(result).toEqual({ done: TOTAL, total: TOTAL });
    expect(onProgress).toHaveBeenCalled();

    const calls = onProgress.mock.calls;
    // Every call reports the same total.
    for (const [, total] of calls) expect(total).toBe(TOTAL);
    // `done` is strictly increasing and ends at total.
    const dones = calls.map(([done]) => done);
    for (let i = 1; i < dones.length; i++) expect(dones[i]).toBeGreaterThan(dones[i - 1]);
    expect(dones[dones.length - 1]).toBe(TOTAL);
  });
});

describe('Title-only ingest makes conversations searchable before they are opened', () => {
  it('indexes the title at list-ingest so an unopened conversation is findable by title', async () => {
    const store = await freshStore();
    // Mirrors conversation.ingest: only list metadata (title), no message bodies.
    const wrote = await indexConversationTitle(store, {
      id: 'claude::/c/images',
      platform: 'claude',
      nativeId: '/c/images',
      title: 'Can you create images?',
    });
    expect(wrote).toBe(true);
    const hits = await runSearch(store, { terms: ['images'] });
    expect(hits.map((h) => h.docId)).toContain('claude::/c/images');
  });

  it('opening (body index) then a later title-only re-ingest does NOT clobber the body', async () => {
    const store = await freshStore();
    const id = 'claude::/c/photo';
    const meta = { id, platform: 'claude' as const, nativeId: '/c/photo', title: 'Photo chat' };

    // 1) list-ingest: title only.
    await indexConversationTitle(store, meta);
    // 2) open: full body indexed.
    await indexConversation(store, { ...meta, body: 'discussion about chloroplast biology' });
    expect((await runSearch(store, { terms: ['chloroplast'] })).map((h) => h.docId)).toContain(id);

    // 3) re-ingest the list again (title only) — body must survive.
    const rewrote = await indexConversationTitle(store, meta);
    expect(rewrote).toBe(false); // idempotent no-op: title+body unchanged
    expect((await runSearch(store, { terms: ['chloroplast'] })).map((h) => h.docId)).toContain(id);
    expect((await runSearch(store, { terms: ['photo'] })).map((h) => h.docId)).toContain(id);
  });

  it('preserves organization state set between ingest and re-ingest', async () => {
    const store = await freshStore();
    const id = 'claude::/c/org';
    const meta = { id, platform: 'claude' as const, nativeId: '/c/org', title: 'Org chat' };
    await indexConversationTitle(store, meta);

    const rec = await store.conversations.get(id);
    await store.conversations.put({ ...rec!, folderId: 'f1', pinned: true, archived: true, tags: ['x'] });

    await indexConversationTitle(store, meta); // title unchanged → no-op, must keep org state
    const after = await store.conversations.get(id);
    expect(after).toMatchObject({ folderId: 'f1', pinned: true, archived: true, tags: ['x'] });
  });
});
