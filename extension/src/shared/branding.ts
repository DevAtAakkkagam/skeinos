// Platform branding: the canonical web origin per PlatformId — the single source
// for turning a platform-relative conversation id (`nativeId`, e.g. "/chat/abc")
// into an absolute URL when opening a conversation that does NOT belong to the
// active tab's platform (cross-platform open). Kept here in `shared/` so it stays
// preact-free and importable by the UI and any worker-side caller alike; the brand
// *logos* (Preact SVG components) live alongside it in `ui/components/PlatformLogo`
// — same per-PlatformId keys, so logo and origin never drift (design D1).
//
// Origins mirror the adapter host matches (`manifest.config.ts` P0_MATCHES) so the
// two are auditable side by side. Only the P0 platforms have an origin today; the
// map grows as adapters ship — an absent origin means "no cross-platform URL yet".

import type { PlatformId } from './types';

// ── Platform registry — the SINGLE source of truth for the platform list ──────
// One row per `PlatformId` the app knows about. Everything platform-shaped in the
// app derives from this array: display labels, the picker/filter sets, the
// cross-platform conversation origins, and (via the bundled adapter configs) the
// manifest host permissions. There is no second list to keep in sync.
//
// `supported: true` means a FULL adapter has shipped — i.e. ALL of:
//   1. a bundled config in `adapters/configs/<id>.json` (+ a contract fixture),
//   2. a brand logo in `ui/components/PlatformLogo` (`PLATFORM_LOGOS[id]`),
//   3. an `origin` below (for cross-platform conversation links),
//   4. a host match in the manifest (auto-derived from the bundled config).
// Adding a platform = add those four pieces and flip `supported` here; it then
// appears in the prompt-target and profile-scope pickers, the view-filter chips,
// and everywhere else at once. Removing one = the reverse. Unsupported rows still
// carry a label so a stray persisted record renders a name rather than its id.
export interface PlatformMeta {
  readonly id: PlatformId;
  /** User-facing brand name. The one place these strings live (i18n-ready). */
  readonly label: string;
  /** Canonical absolute web origin — present iff the platform has shipped. */
  readonly origin?: string;
  /** Whether a full adapter has shipped (see the four-part checklist above). */
  readonly supported: boolean;
}

export const PLATFORM_REGISTRY: readonly PlatformMeta[] = [
  { id: 'claude', label: 'Claude', origin: 'https://claude.ai', supported: true },
  { id: 'gemini', label: 'Gemini', origin: 'https://gemini.google.com', supported: true },
  { id: 'perplexity', label: 'Perplexity', origin: 'https://www.perplexity.ai', supported: true },
  { id: 'chatgpt', label: 'ChatGPT', origin: 'https://chatgpt.com', supported: true },
  { id: 'grok', label: 'Grok', supported: false },
  { id: 'deepseek', label: 'DeepSeek', supported: false },
  { id: 'mistral', label: 'Mistral', supported: false },
];

/** Display label per platform (exhaustive over `PlatformId`). */
export const PLATFORM_LABELS = Object.fromEntries(
  PLATFORM_REGISTRY.map((p) => [p.id, p.label]),
) as Record<PlatformId, string>;

/** Ordered list of platforms with a shipped adapter — the set offered in the
 *  prompt-target and profile-scope pickers and rendered as filter chips. */
export const SUPPORTED_PLATFORMS: PlatformId[] = PLATFORM_REGISTRY.filter(
  (p) => p.supported,
).map((p) => p.id);

/** Canonical absolute web origin per platform (only those that have one). */
export const PLATFORM_ORIGINS: Partial<Record<PlatformId, string>> = Object.fromEntries(
  PLATFORM_REGISTRY.filter((p) => p.origin).map((p) => [p.id, p.origin]),
);

/** The platform's canonical origin, or `undefined` when it has none registered. */
export function platformOrigin(platform: PlatformId): string | undefined {
  return PLATFORM_ORIGINS[platform];
}

/** Resolve a (possibly relative) `nativeId` to an absolute URL on the platform's
 *  origin. Returns `null` when the platform has no origin or the id will not
 *  resolve — callers treat that as "cannot build a cross-platform URL". */
export function resolveConversationUrl(platform: PlatformId, nativeId: string): string | null {
  const origin = PLATFORM_ORIGINS[platform];
  if (!origin) return null;
  try {
    return new URL(nativeId, origin).href;
  } catch {
    return null;
  }
}
