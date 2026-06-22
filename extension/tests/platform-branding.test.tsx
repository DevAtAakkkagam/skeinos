// platform-branding — the per-PlatformId branding registry (happy-dom). The logo
// lookup (ui/components/PlatformLogo) and the origin map (shared/branding) share
// the same keys: every platform with a brand mark also resolves an origin, each
// logo renders as inline SVG with no network, and a relative nativeId resolves to
// the expected absolute URL on that origin.

import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { PLATFORM_LOGOS, PlatformLogo } from '../src/ui/components/PlatformLogo';
import {
  PLATFORM_ORIGINS,
  SUPPORTED_PLATFORMS,
  platformOrigin,
  resolveConversationUrl,
} from '../src/shared/branding';
import type { PlatformId } from '../src/shared/types';

const PRESENT = Object.keys(PLATFORM_LOGOS) as PlatformId[];

let container: HTMLElement | null = null;
afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

describe('platform-branding registry', () => {
  it('keeps the supported set, logos, and origins in lockstep', () => {
    // The registry is the single source of truth: a supported platform has a logo
    // AND an origin, and nothing has a logo/origin without being supported.
    expect(PRESENT.sort()).toEqual([...SUPPORTED_PLATFORMS].sort());
    expect(Object.keys(PLATFORM_ORIGINS).sort()).toEqual([...SUPPORTED_PLATFORMS].sort());
    for (const id of SUPPORTED_PLATFORMS) {
      expect(typeof PLATFORM_LOGOS[id]).toBe('function');
      expect(platformOrigin(id)).toBe(PLATFORM_ORIGINS[id]);
      expect(PLATFORM_ORIGINS[id]).toMatch(/^https:\/\//);
    }
  });

  it('every present platform resolves a logo that renders inline SVG (no network)', () => {
    for (const id of PRESENT) {
      container = document.createElement('div');
      document.body.appendChild(container);
      render(<PlatformLogo platform={id} size={16} />, container);
      const svg = container.querySelector('svg');
      expect(svg, `${id} renders an <svg>`).toBeTruthy();
      // No <img>/remote reference — the mark is in-bundle SVG.
      expect(container.querySelector('img')).toBeNull();
      render(null, container);
    }
  });

  it('renders nothing for a platform without a brand mark yet', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    render(<PlatformLogo platform={'grok' as PlatformId} />, container);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('resolves a relative nativeId to the absolute URL on the platform origin', () => {
    expect(resolveConversationUrl('claude', '/chat/abc')).toBe('https://claude.ai/chat/abc');
    expect(resolveConversationUrl('gemini', '/app/xyz')).toBe('https://gemini.google.com/app/xyz');
    expect(resolveConversationUrl('perplexity', '/search/q')).toBe('https://www.perplexity.ai/search/q');
  });

  it('passes an already-absolute nativeId through unchanged', () => {
    expect(resolveConversationUrl('claude', 'https://claude.ai/chat/xyz')).toBe('https://claude.ai/chat/xyz');
  });

  it('returns null when the platform has no registered origin', () => {
    expect(resolveConversationUrl('grok' as PlatformId, '/x')).toBeNull();
  });
});
