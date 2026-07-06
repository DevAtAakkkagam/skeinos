// WelcomeApp render coverage (happy-dom). A component test — renders the welcome
// surface directly (not the entrypoint harness). Under vitest `import.meta.env.BROWSER`
// is undefined, so the component renders its Chrome variant (the default): the
// Chrome title, the "only opens on the four sites" caveat, and the four site chips.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'preact';
import { WelcomeApp } from '../src/ui/welcome/WelcomeApp';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
});

describe('WelcomeApp', () => {
  it('renders the getting-started surface with the brand mark', () => {
    render(<WelcomeApp />, container);
    expect($('[data-testid="sk-welcome"]')).not.toBeNull();
    expect($('.sk-wl__wordmark')?.textContent).toBe('Skeinos');
  });

  it('shows the Chrome variant: Chrome title and the four-sites-only caveat', () => {
    render(<WelcomeApp />, container);
    expect($('.sk-wl__title')?.textContent).toContain('Chrome');
    // The Chrome-only emphasized caveat is present (Firefox omits it).
    expect($('[data-testid="sk-welcome-only"]')).not.toBeNull();
  });

  it('lists the four supported sites as chips', () => {
    render(<WelcomeApp />, container);
    const chips = $$('.sk-wl__chip').map((c) => c.textContent);
    expect(chips).toEqual(['Claude', 'Gemini', 'Perplexity', 'ChatGPT']);
  });

  it('renders the three how-it-works steps', () => {
    render(<WelcomeApp />, container);
    expect($$('.sk-wl__step')).toHaveLength(3);
  });
});
