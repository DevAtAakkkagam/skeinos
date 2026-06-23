// Onboarding consent surface coverage (onboarding spec "Privacy step surfaces
// telemetry consent", task 7.2): the diagnostics toggle lives on the FINAL step
// (above Finish setup), renders unchecked (opt-in), persists only when the user
// ticks it, and completing without ticking never enables the flag.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { OnboardingSurface } from '../src/ui/onboarding/OnboardingSurface';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
});

function mount(over: Partial<Parameters<typeof OnboardingSurface>[0]> = {}) {
  const props = {
    platform: 'claude' as const,
    onComplete: vi.fn(async () => {}),
    installSeeds: vi.fn(async () => 5),
    persistDomain: vi.fn(async () => {}),
    createFolder: vi.fn(async () => {}),
    persistConsent: vi.fn(async () => {}),
    ...over,
  };
  render(<OnboardingSurface {...props} />, container);
  return props;
}

const diagnosticsBox = () =>
  $('[data-testid=sk-onboarding-consent-diagnostics] input') as HTMLInputElement | null;

/** Click through welcome → permissions → starter → the final get-started step. */
async function gotoFinalStep() {
  $('[data-testid=sk-onboarding-start]')!.click();
  await flush();
  $('[data-testid=sk-onboarding-continue]')!.click(); // permissions → starter
  await flush();
  $('[data-testid=sk-onboarding-continue]')!.click(); // starter → get-started
  await flush();
}

describe('Onboarding consent toggle (7.2)', () => {
  it('the consent toggle is absent on the welcome step', async () => {
    mount();
    await flush();
    expect($('[data-testid=sk-onboarding-step-welcome]')).toBeTruthy();
    expect($('[data-testid=sk-onboarding-consent]')).toBeNull();
  });

  it('the toggle appears on the final step, unchecked by default', async () => {
    mount();
    await gotoFinalStep();
    expect($('[data-testid=sk-onboarding-step-getstarted]')).toBeTruthy();
    expect($('[data-testid=sk-onboarding-consent]')).toBeTruthy();
    expect(diagnosticsBox()!.checked).toBe(false);
  });

  it('finishing without ticking commits diagnostics off', async () => {
    const props = mount();
    await gotoFinalStep();
    $('[data-testid=sk-onboarding-finish]')!.click();
    await flush();
    expect(props.onComplete).toHaveBeenCalled();
    expect(props.persistConsent).toHaveBeenCalledWith({ diagnosticsOptIn: false });
  });

  it('ticking the box then finishing commits the opt-in', async () => {
    const props = mount();
    await gotoFinalStep();
    diagnosticsBox()!.click(); // off → on
    await flush();
    $('[data-testid=sk-onboarding-finish]')!.click();
    await flush();
    expect(props.persistConsent).toHaveBeenCalledWith({ diagnosticsOptIn: true });
  });
});
