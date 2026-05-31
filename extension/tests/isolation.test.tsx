import { describe, it, expect, afterEach } from 'vitest';
import { h } from 'preact';
import { mount } from '../src/ui/mount';
import { SamplePanel } from '../src/ui/components/Panel';

// happy-dom does NOT implement shadow-DOM style encapsulation or custom-property
// resolution, so the *computed-style* isolation guarantees live in the real-browser
// suite (tests/browser/isolation.browser.test.tsx). Here we assert the structural
// preconditions that make that isolation hold.

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

function makeTarget(): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return target;
}

describe('host-CSS isolation (structure)', () => {
  it('renders into a shadow root and does not copy host rules into it', () => {
    const hostStyle = document.createElement('style');
    hostStyle.textContent = '* { color: rgb(255, 0, 0) !important; }';
    document.head.appendChild(hostStyle);

    const handle = mount(makeTarget(), h(SamplePanel, {}), { theme: 'light' });

    const shadowStyleText = Array.from(handle.shadowRoot.querySelectorAll('style'))
      .map((s) => s.textContent)
      .join('\n');
    expect(shadowStyleText).not.toContain('255, 0, 0');

    handle.dispose();
  });

  it('injects a boundary reset on :host to block inherited host properties', () => {
    const handle = mount(makeTarget(), h(SamplePanel, {}), { theme: 'light' });
    const shadowStyleText = Array.from(handle.shadowRoot.querySelectorAll('style'))
      .map((s) => s.textContent)
      .join('\n');
    expect(shadowStyleText).toContain(':host');
    expect(shadowStyleText).toContain('all: initial');
    handle.dispose();
  });

  it('keeps component styles inside the shadow root, not the host document', () => {
    const handle = mount(makeTarget(), h(SamplePanel, {}), { theme: 'light' });
    // Our component CSS must not have been appended to the host document head.
    const docStyles = Array.from(document.head.querySelectorAll('style'))
      .map((s) => s.textContent)
      .join('\n');
    expect(docStyles).not.toContain('.sk-btn');
    handle.dispose();
  });
});
