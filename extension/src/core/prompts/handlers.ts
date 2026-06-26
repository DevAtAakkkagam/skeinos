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
import { getSettings } from '../../core/settings';
import { assertWithinQuota } from '../../core/tier';
import { normalize } from '../../core/search/normalize';
import type { Prompt, PromptFolder, SnippetSegment } from '../../shared/types';
import type { DomainId } from '../../shared/domains';
import type {
  MutationResult,
  PromptInstallResult,
  PromptMutationOp,
  PromptSearchResult,
  PromptSelector,
  PromptSnapshot,
} from '../../shared/prompts';
import { parseVariables } from './template';
import { installSeeds } from './seed';

declare module '../../shared/messages' {
  interface RequestContracts {
    'prompts.query': { request: { selector: PromptSelector }; response: PromptSnapshot };
    'prompts.mutate': { request: { op: PromptMutationOp }; response: MutationResult };
    'prompts.install': { request: { domain: DomainId }; response: PromptInstallResult };
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

/** The unified library (D-B): every non-deleted prompt + category, no counts; or a
 *  ranked `prompt.search` scan over that same library (D-A). */
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
    case 'prompt.search': {
      // A direct scan of the small library (D-A): no postings index, so prompt
      // content never enters `searchPostings` or the sync envelope. `query()` already
      // excludes tombstones, so deleted prompts can't surface.
      const prompts = await store.prompts.query();
      const results = searchPrompts(prompts, selector.terms);
      return { kind: 'prompt.search', results };
    }
    case 'prompt.recents': {
      // The popover's empty-state list (D-3): only prompts with a recorded
      // `lastUsedAt`, most-recent first, capped at `limit`. `query()` excludes
      // tombstones; mapped to result rows so the popover renders them unchanged.
      const prompts = await store.prompts.query();
      const results = recentPrompts(prompts, selector.limit);
      return { kind: 'prompt.recents', results };
    }
  }
}

// ---------------------------------------------------------------------------
// Recents (design D-3) — used prompts, most-recent first, as result rows with a
// leading body/description excerpt as the snippet (no query, so no highlight).
// ---------------------------------------------------------------------------

/** The prompts that have actually been used, sorted by `lastUsedAt` descending and
 *  capped at `limit`, each shaped as a {@link PromptSearchResult} with a leading
 *  excerpt snippet. Prompts that have never been used are excluded; tombstones are
 *  already gone (the caller passes `query()` output). */
export function recentPrompts(prompts: Prompt[], limit: number): PromptSearchResult[] {
  return prompts
    .filter((p) => p.lastUsedAt !== undefined)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, Math.max(0, limit))
    .map((p) => ({
      id: p.id,
      title: p.title,
      // No query → no highlight: a leading excerpt of the body (then description)
      // as a single unmatched segment, reusing the search-row snippet shape.
      snippet: buildSnippet(p.body || (p.description ?? ''), []),
      targetModels: p.targetModels ?? [],
    }));
}

// ---------------------------------------------------------------------------
// Prompt search (slice 4, design D-A..D-C) — a linear scan over the loaded
// library. AND across terms over title/body/description/tags, ranked
// title-over-body with a recency tiebreak, each carrying a highlighted snippet.
// ---------------------------------------------------------------------------

/** Field weights for ranking: a term in the title outweighs one in the body or any
 *  other searchable field, matching conversation search's title boost (D-C). */
const TITLE_WEIGHT = 3;
const OTHER_WEIGHT = 1;
/** Tokens of context on each side of the first match in a snippet window. */
const SNIPPET_WINDOW = 6;

/** Normalize + split a term list into distinct, non-empty normalized terms (the same
 *  tokenizer conversation search uses, so a typed term and a stored field collapse to
 *  identical keys). An empty list (or all-blank terms) yields no terms. */
function normalizeTerms(terms: string[]): string[] {
  const out = new Set<string>();
  for (const raw of terms) {
    for (const t of normalize(raw).split(' ')) if (t) out.add(t);
  }
  return [...out];
}

/** Build a `{title, body, description, tags}` haystack of normalized field
 *  text for one prompt — the surface matching and ranking read from. */
function fieldsOf(p: Prompt): { title: string; rest: string } {
  const title = normalize(p.title);
  const rest = normalize([p.body, p.description ?? '', (p.tags ?? []).join(' ')].join(' '));
  return { title, rest };
}

/** Highlight the matching runs in `text` against the normalized terms, windowed
 *  around the first match. Falls back to a leading excerpt (no highlight) when no
 *  term hits this field, so a title/tag-only match still shows readable body text. */
function buildSnippet(text: string, terms: string[]): SnippetSegment[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const hits = tokens.map((tok) => {
    const norm = normalize(tok);
    return norm.length > 0 && terms.some((t) => norm.includes(t));
  });
  const first = hits.indexOf(true);
  if (first === -1) {
    return tokens.slice(0, SNIPPET_WINDOW * 2).map((text) => ({ text, match: false }));
  }
  const start = Math.max(0, first - SNIPPET_WINDOW);
  const end = Math.min(tokens.length, first + SNIPPET_WINDOW + 1);
  const segments: SnippetSegment[] = [];
  for (let i = start; i < end; i++) segments.push({ text: tokens[i], match: hits[i] });
  return segments;
}

/** Recency key for the tiebreak: last use if known, else last update. */
function recencyOf(p: Prompt): number {
  return p.lastUsedAt ?? p.updatedAt ?? 0;
}

/** Filter the library to prompts matching ALL terms (in any searchable field), rank
 *  title-over-body with a recency tiebreak, and attach a highlighted snippet. An
 *  empty term list returns `[]` (never the whole library). */
export function searchPrompts(prompts: Prompt[], rawTerms: string[]): PromptSearchResult[] {
  const terms = normalizeTerms(rawTerms);
  if (terms.length === 0) return [];

  const scored: { p: Prompt; score: number }[] = [];
  for (const p of prompts) {
    const { title, rest } = fieldsOf(p);
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      const inTitle = title.includes(term);
      const inRest = rest.includes(term);
      if (!inTitle && !inRest) {
        matchedAll = false;
        break;
      }
      score += inTitle ? TITLE_WEIGHT : OTHER_WEIGHT;
    }
    if (matchedAll) scored.push({ p, score });
  }

  scored.sort((a, b) => b.score - a.score || recencyOf(b.p) - recencyOf(a.p));

  return scored.map(({ p }) => {
    // Snippet from the first field that carries a match (body, then description),
    // falling back to a leading body excerpt (D-B).
    const body = buildSnippet(p.body, terms);
    const snippet =
      body.some((s) => s.match) || !p.description
        ? body
        : (() => {
            const desc = buildSnippet(p.description ?? '', terms);
            return desc.some((s) => s.match) ? desc : body;
          })();
    return {
      id: p.id,
      title: p.title,
      snippet,
      targetModels: p.targetModels ?? [],
    };
  });
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
      // Tier quota (tier-gate D2/D3): reject before any `put` when the live prompt
      // count is at the tier limit, so a refused create writes nothing and emits no
      // broadcast. PRO bypasses via the unlimited table entry.
      const existing = await store.prompts.query();
      assertWithinQuota('prompts', existing.length, (await getSettings()).tier ?? 'PRO');
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
      if (op.promptFolderId !== undefined) next.promptFolderId = op.promptFolderId;
      if (op.body !== undefined) {
        next.body = op.body;
        next.variables = parseVariables(op.body);
      }
      // Graduate a starter-kit seed into a user-owned prompt on ANY editor save
      // (starter-kit-provenance): once the user edits a seeded prompt it is "theirs",
      // so drop the catalog provenance. The provenance band counts only prompts that
      // still carry `domain`, so this is exactly what makes an edited card stop
      // reading as "from the kit". `prompt.update` is sent only by the editor; usage
      // bumps (`recordUse`) and category-delete reassignment use other paths and keep
      // their provenance.
      delete next.domain;
      delete next.seedId;
      await store.prompts.put(next);
      return { stores: ['prompts'] };
    }
    case 'prompt.clearDomain': {
      // Replace step of a starter-kit swap: tombstone every prompt still tagged with
      // this domain (the untouched seeds — edited ones already shed `domain` above).
      // One broadcast for the batch; reports no touched store when nothing matched.
      const prompts = await store.prompts.query();
      const stale = prompts.filter((p) => p.domain === op.domain);
      for (const p of stale) await store.prompts.delete(p.id);
      return { stores: stale.length > 0 ? ['prompts'] : [] };
    }
    case 'prompt.delete': {
      // Tombstone via the repo (prompts are syncable, so `delete` writes a tombstone).
      await requirePrompt(store, op.id);
      await store.prompts.delete(op.id);
      return { stores: ['prompts'] };
    }
    case 'prompt.recordUse': {
      // The minimal usage write (D-1): stamp `lastUsedAt` and bump `usageCount`,
      // touching nothing else. A missing/tombstoned id is a silent no-op (fired
      // fire-and-forget on insert — never throws back at the bar), reporting no
      // touched store so the broadcast is skipped. `Date.now()` is ordinary worker
      // app code.
      const prev = await store.prompts.get(op.id);
      if (!prev) return { stores: [] };
      await store.prompts.put({
        ...prev,
        lastUsedAt: Date.now(),
        usageCount: (prev.usageCount ?? 0) + 1,
      });
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
  registerHandler('prompts.install', async (req) => {
    // The single writer installs a domain's seeds (D-E). Broadcast only when at
    // least one prompt was inserted, so a no-op re-install never wakes every tab
    // (mirrors the mutate broadcast gate).
    const installed = await installSeeds(await workspaceStore(), req.domain);
    if (installed > 0) {
      await broadcast({ kind: 'state.changed', stores: ['prompts'] });
    }
    return { installed };
  });
}
