// Prompt-library query/mutate payloads carried by the `prompts.query` and
// `prompts.mutate` request kinds (slice 2 of prompts-library, design D-A). Mirrors
// `shared/workspace.ts`: a discriminated read selector, its snapshot, and the write
// op union — reusing the existing `MutationResult` (`{ stores }`). The request-kind
// contracts are registered via declaration merging in `core/prompts/handlers.ts`
// (the messaging seam), so prompts get their own kind pair without editing the hub
// or coupling into `workspace.*` (owned by `core/folders`).

import type { Prompt, PromptFolder, PlatformId, SnippetSegment } from './types';
import type { DomainId } from './domains';

export type { MutationResult } from './workspace';

/** The reply to a `prompts.install` request: how many seeds the worker inserted
 *  (0 when the domain's seeds were all already present — an idempotent no-op). */
export interface PromptInstallResult {
  installed: number;
}

/** The payload of a `prompts.install` request: the domain whose seeds to install. */
export interface PromptInstallRequest {
  domain: DomainId;
}

/** A read request against the prompt library, discriminated by `kind`. The
 *  `prompt.search` variant (slice 4, design D-A) rides the same `prompts.query`
 *  kind — a direct in-worker scan of the small library, never a postings entry. */
export type PromptSelector =
  | { kind: 'prompt.library' }
  | { kind: 'prompt.search'; terms: string[] }
  | { kind: 'prompt.recents'; limit: number };

/** One ranked prompt-search hit (design D-B): the fields a result row renders,
 *  reusing the search overlay's {@link SnippetSegment} so prompt rows highlight
 *  exactly like conversation rows. Local-only — never enters the sync envelope or
 *  the conversation postings index. */
export interface PromptSearchResult {
  id: string;
  title: string;
  snippet: SnippetSegment[];
  targetModels: PlatformId[];
}

/** The result of a {@link PromptSelector}, discriminated by `kind`. `prompt.library`
 *  returns the unified library (category/tag counts are derived client-side per D-B —
 *  never stored or returned); `prompt.search` returns the ranked matches. Both
 *  exclude tombstones. */
export type PromptSnapshot =
  | {
      kind: 'prompt.library';
      prompts: Prompt[];
      folders: PromptFolder[];
    }
  | {
      kind: 'prompt.search';
      results: PromptSearchResult[];
    }
  | {
      kind: 'prompt.recents';
      results: PromptSearchResult[];
    };

/** A write request against the prompt library, discriminated by `op`. The client
 *  supplies a generated id on creates and the raw `body`; it NEVER carries
 *  `variables` — the worker derives those from `body` via `parseVariables` (D-C). */
export type PromptMutationOp =
  | {
      op: 'prompt.create';
      id: string;
      title: string;
      body: string;
      description?: string;
      tags?: string[];
      targetModels?: PlatformId[];
      promptFolderId?: string | null;
    }
  | {
      op: 'prompt.update';
      id: string;
      title?: string;
      description?: string;
      body?: string;
      tags?: string[];
      targetModels?: PlatformId[];
      promptFolderId?: string | null;
    }
  | { op: 'prompt.delete'; id: string }
  | { op: 'prompt.recordUse'; id: string }
  | { op: 'promptFolder.create'; id: string; name: string; order: number; parentId: null }
  | { op: 'promptFolder.rename'; id: string; name: string }
  | { op: 'promptFolder.delete'; id: string };
