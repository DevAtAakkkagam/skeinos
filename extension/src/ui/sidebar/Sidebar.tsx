// The workspace sidebar (LLD T2.2): the folder tree with pinned + archive
// sections and live counts, drag-drop (conversation→folder assignment, folder
// re-parenting), a create/edit folder dialog, and a per-row actions menu opened
// from a `⋯` button (revealed on row hover / keyboard focus).
// It is a pure view: every action dispatches a worker mutation via `useWorkspace`
// and the tree re-renders from the worker's broadcast — it holds no authoritative
// folder state of its own (PREACT guardrail).

import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConversationIndex, Folder, FolderTreeNode, PlatformId } from '../../shared/types';
import { conversationId, type MutationOp } from '../../shared/workspace';
import { countByFolder } from '../../core/folders';
import { Dialog, useMenu, mergeProps, getNodeRoot } from '../primitives';
import {
  CheckIcon,
  ChevronIcon,
  CloseIcon,
  CollapseAllIcon,
  ExpandAllIcon,
  FOLDER_ICON_SENTINEL,
  FolderIcon,
  FolderRowIcon,
  MoreIcon,
  PlusIcon,
} from '../components/Icon';
import { ConversationList } from './ConversationList';
import { DEFAULT_FOLDER_COLOR, makeFolderId } from './folderDefaults';
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
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
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
  folderIcon: 'Folder icon',
  create: 'Create folder',
  save: 'Save changes',
  close: 'Close',
  cancel: 'Cancel',
  rename: 'Edit',
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
  unfiled: 'Uncategorized',
  expand: 'Expand',
  collapse: 'Collapse',
  menuTrigger: 'Folder actions',
} as const;

/** Sentinel expansion key for the (non-folder) "Unfiled" pseudo-node. */
const UNFILED = 'unfiled';

// `FOLDER_ICON_SENTINEL` (the stored "default folder glyph" marker, design D5) and
// the row-icon renderer now live in `components/Icon` so the move-to-folder picker
// can share them without a circular import; re-exported here for existing callers.
export { FOLDER_ICON_SENTINEL };

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

/** Every folder id in the tree (all depths, pre-order) — the expansion keys that
 *  "expand all" turns on. */
function allFolderIds(nodes: FolderTreeNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    acc.push(n.folder.id);
    allFolderIds(n.children, acc);
  }
  return acc;
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
  const { tree, conversations, active, platformFilter, status, mutate, retry } = ws;

  // Apply the platform view-filter (D28): "All" shows the unified library across
  // every platform; selecting a platform narrows to its conversations. Per-folder
  // counts AND the rendered contents derive from this single filtered set, so a
  // folder's badge always equals the rows it renders — the "5 vs empty" mismatch
  // (a global count over a platform-scoped body) is unrepresentable by construction.
  const visibleConvs =
    platformFilter === 'all'
      ? conversations
      : conversations.filter((c) => c.platform === platformFilter);
  // Archived conversations are hidden from the folder tree, the Unfiled node, AND
  // the per-folder counts — so a badge always equals the rows the folder renders
  // (archiving a chat drops the count, never leaves a phantom). They live only in
  // the Archive section below (alongside archived folders), where they can be
  // unarchived.
  const liveConvs = visibleConvs.filter((c) => !c.archived);
  const archivedConvs = visibleConvs.filter((c) => c.archived);
  const counts = countByFolder(liveConvs);

  // Conversations that belong to no folder — surfaced under the "Unfiled" node so
  // they stay reachable in a folders-only tree (the design has no flat list).
  const unfiledConvs = liveConvs.filter((c) => c.folderId == null);
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
  // Which folder the open actions menu acts on (the row whose ⋯ was last clicked).
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);

  // Which nodes are expanded to reveal their conversations (folder ids + the
  // UNFILED sentinel). Local view state only — never authoritative (PREACT rule).
  // Unfiled starts expanded so its conversations lead on first paint (the section
  // only renders when there are unfiled chats); the user can collapse it freely.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([UNFILED]));
  // A pinned-row "jump-to" in flight: the canonical tree row to scroll into view
  // once the path to it has expanded and re-rendered. Cleared by the scroll effect.
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Expand/collapse every folder at once — active tree (all depths), the archived
  // folders inside the Archive section, and the Unfiled node alike. The Archive
  // dock's own open/closed state is left untouched: opening it later reveals its
  // folders already expanded.
  const expandAll = () => {
    const ids = [...allFolderIds(tree.active), ...tree.archived.map((f) => f.id)];
    if (unfiledConvs.length > 0) ids.push(UNFILED);
    setExpanded(new Set(ids));
  };
  const collapseAll = () => setExpanded(new Set());

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

  // Jump-to: a pinned row is a shortcut to the folder's canonical (expandable)
  // copy in the active tree — expand the path down to it, then flag it so the
  // scroll effect reveals and briefly highlights the now-rendered row.
  const jumpToFolder = (id: string) => {
    const chain = pathToFolder(tree.active, id);
    if (!chain) return; // not in the active tree (shouldn't happen for a pinned folder)
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const fid of chain) next.add(fid);
      return next;
    });
    setJumpTarget(id);
  };

  // After the path expands and the canonical row mounts, scroll it into view and
  // pulse a highlight, then clear the request. Runs whenever the target or the
  // expansion set changes so it fires once the row actually exists in the DOM.
  useEffect(() => {
    if (!jumpTarget) return;
    const root = sidebarRef.current;
    const row = [...(root?.querySelectorAll<HTMLElement>('[data-folder-id]') ?? [])].find(
      (el) => el.getAttribute('data-folder-id') === jumpTarget,
    );
    if (!row) return; // not yet rendered — a later expansion tick will re-run this
    row.scrollIntoView?.({ block: 'nearest' });
    // Restart the pulse on every jump — even re-clicking the same folder. A bare
    // setAttribute is a no-op if the attribute is already present (so the animation
    // wouldn't replay), so remove it, force a reflow, then re-add. The animation
    // ends on an invisible keyframe, so the attribute can safely linger afterwards.
    row.removeAttribute('data-jump-flash');
    void row.offsetWidth; // reflow: lets the CSS animation play again from the top
    row.setAttribute('data-jump-flash', '');
    setJumpTarget(null);
  }, [jumpTarget, expanded]);

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

  // One menu machine shared by every folder row; each row's `⋯` button is a trigger
  // and we track which folder it targeted in `menuTargetId`. Zag owns positioning,
  // keyboard navigation, dismissal, and focus restoration.
  const menu = useMenu({
    getRootNode: () => getNodeRoot(sidebarRef.current),
    onSelect: (value) => performMenuAction(value as MenuAction),
  });

  // A menu item: Zag's accessible item props + our explicit click action.
  const itemProps = (value: MenuAction) =>
    mergeProps(menu.getItemProps({ value }), { onClick: () => performMenuAction(value) });

  // A row's `⋯` actions button: Zag's accessible trigger props + the targeted
  // folder. stopPropagation keeps a tree row's own onClick (expand) from firing too.
  const triggerProps = (id: string) =>
    mergeProps(menu.getTriggerProps({ value: id }), {
      onClick: (e: MouseEvent) => {
        e.stopPropagation();
        setMenuTargetId(id);
      },
    });

  const menuButton = (id: string) => (
    <button
      class="sk-icon-btn sk-row-menu"
      type="button"
      data-testid="sk-folder-menu"
      aria-label={STR.menuTrigger}
      title={STR.menuTrigger}
      {...triggerProps(id)}
    >
      <MoreIcon size={16} />
    </button>
  );

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
    const folderConvs = liveConvs.filter((c) => c.folderId === f.id);
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
          <FolderRowIcon folder={f} />
          <span class="sk-row__label" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
          <span class="sk-row__count" data-testid="sk-folder-count">{counts[f.id] ?? 0}</span>
          {menuButton(f.id)}
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
              activePlatform={platform}
              onOpen={onOpenConversation}
            />
          </div>
        )}
      </div>
    );
  };

  // The pinned shortcut row: icon · color · count, like the active tree but without
  // disclosure/drag affordances — the folder's canonical, expandable copy lives in
  // the tree below, so this row stays a flat jump-to: activating it expands the path
  // to that folder in the tree and scrolls it into view (see `jumpToFolder`).
  const renderLeaf = (f: Folder, attr: 'data-pinned-id') => (
    <div
      key={f.id}
      class="sk-row sk-row--jump"
      {...{ [attr]: f.id }}
      role="button"
      tabIndex={0}
      aria-label={`${STR.pinned}: ${f.name}`}
      onClick={() => jumpToFolder(f.id)}
      onKeyDown={(e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') {
          e.preventDefault();
          jumpToFolder(f.id);
        }
      }}
    >
      <span class="sk-caret-spacer" aria-hidden="true" />
      <FolderRowIcon folder={f} />
      <span class="sk-row__label" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
      <span class="sk-row__count" data-testid="sk-folder-count">{counts[f.id] ?? 0}</span>
      {menuButton(f.id)}
    </div>
  );

  // An archived folder row. Unlike a pinned folder, an archived one is filtered out
  // of the live tree, so this is its ONLY appearance — making it expandable here is
  // what keeps its count honest: the badge promises N chats, and the caret reveals
  // them (rather than a dead-end count). Reuses the tree's disclosure state so the
  // open/closed flag survives a re-render alongside the live folders.
  const renderArchivedFolder = (f: Folder) => {
    const isOpen = expanded.has(f.id);
    const folderConvs = liveConvs.filter((c) => c.folderId === f.id);
    return (
      <div key={f.id} class="sk-sidebar__section">
        <div class="sk-row" data-archived-id={f.id} onClick={() => toggleExpanded(f.id)}>
          <button
            class="sk-caret"
            type="button"
            data-testid="sk-archived-caret"
            aria-expanded={isOpen}
            aria-label={isOpen ? STR.collapse : STR.expand}
            onClick={(e) => {
              (e as MouseEvent).stopPropagation();
              toggleExpanded(f.id);
            }}
          >
            <ChevronIcon size={14} />
          </button>
          <FolderRowIcon folder={f} />
          <span class="sk-row__label" style={f.color ? { color: f.color } : undefined}>{f.name}</span>
          <span class="sk-row__count" data-testid="sk-folder-count">{counts[f.id] ?? 0}</span>
          {menuButton(f.id)}
        </div>
        {isOpen && (
          <div class="sk-node__children">
            <ConversationList
              conversations={folderConvs}
              active={active}
              tree={tree}
              mutate={mutate}
              context={{ kind: 'folder', name: f.name }}
              activePlatform={platform}
              onOpen={onOpenConversation}
            />
          </div>
        )}
      </div>
    );
  };

  const menuTarget = menuTargetId ? resolveFolder(menuTargetId) : undefined;

  // One Archive section — archived folders and archived chats together — docks to
  // the bottom of the panel instead of scrolling away with the tree: the live
  // pinned/folders/unfiled sections scroll inside `sk-sidebar__scroll`, while the
  // archive dock stays pinned below it so the archive is always reachable without
  // scrolling past a long folder list. Its badge counts both kinds put away.
  const hasArchive = archivedConvs.length > 0 || tree.archived.length > 0;
  const archiveCount = tree.archived.length + archivedConvs.length;

  // With zero folders we used to lead with a full "create your first folder" card.
  // But if the user already has unfiled or archived conversations, that blank-slate
  // pitch is wrong — there IS content. In that case the create prompt is demoted to
  // a slim ghost row (below) and the Unfiled group / Archive dock lead the panel.
  // The full card only stands in for a genuinely empty workspace (true first run).
  const hasContentElsewhere = unfiledConvs.length > 0 || hasArchive;

  return (
    <div ref={sidebarRef} class="sk-sidebar" data-testid="sk-sidebar">
      <div class="sk-sidebar__scroll" data-testid="sk-sidebar-scroll">
        {tree.pinned.length > 0 && (
          <div class="sk-sidebar__section" data-testid="sk-pinned">
            <p class="sk-sidebar__heading sk-sidebar__heading--block">{STR.pinned}</p>
            {tree.pinned.map((f) => renderLeaf(f, 'data-pinned-id'))}
          </div>
        )}

        <div class="sk-sidebar__section">
          <div class="sk-row sk-sidebar__section-head">
            <span class="sk-sidebar__heading">{STR.folders}</span>
            <button
              class="sk-icon-btn"
              type="button"
              data-testid="sk-expand-all"
              aria-label={STR.expandAll}
              title={STR.expandAll}
              onClick={(e) => {
                (e as MouseEvent).stopPropagation();
                expandAll();
              }}
            >
              <ExpandAllIcon size={16} />
            </button>
            <button
              class="sk-icon-btn"
              type="button"
              data-testid="sk-collapse-all"
              aria-label={STR.collapseAll}
              title={STR.collapseAll}
              onClick={(e) => {
                (e as MouseEvent).stopPropagation();
                collapseAll();
              }}
            >
              <CollapseAllIcon size={16} />
            </button>
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
                ? // A read succeeded but there are no folders. If the user already
                  // has conversations elsewhere (unfiled or archived), don't lead
                  // with a blank-slate pitch — demote "create your first folder" to a
                  // slim ghost row so the Unfiled group / Archive dock carry the
                  // panel. Only a genuinely empty workspace gets the full first-run
                  // card. (The section-header "+" stays the persistent create path.)
                  hasContentElsewhere
                  ? (
                      <button
                        class="sk-ghost-row"
                        type="button"
                        data-testid="sk-ghost-new-folder"
                        onClick={(e) => {
                          (e as MouseEvent).stopPropagation();
                          setDialog({ mode: 'create', parentId: null });
                        }}
                      >
                        <PlusIcon size={16} />
                        <span>{STR.newFolder}</span>
                      </button>
                    )
                  : (
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
                  activePlatform={platform}
                  onOpen={onOpenConversation}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {hasArchive && (
        <div class="sk-sidebar__dock" data-testid="sk-archive-dock">
          <details class="sk-sidebar__section" data-testid="sk-archive">
            <summary class="sk-row sk-sidebar__section-head sk-sidebar__section-summary">
              <span class="sk-caret sk-section-caret" aria-hidden="true"><ChevronIcon size={14} /></span>
              <span class="sk-sidebar__heading">{STR.archive}</span>
              <span class="sk-row__count" data-testid="sk-archive-count">{archiveCount}</span>
            </summary>
            <div class="sk-node__children">
              {tree.archived.map(renderArchivedFolder)}
              {archivedConvs.length > 0 && (
                <ConversationList
                  conversations={archivedConvs}
                  active={active}
                  tree={tree}
                  mutate={mutate}
                  context={{ kind: 'archived' }}
                  activePlatform={platform}
                  onOpen={onOpenConversation}
                />
              )}
            </div>
          </details>
        </div>
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
// Curated emoji icon set (the icon grid in design 03·05). The grid's first slot is
// the tintable default folder SVG (sentinel) and the leading "clear" option resets
// to no icon; the emoji here keep the rest of the picker zero-asset and
// theme-agnostic. (The 📁 emoji is dropped — the tintable folder SVG supersedes it.)
const FOLDER_ICONS = ['✏️', '📊', '⏱️', '💰', '📚', '🌿', '📷', '🚀', '📞', '🎯', '📌'] as const;

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
  /** Active (non-archived) tree, for the parent-folder picker. */
  tree: FolderTreeNode[];
  onClose: () => void;
  /** Apply a mutation and reconcile; resolves with whether it took effect. The
   *  dialog closes itself on success and stays open (keeping input) on failure. */
  onSubmit: (op: MutationOp) => Promise<MutateResult>;
}

function FolderDialog({ state, tree, onClose, onSubmit }: FolderDialogProps) {
  const editing = state.mode === 'edit';
  const [name, setName] = useState(state.folder?.name ?? '');
  // Create mode preselects the folder icon + blue (a branded default); edit mode
  // reads the folder's stored values. The clear options remain reachable (D5).
  const [icon, setIcon] = useState(editing ? (state.folder?.icon ?? '') : FOLDER_ICON_SENTINEL);
  const [color, setColor] = useState(editing ? (state.folder?.color ?? '') : DEFAULT_FOLDER_COLOR);
  const [parentId, setParentId] = useState<string | null>(
    editing ? (state.folder?.parentId ?? null) : state.parentId,
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A new folder's id is fixed once, so a retry after a (possibly committed but
  // unacknowledged) attempt overwrites the same row instead of duplicating it.
  const [newId] = useState(makeFolderId);

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
        // Folders are platform-agnostic in the unified model (D28 / D-FSR4): never
        // stamp the creating tab's platform (the dead-data source the panel never
        // read). The field is retained in the schema as the M4 independent-mode hook.
        platformScope: 'unified',
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
              {icon && icon !== FOLDER_ICON_SENTINEL ? (
                icon
              ) : (
                <span style={{ color: color || undefined }}>
                  <FolderIcon size={16} />
                </span>
              )}
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
            <button
              type="button"
              class={`sk-icon-option${icon === FOLDER_ICON_SENTINEL ? ' sk-icon-option--selected' : ''}`}
              data-testid="sk-folder-icon-default"
              aria-label={STR.folderIcon}
              aria-pressed={icon === FOLDER_ICON_SENTINEL}
              style={{ color: color || undefined }}
              onClick={() => setIcon(FOLDER_ICON_SENTINEL)}
            >
              <FolderIcon size={16} />
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

