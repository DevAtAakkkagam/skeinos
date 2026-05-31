// Single source of truth for the host surface area. Kept tiny and auditable:
// host permissions cover the P0 launch platforms ONLY (PRD §5), with no broad
// access and no credential-bearing permissions (PRD §8.3-8.4, decision D6).

export const P0_MATCHES = [
  '*://claude.ai/*',
  '*://gemini.google.com/*',
  '*://*.perplexity.ai/*',
] as const;

export const skeinosManifest = {
  name: 'Skeinos',
  description: 'A unified workspace layer for your LLM chats.',
  host_permissions: [...P0_MATCHES],
  // Bootstrap requests no API permissions at all. Anything added later must be
  // justified against the privacy-first positioning and store review.
  permissions: [] as string[],
};
