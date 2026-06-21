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

/** Install the MAIN-world listener. Called once from the page-world content script.
 *  Capture-phase so it runs regardless of where the event is dispatched. */
export function installComposerBridge(target: EventTarget = document): void {
  target.addEventListener(
    CLEAR_COMPOSER_EVENT,
    (e) => {
      if (clearLexicalEditor(e.target)) e.preventDefault();
    },
    true,
  );
}

/** ISOLATED side: ask the page bridge to clear `el`. Returns true only when the
 *  bridge handled it (signalled via `preventDefault`); false → caller falls back. */
export function requestComposerClear(el: HTMLElement): boolean {
  return !el.dispatchEvent(new CustomEvent(CLEAR_COMPOSER_EVENT, { bubbles: true, cancelable: true }));
}
