// Mounts the sidebar via the shared shadow-DOM harness (ui-shell), then injects
// the sidebar's own token-based CSS into that shadow root — so feature styles stay
// out of the host document and out of the generic harness.
//
// `mountSidebar` mounts the shell into a caller-supplied light-DOM node. The
// workspace UI now lives in the browser side panel (the `side-panel` change), so
// the content script no longer docks a panel into the host page — the outboard
// dock + host `marginRight` reflow are gone. This embed helper is retained for
// tests and any future in-page embed.

import { mount, type MountHandle, type MountOptions } from '../mount';
import { SidebarShell } from './SidebarShell';
import { SIDEBAR_CSS } from './styles';
import type { PlatformId } from '../../shared/types';

export function mountSidebar(
  target: HTMLElement,
  platform: PlatformId,
  opts: MountOptions = {},
): MountHandle {
  const handle = mount(target, <SidebarShell platform={platform} />, opts);
  handle.host.style.height = '100%';
  const style = document.createElement('style');
  style.textContent = SIDEBAR_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}
