// Prompt-library query/mutate payloads carried by the `prompts.query` and
// `prompts.mutate` request kinds (slice 2 of prompts-library, design D-A). Mirrors
// `shared/workspace.ts`: a discriminated read selector, its snapshot, and the write
// op union — reusing the existing `MutationResult` (`{ stores }`). The request-kind
// contracts are registered via declaration merging in `core/prompts/handlers.ts`
// (the messaging seam), so prompts get their own kind pair without editing the hub
// or coupling into `workspace.*` (owned by `core/folders`).

import type { Prompt, PromptFolder, PlatformId } from './types';

export type { MutationResult } from './workspace';

/** A read request against the prompt library, discriminated by `kind`. */
export type PromptSelector = { kind: 'prompt.library' };

/** The result of a {@link PromptSelector}: the unified library. Category and tag
 *  counts are derived client-side from `prompts` (D-B) — never stored or returned,
 *  so a badge can never disagree with the rows it labels. Excludes tombstones. */
export type PromptSnapshot = {
  kind: 'prompt.library';
  prompts: Prompt[];
  folders: PromptFolder[];
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
      slug?: string;
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
      slug?: string;
      promptFolderId?: string | null;
    }
  | { op: 'prompt.delete'; id: string }
  | { op: 'promptFolder.create'; id: string; name: string; order: number; parentId: null }
  | { op: 'promptFolder.rename'; id: string; name: string }
  | { op: 'promptFolder.delete'; id: string };
