// The Move-to-folder picker (conversation-filing): the single, keyboard-first
// filing primitive reused by the current-conversation card and every list row. It
// presents the active platform's non-archived folders as a flat, type-to-filter
// list with parent breadcrumbs (flat-filter beats tree-navigation for keyboard
// speed and scales past the 5-level depth limit), plus a pinned "Remove from
// folder" choice when the conversation is already filed. A choice resolves to a
// single `conversation.assign` through the injected `onSubmit` (observe-don't-
// replay); on success the picker closes. It styles only from `--sk-*` tokens, uses
// no hard-coded user-facing strings, and is fully keyboard-operable + ARIA-labelled.

import { useMemo, useRef, useState } from 'preact/hooks';
import type { Folder, FolderTreeNode } from '../../shared/types';
import type { FolderTreeSnapshot, MutationOp } from '../../shared/workspace';
import { FOLDER_ICON_SENTINEL, FolderRowIcon, PlusIcon } from '../components/Icon';
import { UpgradeNudge } from '../components/UpgradeNudge';
import { quotaDetailOf, type QuotaErrorDetail } from '../../core/tier';
import { Dialog } from '../primitives';
import { DEFAULT_FOLDER_COLOR, makeFolderId } from './folderDefaults';
import type { MutateResult } from './useWorkspace';

const STR = {
  title: 'Move to folder',
  filterLabel: 'Filter folders',
  filterPlaceholder: 'Search folders…',
  unfile: 'Remove from folder',
  noMatches: 'No folders match',
  create: 'Create',
  error: 'Couldn’t file this conversation. Try again.',
  in: 'in',
} as const;

/** The conversation the picker acts on — only the fields filing needs. */
export interface PickerConversation {
  id: string;
  title: string;
  folderId: string | null;
}

export interface MoveToFolderPickerProps {
  conversation: PickerConversation;
  tree: FolderTreeSnapshot;
  /** Apply the assignment and reconcile; resolves whether it took effect. */
  onSubmit: (op: MutationOp) => Promise<MutateResult>;
  onClose: () => void;
}

/** A fileable folder plus the names of its ancestors (for breadcrumb disambiguation). */
interface Candidate {
  folder: Folder;
  path: string[];
}

/** Flatten the active (non-archived) tree depth-first, carrying ancestor names. */
function flattenCandidates(nodes: FolderTreeNode[], ancestors: string[] = []): Candidate[] {
  const out: Candidate[] = [];
  for (const n of nodes) {
    out.push({ folder: n.folder, path: ancestors });
    out.push(...flattenCandidates(n.children, [...ancestors, n.folder.name]));
  }
  return out;
}

type Option =
  | { kind: 'unfile' }
  | { kind: 'folder'; candidate: Candidate }
  | { kind: 'create'; name: string };

export function MoveToFolderPicker({ conversation, tree, onSubmit, onClose }: MoveToFolderPickerProps) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The tier quota that refused an inline folder create, if any (block-with-nudge):
  // when set, the picker stays open with the typed name intact and shows the
  // informational upgrade nudge instead of the generic "try again" error.
  const [quota, setQuota] = useState<QuotaErrorDetail | null>(null);
  const listId = useRef(`sk-move-list-${Math.random().toString(36).slice(2)}`).current;

  const candidates = useMemo(() => flattenCandidates(tree.active), [tree]);

  // The "Remove from folder" choice is pinned to the top whenever the conversation
  // is currently filed; the folder list below narrows as the user types. When the
  // query names no existing folder, a "Create …" row at the bottom creates a folder
  // with defaults and files this conversation into it in one keystroke.
  const options = useMemo<Option[]>(() => {
    const trimmed = query.trim();
    const q = trimmed.toLowerCase();
    const matches = q
      ? candidates.filter((c) => c.folder.name.toLowerCase().includes(q))
      : candidates;
    // Suppress the create row on an exact (case-insensitive) name match: surface the
    // existing folder so users file into it rather than fragmenting into duplicates.
    const exact = q.length > 0 && candidates.some((c) => c.folder.name.trim().toLowerCase() === q);
    const filed = conversation.folderId != null;
    return [
      ...(filed ? [{ kind: 'unfile' } as const] : []),
      ...matches.map((candidate) => ({ kind: 'folder', candidate }) as const),
      ...(trimmed.length > 0 && !exact ? [{ kind: 'create', name: trimmed } as const] : []),
    ];
  }, [candidates, query, conversation.folderId]);

  // Keep the highlight in range as the option set shrinks/grows.
  const activeIndex = options.length === 0 ? -1 : Math.min(highlight, options.length - 1);
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const took = (r: MutateResult) => r.ok || r.applied;

  // A new folder's id is fixed per name, so retrying a create after a possibly-
  // committed-but-unacknowledged attempt overwrites the same row (and re-files into
  // it) instead of duplicating the folder.
  const createIds = useRef(new Map<string, string>());
  const idForName = (name: string): string => {
    const m = createIds.current;
    let id = m.get(name);
    if (!id) {
      id = makeFolderId();
      m.set(name, id);
    }
    return id;
  };

  const assign = async (folderId: string | null): Promise<MutateResult> =>
    onSubmit({ op: 'conversation.assign', conversationId: conversation.id, folderId });

  const confirm = async (opt: Option | undefined) => {
    if (!opt || busy) return;
    setFailed(false);
    setQuota(null);
    setBusy(true);
    let ok: boolean;
    if (opt.kind === 'create') {
      // Two UI mutations: create the folder with defaults, then file this
      // conversation into it. Skip the assign if the create never took effect.
      const id = idForName(opt.name);
      const created = await onSubmit({
        op: 'folder.create',
        id,
        name: opt.name,
        parentId: null,
        color: DEFAULT_FOLDER_COLOR,
        icon: FOLDER_ICON_SENTINEL,
        // Folders are platform-agnostic in the unified model (D28 / D-FSR4).
        platformScope: 'unified',
      });
      // A tier quota refusal is not a transient failure ([PRIV] block-with-nudge):
      // keep the picker open with the typed name intact and surface the upgrade
      // nudge, not the generic error. The existing-folder list stays usable as the
      // recovery path (filing into an existing folder isn't quota-governed).
      const blocked = quotaDetailOf(created.error);
      if (blocked) {
        setBusy(false);
        setQuota(blocked);
        return;
      }
      ok = took(created) && took(await assign(id));
    } else {
      ok = took(await assign(opt.kind === 'unfile' ? null : opt.candidate.folder.id));
    }
    setBusy(false);
    // Close when it took effect; otherwise keep the picker open and surface the
    // failure rather than silently dropping the action.
    if (ok) onClose();
    else setFailed(true);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (options.length ? (Math.min(h, options.length - 1) + 1) % options.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (options.length ? (Math.min(h, options.length - 1) + options.length - 1) % options.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void confirm(options[activeIndex]);
    }
    // Esc is handled by the Dialog machine (closes + restores focus).
  };

  return (
    <Dialog open onClose={onClose} ariaLabel={STR.title} contentTestId="sk-move-picker">
      <div class="sk-picker">
        <p class="sk-picker__title">{STR.title}</p>
        <input
          class="sk-input sk-picker__input"
          data-testid="sk-move-filter"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={STR.filterLabel}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          placeholder={STR.filterPlaceholder}
          value={query}
          autoFocus
          onInput={(e) => {
            setQuery((e.currentTarget as HTMLInputElement).value);
            setHighlight(0);
            // Editing the name dismisses a prior quota nudge — the new name may name
            // an existing folder (file into it) or simply lets the user retry.
            setQuota(null);
          }}
          onKeyDown={onKeyDown}
        />
        <ul class="sk-picker__list" id={listId} role="listbox" aria-label={STR.title}>
          {options.length === 0 ? (
            <li class="sk-picker__empty" data-testid="sk-move-empty" role="option" aria-disabled="true">
              {STR.noMatches}
            </li>
          ) : (
            options.map((opt, i) => {
              const selected = i === activeIndex;
              if (opt.kind === 'unfile') {
                return (
                  <li
                    key="unfile"
                    id={optionId(i)}
                    class={`sk-picker__option sk-picker__option--unfile${selected ? ' sk-picker__option--active' : ''}`}
                    data-testid="sk-move-unfile"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => void confirm(opt)}
                  >
                    {STR.unfile}
                  </li>
                );
              }
              if (opt.kind === 'create') {
                return (
                  <li
                    key="create"
                    id={optionId(i)}
                    class={`sk-picker__option sk-picker__option--create${selected ? ' sk-picker__option--active' : ''}`}
                    data-testid="sk-move-create"
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => void confirm(opt)}
                  >
                    <PlusIcon size={16} />
                    <span class="sk-picker__label">{`${STR.create} “${opt.name}”`}</span>
                  </li>
                );
              }
              const { folder, path } = opt.candidate;
              return (
                <li
                  key={folder.id}
                  id={optionId(i)}
                  class={`sk-picker__option${selected ? ' sk-picker__option--active' : ''}`}
                  data-testid="sk-move-option"
                  data-folder-id={folder.id}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => void confirm(opt)}
                >
                  <FolderRowIcon folder={folder} />
                  <span class="sk-picker__label" style={folder.color ? { color: folder.color } : undefined}>
                    {folder.name}
                  </span>
                  {path.length > 0 ? (
                    <span class="sk-picker__path">{`${STR.in} ${path.join(' / ')}`}</span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
        {failed && (
          <p class="sk-dialog__error" data-testid="sk-move-error" role="alert">{STR.error}</p>
        )}
        {quota && (
          <UpgradeNudge resource="folders" limit={quota.limit} testId="sk-move-quota-nudge" />
        )}
      </div>
    </Dialog>
  );
}
