import { describe, it, expect, afterEach } from 'vitest';
import { h } from 'preact';
import { mount } from '../../src/ui/mount';
import { SamplePanel } from '../../src/ui/components/Panel';

// Runs in real Chromium, so shadow-DOM encapsulation and token resolution are real.

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function makeTarget(): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return target;
}

describe('host-CSS isolation (real browser)', () => {
  it('host global !important styles do not change the panel computed styles', () => {
    const hostStyle = document.createElement('style');
    hostStyle.textContent = '* { color: rgb(255, 0, 0) !important; background: rgb(0, 255, 0) !important; }';
    document.head.appendChild(hostStyle);

    const handle = mount(makeTarget(), h(SamplePanel, {}), { theme: 'light' });

    const text = handle.shadowRoot.querySelector('.sk-text') as HTMLElement;
    const panel = handle.shadowRoot.querySelector('.sk-panel') as HTMLElement;

    // Extension's own tokens win inside the shadow root, not the host's red/green.
    // (`--sk-color-fg` #181a23 / `--sk-color-bg` #fbfcff in the light theme.)
    expect(getComputedStyle(text).color).toBe('rgb(24, 26, 35)');
    expect(getComputedStyle(panel).backgroundColor).toBe('rgb(251, 252, 255)');

    handle.dispose();
  });

  it('extension styles do not change host-page elements', () => {
    // A host element reusing our class name must stay unstyled by us.
    const hostBtn = document.createElement('button');
    hostBtn.className = 'sk-btn';
    hostBtn.textContent = 'host button';
    document.body.appendChild(hostBtn);

    const before = getComputedStyle(hostBtn).backgroundColor;
    const handle = mount(makeTarget(), h(SamplePanel, {}), { theme: 'light' });
    const after = getComputedStyle(hostBtn).backgroundColor;

    expect(after).toBe(before);
    expect(after).not.toBe('rgb(79, 70, 229)'); // our accent did not leak out

    handle.dispose();
  });
});
