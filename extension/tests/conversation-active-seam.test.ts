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

  it('clearActive drops the platform record so the active card reads null again', async () => {
    const store = await openStore(dbName());
    await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'gemini',
      nativeId: 'g1',
      title: 'On a chat',
    });
    expect(active(await queryWorkspace(store, { kind: 'conversation.active', platform: 'gemini' }))).toMatchObject({
      nativeId: 'g1',
    });

    // The tab navigates to a new-chat/home page (no open conversation).
    const cleared = await mutateWorkspace(store, { op: 'conversation.clearActive', platform: 'gemini' });
    expect(cleared.stores).toEqual(['activeConversations']);
    expect(active(await queryWorkspace(store, { kind: 'conversation.active', platform: 'gemini' }))).toBeNull();
  });

  it('clearActive on a platform with no active record touches no stores (no broadcast)', async () => {
    const store = await openStore(dbName());
    const res = await mutateWorkspace(store, { op: 'conversation.clearActive', platform: 'claude' });
    expect(res.stores).toEqual([]);
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

  it('persists the collapsed-list hint and surfaces it on the active card', async () => {
    const store = await openStore(dbName());
    await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'gemini',
      nativeId: 'g1',
      title: 'Collapsed drawer',
      listCollapsedHint: true,
    });
    const card = active(await queryWorkspace(store, { kind: 'conversation.active', platform: 'gemini' }));
    expect(card).toMatchObject({ nativeId: 'g1', listCollapsedHint: true });
  });

  it('omits the hint field entirely when not flagged (record stays minimal)', async () => {
    const store = await openStore(dbName());
    await mutateWorkspace(store, {
      op: 'conversation.reportActive',
      platform: 'gemini',
      nativeId: 'g1',
      title: 'Drawer open',
      listCollapsedHint: false,
    });
    const rec = await store.activeConversations.get('gemini');
    expect(Object.keys(rec ?? {}).sort()).toEqual(['nativeId', 'platform', 'title', 'updatedAt']);
  });

  it('treats a hint change on an otherwise-unchanged conversation as a write (nudge must update)', async () => {
    const store = await openStore(dbName());
    const base = { op: 'conversation.reportActive' as const, platform: 'gemini' as const, nativeId: 'g1', title: 'Same' };
    // Drawer collapses → hint rises: this is NOT a no-op even though id/title match.
    const collapsed = await mutateWorkspace(store, { ...base, listCollapsedHint: true });
    expect(collapsed.stores).toEqual(['activeConversations']);
    // Drawer opens → hint clears: also a write so the panel drops the nudge.
    const opened = await mutateWorkspace(store, { ...base, listCollapsedHint: false });
    expect(opened.stores).toEqual(['activeConversations']);
    // A genuinely identical repeat (hint unchanged) stays a no-op.
    const repeat = await mutateWorkspace(store, { ...base, listCollapsedHint: false });
    expect(repeat.stores).toEqual([]);
  });
});

function platformState(snap: WorkspaceSnapshot) {
  if (snap.kind !== 'platform.state') throw new Error('expected platform.state');
  return snap.state;
}

describe('platform collapsed-list signal', () => {
  it('returns null when nothing has been reported for the platform', async () => {
    const store = await openStore(dbName());
    const snap = await queryWorkspace(store, { kind: 'platform.state', platform: 'gemini' });
    expect(platformState(snap)).toBeNull();
  });

  it('persists the collapsed signal per platform and surfaces it on the state read', async () => {
    const store = await openStore(dbName());
    const res = await mutateWorkspace(store, {
      op: 'platform.reportListState',
      platform: 'gemini',
      listCollapsed: true,
    });
    expect(res.stores).toEqual(['platformState']);

    const snap = await queryWorkspace(store, { kind: 'platform.state', platform: 'gemini' });
    expect(platformState(snap)).toMatchObject({ platform: 'gemini', listCollapsed: true });
    // Independent of other platforms.
    const other = await queryWorkspace(store, { kind: 'platform.state', platform: 'claude' });
    expect(platformState(other)).toBeNull();
  });

  it('survives a simulated worker restart (durable, single-writer)', async () => {
    const name = dbName();
    const store = await openStore(name);
    await mutateWorkspace(store, { op: 'platform.reportListState', platform: 'gemini', listCollapsed: true });
    store.db.close();

    // A fresh store over the same database (worker cold start) still reads the signal.
    const restarted = await openStore(name);
    const snap = await queryWorkspace(restarted, { kind: 'platform.state', platform: 'gemini' });
    expect(platformState(snap)).toMatchObject({ listCollapsed: true });
  });

  it('dedups an unchanged signal to a no-op (no broadcast)', async () => {
    const store = await openStore(dbName());
    const first = await mutateWorkspace(store, { op: 'platform.reportListState', platform: 'gemini', listCollapsed: true });
    expect(first.stores).toEqual(['platformState']);
    // Same value again: no write, no broadcast.
    const repeat = await mutateWorkspace(store, { op: 'platform.reportListState', platform: 'gemini', listCollapsed: true });
    expect(repeat.stores).toEqual([]);
    // The drawer opens → false: a real transition, so it writes again.
    const cleared = await mutateWorkspace(store, { op: 'platform.reportListState', platform: 'gemini', listCollapsed: false });
    expect(cleared.stores).toEqual(['platformState']);
  });
});
