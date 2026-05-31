// The shared adapter contract suite (design D-A5). Any platform is proven by
// calling `runAdapterContract` with its config + a recorded DOM fixture; the same
// invariants gate every present and future platform. The fixture is mounted into
// the live document so MutationObserver-based `observe()` behaves as in a real tab.
//
// Fixture format: see tests/fixtures/README.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdapter } from '../src/adapters/runtime/adapter';
import type { AdapterConfig, PlatformAdapter } from '../src/adapters/types';

export interface ContractExpectations {
  /** URL the adapter resolves the active conversation against. */
  activeUrl: string;
  /** The conversation `detectConversation()` should return. */
  active: { nativeId: string; title: string };
  /** How many conversations the list holds (>= 2 so `observe` can be exercised). */
  conversationCount: number;
  /** The ordered, role-tagged messages `readMessages` should return. */
  messages: { role: 'user' | 'assistant'; text: string }[];
  /** Text inserted into the composer; must be observable afterwards. */
  inserted: string;
}

export interface ContractFixture {
  name: string;
  config: AdapterConfig;
  html: string;
  expected: ContractExpectations;
}

function composerText(el: HTMLElement | null): string {
  if (!el) return '';
  const value = (el as HTMLTextAreaElement | HTMLInputElement).value;
  return typeof value === 'string' ? value : (el.textContent ?? '');
}

export function runAdapterContract(fixture: ContractFixture): void {
  const { config, expected } = fixture;
  const itemSel = config.selectors.conversationItem;

  describe(`adapter contract: ${fixture.name}`, () => {
    let root: HTMLElement;
    let adapter: PlatformAdapter;

    beforeEach(() => {
      root = document.createElement('div');
      root.innerHTML = fixture.html;
      document.body.appendChild(root);
      adapter = createAdapter(config, { root, getUrl: () => expected.activeUrl });
    });

    afterEach(() => {
      root.remove();
    });

    it('selfCheck passes when all required anchors resolve', () => {
      expect(adapter.selfCheck()).toEqual({ ok: true, missing: [] });
    });

    it('detectConversation resolves the active conversation', () => {
      const ref = adapter.detectConversation();
      expect(ref?.nativeId).toBe(expected.active.nativeId);
      expect(ref?.title).toBe(expected.active.title);
    });

    it('listConversations returns the seeded conversations', () => {
      expect(adapter.listConversations()).toHaveLength(expected.conversationCount);
    });

    it('readMessages returns ordered, role-tagged messages', async () => {
      const messages = await adapter.readMessages(expected.active.nativeId);
      expect(messages.map((m) => ({ role: m.role, text: m.text }))).toEqual(expected.messages);
      expect(messages.map((m) => m.order)).toEqual(messages.map((_, i) => i));
    });

    it('getInputElement + insertText writes into the composer', () => {
      expect(adapter.getInputElement()).not.toBeNull();
      expect(adapter.insertText(expected.inserted, { replace: true })).toBe(true);
      expect(composerText(adapter.getInputElement())).toContain(expected.inserted);
    });

    it('submit triggers the configured submit mode', () => {
      let fired = false;
      if (config.behaviors.submitMode === 'click') {
        root.querySelector(config.selectors.sendButton)?.addEventListener('click', () => {
          fired = true;
        });
      } else {
        adapter.getInputElement()?.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter') fired = true;
        });
      }
      expect(adapter.submit()).toBe(true);
      expect(fired).toBe(true);
    });

    it('observe emits conversation-changed, then the disposer stops events', async () => {
      const seen = vi.fn();
      const dispose = adapter.observe(seen);

      // Move the active marker to another conversation — a real DOM mutation.
      const current = root.querySelector(`${itemSel}[aria-current]`);
      const next = Array.from(root.querySelectorAll(itemSel)).find((el) => el !== current);
      current?.removeAttribute('aria-current');
      next?.setAttribute('aria-current', 'page');

      await vi.waitFor(() =>
        expect(seen).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'conversation-changed' }),
        ),
      );

      dispose();
      seen.mockClear();
      next?.removeAttribute('aria-current');
      current?.setAttribute('aria-current', 'page');
      await new Promise((r) => setTimeout(r, 20));
      expect(seen).not.toHaveBeenCalled();
    });
  });
}
