// Reading from and writing into a host composer — the one place that knows how the
// different editor kinds behave. This is config/runtime-driven, NOT per-platform:
// the editor kind is detected from the node itself (form field vs contenteditable,
// Lexical vs plain), so a new platform is still just a config + fixture. The generic
// adapter delegates here so its methods stay free of editor quirks.

import { requestComposerClear, requestComposerInsert } from './composer-bridge';

/** A form field has a settable native `value`; everything else (ProseMirror, Quill,
 *  Lexical contenteditables) is a rich editor we must drive through the selection. */
export function isFormField(el: HTMLElement): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

/** The composer's current draft, read from the same place `writeComposer` writes
 *  (form field `value` or contenteditable `textContent`). */
export function readComposerText(el: HTMLElement): string {
  return isFormField(el) ? el.value : (el.textContent ?? '');
}

function nativeValueSetter(el: HTMLElement): ((v: string) => void) | null {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : null;
  if (!proto) return null;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  return desc?.set ? (v: string) => desc.set!.call(el, v) : null;
}

/** Collapse the selection to the end of a contenteditable so an appended insert
 *  lands after any existing draft (and an `execCommand` insert targets the editor).
 *  Best-effort: a host without a Selection API simply skips this. */
function caretToEnd(el: HTMLElement, doc: Document): void {
  try {
    const sel = doc.getSelection?.();
    if (!sel) return;
    const range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* no Selection API (e.g. some test envs) — the insert still runs */
  }
}

/** Select a contenteditable's whole contents so a subsequent `execCommand`
 *  insert/delete replaces the existing draft through real input events. A raw
 *  `textContent=''` is silently reverted by model-backed editors, so a replace
 *  must go through a real selection. Best-effort like `caretToEnd`. */
function selectAllContents(el: HTMLElement, doc: Document): void {
  try {
    const sel = doc.getSelection?.();
    if (!sel) return;
    const range = doc.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* no Selection API (e.g. some test envs) — the fallback write still runs */
  }
}

/** Commit text into a form field / plain contenteditable by writing the value and
 *  firing `input`. The graceful fallback when the `execCommand` path is unavailable. */
function commitText(el: HTMLElement, text: string, replace: boolean): boolean {
  const setNative = nativeValueSetter(el);
  if (setNative) {
    const current = (el as HTMLTextAreaElement | HTMLInputElement).value;
    setNative(replace ? text : current + text);
  } else {
    const current = el.textContent ?? '';
    el.textContent = replace ? text : current + text;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** Insert (append) or replace the composer's draft, picking the right strategy for
 *  the editor kind. `preferExecCommand` comes from the config's `insertMode`; any
 *  contenteditable uses the execCommand path regardless (a host whose textarea became
 *  a rich editor still gets text). Returns false only when there is nothing to do. */
export function writeComposer(
  el: HTMLElement,
  text: string,
  opts: { replace?: boolean; preferExecCommand?: boolean } = {},
): boolean {
  const replace = opts.replace ?? false;
  const doc = el.ownerDocument;

  // The write is triggered from our overlay, so the host editor is NOT focused —
  // focus it first or the write/execCommand has no target. (No-op if already focused.)
  el.focus?.();

  // A rich contenteditable (Claude=ProseMirror, Gemini=Quill, Perplexity=Lexical)
  // manages its own document model and silently reverts a raw `textContent` write, so
  // it must be driven through `execCommand`, which dispatches the real
  // `beforeinput`/`input` the editor listens for. Form fields keep the native
  // value-setter path (`react-set`).
  const useExecCommand = opts.preferExecCommand || !isFormField(el);
  if (useExecCommand) {
    // Quill (Gemini) reverts an out-of-band `execCommand` edit on its next update
    // cycle, so a programmatic insert visibly lands but is restored as a draft the
    // instant the user sends. Drive it through its own instance via the MAIN-world
    // bridge instead (handles both insert and clear); falls through to the DOM path
    // below when no page bridge is present (tests) or the editor isn't Quill.
    if (el.classList?.contains('ql-editor') && requestComposerInsert(el, text, replace)) return true;
    // Clearing a model-backed editor (Perplexity = Lexical) can't go through the DOM —
    // it ignores execCommand delete and reverts a raw write — and its instance lives
    // in the page world the isolated content script can't reach, so we ask the
    // MAIN-world bridge to reset it. Only the empty-replace (erase) case needs this;
    // replacing with text still goes through select-all + insertText, which Lexical
    // honours. A non-Lexical editor leaves the event unhandled → DOM fallback below.
    if (replace && !text && requestComposerClear(el)) return true;
    // Replace: select the whole draft so execCommand overwrites it through real input
    // events. Append: collapse the caret after the existing draft.
    if (replace) selectAllContents(el, doc);
    else caretToEnd(el, doc);
    const exec = (doc as Document & { execCommand?: (c: string, ui: boolean, v: string) => boolean })
      .execCommand;
    if (typeof exec === 'function') {
      // Clearing (empty text) must use `delete` — `insertText('')` is a no-op in
      // editors like Lexical and leaves the selected draft in place.
      const ran = text
        ? exec.call(doc, 'insertText', false, text)
        : exec.call(doc, 'delete', false, '');
      if (ran) return true;
    }
    return commitText(el, text, replace); // graceful fallback (e.g. test envs)
  }

  // 'react-set' and 'paste' both resolve to a native-value write + input event;
  // 'paste' is best-effort and degrades to the same path under test/jsdom.
  return commitText(el, text, replace);
}
