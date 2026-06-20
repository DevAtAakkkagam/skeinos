// Worker `prompt.search` selector coverage (slice 4 of prompts-library, design D-A..D-F).
//
// TARGETS THE UNIMPLEMENTED `prompt-search-results` CHANGE — these are TDD/red tests
// and are EXPECTED TO FAIL until `/opsx:apply prompt-search-results` adds the
// `prompt.search` variant to `PromptSelector`/`PromptSnapshot`, the `PromptSearchResult`
// shape, and the matching/ranking/snippet logic in `core/prompts/handlers.ts`.
//
// Maps to openspec/changes/prompt-search-results/specs/prompts/spec.md (the
// "Prompt search query" requirement) + tasks.md §4.1: field matching, AND semantics,
// title-over-body ranking, highlighted snippet, tombstone exclusion, empty terms → [].
//
// Mirrors prompts-handlers.test.ts: fake-indexeddb, a fresh store per case, and calls
// `queryPromptLibrary(store, selector)` / `mutatePromptLibrary(store, op)` directly.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { mutatePromptLibrary, queryPromptLibrary } from '../src/core/prompts';
import type { PromptMutationOp, PromptSearchResult } from '../src/shared/prompts';
import type { SnippetSegment } from '../src/shared/types';

let dbCounter = 0;
async function freshStore(): Promise<WorkspaceStore> {
  const db = await openDb(`skeinos-prompt-search-${dbCounter++}`);
  return makeWorkspaceStore(db);
}

const createOp = (over: Partial<Extract<PromptMutationOp, { op: 'prompt.create' }>> = {}) =>
  ({
    op: 'prompt.create',
    id: 'p1',
    title: 'A prompt',
    body: 'Hello {{name}}',
    ...over,
  }) as Extract<PromptMutationOp, { op: 'prompt.create' }>;

/** Run a `prompt.search` and return its results. */
async function search(store: WorkspaceStore, terms: string[]): Promise<PromptSearchResult[]> {
  const snap = await queryPromptLibrary(store, { kind: 'prompt.search', terms });
  // The snapshot is discriminated by kind; narrow to the search variant.
  expect(snap.kind).toBe('prompt.search');
  if (snap.kind !== 'prompt.search') throw new Error('expected prompt.search snapshot');
  return snap.results;
}

const ids = (results: PromptSearchResult[]): string[] => results.map((r) => r.id);

describe('prompt.search matches across searchable fields (4.1)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('includes a prompt when a term appears in its title', async () => {
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 'Kestrel briefing', body: 'unrelated' }));
    await mutatePromptLibrary(store, createOp({ id: 'p2', title: 'something else', body: 'nothing here' }));
    expect(ids(await search(store, ['kestrel']))).toEqual(['p1']);
  });

  it('includes a prompt when a term appears in its body', async () => {
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 't', body: 'a polished obsidian blade' }));
    await mutatePromptLibrary(store, createOp({ id: 'p2', title: 't', body: 'no match present' }));
    expect(ids(await search(store, ['obsidian']))).toEqual(['p1']);
  });

  it('includes a prompt when a term appears in its description', async () => {
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 't', body: 'b', description: 'a tungsten alloy note' }));
    await mutatePromptLibrary(store, createOp({ id: 'p2', title: 't', body: 'b' }));
    expect(ids(await search(store, ['tungsten']))).toEqual(['p1']);
  });

  it('includes a prompt when a term appears in its tags', async () => {
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 't', body: 'b', tags: ['marigold'] }));
    await mutatePromptLibrary(store, createOp({ id: 'p2', title: 't', body: 'b', tags: ['other'] }));
    expect(ids(await search(store, ['marigold']))).toEqual(['p1']);
  });

  it('includes a prompt when a term appears in its slug', async () => {
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 't', body: 'b', slug: '/zephyr' }));
    await mutatePromptLibrary(store, createOp({ id: 'p2', title: 't', body: 'b', slug: '/other' }));
    expect(ids(await search(store, ['zephyr']))).toEqual(['p1']);
  });

  it('matches case-insensitively (normalized like conversation search)', async () => {
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 'QUARTZ Report', body: 'b' }));
    expect(ids(await search(store, ['quartz']))).toEqual(['p1']);
  });
});

describe('prompt.search AND semantics across terms (4.1)', () => {
  let store: WorkspaceStore;
  beforeEach(async () => {
    store = await freshStore();
  });

  it('returns only prompts in which every term appears (in any searchable field)', async () => {
    // Each term may land in a different field — title vs body vs tags — but all must hit.
    await mutatePromptLibrary(store, createOp({ id: 'both', title: 'kestrel notes', body: 'an obsidian study', tags: [] }));
    await mutatePromptLibrary(store, createOp({ id: 'only-a', title: 'kestrel notes', body: 'no second term' }));
    await mutatePromptLibrary(store, createOp({ id: 'only-b', title: 'plain title', body: 'an obsidian study' }));
    await mutatePromptLibrary(store, createOp({ id: 'neither', title: 'plain', body: 'nothing relevant' }));

    expect(ids(await search(store, ['kestrel', 'obsidian'])).sort()).toEqual(['both']);
  });
});

describe('prompt.search ranks title matches above body matches (4.1)', () => {
  it('orders a title-field match ahead of a body-only match for the same term', async () => {
    const store = await freshStore();
    // Same recency so the only differentiator is the title-over-body field boost.
    await mutatePromptLibrary(store, createOp({ id: 'in-title', title: 'tungsten', body: 'unrelated filler words' }));
    await mutatePromptLibrary(store, createOp({ id: 'in-body', title: 'unrelated filler', body: 'tungsten appears below' }));

    const results = await search(store, ['tungsten']);
    expect(ids(results)).toEqual(['in-title', 'in-body']);
  });
});

describe('prompt.search results carry a highlighted snippet (4.1)', () => {
  it('a matched prompt carries a {text,match}[] snippet with the matching run flagged', async () => {
    const store = await freshStore();
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 't', body: 'a polished obsidian blade lay flat' }));

    const [hit] = await search(store, ['obsidian']);
    expect(hit).toBeDefined();
    expect(Array.isArray(hit.snippet)).toBe(true);
    const matched = hit.snippet.filter((seg: SnippetSegment) => seg.match);
    expect(matched.length).toBeGreaterThan(0);
    // At least one flagged run carries the matched term.
    expect(matched.some((seg: SnippetSegment) => seg.text.toLowerCase().includes('obsidian'))).toBe(true);
  });

  it('a result carries the fields a row renders (id, title, targetModels, optional slug)', async () => {
    const store = await freshStore();
    await mutatePromptLibrary(
      store,
      createOp({ id: 'p1', title: 'Kestrel', body: 'kestrel body', targetModels: ['claude', 'gemini'], slug: '/k' }),
    );
    const [hit] = await search(store, ['kestrel']);
    expect(hit).toMatchObject({ id: 'p1', title: 'Kestrel', targetModels: ['claude', 'gemini'], slug: '/k' });
    expect(Array.isArray(hit.snippet)).toBe(true);
  });
});

describe('prompt.search excludes tombstoned prompts (4.1)', () => {
  it('a deleted prompt that would otherwise match does not appear', async () => {
    const store = await freshStore();
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 'kestrel briefing', body: 'b' }));
    expect(ids(await search(store, ['kestrel']))).toEqual(['p1']);

    await mutatePromptLibrary(store, { op: 'prompt.delete', id: 'p1' });
    expect(await search(store, ['kestrel'])).toEqual([]);
  });
});

describe('prompt.search empty query returns nothing (4.1)', () => {
  it('an empty term list returns [] (not the whole library)', async () => {
    const store = await freshStore();
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 'kestrel', body: 'b' }));
    await mutatePromptLibrary(store, createOp({ id: 'p2', title: 'obsidian', body: 'b' }));
    expect(await search(store, [])).toEqual([]);
  });

  it('a term no prompt contains returns []', async () => {
    const store = await freshStore();
    await mutatePromptLibrary(store, createOp({ id: 'p1', title: 'kestrel', body: 'b' }));
    expect(await search(store, ['nonexistentword'])).toEqual([]);
  });
});
