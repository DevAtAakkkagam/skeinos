// Menu widget in real Chromium — keyboard, dismissal, focus restoration, and
// shadow-root scoping. Maps to the "Accessible menu widget" + "Shadow-root scoped
// floating widgets" requirement scenarios.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { PRIMITIVES_CSS } from '../../src/ui/primitives';
import { Menu, type MenuItemSpec } from '../../src/ui/primitives/Menu';

let handle: MountHandle | null = null;
const selected: string[] = [];

const ITEMS: MenuItemSpec[] = [
  { value: 'one', label: 'One', testid: 'item-one' },
  { value: 'two', label: 'Two', testid: 'item-two' },
  { value: 'three', label: 'Three', testid: 'item-three' },
];

function mountMenu() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  handle = mount(
    target,
    <Menu
      trigger="Open"
      triggerTestId="trigger"
      contentTestId="menu"
      items={ITEMS}
      onSelect={(v) => selected.push(v)}
    />,
    { theme: 'light' },
  );
  const style = document.createElement('style');
  style.textContent = PRIMITIVES_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;

beforeEach(() => {
  selected.length = 0;
});

afterEach(() => {
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
});

function openMenu() {
  $('[data-testid=trigger]')!.click();
  return vi.waitFor(() => expect($('[data-testid=menu]')).toBeTruthy());
}

// `composed: true` so the event crosses the shadow boundary to reach Zag's
// document-level dismiss/key listeners (real user events are composed).
function keydown(el: HTMLElement, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
}

describe('Menu (real browser)', () => {
  it('renders its content inside the shadow root, not the host light DOM', async () => {
    mountMenu();
    await openMenu();
    expect($('[data-testid=menu]')).toBeTruthy();
    // Nothing leaked into the host page's body.
    expect(document.body.querySelector('[data-testid=menu]')).toBeNull();
  });

  it('is keyboard operable: arrow keys move focus and Enter activates', async () => {
    mountMenu();
    await openMenu();
    const content = () => $('[data-testid=menu]')!;
    // Space the keys so Preact commits each highlight before the next event reads it
    // (real keyboard events are likewise separated by event-loop ticks).
    keydown(content(), 'ArrowDown'); // highlight first item
    await vi.waitFor(() => expect(content().getAttribute('aria-activedescendant')).toContain('one'));
    keydown(content(), 'ArrowDown'); // highlight second item
    await vi.waitFor(() => expect(content().getAttribute('aria-activedescendant')).toContain('two'));
    keydown(content(), 'Enter');
    await vi.waitFor(() => expect(selected).toEqual(['two']));
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    mountMenu();
    await openMenu();
    keydown($('[data-testid=menu]')!, 'Escape');
    await vi.waitFor(() => expect($('[data-testid=menu]')).toBeNull());
    await vi.waitFor(() => expect(handle!.shadowRoot.activeElement).toBe($('[data-testid=trigger]')));
  });

  it('closes on an outside interaction without activating an item', async () => {
    mountMenu();
    await openMenu();
    // Zag's interact-outside dismissal listens for pointerdown, not click.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    await vi.waitFor(() => expect($('[data-testid=menu]')).toBeNull());
    expect(selected).toEqual([]);
  });
});
