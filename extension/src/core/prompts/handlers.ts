// Worker-side prompt-library query/mutate handlers (slice 2, design D-A..D-F). The
// single writer loads from the `prompts`/`promptFolders` repos on every call, applies
// the mutation, and writes back — rebuilding from the store each time, so a cold MV3
// worker needs no in-memory state (SW-1/SW-2). Reads/writes ride the existing
// messaging hub via two new kinds (`prompts.query`/`prompts.mutate`) added through the
// declaration-merging seam; after a write that changed data the worker broadcasts
// `state.changed` with the touched store names so every open tab re-queries.
//
// `variables` is NEVER trusted from the client: the worker derives it from `body` via
// slice 1's `parseVariables` on create and on any body change (D-C) — both modules live
// in `core/`, dependencies inward (LLD §2). No DOM access here.

import { broadcast, registerHandler } from '../../core/messaging';
import { workspaceStore, type WorkspaceStore } from '../../core/store';
import type { Prompt, PromptFolder } from '../../shared/types';
import type {
  MutationResult,
  PromptMutationOp,
  PromptSelector,
  PromptSnapshot,
} from '../../shared/prompts';
import { parseVariables } from './template';

declare module '../../shared/messages' {
  interface RequestContracts {
    'prompts.query': { request: { selector: PromptSelector }; response: PromptSnapshot };
    'prompts.mutate': { request: { op: PromptMutationOp }; response: MutationResult };
  }
}

/** Error codes that survive the messaging boundary (mirror `FOLDER_ERROR`). */
export const PROMPT_ERROR = {
  notFound: 'prompt_not_found',
} as const;

/** A domain error that survives the messaging boundary with its `code` intact. */
export class PromptError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PromptError';
    this.code = code;
  }
}

async function requirePrompt(store: WorkspaceStore, id: string): Promise<Prompt> {
  const p = await store.prompts.get(id);
  if (!p) throw new PromptError(PROMPT_ERROR.notFound, `No prompt ${id}`);
  return p;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The unified library (D-B): every non-deleted prompt + category, no counts. */
export async function queryPromptLibrary(
  store: WorkspaceStore,
  selector: PromptSelector,
): Promise<PromptSnapshot> {
  switch (selector.kind) {
    case 'prompt.library': {
      const [prompts, folders] = await Promise.all([
        store.prompts.query(),
        store.promptFolders.query(),
      ]);
      return { kind: 'prompt.library', prompts, folders };
    }
  }
}

// ---------------------------------------------------------------------------
// Writes — each returns the stores it touched (for the broadcast)
// ---------------------------------------------------------------------------

export async function mutatePromptLibrary(
  store: WorkspaceStore,
  op: PromptMutationOp,
): Promise<MutationResult> {
  switch (op.op) {
    case 'prompt.create': {
      // The worker derives `variables` from `body` (D-C) and initializes the dormant
      // usage fields; the envelope is stamped by the repo on `put`. `usageCount` is 0
      // and `lastUsedAt` is left unset until C25 owns usage.
      const prompt: Prompt = {
        id: op.id,
        title: op.title,
        body: op.body,
        variables: parseVariables(op.body),
        tags: op.tags ?? [],
        targetModels: op.targetModels ?? [],
        promptFolderId: op.promptFolderId ?? null,
        usageCount: 0,
        ...(op.description !== undefined ? { description: op.description } : {}),
        ...(op.slug !== undefined ? { slug: op.slug } : {}),
      } as Prompt;
      await store.prompts.put(prompt);
      return { stores: ['prompts'] };
    }
    case 'prompt.update': {
      // Read-modify-write partial patch (D-D): apply only the present fields, re-derive
      // `variables` ONLY when `body` is in the patch, and preserve the dormant
      // `usageCount`/`lastUsedAt` verbatim (this slice never touches usage — C25).
      const prev = await requirePrompt(store, op.id);
      const next: Prompt = { ...prev };
      if (op.title !== undefined) next.title = op.title;
      if (op.description !== undefined) next.description = op.description;
      if (op.tags !== undefined) next.tags = op.tags;
      if (op.targetModels !== undefined) next.targetModels = op.targetModels;
      if (op.slug !== undefined) next.slug = op.slug;
      if (op.promptFolderId !== undefined) next.promptFolderId = op.promptFolderId;
      if (op.body !== undefined) {
        next.body = op.body;
        next.variables = parseVariables(op.body);
      }
      await store.prompts.put(next);
      return { stores: ['prompts'] };
    }
    case 'prompt.delete': {
      // Tombstone via the repo (prompts are syncable, so `delete` writes a tombstone).
      await requirePrompt(store, op.id);
      await store.prompts.delete(op.id);
      return { stores: ['prompts'] };
    }
    case 'promptFolder.create': {
      const folder: PromptFolder = {
        id: op.id,
        name: op.name,
        parentId: op.parentId,
        order: op.order,
      } as PromptFolder;
      await store.promptFolders.put(folder);
      return { stores: ['promptFolders'] };
    }
    case 'promptFolder.rename': {
      const f = await store.promptFolders.get(op.id);
      if (!f) throw new PromptError(PROMPT_ERROR.notFound, `No prompt category ${op.id}`);
      await store.promptFolders.put({ ...f, name: op.name });
      return { stores: ['promptFolders'] };
    }
    case 'promptFolder.delete': {
      // Reassign every prompt in this category to uncategorized (D-E) so no synced
      // Prompt is left pointing at a removed category. Report both stores only when
      // prompts were actually moved — an empty category touches `promptFolders` alone.
      const f = await store.promptFolders.get(op.id);
      if (!f) throw new PromptError(PROMPT_ERROR.notFound, `No prompt category ${op.id}`);
      const prompts = await store.prompts.query();
      const orphaned = prompts.filter((p) => p.promptFolderId === op.id);
      for (const p of orphaned) {
        await store.prompts.put({ ...p, promptFolderId: null });
      }
      await store.promptFolders.delete(op.id);
      return { stores: orphaned.length > 0 ? ['promptFolders', 'prompts'] : ['promptFolders'] };
    }
  }
}

// ---------------------------------------------------------------------------
// Registration (worker)
// ---------------------------------------------------------------------------

/** Worker side: register the prompt query/mutate handlers and broadcast on writes. */
export function registerPromptHandlers(): void {
  registerHandler('prompts.query', async (req) => {
    return queryPromptLibrary(await workspaceStore(), req.selector);
  });
  registerHandler('prompts.mutate', async (req) => {
    const result = await mutatePromptLibrary(await workspaceStore(), req.op);
    // Skip the fan-out when a mutation touched nothing, so no-op writes never wake
    // every tab into a re-query (mirror the folder handler's broadcast gate).
    if (result.stores.length > 0) {
      await broadcast({ kind: 'state.changed', stores: result.stores });
    }
    return result;
  });
}
