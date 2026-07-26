// Runtime discovery of the element that actually scrolls a host's conversation
// list (design D1). Deliberately NOT a config selector: a live probe of all four
// platforms found the real scroller is never the configured `conversationList`
// element — it is an ANCESTOR on ChatGPT and Gemini and a DESCENDANT on Claude and
// Perplexity — and the ChatGPT one is a Tailwind class carrying a `/` that would
// need CSS escaping, exactly the kind of string that churns. So we walk outward
// AND inward from the list and pick the element that overflows the most, keeping
// the hot-fix surface free of one more breakable selector.

/** How far up the tree to look. The probe found the ChatGPT scroller 3 levels
 *  above `#history`; 12 is generous headroom without walking to `<html>`. */
const ANCESTOR_LIMIT = 12;
/** How far down to look, and how many descendants to examine. `getComputedStyle`
 *  is a layout read, so an unbounded walk over a list holding hundreds of rows
 *  would be needlessly expensive; the probe found the descendant scrollers within
 *  2 levels on both platforms that have one. */
const DESCENDANT_DEPTH = 6;
const DESCENDANT_LIMIT = 500;
/** Sub-pixel rounding means a non-scrolling element can report a 1–2px overflow;
 *  require more than that before believing an element really scrolls. */
const MIN_OVERFLOW = 4;

function computedOverflowY(el: Element): string {
  const view = el.ownerDocument?.defaultView ?? (globalThis as { getComputedStyle?: unknown });
  const getStyle = (view as Window).getComputedStyle;
  if (typeof getStyle !== 'function') return '';
  try {
    return getStyle.call(view, el).overflowY ?? '';
  } catch {
    return '';
  }
}

/** How much this element scrolls, or 0 when it does not scroll at all. */
function scrollableOverflow(el: Element): number {
  const overflowY = computedOverflowY(el);
  if (overflowY !== 'auto' && overflowY !== 'scroll') return 0;
  return el.scrollHeight - el.clientHeight;
}

/** The list element, its bounded ancestors, and its bounded descendants. */
function candidatesAround(listEl: Element): Element[] {
  const out: Element[] = [listEl];

  let ancestor = listEl.parentElement;
  for (let i = 0; ancestor && i < ANCESTOR_LIMIT; i++) {
    out.push(ancestor);
    ancestor = ancestor.parentElement;
  }

  // Breadth-first so the shallowest descendants — where the real scroller sits —
  // are always examined even when the limit cuts the walk short.
  let frontier: Element[] = Array.from(listEl.children);
  for (let depth = 0; depth < DESCENDANT_DEPTH && frontier.length > 0; depth++) {
    const next: Element[] = [];
    for (const el of frontier) {
      if (out.length >= DESCENDANT_LIMIT) return out;
      out.push(el);
      next.push(...Array.from(el.children));
    }
    frontier = next;
  }
  return out;
}

/**
 * Find the element that scrolls `listEl`'s conversation list: the largest-overflow
 * candidate among the list, its ancestors, and its descendants. Falls back to the
 * document's scrolling element when no candidate qualifies but the document itself
 * scrolls (which reports `overflow-y: visible`, so it can never be a candidate),
 * and returns `null` when nothing scrolls at all — the caller treats that as
 * "this host does not paginate" and sweeps nothing.
 */
export function findScroller(listEl: Element | null): Element | null {
  let best: Element | null = null;
  let bestOverflow = MIN_OVERFLOW;

  if (listEl) {
    for (const el of candidatesAround(listEl)) {
      const overflow = scrollableOverflow(el);
      if (overflow > bestOverflow) {
        best = el;
        bestOverflow = overflow;
      }
    }
  }
  if (best) return best;

  const doc = listEl?.ownerDocument ?? (globalThis as { document?: Document }).document;
  const root = doc?.scrollingElement ?? null;
  if (root && root.scrollHeight - root.clientHeight > MIN_OVERFLOW) return root;
  return null;
}
