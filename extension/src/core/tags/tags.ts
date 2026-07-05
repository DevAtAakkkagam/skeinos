// Pure tag logic (C7/M2, design D-1/D-4). No IndexedDB, no DOM, no messaging —
// just records in, records out — so every transform and the client-side derivations
// (counts, filtering) are exhaustively unit-testable in isolation. The worker handler
// loads the `Tag` rows + carriers, calls these functions, and writes the result back
// through the store; this module never persists. The same `countByTag`/`filterByTags`
// run in the UI so a tag's badge count can never disagree with the rows its filter
// renders (the guarantee D28 gives folder badges, applied to tags).

import type { ConversationIndex, Tag } from '../../shared/types';

/** Stable error codes raised when a tag mutation is rejected. */
export const TAG_ERROR = {
  notFound: 'tag_not_found',
  emptyLabel: 'tag_label_empty',
} as const;

/** A fresh tag id, fixed once per create so a retry overwrites the same row (after a
 *  possibly-committed-but-unacknowledged attempt) instead of duplicating. Mirrors
 *  `makeFolderId` / `makePromptId`. */
export function makeTagId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `t_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Build a new `Tag` from a (trimmed) label and optional colour. The envelope is
 *  stamped by the store's write path, never here. */
export function createTag(input: { id: string; label: string; color?: string }): Tag {
  return {
    id: input.id,
    label: input.label,
    ...(input.color ? { color: input.color } : {}),
  } as Tag;
}

/** Return `tag` with a new label (other fields, including the envelope, untouched —
 *  the store re-stamps `rev`/`updatedAt` on write). */
export function renameTag(tag: Tag, label: string): Tag {
  return { ...tag, label };
}

/** Set (or, when `color` is omitted, clear) a tag's colour. */
export function recolorTag(tag: Tag, color?: string): Tag {
  const next = { ...tag };
  if (color) next.color = color;
  else delete next.color;
  return next;
}

/** Add `tagId` to a carrier's `tags` array (idempotent — never duplicates), or remove
 *  it (a no-op when absent), driven by `assigned`. Returns the same reference when the
 *  array would not change, so callers can skip a redundant write. */
export function toggleTag<T extends { tags: string[] }>(carrier: T, tagId: string, assigned: boolean): T {
  const has = carrier.tags.includes(tagId);
  if (assigned) {
    if (has) return carrier;
    return { ...carrier, tags: [...carrier.tags, tagId] };
  }
  if (!has) return carrier;
  return { ...carrier, tags: carrier.tags.filter((t) => t !== tagId) };
}

/** Drop `tagId` from a carrier's `tags` array (deletion cleanup). Returns the same
 *  reference when the id was not present. */
export function detachTag<T extends { tags: string[] }>(carrier: T, tagId: string): T {
  if (!carrier.tags.includes(tagId)) return carrier;
  return { ...carrier, tags: carrier.tags.filter((t) => t !== tagId) };
}

/** Live usage count per tag id, derived client-side from the unified conversation
 *  list (design D-4) — the tags-view badge reads from here, so it equals the rows the
 *  same tag's filter would render. Mirrors `countByFolder`. */
export function countByTag(conversations: ConversationIndex[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of conversations) {
    for (const id of c.tags) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Narrow `conversations` to those carrying ANY id in `selected` (OR semantics).
 *  An empty selection is the identity (the unified list). Pure + ephemeral
 *  — never mutates a record. */
export function filterByTags(
  conversations: ConversationIndex[],
  selected: string[],
): ConversationIndex[] {
  if (selected.length === 0) return conversations;
  return conversations.filter((c) => selected.some((id) => c.tags.includes(id)));
}
