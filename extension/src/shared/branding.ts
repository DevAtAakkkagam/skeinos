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

/** Canonical absolute web origin per platform (P0 set; extended as adapters ship). */
export const PLATFORM_ORIGINS: Partial<Record<PlatformId, string>> = {
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
  perplexity: 'https://www.perplexity.ai',
};

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
