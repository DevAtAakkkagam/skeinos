import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { P0_MATCHES } from '../src/manifest.config';

// Asserts the *generated* manifest (what the browser actually loads), proving the
// WXT config produces a valid MV3 service-worker extension with the right surface.
const MANIFEST_PATH = '.output/chrome-mv3/manifest.json';
const FIREFOX_MANIFEST_PATH = '.output/firefox-mv2/manifest.json';

// Reads a PNG's pixel dimensions straight from the IHDR chunk (width/height are
// big-endian uint32s at byte offsets 16 and 20). Lets us assert an icon file is
// actually the size its manifest key claims, without an image dependency.
function pngDimensions(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

let manifest: any;
let firefoxManifest: any;

beforeAll(() => {
  if (!existsSync(MANIFEST_PATH)) {
    execSync('npx wxt build', { stdio: 'inherit' });
  }
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  if (!existsSync(FIREFOX_MANIFEST_PATH)) {
    execSync('npx wxt build -b firefox', { stdio: 'inherit' });
  }
  firefoxManifest = JSON.parse(readFileSync(FIREFOX_MANIFEST_PATH, 'utf8'));
}, 240_000);

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

  it('declares the alarms/sidePanel/scripting/storage API permissions only (no broad/credential APIs)', () => {
    // The four justified API permissions (see src/manifest.config.ts): `alarms`
    // (resilience canary), `sidePanel` (workspace UI), `scripting` (inject the
    // content script into already-open supported tabs), and `storage`
    // (chrome.storage.local settings store). No more, no less.
    expect(manifest.permissions ?? []).toEqual(
      expect.arrayContaining(['alarms', 'sidePanel', 'scripting', 'storage']),
    );
    expect(manifest.permissions ?? []).toHaveLength(4);
    // The side panel reads the active tab's URL via existing host permissions, so
    // no broad tab-reading permission is requested.
    expect(manifest.permissions ?? []).not.toContain('tabs');
    expect(manifest.permissions ?? []).not.toContain('activeTab');
  });

  it('registers a side-panel page and grants it no new host permissions', () => {
    const path = manifest.side_panel?.default_path;
    expect(path, 'no side_panel.default_path in manifest').toBeTruthy();
    expect(existsSync(join(dirname(MANIFEST_PATH), path))).toBe(true);
    // The side panel adds permission surface but not host access.
    expect(manifest.host_permissions).toEqual(expect.arrayContaining([...P0_MATCHES]));
    expect(manifest.host_permissions).toHaveLength(P0_MATCHES.length);
  });

  it('injects a content script scoped to the P0 hosts', () => {
    const matches = (manifest.content_scripts ?? []).flatMap((cs: any) => cs.matches);
    expect(matches).toEqual(expect.arrayContaining([...P0_MATCHES]));
    expect(matches).not.toContain('<all_urls>');
  });
});

describe('extension branding icons', () => {
  it('declares the required extension icon sizes pointing at bundled files', () => {
    expect(manifest.icons).toBeTruthy();
    for (const size of [16, 32, 48, 128]) {
      const rel = manifest.icons[size];
      expect(rel, `icons[${size}] missing`).toBeTruthy();
      expect(existsSync(join(dirname(MANIFEST_PATH), rel))).toBe(true);
    }
  });

  it('ships icon files whose pixel dimensions match their declared size', () => {
    for (const size of [16, 32, 48, 128]) {
      const file = join(dirname(MANIFEST_PATH), manifest.icons[size]);
      expect(pngDimensions(file)).toEqual({ width: Number(size), height: Number(size) });
    }
  });

  it('declares a branded toolbar action with a title', () => {
    expect(manifest.action).toBeTruthy();
    expect(typeof manifest.action.default_title).toBe('string');
    expect(manifest.action.default_title.length).toBeGreaterThan(0);
  });

  it('provides theme-adaptive toolbar icons on the Firefox build', () => {
    // Firefox (MV2) nests theme_icons under browser_action.
    const themeIcons = firefoxManifest.browser_action?.theme_icons;
    expect(Array.isArray(themeIcons)).toBe(true);
    expect(themeIcons.length).toBeGreaterThan(0);
    for (const entry of themeIcons) {
      expect(entry.light, 'theme icon missing light variant').toBeTruthy();
      expect(entry.dark, 'theme icon missing dark variant').toBeTruthy();
      expect(existsSync(join(dirname(FIREFOX_MANIFEST_PATH), entry.light))).toBe(true);
      expect(existsSync(join(dirname(FIREFOX_MANIFEST_PATH), entry.dark))).toBe(true);
    }
  });
});

describe('options page favicon', () => {
  it('references a bundled icon via <link rel="icon">', () => {
    const html = readFileSync('src/entrypoints/options/index.html', 'utf8');
    const match = html.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/i);
    expect(match, 'no <link rel="icon"> in options page').toBeTruthy();
    const href = match![1].replace(/^\//, '');
    expect(existsSync(join('public', href))).toBe(true);
  });
});
