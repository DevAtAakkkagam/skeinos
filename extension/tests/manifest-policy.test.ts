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

  it('requests no credential-bearing permissions (none at all in bootstrap)', () => {
    expect(skeinosManifest.permissions).toEqual([]);
    for (const perm of skeinosManifest.permissions) {
      expect(CREDENTIAL_BEARING).not.toContain(perm);
    }
  });
});
