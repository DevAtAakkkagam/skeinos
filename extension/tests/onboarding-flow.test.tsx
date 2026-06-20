// onboarding-flow stepper coverage (happy-dom). Renders `OnboardingSurface` directly
// (a component test — NOT the panel/router, which `onboarding-panel.test.tsx` owns).
// Maps to openspec/changes/onboarding-flow/tasks.md §8.1–8.5.
//
// Mirrors the existing onboarding/prompts tests: preact `render` into a detached
// container, a `flush = () => new Promise(r => setTimeout(r, 0))` microtask helper,
// and stubbed prop writers (no worker, no chrome). All four writers
// (`onComplete`/`installSeeds`/`persistDomain`/`createFolder`) are overridable props,
// so this suite never touches the real gate, worker client, or `chrome.*`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { OnboardingSurface } from '../src/ui/onboarding/OnboardingSurface';
import { seedsForDomain } from '../src/core/prompts/catalog';
import { DOMAIN_REGISTRY, type DomainId } from '../src/shared/domains';
import type { PlatformId } from '../src/shared/types';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
});

/** Default stubs; each test can override individually. `installSeeds` returns 5 to
 *  match a full domain pack (every domain ships five seeds), but the count under test
 *  always comes from the STUB's reply, never this catalog size. */
function mount(over: Partial<Parameters<typeof OnboardingSurface>[0]> = {}) {
  const props = {
    platform: 'claude' as const,
    onComplete: vi.fn(async () => {}),
    installSeeds: vi.fn(async () => 5),
    persistDomain: vi.fn(async () => {}),
    createFolder: vi.fn(async () => {}),
    ...over,
  };
  render(<OnboardingSurface {...props} />, container);
  return props;
}

const root = () => $('[data-testid=sk-onboarding]')!;
const step = () => Number(root().getAttribute('data-step'));
const activeDot = () => $$('.sk-onb__dot').findIndex((d) => d.classList.contains('sk-onb__dot--active'));

// --- 8.1 stepper navigation --------------------------------------------------
describe('Stepper navigation (8.1)', () => {
  it('starts on welcome: step 0, welcome step rendered, first dot active', () => {
    mount();
    expect(step()).toBe(0);
    expect($('[data-testid=sk-onboarding-step-welcome]')).toBeTruthy();
    expect($('[data-testid=sk-onboarding-step-permissions]')).toBeNull();
    expect($$('.sk-onb__dot')).toHaveLength(4);
    expect(activeDot()).toBe(0);
  });

  it('"Get started" → permissions → "Continue" → starter → "Continue" → get started, in order', async () => {
    mount();

    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();
    expect(step()).toBe(1);
    expect($('[data-testid=sk-onboarding-step-permissions]')).toBeTruthy();
    expect(activeDot()).toBe(1);

    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    expect(step()).toBe(2);
    expect($('[data-testid=sk-onboarding-step-starter]')).toBeTruthy();
    expect(activeDot()).toBe(2);

    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    expect(step()).toBe(3);
    expect($('[data-testid=sk-onboarding-step-getstarted]')).toBeTruthy();
    expect(activeDot()).toBe(3);
  });

  it('"Back" from permissions returns to welcome', async () => {
    mount();
    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();
    expect(step()).toBe(1);

    $('[data-testid=sk-onboarding-back]')!.click();
    await flush();
    expect(step()).toBe(0);
    expect($('[data-testid=sk-onboarding-step-welcome]')).toBeTruthy();
    expect(activeDot()).toBe(0);
  });

  it('none of the step navigations complete onboarding', async () => {
    const { onComplete } = mount();
    $('[data-testid=sk-onboarding-start]')!.click(); // welcome → permissions
    await flush();
    $('[data-testid=sk-onboarding-back]')!.click(); // permissions → welcome
    await flush();
    $('[data-testid=sk-onboarding-start]')!.click(); // welcome → permissions
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click(); // permissions → starter
    await flush();
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// --- 8.2 completion timing ---------------------------------------------------
describe('Completion timing (8.2)', () => {
  it('the welcome skip completes onboarding', async () => {
    const { onComplete } = mount();
    $('[data-testid=sk-onboarding-skip]')!.click();
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('intermediate "Get started"/"Continue"/"Back" never complete onboarding', async () => {
    const { onComplete } = mount();
    $('[data-testid=sk-onboarding-start]')!.click(); // welcome → permissions
    await flush();
    $('[data-testid=sk-onboarding-back]')!.click(); // permissions → welcome ("Back")
    await flush();
    $('[data-testid=sk-onboarding-start]')!.click(); // welcome → permissions
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click(); // permissions → starter
    await flush();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('the final-step "Finish setup" completes onboarding', async () => {
    const { onComplete } = mount({ platform: 'claude' });
    // advance to get-started
    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-finish]')!.click();
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('the final-step "Create your first folder" completes onboarding', async () => {
    const { onComplete } = mount({ platform: 'claude' });
    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-create-folder]')!.click();
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// --- 8.3 permissions priming -------------------------------------------------
describe('Permissions priming (8.3)', () => {
  // The component must never touch `chrome.permissions`. We install a chrome stub that
  // has NO `permissions` key and a permission-request spy; accessing it would throw or
  // call the spy. Advancing past the step must do neither.
  const originalChrome = (globalThis as { chrome?: unknown }).chrome;
  const requestSpy = vi.fn();

  beforeEach(() => {
    // deliberately NO `permissions` member; a getter trap flags any access.
    const chromeStub: Record<string, unknown> = { runtime: { sendMessage: vi.fn() } };
    Object.defineProperty(chromeStub, 'permissions', {
      configurable: true,
      get() {
        requestSpy('permissions-accessed');
        return { request: requestSpy, contains: requestSpy };
      },
    });
    (globalThis as { chrome?: unknown }).chrome = chromeStub;
    requestSpy.mockClear();
  });
  afterEach(() => {
    (globalThis as { chrome?: unknown }).chrome = originalChrome;
  });

  it('lists the three P0 hosts with per-site "for" copy and a "Read & type" badge', async () => {
    mount();
    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();

    const sites = $('[data-testid=sk-onboarding-perm-sites]')!;
    expect(sites).toBeTruthy();
    const hosts = [...sites.querySelectorAll('.sk-onb__site-host')].map((n) => n.textContent);
    expect(hosts).toEqual(['claude.ai', 'gemini.google.com', 'perplexity.ai']);

    // Each site has non-empty per-site "for" copy.
    const fors = [...sites.querySelectorAll('.sk-onb__site-for')].map((n) => n.textContent ?? '');
    expect(fors).toHaveLength(3);
    expect(fors.every((t) => t.trim().length > 0)).toBe(true);

    // Each site carries a "Read & type" badge.
    const badges = [...sites.querySelectorAll('.sk-onb__site-badge')].map((n) => n.textContent);
    expect(badges).toEqual(['Read & type', 'Read & type', 'Read & type']);

    // The assurance line is present.
    expect($('[data-testid=sk-onboarding-perm-assurance]')).toBeTruthy();
  });

  it('does not touch chrome.permissions when shown or advanced past', async () => {
    mount();
    $('[data-testid=sk-onboarding-start]')!.click(); // → permissions
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click(); // permissions → starter
    await flush();
    expect(requestSpy).not.toHaveBeenCalled();
  });
});

// --- 8.4 starter library -----------------------------------------------------
describe('Starter library (8.4)', () => {
  const DOMAIN = 'software-engineering' as const;

  async function gotoStarter(over: Partial<Parameters<typeof OnboardingSurface>[0]> = {}) {
    const props = mount(over);
    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    expect($('[data-testid=sk-onboarding-step-starter]')).toBeTruthy();
    return props;
  }

  it('selecting a domain installs its seeds, persists the domain, and confirms the stub count', async () => {
    const installSeeds = vi.fn(async () => 5);
    const persistDomain = vi.fn(async () => {});
    const { onComplete } = await gotoStarter({ installSeeds, persistDomain });

    $(`[data-testid=sk-onboarding-domain-${DOMAIN}]`)!.click();
    await flush();

    expect(installSeeds).toHaveBeenCalledWith(DOMAIN);
    expect(persistDomain).toHaveBeenCalledWith(DOMAIN);

    // Confirmation reflects the STUB's count (5), not any hard-coded value.
    const title = $('[data-testid=sk-onboarding-confirm-title]')!;
    expect(title.textContent).toBe('5 starter prompts added');
    // Picking a domain is not terminal — the gate stays open.
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('the confirmation chips include a real seeded title from the catalog', async () => {
    await gotoStarter({ installSeeds: vi.fn(async () => 5) });
    $(`[data-testid=sk-onboarding-domain-${DOMAIN}]`)!.click();
    await flush();

    const chips = $('[data-testid=sk-onboarding-confirm-chips]')!;
    const chipText = [...chips.querySelectorAll('.sk-onb__chip')].map((c) => c.textContent);
    const seededTitles = seedsForDomain(DOMAIN).map((s) => s.title);
    // At least one real seeded title is shown verbatim.
    expect(seededTitles.some((t) => chipText.includes(t))).toBe(true);
  });

  it('a 0-count reply shows the zero-state ("already in your library") title', async () => {
    const installSeeds = vi.fn(async () => 0);
    await gotoStarter({ installSeeds });
    $(`[data-testid=sk-onboarding-domain-${DOMAIN}]`)!.click();
    await flush();

    expect(installSeeds).toHaveBeenCalledTimes(1);
    const title = $('[data-testid=sk-onboarding-confirm-title]')!;
    expect(title.textContent).toBe('Starter prompts already in your library');
    // The count came from the reply (0) — no duplicate install happened.
    expect(installSeeds).toHaveBeenCalledTimes(1);
  });

  it('install failure shows a retryable error and does not complete the gate; retry re-invokes installSeeds', async () => {
    const installSeeds = vi
      .fn(async (_d: DomainId): Promise<number> => 7)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(7);
    const { onComplete } = await gotoStarter({ installSeeds });

    $(`[data-testid=sk-onboarding-domain-${DOMAIN}]`)!.click();
    await flush();

    expect($('[data-testid=sk-onboarding-starter-error]')).toBeTruthy();
    expect($('[data-testid=sk-onboarding-starter-retry]')).toBeTruthy();
    expect($('[data-testid=sk-onboarding-confirm-title]')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();

    // Retry re-invokes the installer; the second (resolving) call confirms.
    $('[data-testid=sk-onboarding-starter-retry]')!.click();
    await flush();
    expect(installSeeds).toHaveBeenCalledTimes(2);
    expect($('[data-testid=sk-onboarding-confirm-title]')!.textContent).toBe('7 starter prompts added');
    expect($('[data-testid=sk-onboarding-starter-error]')).toBeNull();
  });
});

// --- 8.5 get-started actions -------------------------------------------------
describe('Get-started actions (8.5)', () => {
  async function gotoGetStarted(over: Partial<Parameters<typeof OnboardingSurface>[0]> = {}) {
    const props = mount(over);
    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    expect($('[data-testid=sk-onboarding-step-getstarted]')).toBeTruthy();
    return props;
  }

  it('with platform="claude", "Create your first folder" calls createFolder(name, "claude") then completes', async () => {
    const createFolder = vi.fn(async (_name: string, _platform: PlatformId) => {});
    const { onComplete } = await gotoGetStarted({ platform: 'claude', createFolder });

    const btn = $('[data-testid=sk-onboarding-create-folder]')!;
    expect(btn).toBeTruthy();
    btn.click();
    await flush();

    expect(createFolder).toHaveBeenCalledTimes(1);
    const [name, platform] = createFolder.mock.calls[0];
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(platform).toBe('claude');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('"Finish setup" completes onboarding', async () => {
    const { onComplete } = await gotoGetStarted({ platform: 'claude' });
    $('[data-testid=sk-onboarding-finish]')!.click();
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('with platform=null the create-folder action is absent but "Finish setup" still completes', async () => {
    const createFolder = vi.fn(async () => {});
    const { onComplete } = await gotoGetStarted({ platform: null, createFolder });

    expect($('[data-testid=sk-onboarding-create-folder]')).toBeNull();
    $('[data-testid=sk-onboarding-finish]')!.click();
    await flush();
    expect(createFolder).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('there is no "open a platform" action anywhere on the get-started step', async () => {
    await gotoGetStarted({ platform: 'claude' });
    // No control or copy that opens/launches a platform exists.
    const text = $('[data-testid=sk-onboarding-step-getstarted]')!.textContent ?? '';
    expect(/open\s+(a\s+)?platform/i.test(text)).toBe(false);
    expect($('[data-testid=sk-onboarding-open-platform]')).toBeNull();
  });
});

// Sanity: the registry order the picker iterates is the one we assume above.
describe('domain registry sanity', () => {
  it('iterates DOMAIN_REGISTRY and renders a button per domain', async () => {
    mount();
    $('[data-testid=sk-onboarding-start]')!.click();
    await flush();
    $('[data-testid=sk-onboarding-continue]')!.click();
    await flush();
    for (const d of DOMAIN_REGISTRY) {
      expect($(`[data-testid=sk-onboarding-domain-${d.id}]`)).toBeTruthy();
    }
  });
});
