// adapter-resilience banner coverage (happy-dom). Proves the breakage notice
// mounts in a shadow root with the right affordances, recovers on a passing retry,
// and — the headline DoD (T1.5) — that a simulated broken config raises the banner
// while a healthy platform stays clean and operational (isolation).

import { afterEach, describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import { getBundledConfig } from '../src/adapters/configs';
import { mountBanner, BANNER_LABELS } from '../src/adapters/resilience/Banner';
import type { AdapterConfig, PlatformAdapter, PlatformId } from '../src/adapters/types';

const claudeConfig = getBundledConfig('claude') as AdapterConfig;

// Minimal host markup matching the Claude config's required anchors (the dframe
// aside sidebar, a fieldset input bar, and the chat-input composer).
const HEALTHY_HTML = `
  <aside class="dframe-sidebar"><div data-row-key="chat:c1"><div data-row=""><button data-row-main-button="">Chat</button></div></div></aside>
  <fieldset>
    <div data-testid="chat-input" contenteditable="true" class="tiptap ProseMirror"></div>
  </fieldset>
`;
// A "broken config": the composer anchor the selectors target is gone.
const BROKEN_HTML = `
  <aside class="dframe-sidebar"><div data-row-key="chat:c1"><div data-row=""><button data-row-main-button="">Chat</button></div></div></aside>
  <fieldset></fieldset>
`;

function makeAdapter(html: string): { adapter: PlatformAdapter; root: HTMLElement } {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return { adapter: createAdapter(claudeConfig, { root }), root };
}

/** Mirror the content-entry decision: raise the banner only on a failed check. */
function reflectHealth(adapter: PlatformAdapter, platform: PlatformId): (() => void) | null {
  return adapter.selfCheck().ok ? null : mountBanner(adapter, platform);
}

/** Every mounted breakage banner currently in the document (across shadow roots). */
function banners(): Element[] {
  return Array.from(document.querySelectorAll('[data-skeinos-root]'))
    .map((host) => (host as HTMLElement).shadowRoot?.querySelector('[data-testid="sk-breakage-banner"]'))
    .filter((el): el is Element => el != null);
}

/** Let the async Retry handler's `waitForSelfCheck().then(...)` microtask settle. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function buttonByText(banner: Element, text: string): HTMLButtonElement {
  const btn = Array.from(banner.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text,
  );
  if (!btn) throw new Error(`button "${text}" not found`);
  return btn as HTMLButtonElement;
}

/** The close (dismiss) control is an icon button addressed by its accessible label. */
function dismissButton(banner: Element): HTMLButtonElement {
  const btn = banner.querySelector<HTMLButtonElement>(
    `button[aria-label="${BANNER_LABELS.dismiss}"]`,
  );
  if (!btn) throw new Error('dismiss button not found');
  return btn;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Breakage-notice banner (5.5)', () => {
  it('a simulated broken config mounts the banner in a shadow root with the right controls', () => {
    const { adapter } = makeAdapter(BROKEN_HTML);
    mountBanner(adapter, 'claude');

    const found = banners();
    expect(found).toHaveLength(1);

    const banner = found[0];
    expect(banner.getAttribute('role')).toBe('alert');
    expect(buttonByText(banner, BANNER_LABELS.retry)).toBeTruthy();
    expect(dismissButton(banner)).toBeTruthy();
  });

  it('Dismiss unmounts the banner', () => {
    const { adapter } = makeAdapter(BROKEN_HTML);
    mountBanner(adapter, 'claude');

    dismissButton(banners()[0]).click();
    expect(banners()).toHaveLength(0);
  });

  it('Retry on a still-broken platform leaves the banner up and fires no recovery', async () => {
    const { adapter } = makeAdapter(BROKEN_HTML);
    let recovered = 0;
    mountBanner(adapter, 'claude', { onRecover: () => recovered++ });

    buttonByText(banners()[0], BANNER_LABELS.retry).click();
    await flush();
    expect(banners()).toHaveLength(1);
    expect(recovered).toBe(0);
  });

  it('Retry on a recovered platform runs the ready path, then disposes the banner', async () => {
    const { adapter, root } = makeAdapter(BROKEN_HTML);
    // `onRecover` is the content script's ready path (mount the overlay + observers);
    // a passing Retry MUST run it, else the banner closes onto a bare page (the
    // "Retry does nothing, reload works" bug).
    let recovered = 0;
    mountBanner(adapter, 'claude', { onRecover: () => recovered++ });
    expect(banners()).toHaveLength(1);

    // The host page recovers: the missing composer anchor reappears.
    const composer = document.createElement('div');
    composer.setAttribute('data-testid', 'chat-input');
    composer.setAttribute('contenteditable', 'true');
    root.querySelector('fieldset')!.appendChild(composer);

    buttonByText(banners()[0], BANNER_LABELS.retry).click();
    await flush();
    expect(recovered).toBe(1);
    expect(banners()).toHaveLength(0);
  });
});

describe('Headline DoD: broken config raises the banner, isolated to that platform (6.2)', () => {
  it('the broken platform shows the banner; the healthy platform shows none and stays operational', () => {
    const broken = makeAdapter(BROKEN_HTML);
    const healthy = makeAdapter(HEALTHY_HTML);

    const disposeBroken = reflectHealth(broken.adapter, 'claude');
    const disposeHealthy = reflectHealth(healthy.adapter, 'gemini');

    // Exactly one banner — only the broken platform raised it.
    expect(disposeBroken).not.toBeNull();
    expect(disposeHealthy).toBeNull();
    expect(banners()).toHaveLength(1);

    // The healthy platform is untouched and fully operational.
    expect(healthy.adapter.selfCheck().ok).toBe(true);
    expect(healthy.adapter.getInputElement()).not.toBeNull();
  });
});
