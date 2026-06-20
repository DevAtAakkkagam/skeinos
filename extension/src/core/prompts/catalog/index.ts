// The bundled, read-only starter-prompt catalog (prompt-seed-catalog, D-C/D-D).
//
// A `SeedPrompt` carries ONLY authored content — it is deliberately NOT a stored
// `Prompt`: it has no derived `variables`, no `promptFolderId`, no usage fields, no
// `id`, and no sync envelope. Those are the installer's responsibility (`seed.ts`,
// D-D), so a seeded prompt and a hand-created one end up structurally identical.
//
// This module is pure data: importing it NEVER writes the store (D-C). Only
// `installSeeds` writes, and only the picked domain. The catalog is therefore
// versionable across releases with no migration — editing a body here does not touch
// an already-installed copy (dedupe is by `seedId` presence, not content).

import type { DomainId } from '../../../shared/domains';
import type { PlatformId } from '../../../shared/types';
import { SOFTWARE_ENGINEERING } from './software-engineering';
import { MARKETING_CONTENT } from './marketing-content';
import { DATA_ANALYTICS } from './data-analytics';
import { EDUCATION_RESEARCH } from './education-research';

/**
 * One catalog entry: authored content only. The installer turns it into a stored
 * `Prompt` by deriving `variables` from `body`, setting `promptFolderId: null`,
 * initializing `usageCount: 0`, minting an `id`, and carrying `seedId`/`domain`.
 */
export interface SeedPrompt {
  /** Stable, catalog-unique provenance id (e.g. `software-engineering/code-review`). */
  seedId: string;
  /** The professional domain this seed belongs to. */
  domain: DomainId;
  title: string;
  /** Template body (may contain `{{var}}` tokens parsed at install time). */
  body: string;
  description?: string;
  tags?: string[];
  targetModels?: PlatformId[];
  slug?: string;
}

/** Every starter prompt across all domains, in registry order. */
export const CATALOG: SeedPrompt[] = [
  ...SOFTWARE_ENGINEERING,
  ...MARKETING_CONTENT,
  ...DATA_ANALYTICS,
  ...EDUCATION_RESEARCH,
];

/** The catalog's seeds for one domain (the installer's input for that domain). */
export function seedsForDomain(domain: DomainId): SeedPrompt[] {
  return CATALOG.filter((s) => s.domain === domain);
}
