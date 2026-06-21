// Input action bar in real Chromium (input-bar, task 7.1): shadow-root scoping +
// `--sk-*` token resolution, real `useFloating` positioning of the slash popover, and
// the Zag-backed variable modal's focus/keyboard — the parts the happy-dom suite
// can't prove. Opening the popover here is also the regression guard for the render
// loop that froze the tab (an unmemoized floating ref): if it regressed, this hangs
// and the test times out instead of passing.
//
// The bar is rendered through the shared `mount()` harness (like the prompts browser
// test) with `INPUT_BAR_CSS` injected, and an injected `query` stub so no worker is
// needed; `subscribe` no-ops without a chrome runtime.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type MountHandle } from '../../src/ui/mount';
import { INPUT_BAR_CSS } from '../../src/ui/input-bar/styles';
import { InputBar } from '../../src/ui/input-bar/InputBar';
import { mountInputBar } from '../../src/ui/input-bar/mountInputBar';
import { createAdapter } from '../../src/adapters/runtime/adapter';
import type { AdapterConfig } from '../../src/adapters/types';
import type { Prompt } from '../../src/shared/types';
import type { PromptSearchResult } from '../../src/shared/prompts';

let handle: MountHandle | null = null;

function makePrompt(over: Partial<Prompt> & { id: string; body: string }): Prompt {
  return {
    title: over.id, description: '', variables: [], tags: [], targetModels: [],
    promptFolderId: null, usageCount: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h',
    ...over,
  };
}

function searchResult(p: Prompt): PromptSearchResult {
  return { id: p.id, title: p.title, snippet: [{ text: p.title, match: false }], targetModels: [], slug: p.slug };
}

// query stub: prompt.library returns the seeded prompts; prompt.search returns rows.
function makeQuery(prompts: Prompt[]) {
  const results = prompts.map(searchResult);
  return vi.fn(async (sel: { kind: string }) =>
    sel.kind === 'prompt.library'
      ? { ok: true as const, data: { kind: 'prompt.library' as const, prompts, folders: [] } }
      : { ok: true as const, data: { kind: 'prompt.search' as const, results } },
  );
}

// The Profile chip reads its own library; inject an empty list so it never reaches
// for a worker (absent in the browser test) — these tests don't exercise the chip.
const emptyProfiles = () =>
  vi.fn(async () => ({ ok: true as const, data: { kind: 'profile.library' as const, profiles: [] } }));

// A profile library stub for the chip-menu test. `appliesTo: ['claude']` so the seeded
// profile is activatable on the bar's `platform="claude"`.
function profilesQuery() {
  const profiles = [
    {
      id: 'pr1', name: 'Senior staff engineer', instructionText: 'Be terse.',
      appliesTo: ['claude'] as const, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h',
    },
  ];
  return vi.fn(async () => ({ ok: true as const, data: { kind: 'profile.library' as const, profiles } }));
}

// Stub `chrome.storage.local` so the Profile chip's live settings seams resolve a
// pre-activated profile (`activeProfileId`) — the only way to exercise the bar's
// profile-prepend end to end (the chip reads/writes settings directly, not via props).
// Returns a disposer that restores the prior global.
function stubChromeSettings(activeProfileId: string): () => void {
  const store: Record<string, unknown> = { 'skeinos.settings': { activeProfileId } };
  const prior = (globalThis as { chrome?: unknown }).chrome;
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(store, items),
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  };
  return () => {
    (globalThis as { chrome?: unknown }).chrome = prior;
  };
}

function mountBar(
  prompts: Prompt[],
  onInsert: (t: string) => void,
  containFocus = false,
  queryProfiles: () => unknown = emptyProfiles(),
  isComposerEmpty?: () => boolean,
) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  handle = mount(
    target,
    <InputBar
      platform="claude"
      onInsert={onInsert}
      query={makeQuery(prompts) as never}
      queryProfiles={queryProfiles as never}
      isComposerEmpty={isComposerEmpty}
      containFocus={containFocus}
    />,
    { theme: 'light' },
  );
  const style = document.createElement('style');
  style.textContent = INPUT_BAR_CSS;
  handle.shadowRoot.appendChild(style);
  return handle;
}

const $ = (sel: string) => handle!.shadowRoot.querySelector(sel) as HTMLElement | null;
// The variable modal mounts as its own shadow-root overlay at document.body (viewport
// root, so its backdrop isn't clipped by a transformed ancestor), so its elements are
// found by sweeping the Skeinos shadow roots, not the bar's shadow root.
const $modal = (sel: string): HTMLElement | null => {
  for (const host of document.querySelectorAll('[data-skeinos-root]')) {
    const el = (host as HTMLElement).shadowRoot?.querySelector(sel);
    if (el) return el as HTMLElement;
  }
  return null;
};
const click = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
const typeInto = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true, composed: true }));
};

afterEach(() => {
  handle?.dispose();
  handle = null;
  document.body.innerHTML = '';
});

describe('input action bar (real browser)', () => {
  it('mounts in a shadow root with tokens resolved, the Profile chip interactive and no Model stub', () => {
    mountBar([], vi.fn());
    const bar = $('[data-testid="sk-input-bar"]')!;
    expect(bar).toBeTruthy();
    // The token cascade resolves inside the shadow root: the bar paints a real color,
    // not the initial transparent default.
    expect(getComputedStyle(bar).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    // The Profile control is the functional chip (not a disabled stub).
    expect(($('[data-testid="sk-ib-profile"]') as HTMLButtonElement).disabled).toBe(false);
    // The deferred Model stub has been removed.
    expect($('[data-testid="sk-ib-model-stub"]')).toBeNull();
  });

  it('opens the slash popover and positions it with real layout (no render loop)', async () => {
    mountBar([makePrompt({ id: 'p1', title: 'Budget email', body: 'hi', slug: '/email' })], vi.fn());
    click($('[data-testid="sk-ib-trigger"]')!);

    const popover = await vi.waitFor(() => {
      const el = $('[data-testid="sk-ib-popover"]');
      expect(el).toBeTruthy();
      return el!;
    });
    // useFloating ran: absolute positioning with a real computed offset.
    expect(getComputedStyle(popover).position).toBe('absolute');
    await vi.waitFor(() => expect(parseFloat(popover.style.top || '0')).not.toBeNaN());

    // Typing drives the (debounced) search; the row shows title + /slug.
    typeInto($('[data-testid="sk-ib-search"]') as HTMLInputElement, 'budget');
    await vi.waitFor(() => {
      expect($('[data-testid="sk-ib-result"]')).toBeTruthy();
      expect($('[data-testid="sk-ib-slug"]')!.textContent).toBe('/email');
    });
  });

  it('opens the Profile chip menu and positions it with real layout (no render loop)', async () => {
    // Regression guard for the floating-ref render loop that froze the tab on the
    // Profile chip (an unstable `setPanel` dep): if it regressed, useFloating's
    // auto-update re-renders unboundedly and this hangs to a timeout instead of
    // passing. Mirrors the slash-popover loop guard above, for the chip's own menu.
    const onInsert = vi.fn();
    mountBar([], onInsert, false, profilesQuery());

    click($('[data-testid="sk-ib-profile"]')!);

    const menu = await vi.waitFor(() => {
      const el = $('[data-testid="sk-ib-profile-menu"]');
      expect(el).toBeTruthy();
      return el!;
    });
    // useFloating ran: absolute positioning with a real computed offset.
    expect(getComputedStyle(menu).position).toBe('absolute');
    await vi.waitFor(() => expect(parseFloat(menu.style.top || '0')).not.toBeNaN());

    // The seeded profile lists and is applicable (enabled) on this platform.
    const item = await vi.waitFor(() => {
      const el = $('[data-testid="sk-ib-profile-item"]') as HTMLButtonElement | null;
      expect(el).toBeTruthy();
      return el!;
    });
    expect(item.disabled).toBe(false);

    // Selecting it only ACTIVATES — it does not inject on its own (the composed text
    // rides the next prompt insert). The menu closes and nothing is pushed to onInsert.
    click(item);
    await vi.waitFor(() => expect($('[data-testid="sk-ib-profile-menu"]')).toBeNull());
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('prepends an active profile ahead of an inserted prompt, into a real contenteditable', async () => {
    // End-to-end profile-prepend in a real editor: with a profile pre-activated (via a
    // stubbed chrome.storage), inserting a prompt into an EMPTY composer lands the
    // profile's composed text above the prompt body — the one-action flow that replaces
    // the old "click the chip to inject" step. Wires `onInsert`/`isComposerEmpty` to a
    // real adapter over a real contenteditable (the execCommand path).
    const restore = stubChromeSettings('pr1');
    const ceRoot = document.createElement('div');
    ceRoot.innerHTML = `<div class="sidebar"><div class="list"></div></div>
      <div class="input-bar"><div class="ce-composer" contenteditable="true"></div><button class="send">Send</button></div>`;
    document.body.appendChild(ceRoot);
    const adapter = createAdapter(ceConfig(), { root: ceRoot });
    const composer = ceRoot.querySelector<HTMLElement>('.ce-composer')!;
    try {
      mountBar(
        [makePrompt({ id: 'p5', title: 'Linked', body: 'Write a LinkedIn post.' })],
        (t) => adapter.insertText(t),
        false,
        profilesQuery(),
        () => adapter.isComposerEmpty(),
      );
      // Let the chip resolve the active profile from the stubbed settings first.
      await vi.waitFor(() =>
        expect($('[data-testid="sk-ib-profile-name"]')!.textContent).toBe('Senior staff engineer'),
      );

      click($('[data-testid="sk-ib-trigger"]')!);
      await vi.waitFor(() => expect($('[data-testid="sk-ib-search"]')).toBeTruthy());
      typeInto($('[data-testid="sk-ib-search"]') as HTMLInputElement, 'linked');
      const row = await vi.waitFor(() => {
        const el = $('[data-testid="sk-ib-result"]');
        expect(el).toBeTruthy();
        return el!;
      });
      click(row);

      // The profile rode the prompt insert: its composed text leads, then the body.
      // (A contenteditable may normalize the blank line into block/<br> nodes, so assert
      // order + presence rather than the exact whitespace.)
      await vi.waitFor(() => {
        const text = composer.textContent ?? '';
        expect(text.startsWith('Be terse.')).toBe(true);
        expect(text).toContain('Write a LinkedIn post.');
      });
    } finally {
      ceRoot.remove();
      restore();
    }
  });

  it('clicking the search field keeps the popover open (shadow retargeting)', async () => {
    // Regression: a document-level outside-click listener sees clicks inside the
    // shadow root retargeted to the shadow host, so a naive contains(target) check
    // closed the popover when its own search field was clicked. composedPath() fixes
    // it. Only reproducible in a real shadow root, hence a browser test.
    mountBar([], vi.fn());
    click($('[data-testid="sk-ib-trigger"]')!);
    const search = await vi.waitFor(() => {
      const el = $('[data-testid="sk-ib-search"]');
      expect(el).toBeTruthy();
      return el!;
    });
    // Let the outside-pointerdown listener register, then click INSIDE the popover.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    search.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    search.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect($('[data-testid="sk-ib-popover"]')).toBeTruthy();

    // A pointerdown truly outside the overlay still closes it.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    await vi.waitFor(() => expect($('[data-testid="sk-ib-popover"]')).toBeNull());
  });

  it('pulls focus back to the search field when the host steals it', async () => {
    // Mimics Perplexity force-focusing its own composer: an external input grabs
    // focus while the popover is open. The popover must reclaim it so typing stays in
    // the search field. Real focus events → browser test.
    const hostInput = document.createElement('input');
    document.body.appendChild(hostInput);
    try {
      mountBar([], vi.fn(), /* containFocus */ true); // the Perplexity-style opt-in
      click($('[data-testid="sk-ib-trigger"]')!);
      const search = await vi.waitFor(() => {
        const el = $('[data-testid="sk-ib-search"]');
        expect(el).toBeTruthy();
        return el!;
      });
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      hostInput.focus(); // host yanks focus away
      // …and it bounces straight back into the popover's search field.
      await vi.waitFor(() => expect(handle!.shadowRoot.activeElement).toBe(search));
    } finally {
      hostInput.remove();
    }
  });

  it('fills a prompt’s variables in the modal and inserts the substituted body', async () => {
    const onInsert = vi.fn();
    mountBar([makePrompt({ id: 'p2', title: 'Greeting', body: 'Dear {{name}}, {{tone=formal|casual}}.' })], onInsert);
    click($('[data-testid="sk-ib-trigger"]')!);
    await vi.waitFor(() => expect($('[data-testid="sk-ib-search"]')).toBeTruthy());

    typeInto($('[data-testid="sk-ib-search"]') as HTMLInputElement, 'greeting');
    const row = await vi.waitFor(() => {
      const el = $('[data-testid="sk-ib-result"]');
      expect(el).toBeTruthy();
      return el!;
    });
    click(row);

    // The modal opens in the shadow root, pre-filled from the parsed defaults.
    await vi.waitFor(() => expect($modal('[data-testid="sk-ib-var-modal"]')).toBeTruthy());
    const tone = $modal('[data-testid="sk-ib-var-tone"]') as HTMLSelectElement;
    expect(tone.tagName).toBe('SELECT');
    expect(tone.value).toBe('formal');

    const name = $modal('[data-testid="sk-ib-var-name"]') as HTMLInputElement;
    typeInto(name, 'Sam');
    typeInto(tone, 'casual');
    // Let the controlled inputs commit to state before confirming (Insert reads the
    // values from the latest render).
    await vi.waitFor(() => {
      expect(name.value).toBe('Sam');
      expect(tone.value).toBe('casual');
    });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    click($modal('[data-testid="sk-ib-var-insert"]')!);

    // Insertion is deferred until the modal unmounts (focus-trap release), so wait.
    await vi.waitFor(() => expect(onInsert).toHaveBeenCalledWith('Dear Sam, casual.'));
    await vi.waitFor(() => expect($modal('[data-testid="sk-ib-var-modal"]')).toBeNull());
  });

  it('inserts into a real contenteditable through the modal, past its focus trap', async () => {
    // The Claude failure: confirming inserted nothing because the Dialog's focus trap
    // pulled focus from the host composer at insert time. This wires the bar to a real
    // `adapter.insertText` over a real contenteditable AND opens the focus-trapping
    // modal — only a browser reproduces both. The text must land in the composer.
    const ceRoot = document.createElement('div');
    ceRoot.innerHTML = `<div class="sidebar"><div class="list"></div></div>
      <div class="input-bar"><div class="ce-composer" contenteditable="true"></div><button class="send">Send</button></div>`;
    document.body.appendChild(ceRoot);
    const adapter = createAdapter(ceConfig(), { root: ceRoot });
    const composer = ceRoot.querySelector<HTMLElement>('.ce-composer')!;
    try {
      mountBar([makePrompt({ id: 'p4', title: 'Quiz', body: 'Topic: {{topic}}.' })], (t) =>
        adapter.insertText(t),
      );
      click($('[data-testid="sk-ib-trigger"]')!);
      await vi.waitFor(() => expect($('[data-testid="sk-ib-search"]')).toBeTruthy());
      typeInto($('[data-testid="sk-ib-search"]') as HTMLInputElement, 'quiz');
      const row = await vi.waitFor(() => {
        const el = $('[data-testid="sk-ib-result"]');
        expect(el).toBeTruthy();
        return el!;
      });
      click(row);

      const topic = await vi.waitFor(() => {
        const el = $modal('[data-testid="sk-ib-var-topic"]') as HTMLInputElement | null;
        expect(el).toBeTruthy();
        return el!;
      });
      typeInto(topic, 'Black holes');
      await vi.waitFor(() => expect(topic.value).toBe('Black holes'));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      click($modal('[data-testid="sk-ib-var-insert"]')!);

      await vi.waitFor(() => expect(composer.textContent).toBe('Topic: Black holes.'));
    } finally {
      ceRoot.remove();
    }
  });

  it('inserts a no-variable prompt directly, with no modal', async () => {
    const onInsert = vi.fn();
    mountBar([makePrompt({ id: 'p3', title: 'Ping', body: 'just ping' })], onInsert);
    click($('[data-testid="sk-ib-trigger"]')!);
    await vi.waitFor(() => expect($('[data-testid="sk-ib-search"]')).toBeTruthy());
    typeInto($('[data-testid="sk-ib-search"]') as HTMLInputElement, 'ping');
    const row = await vi.waitFor(() => {
      const el = $('[data-testid="sk-ib-result"]');
      expect(el).toBeTruthy();
      return el!;
    });
    click(row);
    await vi.waitFor(() => expect(onInsert).toHaveBeenCalledWith('just ping'));
    expect($modal('[data-testid="sk-ib-var-modal"]')).toBeNull();
  });
});

// The composer-injection fix (focus the host editor + execCommand for a
// contenteditable) only really runs in a browser: happy-dom has no execCommand and
// no rich editor. This proves `adapter.insertText` lands text in a real
// contenteditable, appended after an existing draft (the Gemini/Claude failure).
function ceConfig(): AdapterConfig {
  return {
    platformId: 'gemini',
    configVersion: '1.0.0',
    hostMatch: ['*://gemini.google.com/*'],
    selectors: {
      conversationList: '.list', conversationItem: '.item', conversationTitle: '.title',
      conversationIdAttr: 'data-id', messageUser: '.mu', messageAssistant: '.ma',
      composer: '.ce-composer', sendButton: 'button.send', sidebarAnchor: '.sidebar',
      inputBarAnchor: '.input-bar',
    },
    behaviors: { insertMode: 'execCommand', submitMode: 'click', supportsSystemPrompt: false },
  };
}

describe('adapter.insertText into a contenteditable (real browser)', () => {
  let root: HTMLElement | null = null;
  afterEach(() => {
    root?.remove();
    root = null;
  });

  it('focuses the editor and appends after the existing draft', () => {
    root = document.createElement('div');
    root.innerHTML = `
      <div class="sidebar"><div class="list"></div></div>
      <div class="input-bar">
        <div class="ce-composer" contenteditable="true">DRAFT</div>
        <button class="send">Send</button>
      </div>`;
    document.body.appendChild(root);
    const adapter = createAdapter(ceConfig(), { root });
    const composer = root.querySelector<HTMLElement>('.ce-composer')!;

    const ok = adapter.insertText(' INSERTED');

    expect(ok).toBe(true);
    // The host editor received focus (insert had a target), and the text appended
    // after the draft via the real execCommand path (proving the Gemini/Claude fix:
    // a raw textContent write would have been reverted by a rich editor).
    expect(root.ownerDocument.activeElement).toBe(composer);
    expect(composer.textContent).toBe('DRAFT INSERTED');
  });

  it('reports composer emptiness (drives the profile-prepend gate)', () => {
    root = document.createElement('div');
    root.innerHTML = `
      <div class="sidebar"><div class="list"></div></div>
      <div class="input-bar">
        <div class="ce-composer" contenteditable="true"></div>
        <button class="send">Send</button>
      </div>`;
    document.body.appendChild(root);
    const adapter = createAdapter(ceConfig(), { root });
    const composer = root.querySelector<HTMLElement>('.ce-composer')!;

    // Empty (and whitespace-only) reads as empty; a real draft reads as non-empty.
    expect(adapter.isComposerEmpty()).toBe(true);
    composer.textContent = '   \n  ';
    expect(adapter.isComposerEmpty()).toBe(true);
    composer.textContent = 'a draft';
    expect(adapter.isComposerEmpty()).toBe(false);
  });
});

// Placement: a flex-ROW composer container (Perplexity's `#ask-input` row, Gemini's
// input-area-v2) must NOT lay the bar out beside the composer. `mountInputBar` climbs
// out of row-like ancestors so the bar docks on its own line above. Needs real layout
// (getComputedStyle/flex), hence a browser test.
describe('input bar placement (real browser)', () => {
  let root: HTMLElement | null = null;
  let handleP: MountHandle | null = null;
  afterEach(() => {
    handleP?.dispose();
    handleP = null;
    root?.remove();
    root = null;
  });

  it('docks above a flex-row composer, on its own line (not beside it)', () => {
    // Mimics Perplexity: a vertical outer container holding a flex-ROW whose child is
    // the composer anchor. A naive sibling-before would make the bar a flex item beside
    // the composer; the climb must hoist it into the outer column instead.
    root = document.createElement('div');
    root.style.display = 'block';
    root.innerHTML = `
      <div class="row" style="display:flex;flex-direction:row;align-items:center;width:600px">
        <div class="ask" style="flex:1"><textarea style="width:100%">x</textarea></div>
      </div>`;
    document.body.appendChild(root);
    const anchor = root.querySelector<HTMLElement>('.ask')!;
    const row = root.querySelector<HTMLElement>('.row')!;

    handleP = mountInputBar(anchor, { platform: 'claude', onInsert: () => {} });

    // Climbed out of the flex row: the bar is a sibling of the row in the outer column…
    expect(handleP.host.parentElement).toBe(root);
    expect(row.contains(handleP.host)).toBe(false);
    // …and it sits ABOVE the composer row, not beside it.
    expect(handleP.host.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      row.getBoundingClientRect().top + 1,
    );
  });
});
