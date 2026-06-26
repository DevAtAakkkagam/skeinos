// Live, console-callable adapter diagnostics (`window.__skeinos.diagnose()`). The
// report re-probes the DOM on every call and, per selector, says what resolves —
// pinning the breakage banner's root cause to specific missing anchors.

import { afterEach, describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import {
  buildDiagnostics,
  installDebugGlobal,
  type SkeinosDebugApi,
} from '../src/adapters/runtime/diagnose';
import type { AdapterConfig } from '../src/adapters/types';

function cfg(authedMarker?: string): AdapterConfig {
  return {
    platformId: 'chatgpt',
    configVersion: '1.0.0',
    hostMatch: ['*://host/*'],
    selectors: {
      conversationList: '#list',
      conversationItem: 'a',
      conversationTitle: '.t',
      conversationIdAttr: 'href',
      messageUser: '.u',
      messageAssistant: '.a',
      composer: '#composer',
      sendButton: '#send',
      sidebarAnchor: '#sidebar',
      inputBarAnchor: '#inputbar',
      ...(authedMarker ? { authedMarker } : {}),
    },
    behaviors: { insertMode: 'execCommand', submitMode: 'click', supportsSystemPrompt: false },
  };
}

const COMPOSE = '<div id="composer"></div><div id="inputbar"></div>';
const WORKSPACE = '<div id="list"></div><div id="sidebar"></div>';
const AUTHED = '<div data-testid="account"></div>';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

let root: HTMLElement | undefined;
afterEach(() => {
  root?.remove();
  root = undefined;
  delete (globalThis as { __skeinos?: unknown }).__skeinos;
});

function diagnose(html: string, authedMarker?: string) {
  root = mount(html);
  const config = cfg(authedMarker);
  return buildDiagnostics(config, createAdapter(config, { root }), root);
}

describe('buildDiagnostics', () => {
  it('all anchors present → ready, no banner, every required selector resolves', () => {
    const d = diagnose(COMPOSE + WORKSPACE + AUTHED, '[data-testid="account"]');
    expect(d.readiness).toBe('ready');
    expect(d.bannerExpected).toBe(false);
    expect(d.selfCheckOk).toBe(true);
    expect(d.missing).toEqual([]);
    expect(d.signedIn).toBe(true);
    expect(d.selectors.filter((p) => p.required).every((p) => p.resolved)).toBe(true);
  });

  it('signed in but a workspace anchor missing → breakage, missing pinned per selector', () => {
    const d = diagnose(COMPOSE + AUTHED, '[data-testid="account"]');
    expect(d.bannerExpected).toBe(true);
    expect(d.readiness).toBe('breakage');
    expect(d.signedIn).toBe(true);
    expect(d.missing.sort()).toEqual(['conversationList', 'sidebarAnchor']);
    const list = d.selectors.find((p) => p.key === 'conversationList');
    expect(list).toMatchObject({ resolved: false, required: true, count: 0, sample: null });
    const composer = d.selectors.find((p) => p.key === 'composer');
    expect(composer).toMatchObject({ resolved: true, required: true, count: 1 });
    expect(composer?.sample).toBeInstanceOf(Element);
  });

  it('signed out (no authedMarker hit) → not a breakage even with missing anchors', () => {
    const d = diagnose(COMPOSE, '[data-testid="account"]');
    expect(d.signedIn).toBe(false);
    expect(d.bannerExpected).toBe(false);
    expect(d.readiness).toBe('signed-out-compose');
  });

  it('surfaces non-selector config (id attr, url pattern) without querying them', () => {
    const config = cfg();
    config.selectors.conversationUrlPattern = '/c/([^/]+)';
    root = mount(WORKSPACE);
    const d = buildDiagnostics(config, createAdapter(config, { root }), root);
    expect(d.raw.conversationIdAttr).toBe('href');
    expect(d.raw.conversationUrlPattern).toBe('/c/([^/]+)');
    // The url pattern is reported but never appears as a probed selector.
    expect(d.selectors.some((p) => p.selector === '/c/([^/]+)')).toBe(false);
  });
});

describe('installDebugGlobal', () => {
  it('attaches window.__skeinos.diagnose() that re-probes live on each call', () => {
    root = mount(COMPOSE + AUTHED);
    const config = cfg('[data-testid="account"]');
    const dispose = installDebugGlobal(config, createAdapter(config, { root }));
    const api = (globalThis as { __skeinos?: SkeinosDebugApi }).__skeinos!;
    expect(api.platform).toBe('chatgpt');
    expect(api.diagnose().bannerExpected).toBe(true);

    // The DOM heals → the very next diagnose() reflects it (no reinstall).
    root.insertAdjacentHTML('beforeend', WORKSPACE);
    expect(api.diagnose().bannerExpected).toBe(false);
    expect(api.diagnose().readiness).toBe('ready');

    dispose();
    expect((globalThis as { __skeinos?: unknown }).__skeinos).toBeUndefined();
  });
});
