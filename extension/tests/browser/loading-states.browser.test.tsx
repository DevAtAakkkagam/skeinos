// loading-states in real Chromium (loading-states task 5.1): shadow-root scoping +
// `--sk-*` token resolution for the Skeleton primitive and the IndexingIndicator.
// The happy-dom suite (tests/loading-states.test.tsx) covers structure/logic; this
// asserts the parts that need a real engine — the skeleton's token-derived
// `color-mix` background resolves to a real applied value, it lives in the shadow
// root (not the host light DOM), and the indexing bar computes its width to ~50%.

import { afterEach, describe, expect, it } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { Skeleton } from '../../src/ui/components/Skeleton';
import { IndexingIndicator } from '../../src/ui/sidebar/IndexingIndicator';

let handle: MountHandle | null = null;

function mountNode(node: preact.ComponentChild, theme: 'light' | 'dark' = 'light') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  // `mount` auto-injects COMPONENT_CSS (which carries `.sk-skeleton`); append the
  // sidebar CSS for the `.sk-indexing*` rules.
  handle = mount(target, node as never, { theme });
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;

afterEach(() => {
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
});

describe('Skeleton token resolution (real browser)', () => {
  it('mounts in the shadow root and resolves its --sk-* token-derived background', () => {
    mountNode(<Skeleton variant="row" />);
    const el = $('[data-testid=sk-skeleton]')!;
    expect(el).toBeTruthy();
    // It lives in the shadow root, not the host light DOM.
    expect(document.body.querySelector('[data-testid=sk-skeleton]')).toBeNull();
    // The token-derived color-mix actually resolved to an applied value (not an
    // unresolved var) — a real rgb background and/or a gradient background-image.
    const cs = getComputedStyle(el);
    const resolved = `${cs.backgroundColor} ${cs.backgroundImage}`;
    expect(resolved).toMatch(/rgb|gradient/);
  });

  it('re-themes: the computed background changes between light and dark', () => {
    mountNode(<Skeleton variant="block" />, 'light');
    const el = $('[data-testid=sk-skeleton]')!;
    const lightBg = getComputedStyle(el).backgroundColor;
    handle!.setTheme('dark');
    const darkBg = getComputedStyle(el).backgroundColor;
    // The background derives from `--sk-color-muted`, which differs across themes, so
    // the applied color tracks the theme flip.
    expect(darkBg).not.toBe(lightBg);
  });
});

describe('IndexingIndicator token resolution (real browser)', () => {
  it('mounts in the shadow root and computes the bar width to ~50%', () => {
    mountNode(<IndexingIndicator progress={{ done: 4, total: 8 }} />);
    const banner = $('[data-testid=sk-indexing]')!;
    expect(banner).toBeTruthy();
    expect(document.body.querySelector('[data-testid=sk-indexing]')).toBeNull();

    // 4/8 → 50% in the percent label…
    expect($('[data-testid=sk-indexing-pct]')!.textContent).toBe('50%');

    // …and the bar's computed width is half its track.
    const track = banner.querySelector('.sk-indexing__track') as HTMLElement;
    const bar = banner.querySelector('.sk-indexing__bar') as HTMLElement;
    const trackW = track.getBoundingClientRect().width;
    const barW = bar.getBoundingClientRect().width;
    expect(trackW).toBeGreaterThan(0);
    expect(barW / trackW).toBeCloseTo(0.5, 1);

    // The bar's background is the token accent, resolved to a real color.
    expect(getComputedStyle(bar).backgroundColor).toMatch(/^rgb/);
  });
});
