// Persisted record shapes for the workspace store.
//
// Every *syncable* record extends `SyncMeta` — the sync envelope wired from day
// one (D7) so the M5 sync engine never forces a data migration. Local-only
// records (`ConversationIndex`, `Comparison`) deliberately do NOT carry the
// envelope: they never leave the device (PRIV-1), so there is nothing to sync.

import type { DomainId } from './domains';

export type PlatformId =
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'grok'
  | 'deepseek'
  | 'chatgpt'
  | 'mistral';

/**
 * Sync envelope mixed into every syncable record. Stamped centrally by the
 * store's write path — feature code never sets these fields by hand.
 */
export interface SyncMeta {
  rev: number;
  updatedAt: number;
  deviceId: string;
  hash: string;
  deleted?: boolean;
}

export interface Folder extends SyncMeta {
  id: string;
  name: string;
  parentId: string | null;
  platformScope: PlatformId | 'unified';
  color?: string;
  icon?: string;
  order: number;
  pinned?: boolean;
  archived?: boolean;
}

/**
 * A derived view of the folder hierarchy — not persisted. `core/folders`
 * `buildTree` produces it from the flat `Folder` rows; the sidebar renders it.
 * `depth` is 1-based (a root folder is depth 1) so the nest-≤5 guard reads
 * directly.
 */
export interface FolderTreeNode {
  folder: Folder;
  depth: number;
  children: FolderTreeNode[];
}

/**
 * The conversation open in a platform's active tab, reported by the content
 * script so the side panel can surface a "current conversation" card. One record
 * per platform (keyed by `platform`). Local only — never synced; carries only the
 * id/title metadata that already crosses the messaging seam, never content.
 */
export interface ActiveConversation {
  platform: PlatformId;
  nativeId: string;
  title: string;
  updatedAt: number;
  // True when this tab has a conversation open but the host rendered no list items
  // (its drawer is collapsed and it hides the list when collapsed — Gemini). Lets
  // the side panel nudge the user to open the drawer once so the full list syncs.
  // Optional/additive — absent means "no nudge" (the common case for every platform
  // whose list stays in the DOM when collapsed). Local-only metadata, never synced.
  listCollapsedHint?: boolean;
}

/**
 * Per-platform UI signal reported by the content script, independent of whether a
 * conversation is open. One record per platform (keyed by `platform`). Today it
 * carries only `listCollapsed` — true when the host hides its conversation list
 * while its side drawer is collapsed (Gemini) and that drawer is currently shut —
 * so the side panel can nudge the user to open the drawer once and sync the full
 * list EVEN on a new-chat/home page where no conversation is open (the moment a
 * fresh user most needs the hint). Local-only metadata, never synced; survives MV3
 * worker death (SW-2) so the nudge persists across a worker restart.
 */
export interface PlatformState {
  platform: PlatformId;
  listCollapsed: boolean;
  updatedAt: number;
  // When the once-per-install history-expansion sweep finished for this platform
  // (epoch ms), and how it ended. The content script consults this before sweeping,
  // so a visible, up-to-a-minute scroll of the host sidebar happens once per install
  // rather than on every page load — and survives MV3 worker death, which an
  // in-memory flag would not (SW-2). Absent means "never swept". A `cap` outcome
  // records an INCOMPLETE backfill, so a later change can resume rather than
  // re-sweep from scratch. Local-only metadata, never synced.
  historyBackfilledAt?: number;
  historyBackfillOutcome?: 'plateau' | 'cap' | 'noop';
}

/** Local only — never synced. */
export interface ConversationIndex {
  id: string;
  platform: PlatformId;
  nativeId: string;
  title: string;
  folderId: string | null;
  tags: string[];
  indexedText: string;
  contentHash: string;
  // Token-index boundary within `indexedText`: tokens before it are the title,
  // tokens at/after it are the body. Lets a title-only re-ingest recover and
  // preserve a previously-indexed body instead of clobbering it. Optional/additive
  // — absent on records written before search shipped (treated as "unknown").
  titleTokenCount?: number;
  updatedAt: number;
  // Per-conversation organization state (conversation-context-menu). Optional and
  // additive — absent means unpinned / not archived / no colour. Local-only like
  // the rest of the record: these never sync (PRIV-1).
  pinned?: boolean;
  archived?: boolean;
  color?: string;
}

/** D14: variables carry defaults + an input type that drives the fill-in modal. */
export interface PromptVar {
  name: string;
  default?: string;
  type: 'text' | 'select';
  options?: string[];
}

/**
 * One token from {@link tokenizeTemplate}: either a literal `text` run or a
 * recognized `{{…}}` `var`. `raw` preserves the original token text so card /
 * editor rendering can round-trip the body faithfully. Derived from the same scan
 * as {@link parseVariables}, so the two never disagree about which spans are vars.
 */
export type TemplateToken =
  | { kind: 'text'; text: string }
  | { kind: 'var'; name: string; raw: string };

export interface Prompt extends SyncMeta {
  id: string;
  title: string;
  description?: string;
  body: string;
  variables: PromptVar[];
  tags: string[];
  /** Platforms this prompt targets (zero or more) — the cross-platform cards. */
  targetModels: PlatformId[];
  /**
   * The professional domain this prompt belongs to ({@link DomainId}). Set once when
   * a catalog seed is installed and left as the stable onboarding filter key —
   * independent of the user-editable `promptFolderId` category (D-A). Absent on
   * hand-created prompts.
   */
  domain?: DomainId;
  /**
   * Catalog provenance: the originating seed's stable id (e.g.
   * `software-engineering/code-review`). Lets the installer dedupe by presence so
   * re-installing a domain never duplicates (D-B). Absent on hand-created prompts,
   * which the installer never touches.
   */
  seedId?: string;
  promptFolderId: string | null;
  usageCount: number;
  lastUsedAt?: number;
}

/** Prompt-library folder tree (separate from conversation `folders`). */
export interface PromptFolder extends SyncMeta {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
}

export interface InstructionProfile extends SyncMeta {
  id: string;
  name: string;
  description?: string;
  instructionText: string;
  appliesTo: PlatformId[]; // D13
  responseStyle?: {
    verbosity: 'brief' | 'balanced' | 'thorough';
    format: 'markdown' | 'plain';
  };
  /**
   * The professional domain this profile was seeded for ({@link DomainId}). Set once
   * when a catalog seed is installed; absent on hand-created profiles. Mirrors
   * `Prompt.domain`.
   */
  domain?: DomainId;
  /**
   * Catalog provenance: the originating seed's stable id (e.g.
   * `software-engineering/senior-staff-engineer`). Lets the installer dedupe by
   * presence so re-installing a domain never duplicates. Absent on hand-created
   * profiles. Mirrors `Prompt.seedId`.
   */
  seedId?: string;
}

export interface Tag extends SyncMeta {
  id: string;
  label: string;
  color?: string;
}

/** Local only — never synced (D12). */
export interface Comparison {
  id: string;
  title?: string;
  prompt: string;
  platforms: PlatformId[];
  responses: { platform: PlatformId; text: string; latencyMs?: number }[];
  picked?: PlatformId;
  createdAt: number;
}

/**
 * One term's occurrences within a single document (/ D26). `field`
 * tracks title-vs-body provenance so ranking can boost titles and highlighting
 * can target the right field; `positions` are token indices into the document's
 * normalized `indexedText` (a single token stream over title then body), so the
 * same indices drive both scoring and snippet windows.
 */
export interface Posting {
  docId: string;
  field: 'title' | 'body';
  positions: number[];
}

/**
 * A shard of the search postings index (/ D26), keyed by a 2-char term
 * **prefix** — each shard record holds many terms, mapping each to its postings.
 * Prefix sharding keeps individual records small (vs. one monolithic blob) while
 * avoiding the write amplification of one-record-per-term (the shipped per-term
 * layout this replaces). Local only — never synced (PRIV-1).
 */
export interface SearchShard {
  /** First two characters of the normalized term, or the whole term when shorter. */
  prefix: string;
  /** term → its postings across documents. */
  terms: Record<string, Posting[]>;
}

/** One segment of a highlighted snippet: a run of text, flagged if it matched. */
export interface SnippetSegment {
  text: string;
  match: boolean;
}

/** Optional filters narrowing a {@link Query} against `ConversationIndex` metadata. */
export interface SearchFilters {
  platform?: PlatformId;
  /** Inclusive lower / upper bounds on `updatedAt` (epoch ms). */
  updatedAfter?: number;
  updatedBefore?: number;
  /** `null` matches unfiled conversations; omit to not filter by folder. */
  folderId?: string | null;
  /** Include archived conversations when `true`; archived are excluded by default. */
  archived?: boolean;
  /** Forward-compatible tag dimension (C7). Inert until tag assignment ships. */
  tag?: string;
}

/** A search request: terms (AND semantics) + optional filters + paging. */
export interface Query {
  terms: string[];
  filters?: SearchFilters;
  offset?: number;
  limit?: number;
}

/**
 * One ranked search hit. Carries the display fields the overlay needs to render a
 * row (title, platform, nativeId for the logo + open action) alongside the score
 * and the highlighted snippet — all derived from local-only records, nothing new
 * crosses the privacy boundary.
 */
export interface SearchResult {
  docId: string;
  platform: PlatformId;
  nativeId: string;
  title: string;
  score: number;
  snippet: SnippetSegment[];
  /** Owning folder (or `null` when unfiled) — drives the result row's folder chip. */
  folderId: string | null;
  /** Last-updated epoch ms — drives the result row's relative timestamp. */
  updatedAt: number;
}

/** Input for indexing one conversation (content-derived fields only). */
export interface IndexInput {
  id: string;
  platform: PlatformId;
  nativeId: string;
  title: string;
  /** The conversation's message text, concatenated by the caller. */
  body: string;
  /** Source timestamp for the recency factor; defaults to now when omitted. */
  updatedAt?: number;
}

/**
 * The query/index contract the rest of the worker programs against,
 * introduced by the `search` change. Implemented over the `searchPostings` +
 * `conversations` repos in the service worker (the single writer).
 */
export interface SearchEngine {
  /** Index or re-index one conversation; resolves `true` when it wrote, `false`
   *  on an idempotent no-op (unchanged `contentHash`). */
  index(input: IndexInput): Promise<boolean>;
  /** Remove a conversation's postings and its `ConversationIndex` record. */
  remove(id: string): Promise<void>;
  /** Run a query and return ranked, paged results. */
  search(query: Query): Promise<SearchResult[]>;
}
