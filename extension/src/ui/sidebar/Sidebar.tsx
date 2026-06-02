// The workspace sidebar (LLD T2.2): the folder tree with pinned + archive
// sections and live counts, drag-drop (conversation→folder assignment, folder
// re-parenting), a create/edit folder dialog, and a right-click context menu.
// It is a pure view: every action dispatches a worker mutation via `useWorkspace`
// and the tree re-renders from the worker's broadcast — it holds no authoritative
// folder state of its own (PREACT guardrail).

import { useRef, useState } from 'preact/hooks';
import type { Folder, FolderTreeNode, PlatformId } from '../../shared/types';
import type { MutationOp } from '../../shared/workspace';
import { Dialog, useMenu, mergeProps, getNodeRoot } from '../primitives';
import { useWorkspace, type WorkspaceView } from './useWorkspace';

// User-facing strings in one place (i18n-ready; no inline literals in markup).
const STR = {
  folders: 'Folders',
  pinned: 'Pinned',
  archive: 'Archive',
  newFolder: 'New folder',
  noFolders: 'No folders yet',
  emptyBody: 'Create a folder to start organising conversations across every platform.',
  name: 'Name',
  icon: 'Icon',
  color: 'Color',
  create: 'Create',
  save: 'Save',
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
  createTitle: 'Create folder',
  editTitle: 'Edit folder',
} as const;

const DRAG_MIME = 'application/x-skeinos';
type DragPayload = { type: 'folder' | 'conversation'; id: string };

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

export interface SidebarProps {
  platform: PlatformId;
  /** Injectable for tests; defaults to the live worker-backed view. */
  view?: WorkspaceView;
}

export function Sidebar({ platform, view }: SidebarProps) {
  const live = useWorkspace(platform);
  const ws = view ?? live;
  const { tree, counts, mutate } = ws;

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Which folder the open context menu acts on (the row last right-clicked).
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);

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
  const performMenuAction = (value: MenuAction) => {
    if (actedRef.current === value) return;
    actedRef.current = value;
    setTimeout(() => {
      if (actedRef.current === value) actedRef.current = null;
    }, 0);

    const id = menuTargetId;
    if (!id) return;
    const folder = findFolder(tree.active, id);
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
    return (
      <div key={f.id} class="sk-sidebar__section" style={{ marginLeft: `${(node.depth - 1) * 12}px` }}>
        <div
          class={`sk-row${dropTarget === f.id ? ' sk-row--drop' : ''}`}
          data-testid="sk-folder"
          data-folder-id={f.id}
          draggable
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
          {f.icon ? <span class="sk-row__icon">{f.icon}</span> : null}
          <span class="sk-row__label" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
          <span class="sk-row__count" data-testid="sk-folder-count">{counts[f.id] ?? 0}</span>
        </div>
        {node.children.map(renderNode)}
      </div>
    );
  };

  // A non-tree folder row (pinned / archive): icon · color · count, like the
  // active tree but without disclosure/drag affordances.
  const renderLeaf = (f: Folder, attr: 'data-pinned-id' | 'data-archived-id') => (
    <div key={f.id} class="sk-row" {...{ [attr]: f.id }}>
      {f.icon ? <span class="sk-row__icon">{f.icon}</span> : null}
      <span class="sk-row__label" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
      <span class="sk-row__count" data-testid="sk-folder-count">{counts[f.id] ?? 0}</span>
    </div>
  );

  const menuTarget = menuTargetId ? findFolder(tree.active, menuTargetId) : undefined;

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
            +
          </button>
        </div>
        {tree.active.length === 0 ? (
          <div class="sk-empty" data-testid="sk-folders-empty">
            <span class="sk-empty__icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </span>
            <p class="sk-empty__title">{STR.noFolders}</p>
            <p class="sk-empty__body">{STR.emptyBody}</p>
            <button
              class="sk-btn"
              type="button"
              data-testid="sk-empty-new-folder"
              onClick={(e) => {
                (e as MouseEvent).stopPropagation();
                setDialog({ mode: 'create', parentId: null });
              }}
            >
              + {STR.newFolder}
            </button>
          </div>
        ) : (
          tree.active.map(renderNode)
        )}
      </div>

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
          onClose={() => setDialog(null)}
          onSubmit={(op) => {
            setDialog(null);
            void mutate(op);
          }}
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
interface FolderDialogProps {
  state: DialogState;
  platform: PlatformId;
  onClose: () => void;
  onSubmit: (op: MutationOp) => void;
}

function FolderDialog({ state, platform, onClose, onSubmit }: FolderDialogProps) {
  const editing = state.mode === 'edit';
  const [name, setName] = useState(state.folder?.name ?? '');
  const [icon, setIcon] = useState(state.folder?.icon ?? '');
  const [color, setColor] = useState(state.folder?.color ?? '');

  const submit = (e: Event) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (editing && state.folder) {
      onSubmit({ op: 'folder.rename', id: state.folder.id, name: trimmed });
      onSubmit({ op: 'folder.recolor', id: state.folder.id, color: color || undefined, icon: icon || undefined });
    } else {
      onSubmit({
        op: 'folder.create',
        id: makeId(),
        name: trimmed,
        parentId: state.parentId,
        color: color || undefined,
        icon: icon || undefined,
        platformScope: platform,
      });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel={editing ? STR.editTitle : STR.createTitle}
      contentTestId="sk-folder-dialog"
    >
      <form class="sk-dialog__body" onSubmit={submit}>
        <label class="sk-field">
          <span class="sk-sidebar__heading">{STR.name}</span>
          <input class="sk-input" data-testid="sk-folder-name" aria-label={STR.name} value={name} autoFocus onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="sk-field">
          <span class="sk-sidebar__heading">{STR.icon}</span>
          <input class="sk-input" data-testid="sk-folder-icon" aria-label={STR.icon} value={icon} onInput={(e) => setIcon((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label class="sk-field">
          <span class="sk-sidebar__heading">{STR.color}</span>
          <input class="sk-input" data-testid="sk-folder-color" aria-label={STR.color} value={color} onInput={(e) => setColor((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <div class="sk-dialog__actions">
          <button class="sk-menu__item" type="button" onClick={onClose}>{STR.cancel}</button>
          <button class="sk-btn" type="submit" data-testid="sk-folder-submit">{editing ? STR.save : STR.create}</button>
        </div>
      </form>
    </Dialog>
  );
}

function makeId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
