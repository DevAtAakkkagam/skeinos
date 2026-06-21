// Gemini's Quill composer reverts an out-of-band `execCommand` edit on its next
// update cycle, so a programmatic insert vanishes the instant the user sends. The
// fix drives Quill through its own instance via the MAIN-world bridge (mirroring the
// Lexical clear). These tests pin that wiring: `writeComposer` over a `.ql-editor`
// routes through the bridge to the Quill instance with source `'user'`, and falls
// back to the DOM path when no bridge is installed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { installComposerBridge } from '../src/adapters/runtime/composer-bridge';
import { writeComposer } from '../src/adapters/runtime/composer-io';

interface FakeQuill {
  length: number;
  inserts: Array<{ index: number; text: string; source?: string }>;
  sets: Array<{ text: string; source?: string }>;
  selections: Array<{ index: number; length: number; source?: string }>;
  getLength(): number;
  insertText(index: number, text: string, source?: string): void;
  setText(text: string, source?: string): void;
  setSelection(index: number, length: number, source?: string): void;
}

function makeQuill(length = 1): FakeQuill {
  return {
    length,
    inserts: [],
    sets: [],
    selections: [],
    getLength() {
      return this.length;
    },
    insertText(index, text, source) {
      this.inserts.push({ index, text, source });
      this.length += text.length;
    },
    setText(text, source) {
      this.sets.push({ text, source });
      this.length = text.length + 1; // Quill keeps a trailing newline
    },
    setSelection(index, length, source) {
      this.selections.push({ index, length, source });
    },
  };
}

/** Build Gemini's composer shape: a `.ql-editor` inside a `.ql-container` carrying the
 *  Quill instance on `__quill` (the page-world expando the probe confirmed). */
function mountComposer(quill: FakeQuill): HTMLElement {
  const container = document.createElement('div');
  container.className = 'ql-container';
  (container as unknown as { __quill: FakeQuill }).__quill = quill;
  const editor = document.createElement('div');
  editor.className = 'ql-editor';
  editor.setAttribute('contenteditable', 'true');
  container.appendChild(editor);
  document.body.appendChild(container);
  return editor;
}

let removeBridge: (() => void) | undefined;
function installBridge(): void {
  // installComposerBridge wires capture-phase document listeners; capture them so we
  // can tear the bridge down between tests (the fallback case must run bridge-free).
  const added: Array<[string, EventListener]> = [];
  const orig = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
    added.push([type as string, fn as EventListener]);
    orig(type, fn as EventListener, opts);
  });
  installComposerBridge(document);
  vi.restoreAllMocks();
  removeBridge = () => {
    for (const [type, fn] of added) document.removeEventListener(type, fn, true);
  };
}

afterEach(() => {
  removeBridge?.();
  removeBridge = undefined;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Quill composer bridge', () => {
  it('appends through the Quill instance before the trailing newline, source "user"', () => {
    const quill = makeQuill(1); // empty editor: length 1 (just the newline)
    const editor = mountComposer(quill);
    installBridge();

    const ok = writeComposer(editor, 'Hello world', { preferExecCommand: true });

    expect(ok).toBe(true);
    expect(quill.inserts).toEqual([{ index: 0, text: 'Hello world', source: 'user' }]);
    expect(quill.selections.at(-1)).toEqual({ index: 11, length: 0, source: 'user' });
    expect(quill.sets).toHaveLength(0);
  });

  it('appends after an existing draft (insert index = length - 1)', () => {
    const quill = makeQuill(4); // "abc" + newline
    const editor = mountComposer(quill);
    installBridge();

    writeComposer(editor, '!', { preferExecCommand: true });

    expect(quill.inserts).toEqual([{ index: 3, text: '!', source: 'user' }]);
  });

  it('replaces the whole draft via setText, source "user"', () => {
    const quill = makeQuill(10);
    const editor = mountComposer(quill);
    installBridge();

    writeComposer(editor, 'fresh', { preferExecCommand: true, replace: true });

    expect(quill.sets).toEqual([{ text: 'fresh', source: 'user' }]);
    expect(quill.inserts).toHaveLength(0);
  });

  it('clears via setText("") on an empty replace', () => {
    const quill = makeQuill(10);
    const editor = mountComposer(quill);
    installBridge();

    writeComposer(editor, '', { preferExecCommand: true, replace: true });

    expect(quill.sets).toEqual([{ text: '', source: 'user' }]);
  });

  it('falls back to the DOM path when no bridge is installed', () => {
    const quill = makeQuill(1);
    const editor = mountComposer(quill);
    // No installBridge(): the dispatched event is never handled.

    const ok = writeComposer(editor, 'Hi', { preferExecCommand: true });

    expect(ok).toBe(true);
    expect(quill.inserts).toHaveLength(0); // never reached the instance
    expect(editor.textContent).toBe('Hi'); // commitText DOM fallback ran
  });
});
