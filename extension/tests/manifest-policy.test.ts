import { describe, it, expect } from 'vitest';
import { P0_MATCHES, skeinosManifest } from '../src/manifest.config';

// Auditable, build-independent assertions on our human-authored permission policy.
const CREDENTIAL_BEARING = [
  'cookies', 'webRequest', 'webRequestBlocking', 'history', 'tabs',
  'management', 'privacy', 'proxy', 'debugger', 'declarativeNetRequest',
];

describe('manifest permission policy', () => {
  it('requests host permissions for the P0 launch hosts only', () => {
    expect(skeinosManifest.host_permissions).toEqual([...P0_MATCHES]);
    expect(P0_MATCHES).toEqual([
      '*://claude.ai/*',
      '*://gemini.google.com/*',
      '*://*.perplexity.ai/*',
    ]);
  });

  it('does not request broad host access', () => {
    for (const pattern of skeinosManifest.host_permissions) {
      expect(pattern).not.toBe('<all_urls>');
      expect(pattern).not.toBe('*://*/*');
      expect(pattern).not.toContain('<all_urls>');
    }
  });

  it('requests only the non-credential-bearing alarms + sidePanel + scripting permissions', () => {
    // `scripting` injects the content script into already-open supported tabs on
    // install/update; it is bounded by host_permissions and is not credential-bearing.
    expect(skeinosManifest.permissions).toEqual(['alarms', 'sidePanel', 'scripting']);
    for (const perm of skeinosManifest.permissions) {
      expect(CREDENTIAL_BEARING).not.toContain(perm);
    }
  });

  it('does not request a broad tab-reading permission for side-panel scoping', () => {
    // The side panel reads the active tab's URL via existing host permissions, so
    // neither `tabs` nor `activeTab` is requested (keeps the privacy posture).
    expect(skeinosManifest.permissions).not.toContain('tabs');
    expect(skeinosManifest.permissions).not.toContain('activeTab');
  });
});
