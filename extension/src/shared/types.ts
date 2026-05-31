// Persisted record shapes for the workspace store (LLD §6).
//
// Every *syncable* record extends `SyncMeta` — the sync envelope wired from day
// one (D7) so the M5 sync engine never forces a data migration. Local-only
// records (`ConversationIndex`, `Comparison`) deliberately do NOT carry the
// envelope: they never leave the device (PRIV-1), so there is nothing to sync.

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
  updatedAt: number;
}

/** D14: variables carry defaults + an input type that drives the fill-in modal. */
export interface PromptVar {
  name: string;
  default?: string;
  type: 'text' | 'select';
  options?: string[];
}

export interface Prompt extends SyncMeta {
  id: string;
  title: string;
  description?: string;
  body: string;
  variables: PromptVar[];
  tags: string[];
  targetModel?: PlatformId;
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
 * A shard of the search postings index (LLD §8). Keyed by `term`; the index
 * logic lands in M2 (the `search` change) — the empty store + key shape exist
 * now (D6) so M2 needs no schema bump. Local only — never synced.
 */
export interface SearchPosting {
  term: string;
  docs: { docId: string; field: string; positions: number[] }[];
}
