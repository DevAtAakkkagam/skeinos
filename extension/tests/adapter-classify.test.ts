// Capability-tiered signed-out classification (platform-adapter spec, design D2).
// `classify()` turns a failing `selfCheck()` into one of three reactions using the
// COMPOSE/WORKSPACE anchor tiers + the optional `authedMarker`, so a signed-out
// page is never treated as a breakage.

import { afterEach, describe, expect, it } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import type { AdapterConfig } from '../src/adapters/types';

/** A minimal config with controllable anchors; `authedMarker` is opt-in per test. */
function cfg(authedMarker?: string, listHiddenWhenCollapsed = false): AdapterConfig {
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
    behaviors: {
      insertMode: 'execCommand',
      submitMode: 'click',
      supportsSystemPrompt: false,
      ...(listHiddenWhenCollapsed ? { listHiddenWhenCollapsed: true } : {}),
    },
  };
}

const COMPOSE = '<div id="composer"></div><div id="inputbar"></div>';
const WORKSPACE = '<div id="list"></div><div id="sidebar"></div>';
// The workspace shell minus the conversation list — Gemini's collapsed-drawer state,
// where the list anchor is gone but the sidebar/composer/input-bar persist.
const SIDEBAR = '<div id="sidebar"></div>';
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
});

function classifyWith(html: string, authedMarker?: string) {
  root = mount(html);
  return createAdapter(cfg(authedMarker), { root }).classify();
}

function classifyCollapsed(html: string, authedMarker?: string) {
  root = mount(html);
  return createAdapter(cfg(authedMarker, true), { root }).classify();
}

describe('adapter.classify (signed-out classification)', () => {
  it('all anchors present → ready', () => {
    expect(classifyWith(COMPOSE + WORKSPACE, '[data-testid="account"]')).toBe('ready');
  });

  it('signed in (authedMarker resolves) but a workspace anchor missing → breakage', () => {
    expect(classifyWith(COMPOSE + AUTHED, '[data-testid="account"]')).toBe('breakage');
  });

  it('not signed in, composer present → signed-out-compose', () => {
    // authedMarker is configured but absent from the DOM; COMPOSE resolves.
    expect(classifyWith(COMPOSE, '[data-testid="account"]')).toBe('signed-out-compose');
  });

  it('not signed in, no composer → signed-out-dormant', () => {
    // A login page: neither the authed marker nor the composer is present.
    expect(classifyWith('<div id="loginform"></div>', '[data-testid="account"]')).toBe(
      'signed-out-dormant',
    );
  });

  it('config without authedMarker preserves legacy behavior → breakage on failure', () => {
    // No marker means we cannot prove signed-out, so a failing check stays a breakage.
    expect(classifyWith(COMPOSE)).toBe('breakage');
  });
});

describe('adapter.classify (listHiddenWhenCollapsed — Gemini collapsed drawer)', () => {
  it('signed in, only the conversation list missing (drawer collapsed) → ready, not breakage', () => {
    // Composer + sidebar + input bar present; the list anchor is gone because the
    // drawer is collapsed. That is the expected collapsed state, so the overlay
    // activates (side panel shows the collapsed-list nudge) instead of bannering.
    expect(classifyCollapsed(COMPOSE + SIDEBAR + AUTHED, '[data-testid="account"]')).toBe('ready');
  });

  it('signed in, a non-list anchor also missing (genuine breakage) → breakage', () => {
    // Sidebar gone too (not just the collapsible list) — that anchor persists when
    // collapsed, so its absence is a real breakage even on a collapsed-list platform.
    expect(classifyCollapsed(COMPOSE + AUTHED, '[data-testid="account"]')).toBe('breakage');
  });
});
