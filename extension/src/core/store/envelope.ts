// The sync envelope: deviceId provisioning, content hashing, and the central
// stamp applied on every syncable write (D2/D7). Centralizing it here is the
// whole point of `Repo` — feature code cannot forget to bump the envelope.

import type { SyncMeta } from '../../shared/types';

/** Envelope fields excluded from the content hash (they describe sync, not content). */
const ENVELOPE_FIELDS = new Set(['rev', 'updatedAt', 'deviceId', 'hash', 'deleted']);

// ---------------------------------------------------------------------------
// deviceId
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = 'sk_deviceId';
let cachedDeviceId: string | undefined;

/**
 * A stable per-install identifier, generated once and persisted in
 * `chrome.storage.local` so it survives MV3 worker restarts. Outside the
 * extension runtime (tests) it falls back to a process-cached UUID, which keeps
 * `deviceId` non-empty and stable within a run — persistence there is moot.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  const local = chromeLocal();
  if (local) {
    const got = await local.get(DEVICE_ID_KEY);
    const existing = got?.[DEVICE_ID_KEY] as string | undefined;
    if (existing) return (cachedDeviceId = existing);
    const id = crypto.randomUUID();
    await local.set({ [DEVICE_ID_KEY]: id });
    return (cachedDeviceId = id);
  }

  return (cachedDeviceId = crypto.randomUUID());
}

/** Reset the in-memory cache. Test-only seam. */
export function __resetDeviceIdCache(): void {
  cachedDeviceId = undefined;
}

/** Minimal structural view of the bits of `chrome.storage.local` we use. */
interface LocalArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function chromeLocal(): LocalArea | undefined {
  const c = (globalThis as { chrome?: { storage?: { local?: unknown } } }).chrome;
  return c?.storage?.local as LocalArea | undefined;
}

// ---------------------------------------------------------------------------
// content hash
// ---------------------------------------------------------------------------

/**
 * A stable digest over a record's semantic fields (envelope fields excluded),
 * so the sync engine can equality-check changesets. Implementation: FNV-1a/64
 * over a canonical (key-sorted) JSON serialization — fast, dependency-free, and
 * deterministic. It is a change detector, not a security primitive.
 */
export function contentHash(rec: Record<string, unknown>): string {
  return fnv1a64(canonicalize(rec));
}

/** Deterministic JSON: object keys sorted, envelope fields dropped. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const parts = Object.keys(obj)
    .filter((k) => !ENVELOPE_FIELDS.has(k) && obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${parts.join(',')}}`;
}

function fnv1a64(s: string): string {
  // 64-bit FNV-1a using BigInt to avoid 32-bit overflow collisions.
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    hash ^= BigInt(s.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

// ---------------------------------------------------------------------------
// stamp
// ---------------------------------------------------------------------------

/**
 * Stamp the envelope for a write: bump `rev` off the previous record (first
 * write → 1), refresh `updatedAt`/`deviceId`, and recompute `hash`.
 */
export async function stampEnvelope<T extends SyncMeta>(rec: T, prev?: T): Promise<T> {
  const deviceId = await getDeviceId();
  return {
    ...rec,
    rev: (prev?.rev ?? 0) + 1,
    updatedAt: Date.now(),
    deviceId,
    hash: contentHash(rec as unknown as Record<string, unknown>),
  };
}
