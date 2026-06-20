import { describe, it, expect, afterEach, vi } from 'vitest';
import { h } from 'preact';
import { mount } from '../src/ui/mount';
import { SamplePanel } from '../src/ui/components/Panel';
import { THEME_CSS } from '../src/ui/theme/tokens';

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function mountPanel(theme: 'light' | 'dark' | 'system') {
  const target = document.createElement('div');
  document.body.appendChild(target);
  return mount(target, h(SamplePanel, {}), { theme });
}

describe('theme tokens', () => {
  it('defines light and dark token sets plus a system override in the shadow stylesheet', () => {
    // Tokens are real and mode-specific.
    expect(THEME_CSS).toContain('--sk-color-bg: #fbfcff'); // light default (indigo-tinted neutral)
    expect(THEME_CSS).toContain(':host([data-theme="dark"])');
    expect(THEME_CSS).toContain('--sk-color-bg: #191a21'); // dark (indigo-tinted neutral)
    expect(THEME_CSS).toContain('@media (prefers-color-scheme: dark)');
    expect(THEME_CSS).toContain(':host([data-theme="system"])');
  });

  it('switches the active mode by flipping the host data-theme attribute', () => {
    const handle = mountPanel('dark');
    expect(handle.host.getAttribute('data-theme')).toBe('dark');

    handle.setTheme('light');
    expect(handle.host.getAttribute('data-theme')).toBe('light');

    handle.setTheme('system');
    expect(handle.host.getAttribute('data-theme')).toBe('system');
    handle.dispose();
  });

  it('defaults to system mode when no theme is given', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const handle = mount(target, h(SamplePanel, {}));
    expect(handle.host.getAttribute('data-theme')).toBe('system');
    handle.dispose();
  });

  it('scopes tokens to the shadow host, not the host document root', () => {
    const handle = mountPanel('light');
    const onDocRoot = getComputedStyle(document.documentElement)
      .getPropertyValue('--sk-color-bg')
      .trim();
    expect(onDocRoot).toBe('');
    handle.dispose();
  });
});
