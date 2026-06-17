// The workspace sidebar (LLD T2.2): the folder tree with pinned + archive
// sections and live counts, drag-drop (conversation→folder assignment, folder
// re-parenting), a create/edit folder dialog, and a right-click context menu.
// It is a pure view: every action dispatches a worker mutation via `useWorkspace`
// and the tree re-renders from the worker's broadcast — it holds no authoritative
// folder state of its own (PREACT guardrail).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConversationIndex, Folder, FolderTreeNode, PlatformId } from '../../shared/types';
import { conversationId, type MutationOp } from '../../shared/workspace';
import { Dialog, useMenu, mergeProps, getNodeRoot } from '../primitives';
import { CheckIcon, ChevronIcon, CloseIcon, FolderIcon, PlusIcon } from '../components/Icon';
import { ConversationList } from './ConversationList';
import { FOLDER_COLORS } from './palette';
import { DRAG_MIME, type DragPayload } from './drag';
import { useWorkspace, type MutateResult, type WorkspaceView } from './useWorkspace';

// Re-exported for the existing import site (`tests`/other UI) that reaches for the
// drag contract via this module; the definition now lives in `./drag`.
export { DRAG_MIME } from './drag';
export type { DragPayload } from './drag';

/** Delay before a loading indicator appears, so a warm read never flashes a
 *  spinner (matches the transport's retry cadence). */
const SPINNER_DELAY_MS = 150;

// User-facing strings in one place (i18n-ready; no inline literals in markup).
const STR = {
  folders: 'Folders',
  pinned: 'Pinned',
  archive: 'Archive',
  newFolder: 'New folder',
  noFolders: 'No folders yet',
  emptyBody: 'Create a folder to start organising conversations across every platform.',
  loading: 'Loading your workspace…',
  loadError: 'Couldn’t load your folders',
  loadErrorBody: 'The workspace didn’t respond. Check your connection and try again.',
  retry: 'Retry',
  createError: 'Couldn’t save the folder. Your changes are kept — try again.',
  name: 'Name',
  namePlaceholder: 'Folder name',
  icon: 'Icon',
  color: 'Colour',
  parentFolder: 'Parent folder',
  topLevel: 'No parent (top level)',
  clearColor: 'No colour',
  clearIcon: 'No icon',
  create: 'Create folder',
  save: 'Save changes',
  close: 'Close',
  cancel: 'Cancel',
  rename: 'Rename',
  pin: 'Pin',
  unpin: 'Unpin',
  archiveAction: 'Archive',
  unarchive: 'Unarchive',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveTop: 'Move to top level',
  delete: 'Delete',
  createTitle: 'New folder',
  editTitle: 'Edit folder',
  unfiled: 'Unfiled',
  expand: 'Expand',
  collapse: 'Collapse',
} as const;

/** Sentinel expansion key for the (non-folder) "Unfiled" pseudo-node. */
const UNFILED = 'unfiled';

interface DialogState {
  mode: 'create' | 'edit';
  parentId: string | null;
  folder?: Folder;
}

// Context-menu action values (the menu item `value`s the Zag menu reports back).
type MenuAction = 'rename' | 'pin' | 'archive' | 'move-up' | 'move-down' | 'move-top' | 'delete';

/** Ordered sibling folders of `id` within the active tree (for reorder). */
function siblingsOf(nodes: FolderTreeNode[], id: string): Folder[] {
  for (const n of nodes) {
    if (n.children.some((c) => c.folder.id === id)) return n.children.map((c) => c.folder);
  }
  // Root level
  if (nodes.some((n) => n.folder.id === id)) return nodes.map((n) => n.folder);
  for (const n of nodes) {
    const found = siblingsOf(n.children, id);
    if (found.length) return found;
  }
  return [];
}

/** The chain of folder ids from a root down to `id` (inclusive), or null if `id`
 *  is not in the active tree — used to auto-expand the path to the active chat. */
function pathToFolder(nodes: FolderTreeNode[], id: string, acc: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...acc, n.folder.id];
    if (n.folder.id === id) return next;
    const found = pathToFolder(n.children, id, next);
    if (found) return found;
  }
  return null;
}

export interface SidebarProps {
  platform: PlatformId;
  /** Injectable for tests; defaults to the live worker-backed view. */
  view?: WorkspaceView;
  /** Open a conversation in the active tab; forwarded to the inline lists.
   *  Defaults (in ConversationList) to the live tab-navigation helper. */
  onOpenConversation?: (conv: ConversationIndex) => void;
}

export function Sidebar({ platform, view, onOpenConversation }: SidebarProps) {
  const live = useWorkspace(platform);
  const ws = view ?? live;
  const { tree, counts, conversations, active, status, mutate, retry } = ws;

  // Conversations that belong to no folder — surfaced under the "Unfiled" node so
  // they stay reachable in a folders-only tree (the design has no flat list).
  const unfiledConvs = conversations.filter((c) => c.folderId == null);
  const activeConvId = active ? conversationId(active.platform, active.nativeId) : null;

  // The loading indicator is delayed so a warm read (which resolves first) renders
  // the tree/empty state directly without flashing a spinner.
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    if (status !== 'loading') {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [status]);

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Which folder the open context menu acts on (the row last right-clicked).
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);

  // Which nodes are expanded to reveal their conversations (folder ids + the
  // UNFILED sentinel). Local view state only — never authoritative (PREACT rule).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Auto-expand the path to the active-tab conversation so it is revealed and
  // highlighted — but only once per active conversation, so a user who collapses
  // the branch is not fought on the next reconcile.
  const autoExpandedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!activeConvId) {
      autoExpandedFor.current = null;
      return;
    }
    if (autoExpandedFor.current === activeConvId) return;
    const record = conversations.find((c) => c.id === activeConvId);
    if (!record) return; // not ingested yet — try again once it lands
    const chain = record.folderId == null ? [UNFILED] : pathToFolder(tree.active, record.folderId);
    if (!chain || chain.length === 0) return;
    autoExpandedFor.current = activeConvId;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of chain) {
        if (next.has(id)) continue;
        next.add(id);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [activeConvId, conversations, tree]);

  const sidebarRef = useRef<HTMLDivElement>(null);

  const reorder = (id: string, dir: -1 | 1) => {
    const sibs = siblingsOf(tree.active, id);
    const ids = sibs.map((f) => f.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void mutate({ op: 'folder.reorder', orderedIds: ids });
  };

  // Mouse selection routes through each item's own `onClick` (a bare click never
  // highlights an item, so Zag's `onSelect`/highlightedValue path stays null);
  // keyboard ENTER routes through Zag's `onSelect`. `actedRef` dedupes the case where
  // a highlighted mouse click fires both within one tick.
  const actedRef = useRef<MenuAction | null>(null);

  // The context menu targets active-tree folders and the flat archive list alike;
  // archived rows live outside `tree.active`, so fall back to the archive set so
  // they remain actionable (notably: Unarchive).
  const resolveFolder = (id: string): Folder | undefined =>
    findFolder(tree.active, id) ?? tree.archived.find((f) => f.id === id);

  const performMenuAction = (value: MenuAction) => {
    if (actedRef.current === value) return;
    actedRef.current = value;
    setTimeout(() => {
      if (actedRef.current === value) actedRef.current = null;
    }, 0);

    const id = menuTargetId;
    if (!id) return;
    const folder = resolveFolder(id);
    if (!folder) return;
    switch (value) {
      case 'rename':
        setDialog({ mode: 'edit', parentId: folder.parentId, folder });
        break;
      case 'pin':
        void mutate({ op: 'folder.pin', id: folder.id, pinned: !folder.pinned });
        break;
      case 'archive':
        void mutate({ op: 'folder.archive', id: folder.id, archived: !folder.archived });
        break;
      case 'move-up':
        reorder(folder.id, -1);
        break;
      case 'move-down':
        reorder(folder.id, 1);
        break;
      case 'move-top':
        void mutate({ op: 'folder.move', id: folder.id, parentId: null });
        break;
      case 'delete':
        void mutate({ op: 'folder.delete', id: folder.id });
        break;
    }
  };

  // One menu machine shared by every folder row; each row is a context trigger and
  // we track which folder it targeted in `menuTargetId`. Zag owns positioning,
  // keyboard navigation, dismissal, and focus restoration.
  const menu = useMenu({
    getRootNode: () => getNodeRoot(sidebarRef.current),
    onSelect: (value) => performMenuAction(value as MenuAction),
  });

  // A menu item: Zag's accessible item props + our explicit click action.
  const itemProps = (value: MenuAction) =>
    mergeProps(menu.getItemProps({ value }), { onClick: () => performMenuAction(value) });

  const onDropOnFolder = (folderId: string, e: DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer?.getData(DRAG_MIME);
    if (!raw) return;
    const payload = JSON.parse(raw) as DragPayload;
    if (payload.type === 'conversation') {
      void mutate({ op: 'conversation.assign', conversationId: payload.id, folderId });
    } else if (payload.type === 'folder' && payload.id !== folderId) {
      void mutate({ op: 'folder.move', id: payload.id, parentId: folderId });
    }
  };

  const renderNode = (node: FolderTreeNode) => {
    const f = node.folder;
    const isOpen = expanded.has(f.id);
    const folderConvs = conversations.filter((c) => c.folderId === f.id);
    return (
      <div key={f.id} class="sk-sidebar__section" style={{ marginLeft: `${(node.depth - 1) * 12}px` }}>
        <div
          class={`sk-row${dropTarget === f.id ? ' sk-row--drop' : ''}`}
          data-testid="sk-folder"
          data-folder-id={f.id}
          draggable
          onClick={() => toggleExpanded(f.id)}
          onDragStart={(e) =>
            (e as DragEvent).dataTransfer?.setData(
              DRAG_MIME,
              JSON.stringify({ type: 'folder', id: f.id } satisfies DragPayload),
            )
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget(f.id);
          }}
          onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
          onDrop={(e) => onDropOnFolder(f.id, e as DragEvent)}
          {...mergeProps(menu.getContextTriggerProps({ value: f.id }), {
            onContextMenu: () => setMenuTargetId(f.id),
          })}
        >
          <button
            class="sk-caret"
            type="button"
            data-testid="sk-folder-caret"
            aria-expanded={isOpen}
            aria-label={isOpen ? STR.collapse : STR.expand}
            onClick={(e) => {
              (e as MouseEvent).stopPropagation();
              toggleExpanded(f.id);
            }}
          >
            <ChevronIcon size={14} />
          </button>
          {f.icon ? <span class="sk-row__icon">{f.icon}</span> : null}
          <span class="sk-row__label" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
          <span class="sk-row__count" data-testid="sk-folder-count">{counts[f.id] ?? 0}</span>
        </div>
        {isOpen && (
          <div class="sk-node__children">
            {node.children.map(renderNode)}
            <ConversationList
              conversations={folderConvs}
              active={active}
              tree={tree}
              mutate={mutate}
              context={{ kind: 'folder', name: f.name }}
              onOpen={onOpenConversation}
            />
          </div>
        )}
      </div>
    );
  };

  // A non-tree folder row (pinned / archive): icon · color · count, like the
  // active tree but without disclosure/drag affordances.
  const renderLeaf = (f: Folder, attr: 'data-pinned-id' | 'data-archived-id') => (
    <div
      key={f.id}
      class="sk-row"
      {...{ [attr]: f.id }}
      {...mergeProps(menu.getContextTriggerProps({ value: f.id }), {
        onContextMenu: () => setMenuTargetId(f.id),
      })}
    >
      <span class="sk-caret-spacer" aria-hidden="true" />
      {f.icon ? <span class="sk-row__icon">{f.icon}</span> : null}
      <span class="sk-row__label" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
      <span class="sk-row__count" data-testid="sk-folder-count">{counts[f.id] ?? 0}</span>
    </div>
  );

  const menuTarget = menuTargetId ? resolveFolder(menuTargetId) : undefined;

  return (
    <div ref={sidebarRef} class="sk-sidebar" data-testid="sk-sidebar">
      {tree.pinned.length > 0 && (
        <div class="sk-sidebar__section" data-testid="sk-pinned">
          <p class="sk-sidebar__heading">{STR.pinned}</p>
          {tree.pinned.map((f) => renderLeaf(f, 'data-pinned-id'))}
        </div>
      )}

      <div class="sk-sidebar__section">
        <div class="sk-row sk-sidebar__section-head">
          <span class="sk-sidebar__heading">{STR.folders}</span>
          <button
            class="sk-icon-btn"
            type="button"
            data-testid="sk-new-folder"
            aria-label={STR.newFolder}
            title={STR.newFolder}
            onClick={(e) => {
              (e as MouseEvent).stopPropagation();
              setDialog({ mode: 'create', parentId: null });
            }}
          >
            <PlusIcon size={16} />
          </button>
        </div>
        {tree.active.length > 0
          ? // Whenever we have folders, show them — never flicker to a load state.
            tree.active.map(renderNode)
          : status === 'error'
            ? // Load failed after the retry budget: offer a retry, not a false empty.
              (
                <div class="sk-empty" data-testid="sk-folders-error" role="alert">
                  <span class="sk-empty__icon" aria-hidden="true">
                    <FolderIcon size={40} />
                  </span>
                  <p class="sk-empty__title">{STR.loadError}</p>
                  <p class="sk-empty__body">{STR.loadErrorBody}</p>
                  <button
                    class="sk-btn sk-btn--icon"
                    type="button"
                    data-testid="sk-folders-retry"
                    onClick={(e) => {
                      (e as MouseEvent).stopPropagation();
                      retry();
                    }}
                  >
                    {STR.retry}
                  </button>
                </div>
              )
            : status === 'ready'
              ? // A read succeeded and returned nothing: the honest empty state.
                (
                  <div class="sk-empty" data-testid="sk-folders-empty">
                    <span class="sk-empty__icon" aria-hidden="true">
                      <FolderIcon size={40} />
                    </span>
                    <p class="sk-empty__title">{STR.noFolders}</p>
                    <p class="sk-empty__body">{STR.emptyBody}</p>
                    <button
                      class="sk-btn sk-btn--icon"
                      type="button"
                      data-testid="sk-empty-new-folder"
                      onClick={(e) => {
                        (e as MouseEvent).stopPropagation();
                        setDialog({ mode: 'create', parentId: null });
                      }}
                    >
                      <PlusIcon size={16} />
                      {STR.newFolder}
                    </button>
                  </div>
                )
              : // Still loading: a delayed spinner (nothing on the warm fast path).
                showSpinner && (
                  <div class="sk-empty" data-testid="sk-folders-loading" role="status" aria-live="polite">
                    <span class="sk-spinner" aria-hidden="true" />
                    <p class="sk-empty__body">{STR.loading}</p>
                  </div>
                )}
      </div>

      {unfiledConvs.length > 0 && (
        <div class="sk-sidebar__section" data-testid="sk-unfiled">
          <div class="sk-row" onClick={() => toggleExpanded(UNFILED)}>
            <button
              class="sk-caret"
              type="button"
              data-testid="sk-unfiled-caret"
              aria-expanded={expanded.has(UNFILED)}
              aria-label={expanded.has(UNFILED) ? STR.collapse : STR.expand}
              onClick={(e) => {
                (e as MouseEvent).stopPropagation();
                toggleExpanded(UNFILED);
              }}
            >
              <ChevronIcon size={14} />
            </button>
            <span class="sk-row__label">{STR.unfiled}</span>
            <span class="sk-row__count" data-testid="sk-unfiled-count">{unfiledConvs.length}</span>
          </div>
          {expanded.has(UNFILED) && (
            <div class="sk-node__children">
              <ConversationList
                conversations={unfiledConvs}
                active={active}
                tree={tree}
                mutate={mutate}
                context={{ kind: 'unfiled' }}
                onOpen={onOpenConversation}
              />
            </div>
          )}
        </div>
      )}

      {tree.archived.length > 0 && (
        <details class="sk-sidebar__section" data-testid="sk-archive">
          <summary class="sk-sidebar__heading">{STR.archive}</summary>
          {tree.archived.map((f) => renderLeaf(f, 'data-archived-id'))}
        </details>
      )}

      {menu.open && menuTarget && (
        <div class="sk-menu__positioner" {...menu.getPositionerProps()}>
          <div class="sk-menu" data-testid="sk-context-menu" {...menu.getContentProps()}>
            <button class="sk-menu__item" data-testid="sk-menu-rename" {...itemProps('rename')}>{STR.rename}</button>
            <button class="sk-menu__item" data-testid="sk-menu-pin" {...itemProps('pin')}>{menuTarget.pinned ? STR.unpin : STR.pin}</button>
            <button class="sk-menu__item" data-testid="sk-menu-archive" {...itemProps('archive')}>{menuTarget.archived ? STR.unarchive : STR.archiveAction}</button>
            <button class="sk-menu__item" {...itemProps('move-up')}>{STR.moveUp}</button>
            <button class="sk-menu__item" {...itemProps('move-down')}>{STR.moveDown}</button>
            <button class="sk-menu__item" data-testid="sk-menu-move-top" {...itemProps('move-top')}>{STR.moveTop}</button>
            <button class="sk-menu__item" data-testid="sk-menu-delete" {...itemProps('delete')}>{STR.delete}</button>
          </div>
        </div>
      )}

      {dialog && (
        <FolderDialog
          state={dialog}
          platform={platform}
          tree={tree.active}
          onClose={() => setDialog(null)}
          onSubmit={(op) => mutate(op)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function findFolder(nodes: FolderTreeNode[], id: string): Folder | undefined {
  for (const n of nodes) {
    if (n.folder.id === id) return n.folder;
    const found = findFolder(n.children, id);
    if (found) return found;
  }
  return undefined;
}
// Curated emoji icon set (the icon grid in design 03·05); the leading "clear"
// option resets to no icon. Emoji keep the picker zero-asset and theme-agnostic.
const FOLDER_ICONS = ['📁', '✏️', '📊', '⏱️', '💰', '📚', '🌿', '📷', '🚀', '📞', '🎯', '📌'] as const;

/** A selectable parent option: the folder and its depth-derived indent. */
interface ParentOption {
  id: string;
  name: string;
  depth: number;
}

/** Flatten the active tree into parent options, skipping `excludeId` and its whole
 *  subtree (you cannot re-parent a folder under itself or a descendant). */
function parentOptions(nodes: FolderTreeNode[], excludeId: string | undefined, depth = 0): ParentOption[] {
  const out: ParentOption[] = [];
  for (const n of nodes) {
    if (n.folder.id === excludeId) continue; // prune self + descendants
    out.push({ id: n.folder.id, name: n.folder.name, depth });
    out.push(...parentOptions(n.children, excludeId, depth + 1));
  }
  return out;
}

interface FolderDialogProps {
  state: DialogState;
  platform: PlatformId;
  /** Active (non-archived) tree, for the parent-folder picker. */
  tree: FolderTreeNode[];
  onClose: () => void;
  /** Apply a mutation and reconcile; resolves with whether it took effect. The
   *  dialog closes itself on success and stays open (keeping input) on failure. */
  onSubmit: (op: MutationOp) => Promise<MutateResult>;
}

function FolderDialog({ state, platform, tree, onClose, onSubmit }: FolderDialogProps) {
  const editing = state.mode === 'edit';
  const [name, setName] = useState(state.folder?.name ?? '');
  const [icon, setIcon] = useState(state.folder?.icon ?? '');
  const [color, setColor] = useState(state.folder?.color ?? '');
  const [parentId, setParentId] = useState<string | null>(
    editing ? (state.folder?.parentId ?? null) : state.parentId,
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A new folder's id is fixed once, so a retry after a (possibly committed but
  // unacknowledged) attempt overwrites the same row instead of duplicating it.
  const [newId] = useState(makeId);

  // A folder cannot be its own parent or nest under one of its descendants, so
  // prune the edited folder's subtree from the options.
  const options = parentOptions(tree, editing ? state.folder?.id : undefined);

  /** A mutation "took effect" if the worker acked it or the reconcile confirmed it. */
  const took = (r: MutateResult) => r.ok || r.applied;

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setFailed(false);
    setBusy(true);
    let ok: boolean;
    if (editing && state.folder) {
      const renamed = await onSubmit({ op: 'folder.rename', id: state.folder.id, name: trimmed });
      const recolored = await onSubmit({
        op: 'folder.recolor',
        id: state.folder.id,
        color: color || undefined,
        icon: icon || undefined,
      });
      // Only re-parent when the selection actually changed (avoids a redundant
      // move + the cycle/depth checks the worker would otherwise re-run).
      const moved =
        parentId !== (state.folder.parentId ?? null)
          ? await onSubmit({ op: 'folder.move', id: state.folder.id, parentId })
          : null;
      ok = took(renamed) && took(recolored) && (moved === null || took(moved));
    } else {
      const created = await onSubmit({
        op: 'folder.create',
        id: newId,
        name: trimmed,
        parentId,
        color: color || undefined,
        icon: icon || undefined,
        platformScope: platform,
      });
      ok = took(created);
    }
    setBusy(false);
    // On success close; on a confirmed failure keep the dialog (and the typed
    // values) open and surface the error — never silently discard input ([PRIV]).
    if (ok) onClose();
    else setFailed(true);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel={editing ? STR.editTitle : STR.createTitle}
      contentTestId="sk-folder-dialog"
    >
      <form class="sk-dialog__body sk-folder-form" onSubmit={submit}>
        <div class="sk-dialog__header">
          <h2 class="sk-dialog__title">{editing ? STR.editTitle : STR.createTitle}</h2>
          <button class="sk-icon-btn" type="button" data-testid="sk-folder-close" aria-label={STR.close} onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <label class="sk-field">
          <span class="sk-sidebar__heading">{STR.name}</span>
          <span class="sk-name-field">
            <span class="sk-name-field__icon" aria-hidden="true">
              {icon ? icon : <FolderIcon size={16} />}
            </span>
            <input
              class="sk-name-field__input"
              data-testid="sk-folder-name"
              aria-label={STR.name}
              placeholder={STR.namePlaceholder}
              value={name}
              autoFocus
              onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
            />
          </span>
        </label>

        <fieldset class="sk-field sk-fieldset">
          <legend class="sk-sidebar__heading">{STR.color}</legend>
          <div class="sk-swatches" data-testid="sk-folder-colors">
            <button
              type="button"
              class={`sk-swatch sk-swatch--clear${color ? '' : ' sk-swatch--selected'}`}
              aria-label={STR.clearColor}
              aria-pressed={!color}
              onClick={() => setColor('')}
            />
            {FOLDER_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                class={`sk-swatch${color === c ? ' sk-swatch--selected' : ''}`}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset class="sk-field sk-fieldset">
          <legend class="sk-sidebar__heading">{STR.icon}</legend>
          <div class="sk-icon-grid" data-testid="sk-folder-icons">
            <button
              type="button"
              class={`sk-icon-option sk-icon-option--clear${icon ? '' : ' sk-icon-option--selected'}`}
              aria-label={STR.clearIcon}
              aria-pressed={!icon}
              onClick={() => setIcon('')}
            >
              <CloseIcon size={14} />
            </button>
            {FOLDER_ICONS.map((g) => (
              <button
                key={g}
                type="button"
                class={`sk-icon-option${icon === g ? ' sk-icon-option--selected' : ''}`}
                aria-label={g}
                aria-pressed={icon === g}
                onClick={() => setIcon(g)}
              >
                {g}
              </button>
            ))}
          </div>
        </fieldset>

        <label class="sk-field">
          <span class="sk-sidebar__heading">{STR.parentFolder}</span>
          <select
            class="sk-select"
            data-testid="sk-folder-parent"
            aria-label={STR.parentFolder}
            value={parentId ?? ''}
            onChange={(e) => setParentId((e.currentTarget as HTMLSelectElement).value || null)}
          >
            <option value="">{STR.topLevel}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {`${'  '.repeat(o.depth)}${o.name}`}
              </option>
            ))}
          </select>
        </label>

        {failed && (
          <p class="sk-dialog__error" data-testid="sk-folder-error" role="alert">{STR.createError}</p>
        )}
        <div class="sk-dialog__actions">
          <button class="sk-menu__item" type="button" onClick={onClose}>{STR.cancel}</button>
          <button class="sk-btn sk-btn--icon" type="submit" data-testid="sk-folder-submit" disabled={busy} aria-busy={busy}>
            <CheckIcon size={16} />
            {editing ? STR.save : STR.create}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function makeId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
