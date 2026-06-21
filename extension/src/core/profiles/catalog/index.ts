// The bundled, read-only starter-profile catalog (profiles-library, seeding). Mirrors
// the prompt seed catalog: a `SeedProfile` carries ONLY authored content — it is NOT a
// stored `InstructionProfile` (no `id`, no sync envelope). The installer (`seed.ts`)
// turns it into a stored record by minting an `id`, carrying `seedId`/`domain`, and
// letting the repo stamp the sync envelope.
//
// Pure data: importing it NEVER writes the store. Only `installProfileSeeds` writes,
// and only the picked domain. Versionable across releases with no migration — dedupe
// is by `seedId` presence, not content.

import type { DomainId } from '../../../shared/domains';
import type { InstructionProfile, PlatformId } from '../../../shared/types';

/** Platforms a seeded profile applies to by default — the targetable set today. */
const ALL_TARGETABLE: PlatformId[] = ['claude', 'gemini', 'perplexity'];

/** One catalog entry: authored content only. The installer turns it into a stored
 *  `InstructionProfile` by minting an `id`, carrying `seedId`/`domain`, and stamping
 *  the sync envelope. */
export interface SeedProfile {
  /** Stable, catalog-unique provenance id (e.g. `software-engineering/senior-staff-engineer`). */
  seedId: string;
  domain: DomainId;
  name: string;
  description?: string;
  instructionText: string;
  appliesTo?: PlatformId[];
  responseStyle?: InstructionProfile['responseStyle'];
}

/** Every starter profile across all domains, in registry order. One curated standing-
 *  instruction profile per domain — a useful default the user can edit or delete. */
export const PROFILE_CATALOG: SeedProfile[] = [
  {
    seedId: 'software-engineering/senior-staff-engineer',
    domain: 'software-engineering',
    name: 'Senior staff engineer',
    description: 'Terse, senior-level technical answers.',
    instructionText:
      'Act as a senior staff software engineer. Be terse and precise. Prefer concrete code and trade-offs over generalities. Call out edge cases and failure modes. Skip pleasantries.',
    appliesTo: ALL_TARGETABLE,
    responseStyle: { verbosity: 'brief', format: 'markdown' },
  },
  {
    seedId: 'marketing-content/brand-copywriter',
    domain: 'marketing-content',
    name: 'Brand copywriter',
    description: 'On-brand, persuasive marketing copy.',
    instructionText:
      'Act as a brand copywriter. Write in a clear, confident, benefit-led voice. Avoid jargon and hype. Lead with the customer outcome, keep sentences short, and offer a couple of variations when useful.',
    appliesTo: ALL_TARGETABLE,
    responseStyle: { verbosity: 'balanced', format: 'markdown' },
  },
  {
    seedId: 'data-analytics/data-analyst',
    domain: 'data-analytics',
    name: 'Data analyst',
    description: 'Rigorous, assumption-checking analysis.',
    instructionText:
      'Act as a rigorous data analyst. State your assumptions explicitly, show the steps of any calculation, and flag when the data is insufficient to answer. Prefer precise numbers and clearly label estimates.',
    appliesTo: ALL_TARGETABLE,
    responseStyle: { verbosity: 'thorough', format: 'markdown' },
  },
  {
    seedId: 'education-research/patient-tutor',
    domain: 'education-research',
    name: 'Patient tutor',
    description: 'Explains step by step, checks understanding.',
    instructionText:
      'Act as a patient tutor. Explain concepts step by step from first principles, use a concrete example, and check understanding before moving on. Avoid giving the final answer outright when the goal is learning.',
    appliesTo: ALL_TARGETABLE,
    responseStyle: { verbosity: 'balanced', format: 'markdown' },
  },
];

/** The catalog's seeds for one domain (the installer's input for that domain). */
export function profileSeedsForDomain(domain: DomainId): SeedProfile[] {
  return PROFILE_CATALOG.filter((s) => s.domain === domain);
}
