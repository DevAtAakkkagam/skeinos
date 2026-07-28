// Options footer external links (happy-dom). A component test — renders OptionsApp
// directly. These three buttons are the extension's only outbound links, and the
// source-code one carries a claim the store listing and privacy policy both make
// ("you can check this yourself"), so a silent regression here breaks a promise
// rather than a feature. Asserts each button exists, is labelled, and opens the
// URL that shared/links.ts defines.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { OptionsApp } from '../src/ui/options/OptionsApp';
import { FEEDBACK_URL, REVIEW_URL, SOURCE_URL } from '../src/shared/links';

let container: HTMLElement;
const $ = (sel: string) => container.querySelector(sel) as HTMLElement | null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('options page external links', () => {
  it.each([
    ['sk-send-feedback', FEEDBACK_URL],
    ['sk-source-code', SOURCE_URL],
    ['sk-rate', REVIEW_URL],
  ])('%s opens its configured URL in a new tab', (testid, url) => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(<OptionsApp />, container);

    const btn = $(`[data-testid="${testid}"]`) as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    // Every button carries a translated label — no bare icon, nothing hard-coded.
    expect(btn?.textContent?.trim()).not.toBe('');

    btn?.click();
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener');
  });

  it('points the source link at the public repository', () => {
    // The listing tells users they can read the code; this is the path there.
    expect(SOURCE_URL).toBe('https://github.com/aakkagam/skeinos');
  });
});
