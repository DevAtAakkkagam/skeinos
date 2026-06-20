// The Prompts tab's view-model (the prompt-library analog of `useWorkspace`). It is
// held ONCE at the shell so the two prompt surfaces — the category/tag chip row in
// the shell's filter slot and the panel body — read and mutate a single source,
// exactly as the Folders tab shares one `WorkspaceView` between the platform chips
// and the folder tree (PREACT guardrail: pure view, no authoritative state here).
//
// It wraps the worker-backed `usePromptLibrary` (injectable for tests) and owns the
// ephemeral, never-persisted filter selection (AND of the active category and any
// selected tags, D-B), the prompt editor + category-dialog UI state, the
// client-derived counts, and the imperative search→prompt open seam.

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { Prompt, PromptFolder } from '../../shared/types';
import type { DomainId } from '../../shared/domains';
import { installPromptSeedsRemote } from '../../core/prompts';
import type { PromptEditorSubmit } from './PromptEditor';
import {
  makePromptId,
  usePromptLibrary,
  type PromptLibraryStatus,
  type PromptLibraryView,
} from './usePromptLibrary';

/** The category filter selection: a folder id, or `'all'` (no category narrowing). */
export type CategoryFilter = string | 'all';

/** The create/rename category dialog target (null = closed). */
export type CategoryDialog = { mode: 'create' } | { mode: 'rename'; folder: PromptFolder } | null;

/** Everything the chip row and the panel body need, derived once from a single
 *  library view so a badge can never disagree with the rows it labels. */
export interface PromptsController {
  // --- data (passthrough from the library view) -------------------------------
  prompts: Prompt[];
  folders: PromptFolder[];
  status: PromptLibraryStatus;
  retry: () => void;

  // --- filter state (ephemeral; never a worker round-trip) ---------------------
  category: CategoryFilter;
  setCategory: (c: CategoryFilter) => void;
  selectedTags: string[];
  toggleTag: (tag: string) => void;
  clearFilter: () => void;

  // --- derived (client-side counts + filtered list) ----------------------------
  categoryCount: Map<string, number>;
  tagCount: Map<string, number>;
  tagChips: string[];
  filtered: Prompt[];

  // --- prompt editor -----------------------------------------------------------
  editorOpen: boolean;
  editing: Prompt | undefined;
  openCreate: () => void;
  openEdit: (p: Prompt) => void;
  closeEditor: () => void;
  submitPrompt: (fields: PromptEditorSubmit) => void;
  deletePrompt: (p: Prompt) => void;
  /** Inline category create from within the editor; returns the new id (or null). */
  createCategory: (name: string) => Promise<string | null>;

  // --- category dialogs (create / rename / delete) -----------------------------
  categoryDialog: CategoryDialog;
  categoryName: string;
  setCategoryName: (s: string) => void;
  openCreateCategory: () => void;
  openRenameCategory: (f: PromptFolder) => void;
  closeCategoryDialog: () => void;
  submitCategoryDialog: () => void;
  deleteCategoryTarget: PromptFolder | null;
  requestDeleteCategory: (f: PromptFolder) => void;
  cancelDeleteCategory: () => void;
  confirmDeleteCategory: () => void;

  // --- imperative open (search → prompt, slice 4) ------------------------------
  /** Open the editor for this prompt id once the library has it. */
  openPrompt: (id: string) => void;

  // --- starter-prompt install ---
  /** Install a domain's bundled starter prompts via the worker, then reconcile.
   *  Resolves to the number inserted (0 when already installed). Onboarding's
   *  domain picker drives seeding via `installPromptSeedsRemote` directly; this
   *  controller seam is retained as the library-side install path (covered by
   *  `prompts-panel-no-starter.test.tsx`). */
  installSeeds: (domain: DomainId) => Promise<number>;
}

/** Build the prompts view-model. Pass `view` in tests to drive it over a stub
 *  library; production omits it and uses the live worker-backed hook. */
export function usePromptsController(view?: PromptLibraryView): PromptsController {
  const live = usePromptLibrary();
  const lib = view ?? live;
  const { prompts, folders, status } = lib;

  // --- ephemeral filter state ---------------------------------------------------
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // --- editor + category-dialog state -------------------------------------------
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Prompt | undefined>(undefined);
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialog>(null);
  const [categoryName, setCategoryName] = useState('');
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<PromptFolder | null>(null);

  // The pending search→prompt target: held until the library has that id, then the
  // editor opens and the pending id clears (the library may still be loading).
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingOpenId) return;
    const target = prompts.find((p) => p.id === pendingOpenId);
    if (target) {
      setEditing(target);
      setEditorOpen(true);
      setPendingOpenId(null);
    }
  }, [pendingOpenId, prompts]);

  // --- derived counts + filtered list (D-B) -------------------------------------
  const categoryCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of prompts) {
      if (p.promptFolderId) counts.set(p.promptFolderId, (counts.get(p.promptFolderId) ?? 0) + 1);
    }
    return counts;
  }, [prompts]);

  // Prompts in the active category (before the tag narrowing) — the basis for both
  // the tag chip set and its counts, so tags stay scoped to what's visible.
  const inCategory = useMemo(
    () => (category === 'all' ? prompts : prompts.filter((p) => p.promptFolderId === category)),
    [prompts, category],
  );

  const tagCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of inCategory) {
      for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [inCategory]);

  const tagChips = useMemo(
    () => [...tagCount.keys()].sort((a, b) => a.localeCompare(b)),
    [tagCount],
  );

  const filtered = useMemo(
    () => inCategory.filter((p) => selectedTags.every((t) => p.tags.includes(t))),
    [inCategory, selectedTags],
  );

  // --- handlers -----------------------------------------------------------------
  const toggleTag = useCallback(
    (tag: string): void =>
      setSelectedTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag])),
    [],
  );

  const clearFilter = useCallback((): void => {
    setCategory('all');
    setSelectedTags([]);
  }, []);

  const openCreate = useCallback((): void => {
    setEditing(undefined);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((p: Prompt): void => {
    setEditing(p);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback((): void => {
    setEditorOpen(false);
    setEditing(undefined);
  }, []);

  const submitPrompt = useCallback(
    (fields: PromptEditorSubmit): void => {
      if (editing) {
        void lib.mutate({ op: 'prompt.update', id: editing.id, ...fields });
      } else {
        void lib.mutate({ op: 'prompt.create', id: makePromptId(), ...fields });
      }
      setEditorOpen(false);
      setEditing(undefined);
    },
    [editing, lib],
  );

  const deletePrompt = useCallback(
    (p: Prompt): void => {
      void lib.mutate({ op: 'prompt.delete', id: p.id });
    },
    [lib],
  );

  // Inline category create from within the editor: generate the id, send the create,
  // and hand the id back so the editor selects it (the reconcile surfaces the row).
  const createCategory = useCallback(
    async (name: string): Promise<string | null> => {
      const id = makePromptId('cat');
      const res = await lib.mutate({
        op: 'promptFolder.create',
        id,
        name,
        order: folders.length,
        parentId: null,
      });
      return res.ok || res.applied ? id : null;
    },
    [folders.length, lib],
  );

  const openCreateCategory = useCallback((): void => {
    setCategoryDialog({ mode: 'create' });
    setCategoryName('');
  }, []);

  const openRenameCategory = useCallback((f: PromptFolder): void => {
    setCategoryDialog({ mode: 'rename', folder: f });
    setCategoryName(f.name);
  }, []);

  const closeCategoryDialog = useCallback((): void => {
    setCategoryDialog(null);
    setCategoryName('');
  }, []);

  const submitCategoryDialog = useCallback((): void => {
    const name = categoryName.trim();
    if (!name || !categoryDialog) return;
    if (categoryDialog.mode === 'create') {
      void lib.mutate({
        op: 'promptFolder.create',
        id: makePromptId('cat'),
        name,
        order: folders.length,
        parentId: null,
      });
    } else {
      void lib.mutate({ op: 'promptFolder.rename', id: categoryDialog.folder.id, name });
    }
    setCategoryDialog(null);
    setCategoryName('');
  }, [categoryDialog, categoryName, folders.length, lib]);

  const requestDeleteCategory = useCallback((f: PromptFolder): void => {
    setDeleteCategoryTarget(f);
  }, []);

  const cancelDeleteCategory = useCallback((): void => {
    setDeleteCategoryTarget(null);
  }, []);

  const confirmDeleteCategory = useCallback((): void => {
    if (!deleteCategoryTarget) return;
    void lib.mutate({ op: 'promptFolder.delete', id: deleteCategoryTarget.id });
    // Drop the now-removed category from the active filter so the view doesn't show
    // an empty "no match" against a category that no longer exists.
    setCategory((c) => (c === deleteCategoryTarget.id ? 'all' : c));
    setDeleteCategoryTarget(null);
  }, [deleteCategoryTarget, lib]);

  const openPrompt = useCallback((id: string): void => {
    setPendingOpenId(id);
  }, []);

  // The library-side starter-prompt install seam. Onboarding's domain picker
  // (onboarding-flow) seeds via the same worker request from its own surface; this
  // path is retained for the library. Reconcile via the library's re-read
  // (observe-don't-replay) so the newly inserted prompts surface without replaying.
  const installSeeds = useCallback(
    async (domain: DomainId): Promise<number> => {
      const res = await installPromptSeedsRemote(domain);
      lib.refresh();
      return res.ok ? res.data.installed : 0;
    },
    [lib],
  );

  return {
    prompts,
    folders,
    status,
    retry: lib.retry,
    category,
    setCategory,
    selectedTags,
    toggleTag,
    clearFilter,
    categoryCount,
    tagCount,
    tagChips,
    filtered,
    editorOpen,
    editing,
    openCreate,
    openEdit,
    closeEditor,
    submitPrompt,
    deletePrompt,
    createCategory,
    categoryDialog,
    categoryName,
    setCategoryName,
    openCreateCategory,
    openRenameCategory,
    closeCategoryDialog,
    submitCategoryDialog,
    deleteCategoryTarget,
    requestDeleteCategory,
    cancelDeleteCategory,
    confirmDeleteCategory,
    openPrompt,
    installSeeds,
  };
}
