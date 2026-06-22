// Idempotent domain seed installer (prompt-seed-catalog, D-E). Runs in the service
// worker (the single writer, SW-1): the `prompts.install` handler calls this with the
// worker's store and a `DomainId`. It copies that domain's catalog seeds into the
// `prompts` store as ordinary, editable `Prompt` records and returns the count it
// inserted.
//
// Idempotent by `seedId` presence: it collects the `seedId`s already in the store and
// inserts only the missing ones, so re-running a domain — or installing a second
// domain — never duplicates. A user-authored prompt has no `seedId`, so it is never
// matched and never touched.
//
// Each installed record mirrors the `prompt.create` handler exactly (D-D): `variables`
// is derived from `body` via `parseVariables` (never hand-authored in the catalog),
// `promptFolderId` is `null` (uncategorized, so the user organizes freely without
// losing the domain identity), `usageCount` is `0`, the `id` is freshly minted, and
// the repo stamps the sync envelope on `put`.

import type { WorkspaceStore } from '../store';
import type { DomainId } from '../../shared/domains';
import type { Prompt } from '../../shared/types';
import { seedsForDomain } from './catalog';
import { parseVariables } from './template';

/** Mint a fresh prompt id (mirrors the UI's `makePromptId`, but core-side). */
function mintId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID
    ? c.randomUUID()
    : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Install the catalog's seeds for `domain` into `store`, skipping any whose `seedId`
 * is already present. Returns the number of prompts inserted (0 when all are present).
 */
export async function installSeeds(store: WorkspaceStore, domain: DomainId): Promise<number> {
  const existing = await store.prompts.query();
  const present = new Set(existing.map((p) => p.seedId).filter((s): s is string => !!s));

  let installed = 0;
  for (const seed of seedsForDomain(domain)) {
    if (present.has(seed.seedId)) continue;
    const prompt: Prompt = {
      id: mintId(),
      title: seed.title,
      body: seed.body,
      variables: parseVariables(seed.body),
      tags: seed.tags ?? [],
      targetModels: seed.targetModels ?? [],
      promptFolderId: null,
      usageCount: 0,
      domain: seed.domain,
      seedId: seed.seedId,
      ...(seed.description !== undefined ? { description: seed.description } : {}),
    } as Prompt;
    await store.prompts.put(prompt);
    installed += 1;
  }
  return installed;
}
