import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { P0_MATCHES } from '../src/manifest.config';

// Asserts the *generated* manifest (what the browser actually loads), proving the
// WXT config produces a valid MV3 service-worker extension with the right surface.
const MANIFEST_PATH = '.output/chrome-mv3/manifest.json';

let manifest: any;

beforeAll(() => {
  if (!existsSync(MANIFEST_PATH)) {
    execSync('npx wxt build', { stdio: 'inherit' });
  }
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}, 120_000);

describe('generated MV3 manifest', () => {
  it('is Manifest V3 with a service-worker background', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background?.service_worker).toBeTruthy();
  });

  it('declares host permissions for P0 hosts only, with no broad access', () => {
    expect(manifest.host_permissions).toEqual(expect.arrayContaining([...P0_MATCHES]));
    expect(manifest.host_permissions).toHaveLength(P0_MATCHES.length);
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).not.toContain('*://*/*');
  });

  it('declares only the alarms API permission (canary watchdog)', () => {
    expect(manifest.permissions ?? []).toEqual(['alarms']);
  });

  it('injects a content script scoped to the P0 hosts', () => {
    const matches = (manifest.content_scripts ?? []).flatMap((cs: any) => cs.matches);
    expect(matches).toEqual(expect.arrayContaining([...P0_MATCHES]));
    expect(matches).not.toContain('<all_urls>');
  });
});
