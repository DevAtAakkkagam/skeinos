// Onboarding stepper in real Chromium: shadow-root scoping + `--sk-*` token
// resolution across the four steps (onboarding-flow, task 9.1). The happy-dom suite
// (tests/onboarding-flow.test.tsx) covers the navigation/seed/complete logic; this
// asserts the parts that need a real engine — the stepper mounts in the shadow DOM,
// its token-styled surfaces resolve real applied colors, and stepping forward swaps
// the rendered step inside the same shadow root without leaking into the host.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { ONBOARDING_CSS } from '../../src/ui/onboarding/styles';
import { OnboardingSurface } from '../../src/ui/onboarding/OnboardingSurface';

let handle: MountHandle | null = null;

function mountSurface() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  // Stub every writer so the real worker/gate seams are never touched in the browser.
  handle = mount(
    target,
    <OnboardingSurface
      platform="claude"
      onComplete={vi.fn()}
      installSeeds={vi.fn(async () => 5)}
      persistDomain={vi.fn()}
      createFolder={vi.fn()}
    />,
    { theme: 'light' },
  );
  const style = document.createElement('style');
  style.textContent = `${SIDEBAR_CSS}\n${ONBOARDING_CSS}`;
  handle.shadowRoot.appendChild(style);
  return handle;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;

afterEach(() => {
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
});

describe('Onboarding stepper (real browser)', () => {
  it('mounts the welcome step in the shadow root and resolves --sk-* tokens', () => {
    mountSurface();
    const surface = $('[data-testid=sk-onboarding]')!;
    expect(surface).toBeTruthy();
    expect(surface.getAttribute('data-step')).toBe('0');
    expect($('[data-testid=sk-onboarding-step-welcome]')).toBeTruthy();
    // Nothing leaked into the host light DOM.
    expect(document.body.querySelector('[data-testid=sk-onboarding]')).toBeNull();
    // The active progress dot is token-styled: the accent custom property resolves
    // and the dot's computed background is a real, applied color (not an unresolved var).
    const dot = $('.sk-onb__dot--active')!;
    expect(getComputedStyle(dot).getPropertyValue('--sk-color-accent').trim()).not.toBe('');
    expect(getComputedStyle(dot).backgroundColor).toMatch(/^rgb/);
  });

  it('steps welcome → permissions → starter → get started within the shadow root', async () => {
    mountSurface();

    $('[data-testid=sk-onboarding-start]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-onboarding-step-permissions]')).toBeTruthy());
    // The three P0 hosts render their per-site rows in the real DOM.
    expect($('[data-testid=sk-onboarding-perm-sites]')!.querySelectorAll('.sk-onb__site').length).toBe(3);

    $('[data-testid=sk-onboarding-continue]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-onboarding-step-starter]')).toBeTruthy());
    expect($('[data-testid=sk-onboarding-domains]')).toBeTruthy();

    $('[data-testid=sk-onboarding-continue]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-onboarding-step-getstarted]')).toBeTruthy());
    expect($('[data-testid=sk-onboarding-finish]')).toBeTruthy();
    expect($('[data-testid=sk-onboarding]')!.getAttribute('data-step')).toBe('3');
  });

  it('picks a domain and shows the seeded confirmation with the reply count', async () => {
    mountSurface();
    $('[data-testid=sk-onboarding-start]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-onboarding-step-permissions]')).toBeTruthy());
    $('[data-testid=sk-onboarding-continue]')!.click();
    await vi.waitFor(() => expect($('[data-testid=sk-onboarding-domains]')).toBeTruthy());

    $('[data-testid=sk-onboarding-domain-software-engineering]')!.click();
    // The install stub resolves 5 → the confirmation count is driven by the reply.
    await vi.waitFor(() => {
      const title = $('[data-testid=sk-onboarding-confirm-title]');
      expect(title?.textContent).toContain('5');
    });
    expect($('[data-testid=sk-onboarding-confirm-chips]')!.querySelectorAll('.sk-onb__chip').length)
      .toBeGreaterThan(0);
  });
});
