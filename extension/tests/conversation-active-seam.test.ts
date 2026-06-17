// conversation-filing — the active-conversation seam (Vitest + fake-indexeddb).
// Maps to "Active-conversation seam is single-writer and durable":
//   · a report persists and survives a simulated worker restart;
//   · `conversation.active` returns the latest per platform and null when none;
//   · only id/title cross the seam (no message content).

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { makeWorkspaceStore, openDb, type WorkspaceStore } from '../src/core/store';
import { mutateWorkspace, queryWorkspace } from '../src/core/folders';
import type { WorkspaceSnapshot } from '../src/shared/workspace';

let dbCounter = 0;
function dbName(): string {
  return `skeinos-active-${dbCounter++}`;
}
async function openStore(name: string): Promise<WorkspaceStore> {
  return makeWorkspaceStore(await openDb(name));
}

function active(snap: WorkspaceSnapshot) {
  if (snap.kind !== 'conversation.active') throw new Error('expected conversation.active');
  return snap.active;
}

describe('active-conversation seam', () => {
  it('returns null when nothing has been reported for the platform', async () => {
    const store = await openStore(dbName());
    const snap = await queryWorkspace(store, { kind: 'conversation.active', platform: 'claude' });
    expect(active(snap)).toBeNull();
  });

  it('reports the latest conversation per platform and keeps platforms independent', async () => {
    const store = await openStore(dbName());
    await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'c1',
      title: 'First',
    });
    await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'gemini',
      nativeId: 'g1',
      title: 'Gemini one',
    });
    // A newer report for claude supersedes the previous one (latest wins).
    await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'c2',
      title: 'Second',
    });

    const claude = active(await queryWorkspace(store, { kind: 'conversation.active', platform: 'claude' }));
    const gemini = active(await queryWorkspace(store, { kind: 'conversation.active', platform: 'gemini' }));
    expect(claude).toMatchObject({ nativeId: 'c2', title: 'Second' });
    expect(gemini).toMatchObject({ nativeId: 'g1', title: 'Gemini one' });
  });

  it('survives a simulated worker restart (record is durable in IndexedDB)', async () => {
    const name = dbName();
    const first = await openStore(name);
    await mutateWorkspace(first, {
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'c9',
      title: 'Survives teardown',
    });
    // Tear the worker down: close the connection and reopen against the same DB,
    // exactly as an MV3 cold start rehydrates from durable storage.
    first.db.close();
    const woken = await openStore(name);

    const snap = await queryWorkspace(woken, { kind: 'conversation.active', platform: 'claude' });
    expect(active(snap)).toMatchObject({ nativeId: 'c9', title: 'Survives teardown' });
  });

  it('persists only id/title metadata — no conversation content is stored', async () => {
    const store = await openStore(dbName());
    await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'c1',
      title: 'Only metadata',
    });
    const rec = await store.activeConversations.get('claude');
    // The stored record's keys are exactly the seam's metadata shape — nothing
    // resembling message bodies/content ever lands here.
    expect(Object.keys(rec ?? {}).sort()).toEqual(['nativeId', 'platform', 'title', 'updatedAt']);
  });

  it('an unchanged report touches no stores (no needless broadcast)', async () => {
    const store = await openStore(dbName());
    const first = await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'c1',
      title: 'Same',
    });
    expect(first.stores).toEqual(['activeConversations']);

    const repeat = await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'claude',
      nativeId: 'c1',
      title: 'Same',
    });
    expect(repeat.stores).toEqual([]);
  });
});
