import { describe, it, expect, afterEach } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { SidebarShell } from '../../src/ui/sidebar/SidebarShell';
import { SIDEBAR_CSS } from '../../src/ui/sidebar/styles';

let handle: MountHandle | null = null;
afterEach(() => { handle?.dispose(); handle = null; document.body.innerHTML = ''; });

describe('bundled fonts (real browser)', () => {
  it('registers the Lattice faces on document.fonts and applies them in the shadow root', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    handle = mount(target, <SidebarShell platform="claude" />, { theme: 'light' });
    const s = document.createElement('style'); s.textContent = SIDEBAR_CSS;
    handle.shadowRoot.appendChild(s);

    // FontFace API registration
    const families = new Set<string>();
    document.fonts.forEach((f) => families.add(f.family));
    expect(families.has('Urbanist')).toBe(true);
    expect(families.has('IBM Plex Mono')).toBe(true);

    await document.fonts.ready;

    // the overline heading should resolve to the label font (IBM Plex Mono)
    const heading = handle.shadowRoot.querySelector('.sk-sidebar__heading') as HTMLElement;
    expect(heading).toBeTruthy();
    const fam = getComputedStyle(heading).fontFamily;
    expect(fam).toContain('IBM Plex Mono');
  });
});
