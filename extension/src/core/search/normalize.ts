// Pure text → tokens primitives shared by indexing and querying. The
// single rule that makes the index correct: the SAME normalization, stemming, and
// prefixing run at index time and at query time, so a term derived from a document
// and the same term typed into the search box collapse to identical keys. Nothing
// here touches storage or the DOM — it is deterministic and dependency-free, which
// is what lets the engine run inside the service worker and the benchmark drive a
// synthetic corpus.

/** A normalized, stemmed token plus its position in the document's token stream. */
export interface Token {
  term: string;
  /** Zero-based token index within the normalized text (drives positions). */
  position: number;
}

/**
 * Lowercase, strip punctuation, and collapse whitespace. Unicode-aware: letters
 * and numbers in any script survive (`\p{L}`/`\p{N}`), everything else becomes a
 * separator — so accented and CJK text tokenize, while punctuation never glues or
 * splits a term differently between index and query.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Light, idempotent stemming: plural/case folding only (D26 — keep it light so it
 * never over-collapses, and identical on a second pass so re-tokenizing stored
 * text is stable). Operates on an already-lowercased word.
 */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')))
    return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us'))
    return word.slice(0, -1);
  return word;
}

/**
 * Normalize then split into positioned, stemmed tokens. Positions are dense token
 * indices (0, 1, 2…) over the normalized stream, so they are stable across runs
 * for identical input and line up with `indexedText.split(' ')` for snippeting.
 */
export function tokenize(text: string): Token[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized.split(' ').map((word, position) => ({ term: stem(word), position }));
}

/**
 * The shard key for a term: its first two characters, or the whole term when
 * shorter than two. Computed from the already-normalized/stemmed term so sharding
 * and lookup use the identical function. Code-point aware (`[...term]`) so a
 * multibyte leading character is never split mid-surrogate into a broken key.
 */
export function prefixOf(term: string): string {
  const chars = [...term];
  return chars.length <= 2 ? term : chars.slice(0, 2).join('');
}

/**
 * A stable digest over normalized text for the `contentHash` idempotency guard
 * (FNV-1a/64 via BigInt, the same family as the store envelope's hash). It is a
 * change detector, not a security primitive: identical input yields an identical
 * hash, and a single changed character changes it.
 */
export function hashContent(normalizedText: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < normalizedText.length; i++) {
    hash ^= BigInt(normalizedText.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Build a conversation's normalized `indexedText` and the title/body boundary.
 * Title and body are tokenized separately so field provenance is exact, then
 * joined into one token stream whose dense positions back both postings and
 * snippets. `titleTokenCount` marks where title tokens end and body begins, so a
 * later `tokenize(text)` re-derives the same field split without storing it.
 */
/** Upper bound on body characters fed to the tokenizer. The content script reads
 *  arbitrary host-page DOM, so a pathological (or hostile) megabyte-scale
 *  conversation must not make the single-writer worker do unbounded normalize/
 *  tokenize work or bloat `indexedText`. Generous enough to cover any real chat. */
export const MAX_BODY_CHARS = 200_000;

export function indexableText(
  title: string,
  body: string,
): { text: string; titleTokenCount: number } {
  const titleTokens = tokenize(title);
  const bodyTokens = tokenize(body.length > MAX_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) : body);
  const text = [...titleTokens, ...bodyTokens].map((t) => t.term).join(' ');
  return { text, titleTokenCount: titleTokens.length };
}
