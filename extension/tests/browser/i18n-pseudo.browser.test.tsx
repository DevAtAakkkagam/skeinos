// Pseudo-locale expansion pass in real Chromium (task 5.3, D21). Forces the UI into
// the generated `en-XA` pseudo-locale — accented, bracketed, ~140% padded — and
// asserts that the load-bearing chrome (the tab nav / segmented control, the filter
// chips, and the footer badge) renders without the panel developing a horizontal
// overflow. Real layout, real CSS, real shadow root — the only thing faked is the
// chrome messaging stub the shell needs to mount.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';
import { SidebarShell } from '../../src/ui/sidebar/SidebarShell';
import { forceLocale } from '../../src/core/i18n';

// Minimal chrome loopback: enough for the shell's workspace client to subscribe and
// send without throwing. Handlers are absent, so the body settles into an empty/error
// state — but the tab nav, filter chips, and footer badge (the surfaces under test)
// render regardless of body data.
type Listener = (msg: unknown, sender: unknown, send: (r: unknown) => void) => unknown;
function installChrome() {
  const listeners = new Set<Listener>();
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      onMessage: {
        addListener: (l: Listener) => void listeners.add(l),
        removeListener: (l: Listener) => void listeners.delete(l),
      },
      sendMessage: async () => undefined,
      lastError: undefined,
      openOptionsPage: () => {},
    },
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async () => {},
    },
  };
}

// A panel width at the narrow end of what the side panel ships at — the tighter the
// box, the more honestly it surfaces expansion overflow.
const PANEL_WIDTH = 320;

let handle: MountHandle | null = null;

function mountShell(): MountHandle {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const h = mount(target, <SidebarShell platform="claude" />, { theme: 'light' });
  h.host.style.cssText = `width:${PANEL_WIDTH}px;height:600px;display:block;`;
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  h.shadowRoot.appendChild(style);
  return h;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;

/** An element "overflows" when its scrollable content is wider than its box. A 1px
 *  slack absorbs sub-pixel rounding from the layout engine. */
function overflowsX(el: HTMLElement): boolean {
  return el.scrollWidth - el.clientWidth > 1;
}

beforeEach(() => {
  installChrome();
  forceLocale('en-XA');
});

afterEach(() => {
  forceLocale(null);
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
  (globalThis as { chrome?: unknown }).chrome = undefined;
});

describe('pseudo-locale expansion', () => {
  it('renders the chrome in the accented, bracketed pseudo-locale', () => {
    handle = mountShell();
    const folders = $('[data-testid="sk-tab-folders"]');
    expect(folders).toBeTruthy();
    // The pseudo transformer brackets every string with ⟦…⟧ and accents letters.
    expect(folders!.textContent).toContain('⟦');
    expect(folders!.textContent).not.toBe('Folders');
  });

  it('keeps the tab nav (segmented control) within the panel', () => {
    handle = mountShell();
    const tabs = $('.sk-tabs');
    expect(tabs).toBeTruthy();
    expect(overflowsX(tabs!), 'tab nav overflows its track').toBe(false);
  });

  it('keeps the filter chip row within the panel', () => {
    handle = mountShell();
    const chips = $('[data-testid="sk-platforms"]');
    expect(chips).toBeTruthy();
    expect(overflowsX(chips!), 'filter chip row overflows').toBe(false);
  });

  it('keeps the footer badge within the panel', () => {
    handle = mountShell();
    const status = $('[data-testid="sk-status"]');
    expect(status).toBeTruthy();
    expect(overflowsX(status!), 'footer badge overflows').toBe(false);
  });

  it('does not give the whole panel a horizontal scrollbar', () => {
    handle = mountShell();
    const shell = $('.sk-shell');
    expect(shell).toBeTruthy();
    expect(overflowsX(shell!), 'panel has horizontal overflow').toBe(false);
  });
});
