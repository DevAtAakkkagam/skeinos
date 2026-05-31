import { describe, it, expect, afterEach } from 'vitest';
import { h } from 'preact';
import { mount } from '../../src/ui/mount';
import { SamplePanel } from '../../src/ui/components/Panel';

afterEach(() => {
  document.body.innerHTML = '';
});

function makeTarget(): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return target;
}

describe('theme tokens (real browser)', () => {
  it('resolves token-derived colors and switches them live on theme change', () => {
    const handle = mount(makeTarget(), h(SamplePanel, {}), { theme: 'light' });
    const panel = handle.shadowRoot.querySelector('.sk-panel') as HTMLElement;

    expect(getComputedStyle(panel).backgroundColor).toBe('rgb(255, 255, 255)'); // light

    handle.setTheme('dark');
    expect(getComputedStyle(panel).backgroundColor).toBe('rgb(26, 26, 26)'); // dark

    handle.setTheme('light');
    expect(getComputedStyle(panel).backgroundColor).toBe('rgb(255, 255, 255)');

    handle.dispose();
  });

  it('resolves tokens on the shadow host but leaves the host document root untouched', () => {
    const handle = mount(makeTarget(), h(SamplePanel, {}), { theme: 'light' });

    expect(getComputedStyle(handle.host).getPropertyValue('--sk-color-bg').trim()).toBe('#ffffff');
    expect(
      getComputedStyle(document.documentElement).getPropertyValue('--sk-color-bg').trim(),
    ).toBe('');

    handle.dispose();
  });
});
