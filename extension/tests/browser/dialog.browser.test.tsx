// Dialog widget in real Chromium — focus trap, Escape dismissal + focus restoration,
// modal ARIA, and shadow-root scoping. Maps to the "Accessible modal dialog widget"
// + "Shadow-root scoped floating widgets" requirement scenarios.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'preact/hooks';
import { mount, type MountHandle } from '../../src/ui/mount';
import { PRIMITIVES_CSS } from '../../src/ui/primitives';
import { Dialog } from '../../src/ui/primitives/Dialog';

let handle: MountHandle | null = null;

// A trigger + dialog harness: opening captures the trigger as the focus origin so
// we can assert restoration on close.
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="trigger" type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Demo" contentTestId="dialog">
        <input data-testid="first" aria-label="first" />
        <button data-testid="last" type="button">
          Last
        </button>
      </Dialog>
    </div>
  );
}

function mountDialog() {
  const target = document.createElement('div');
  document.body.appendChild(target);
  handle = mount(target, <Harness />, { theme: 'light' });
  const style = document.createElement('style');
  style.textContent = PRIMITIVES_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;

afterEach(() => {
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
});

function openDialog() {
  const trigger = $('[data-testid=trigger]')!;
  // Focus then activate, as a keyboard user would — so Zag captures the trigger as
  // the focus origin to restore to (a bare programmatic click does not focus it).
  trigger.focus();
  trigger.click();
  return vi.waitFor(() => expect($('[data-testid=dialog]')).toBeTruthy());
}

describe('Dialog (real browser)', () => {
  it('renders inside the shadow root and is announced as a modal dialog', async () => {
    mountDialog();
    await openDialog();
    const content = $('[data-testid=dialog]')!;
    expect(content.getAttribute('role')).toBe('dialog');
    expect(content.getAttribute('aria-modal')).toBe('true');
    expect(document.body.querySelector('[data-testid=dialog]')).toBeNull();
  });

  it('traps focus within the dialog while open', async () => {
    mountDialog();
    await openDialog();
    const last = $('[data-testid=last]')!;
    last.focus();
    // Tabbing past the last focusable wraps back inside the dialog, never escaping.
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, composed: true }));
    await vi.waitFor(() => {
      const active = handle!.shadowRoot.activeElement;
      expect($('[data-testid=dialog]')!.contains(active)).toBe(true);
    });
  });

  it('closes on Escape and restores focus to the trigger', async () => {
    mountDialog();
    await openDialog();
    $('[data-testid=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await vi.waitFor(() => expect($('[data-testid=dialog]')).toBeNull());
    await vi.waitFor(() => expect(handle!.shadowRoot.activeElement).toBe($('[data-testid=trigger]')));
  });
});
