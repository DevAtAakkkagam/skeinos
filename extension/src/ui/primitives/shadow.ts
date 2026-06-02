// Resolve the root a node lives in. Zag.js machines query their elements and attach
// dismiss/focus listeners relative to `getRootNode()`; our UI lives in a shadow root,
// where `document.getElementById` cannot reach, so widgets must hand Zag the shadow
// root (decision D-IP4). Falls back to `document` before the element is mounted.
export function getNodeRoot(el: Element | null | undefined): Document | ShadowRoot {
  const root = el?.getRootNode?.();
  return root instanceof ShadowRoot ? root : document;
}

let counter = 0;
/** Stable unique id for a machine instance (Zag requires one per widget). */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
