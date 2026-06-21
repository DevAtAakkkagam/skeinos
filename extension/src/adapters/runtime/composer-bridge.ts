// A bridge for composer operations that can only run in the page's OWN JS world.
//
// The content script runs in an ISOLATED world: it shares the DOM with the page but
// NOT the page's JS — expando properties a page script attaches to a node (e.g. a
// Lexical editor's `el.__lexicalEditor`) are invisible from the isolated side. Some
// editors (Perplexity = Lexical) ignore every DOM-level edit and can only be cleared
// through that instance, so the isolated side must ask the page world to do it.
//
// The only zero-permission channel between the worlds is a DOM event on the shared
// node. The isolated side dispatches a CANCELABLE event on the composer; the tiny
// MAIN-world content script (`skeinos-page.content.ts`) listens, performs the
// page-world op, and calls `preventDefault()` on success. DOM events dispatch
// synchronously across both worlds, so `dispatchEvent` returns `false` exactly when
// the page world handled it — giving the isolated side a real success signal (and a
// clean fallback to its DOM path when no page bridge is present).

export const CLEAR_COMPOSER_EVENT = 'skeinos:clear-composer';
export const INSERT_COMPOSER_EVENT = 'skeinos:insert-composer';

// The insert payload (text + replace flag) rides a DOM attribute on the composer
// rather than the CustomEvent `detail`: a DOM attribute is shared real state both
// worlds read directly, so it crosses the isolated→MAIN boundary without the
// `detail` structured-clone caveats (and works in Firefox without `cloneInto`). The
// isolated side sets it just before dispatch and removes it right after.
const INSERT_PAYLOAD_ATTR = 'data-skeinos-composer-insert';

// Lexical's canonical "no content" document: a root holding one empty paragraph.
const EMPTY_LEXICAL_STATE =
  '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

interface LexicalEditorLike {
  parseEditorState(json: string): unknown;
  setEditorState(state: unknown): void;
}

/** MAIN-world side: reset a Lexical composer through its editor instance. A plain or
 *  non-Lexical contenteditable has no `__lexicalEditor`, so this no-ops and the
 *  isolated side falls back to its DOM path. */
function clearLexicalEditor(el: EventTarget | null): boolean {
  const ed = (el as { __lexicalEditor?: LexicalEditorLike } | null)?.__lexicalEditor;
  if (!ed || typeof ed.setEditorState !== 'function' || typeof ed.parseEditorState !== 'function')
    return false;
  try {
    ed.setEditorState(ed.parseEditorState(EMPTY_LEXICAL_STATE));
    return true;
  } catch {
    return false;
  }
}

// Quill (Gemini) owns its own document model and reverts any out-of-band DOM edit on
// its next update cycle — so an `execCommand` insert visibly lands but is restored as
// a draft the moment the user sends. Its instance lives in the page's MAIN world
// (`window.Quill` + `.ql-container.__quill`), so the isolated side must ask the bridge
// to drive it. Going through the instance with source `'user'` keeps model/DOM/observer
// in sync and makes Gemini treat the text as genuine user input, so the send sticks.
interface QuillLike {
  getLength(): number;
  insertText(index: number, text: string, source?: string): unknown;
  setText(text: string, source?: string): unknown;
  setSelection(index: number, length: number, source?: string): unknown;
}

function isQuillInstance(q: unknown): q is QuillLike {
  const cand = q as Partial<QuillLike> | null;
  return (
    !!cand &&
    typeof cand.insertText === 'function' &&
    typeof cand.getLength === 'function' &&
    typeof cand.setSelection === 'function' &&
    typeof cand.setText === 'function'
  );
}

/** Resolve the Quill instance for a `.ql-editor` node. The instance hangs off the
 *  `.ql-container` (`__quill`); `Quill.find` is the documented fallback. Note
 *  `Quill.find(.ql-editor)` returns the scroll *blot*, not the instance — hence we
 *  resolve against the container first and duck-type the result. */
function findQuill(el: HTMLElement): QuillLike | null {
  const container = el.closest?.('.ql-container') ?? el.parentElement ?? null;
  const fromExpando = (container as { __quill?: unknown } | null)?.__quill;
  if (isQuillInstance(fromExpando)) return fromExpando;
  const ctor = (window as { Quill?: { find?: (n: unknown) => unknown } }).Quill;
  for (const node of [container, el]) {
    if (!node) continue;
    try {
      const found = ctor?.find?.(node);
      if (isQuillInstance(found)) return found;
    } catch {
      /* find can throw on a node it doesn't recognise — try the next candidate */
    }
  }
  return null;
}

/** MAIN-world side: insert/replace text in a Quill composer through its instance,
 *  reading the payload off the shared DOM attribute. No `.ql-container`/instance →
 *  this no-ops and the isolated side falls back to its DOM path. */
function insertIntoQuill(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  const raw = el?.getAttribute?.(INSERT_PAYLOAD_ATTR);
  if (raw == null) return false;
  let payload: { text?: string; replace?: boolean };
  try {
    payload = JSON.parse(raw) as { text?: string; replace?: boolean };
  } catch {
    return false;
  }
  const quill = findQuill(el!);
  if (!quill) return false;
  const text = payload.text ?? '';
  try {
    if (payload.replace) {
      // setText('') is Quill's canonical clear (content normalises to one newline).
      quill.setText(text, 'user');
      quill.setSelection(quill.getLength(), 0, 'user');
    } else {
      // Append before Quill's mandatory trailing newline so the draft is preserved.
      const at = Math.max(0, quill.getLength() - 1);
      quill.insertText(at, text, 'user');
      quill.setSelection(at + text.length, 0, 'user');
    }
    return true;
  } catch {
    return false;
  }
}

/** Install the MAIN-world listeners. Called once from the page-world content script.
 *  Capture-phase so they run regardless of where the event is dispatched. */
export function installComposerBridge(target: EventTarget = document): void {
  target.addEventListener(
    CLEAR_COMPOSER_EVENT,
    (e) => {
      if (clearLexicalEditor(e.target)) e.preventDefault();
    },
    true,
  );
  target.addEventListener(
    INSERT_COMPOSER_EVENT,
    (e) => {
      if (insertIntoQuill(e.target)) e.preventDefault();
    },
    true,
  );
}

/** ISOLATED side: ask the page bridge to clear `el`. Returns true only when the
 *  bridge handled it (signalled via `preventDefault`); false → caller falls back. */
export function requestComposerClear(el: HTMLElement): boolean {
  return !el.dispatchEvent(new CustomEvent(CLEAR_COMPOSER_EVENT, { bubbles: true, cancelable: true }));
}

/** ISOLATED side: ask the page bridge to insert (or replace, when `replace`) text in
 *  `el` through its Quill instance. The payload rides a DOM attribute the MAIN side
 *  reads. Returns true only when the bridge handled it (`preventDefault`); false →
 *  caller falls back to the DOM path (no page bridge / not a Quill editor). */
export function requestComposerInsert(el: HTMLElement, text: string, replace: boolean): boolean {
  el.setAttribute(INSERT_PAYLOAD_ATTR, JSON.stringify({ text, replace }));
  try {
    return !el.dispatchEvent(
      new CustomEvent(INSERT_COMPOSER_EVENT, { bubbles: true, cancelable: true }),
    );
  } finally {
    el.removeAttribute(INSERT_PAYLOAD_ATTR);
  }
}
