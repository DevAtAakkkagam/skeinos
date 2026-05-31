import { describe, it, expect, afterEach } from 'vitest';
import { h } from 'preact';
import { mount } from '../src/ui/mount';
import { SamplePanel } from '../src/ui/components/Panel';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.querySelectorAll('style[data-test]').forEach((n) => n.remove());
});

function makeTarget(): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return target;
}

describe('shadow-DOM mount harness', () => {
  it('renders the panel inside an open shadow root', () => {
    const target = makeTarget();
    const handle = mount(target, h(SamplePanel, {}));

    expect(handle.shadowRoot).toBeTruthy();
    expect(handle.host.shadowRoot).toBe(handle.shadowRoot);

    const panel = handle.shadowRoot.querySelector('[data-testid="sk-panel"]');
    expect(panel).toBeTruthy();
    expect(handle.shadowRoot.textContent).toContain('Skeinos');

    handle.dispose();
  });

  it('disposer unmounts the tree and removes the host node', () => {
    const target = makeTarget();
    const handle = mount(target, h(SamplePanel, {}));

    expect(target.contains(handle.host)).toBe(true);

    handle.dispose();

    expect(target.contains(handle.host)).toBe(false);
    expect(document.querySelector('[data-skeinos-root]')).toBeNull();
  });
});
