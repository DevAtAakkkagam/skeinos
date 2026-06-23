// The workspace sidebar (LLD T2.2): the folder tree with pinned + archive
// sections and live counts, drag-drop (conversation→folder assignment, folder
// re-parenting), a create/edit folder dialog, and a per-row actions menu opened
// from a `⋯` button (revealed on row hover / keyboard focus).
// It is a pure view: every action dispatches a worker mutation via `useWorkspace`
// and the tree re-renders from the worker's broadcast — it holds no authoritative
// folder state of its own (PREACT guardrail).

import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConversationIndex, Folder, FolderTreeNode, PlatformId } from '../../shared/types';
import { conversationId, type MutationOp } from '../../shared/workspace';
import { countByFolder } from '../../core/folders';
import { filterByTags } from '../../core/tags';
import type { Tag } from '../../shared/types';
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
import { Skeleton } from '../components/Skeleton';
import { UpgradeNudge } from '../components/UpgradeNudge';
import { EnterHint } from '../components/EnterHint';
import { quotaDetailOf, type QuotaErrorDetail } from '../../core/tier';
import { ConversationList } from './ConversationList';
import { DEFAULT_FOLDER_COLOR, makeFolderId } from './folderDefaults';
import { FOLDER_COLORS } from './palette';
import { DRAG_MIME, type DragPayload } from './drag';
import { useWorkspace, type MutateResult, type WorkspaceView } from './useWorkspace';
import { useT } from '../../core/i18n';

// Re-exported for the existing import site (`tests`/other UI) that reaches for the
// drag contract via this module; the definition now lives in `./drag`.
export { DRAG_MIME } from './drag';
export type { DragPayload } from './drag';

/** How many placeholder rows the loading skeleton shows — a small fixed set that
 *  fills the list region without claiming to predict the real folder count (D-2). */
const SKELETON_ROWS = 6;

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
// Sibling reordering is no longer a menu action — it's done by dragging a folder
// onto a seam between rows (see `repositionFolder` / the `sk-seam` drop zones).
type MenuAction = 'rename' | 'pin' | 'archive' | 'move-top' | 'delete';

/** New sibling order after dropping `movedId` at insertion slot `dropPos` within a
 *  group displaying `groupIds` (slots run 0…length: before the first row … after the
 *  last). Returns null when the drop is a no-op (folder lands in its current slot). */
function reorderedIds(groupIds: string[], movedId: string, dropPos: number): string[] | null {
  const from = groupIds.indexOf(movedId);
  const without = groupIds.filter((id) => id !== movedId);
  // When the folder already sits before the slot, removing it shifts the target left.
  let target = from !== -1 && dropPos > from ? dropPos - 1 : dropPos;
  target = Math.max(0, Math.min(target, without.length));
  without.splice(target, 0, movedId);
  if (without.length === groupIds.length && without.every((id, i) => id === groupIds[i])) return null;
  return without;
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
  /** The tag library, for the per-row tag-assignment affordance. Optional (defaults
   *  to none) so the sidebar still renders standalone in tests without a tag lib. */
  tags?: Tag[];
  /** Open a conversation in the active tab; forwarded to the inline lists.
   *  Defaults (in ConversationList) to the live tab-navigation helper. */
  onOpenConversation?: (conv: ConversationIndex) => void;
}

export function Sidebar({ platform, view, tags = [], onOpenConversation }: SidebarProps) {
  const t = useT();
  const live = useWorkspace(platform);
  const ws = view ?? live;
  const { tree, conversations, active, platformFilter, tagFilter, status, mutate, retry } = ws;

  // Apply the platform view-filter (D28): "All" shows the unified library across
  // every platform; selecting a platform narrows to its conversations. Then narrow by
  // the selected tag set (design D-4, AND semantics). Per-folder counts AND the
  // rendered contents derive from this single filtered set, so a folder's badge always
  // equals the rows it renders — the "5 vs empty" mismatch (a global count over a
  // platform-scoped body) is unrepresentable by construction.
  const platformConvs =
    platformFilter === 'all'
      ? conversations
      : conversations.filter((c) => c.platform === platformFilter);
  const visibleConvs = filterByTags(platformConvs, tagFilter);
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

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Which folder the open actions menu acts on (the row whose ⋯ was last clicked).
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);
  // A folder awaiting delete confirmation. Delete is destructive and can hold the
  // user's conversations, so it routes through a confirm dialog (never one-click).
  const [pendingDelete, setPendingDelete] = useState<Folder | null>(null);
  // Drag-to-reorder state: the folder currently being dragged (so the reorder seams
  // between rows only render mid-drag, never at rest), and the seam under the pointer
  // (so it draws an insertion line). Seams are keyed `${parentId ?? 'root'}:${index}`.
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [seamTarget, setSeamTarget] = useState<string | null>(null);

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

  // Reposition `movedId` to slot `dropPos` within the sibling group whose parent is
  // `parentId` and whose current order is `groupIds`. Within the same parent this is
  // a pure reorder; dragged in from another parent it re-parents first (which appends
  // it), then reorders to land it at the dropped slot. Validation (cycle/depth) is the
  // worker's via `folder.move`; we only reorder once the move has taken effect.
  const repositionFolder = async (movedId: string, parentId: string | null, groupIds: string[], dropPos: number) => {
    if (groupIds.includes(movedId)) {
      const ordered = reorderedIds(groupIds, movedId, dropPos);
      if (ordered) await mutate({ op: 'folder.reorder', orderedIds: ordered });
      return;
    }
    const moved = await mutate({ op: 'folder.move', id: movedId, parentId });
    if (!(moved.ok || moved.applied)) return; // rejected (cycle/depth) — leave as-is
    const ids = [...groupIds];
    ids.splice(Math.max(0, Math.min(dropPos, ids.length)), 0, movedId);
    await mutate({ op: 'folder.reorder', orderedIds: ids });
  };

  const onDropOnSeam = (parentId: string | null, groupIds: string[], dropPos: number, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSeamTarget(null);
    setDraggingFolderId(null);
    const raw = e.dataTransfer?.getData(DRAG_MIME);
    if (!raw) return;
    const payload = JSON.parse(raw) as DragPayload;
    if (payload.type !== 'folder') return; // seams reorder folders only
    void repositionFolder(payload.id, parentId, groupIds, dropPos);
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
      case 'move-top':
        void mutate({ op: 'folder.move', id: folder.id, parentId: null });
        break;
      case 'delete':
        // Open the confirm dialog rather than deleting inline — the worker re-homes
        // the folder's conversations to Uncategorized, but the user confirms first.
        setPendingDelete(folder);
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
      class={`sk-icon-btn sk-row-menu${menu.open && menuTargetId === id ? ' sk-row-menu--open' : ''}`}
      type="button"
      data-testid="sk-folder-menu"
      aria-label={t('sidebar.menuTrigger')}
      title={t('sidebar.menuTrigger')}
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
          onDragStart={(e) => {
            (e as DragEvent).dataTransfer?.setData(
              DRAG_MIME,
              JSON.stringify({ type: 'folder', id: f.id } satisfies DragPayload),
            );
            // Reveal the reorder seams between rows for the duration of the drag.
            setDraggingFolderId(f.id);
          }}
          onDragEnd={() => {
            setDraggingFolderId(null);
            setSeamTarget(null);
          }}
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
            aria-label={isOpen ? t('sidebar.collapse') : t('sidebar.expand')}
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
            {renderGroup(node.children, f.id)}
            <ConversationList
              conversations={folderConvs}
              active={active}
              tree={tree}
              mutate={mutate}
              tags={tags}
              context={{ kind: 'folder', name: f.name }}
              activePlatform={platform}
              onOpen={onOpenConversation}
            />
          </div>
        )}
      </div>
    );
  };

  // A reorder seam: a thin drop target between sibling folder rows (and at the start
  // and end of the group). Rendered only mid-drag; dropping a folder here repositions
  // it to that slot. `depth` aligns the seam's indent with the rows it sits among.
  const seam = (parentId: string | null, groupIds: string[], dropPos: number, depth: number) => {
    if (!draggingFolderId) return null;
    const key = `${parentId ?? 'root'}:${dropPos}`;
    return (
      <div
        class={`sk-seam${seamTarget === key ? ' sk-seam--active' : ''}`}
        data-testid="sk-folder-seam"
        data-seam={key}
        style={{ marginLeft: `${(depth - 1) * 12}px` }}
        onDragOver={(e) => {
          e.preventDefault();
          (e as DragEvent).stopPropagation();
          setSeamTarget(key);
        }}
        onDragLeave={() => setSeamTarget((t) => (t === key ? null : t))}
        onDrop={(e) => onDropOnSeam(parentId, groupIds, dropPos, e as DragEvent)}
      />
    );
  };

  // Render a sibling group with reorder seams interleaved between its rows. Siblings
  // share a depth, so the group's indent derives from the first node.
  const renderGroup = (nodes: FolderTreeNode[], parentId: string | null) => {
    if (nodes.length === 0) return null;
    const depth = nodes[0].depth;
    const ids = nodes.map((n) => n.folder.id);
    return (
      <>
        {nodes.map((n, i) => (
          <Fragment key={`grp-${n.folder.id}`}>
            {seam(parentId, ids, i, depth)}
            {renderNode(n)}
          </Fragment>
        ))}
        {seam(parentId, ids, nodes.length, depth)}
      </>
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
      aria-label={`${t('sidebar.pinned')}: ${f.name}`}
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
            aria-label={isOpen ? t('sidebar.collapse') : t('sidebar.expand')}
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
              tags={tags}
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
            <p class="sk-sidebar__heading sk-sidebar__heading--block">{t('sidebar.pinned')}</p>
            {tree.pinned.map((f) => renderLeaf(f, 'data-pinned-id'))}
          </div>
        )}

        <div class="sk-sidebar__section">
          <div class="sk-row sk-sidebar__section-head">
            <span class="sk-sidebar__heading">{t('sidebar.folders')}</span>
            <button
              class="sk-icon-btn"
              type="button"
              data-testid="sk-expand-all"
              aria-label={t('sidebar.expandAll')}
              title={t('sidebar.expandAll')}
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
              aria-label={t('sidebar.collapseAll')}
              title={t('sidebar.collapseAll')}
              onClick={(e) => {
                (e as MouseEvent).stopPropagation();
                collapseAll();
              }}
            >
              <CollapseAllIcon size={16} />
            </button>
            <button
              class="sk-icon-btn sk-icon-btn--accent"
              type="button"
              data-testid="sk-new-folder"
              aria-label={t('sidebar.newFolder')}
              title={t('sidebar.newFolder')}
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
              renderGroup(tree.active, null)
            : status === 'error'
              ? // Load failed after the retry budget: offer a retry, not a false empty.
                (
                  <div class="sk-empty" data-testid="sk-folders-error" role="alert">
                    <span class="sk-empty__icon" aria-hidden="true">
                      <FolderIcon size={40} />
                    </span>
                    <p class="sk-empty__title">{t('sidebar.loadError')}</p>
                    <p class="sk-empty__body">{t('sidebar.loadErrorBody')}</p>
                    <button
                      class="sk-btn sk-btn--icon"
                      type="button"
                      data-testid="sk-folders-retry"
                      onClick={(e) => {
                        (e as MouseEvent).stopPropagation();
                        retry();
                      }}
                    >
                      {t('sidebar.retry')}
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
                        <span>{t('sidebar.newFolder')}</span>
                      </button>
                    )
                  : (
                      <div class="sk-empty" data-testid="sk-folders-empty">
                        <span class="sk-empty__icon" aria-hidden="true">
                          <FolderIcon size={40} />
                        </span>
                        <p class="sk-empty__title">{t('sidebar.noFolders')}</p>
                        <p class="sk-empty__body">{t('sidebar.emptyBody')}</p>
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
                          {t('sidebar.newFolder')}
                        </button>
                      </div>
                    )
                : // Still loading: skeleton rows in place of the list (D-2), so a
                  // loading workspace reads as "loading" rather than blank or empty.
                  // They render only here (no folders + status loading) and are
                  // replaced the moment the tree resolves to ready/error.
                  (
                    <div
                      class="sk-skeleton-rows"
                      data-testid="sk-folders-skeleton"
                      role="status"
                      aria-label={t('sidebar.loading')}
                    >
                      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                        <div class="sk-row sk-skeleton-row" key={i} aria-hidden="true">
                          <Skeleton variant="line" width="14px" height="14px" />
                          <Skeleton variant="line" width={`${64 - i * 6}%`} class="sk-skeleton-row__label" />
                        </div>
                      ))}
                    </div>
                  )}

          {/* Unfiled lives inside the folders section so the sticky FOLDERS header
              pins across the whole list (folders + unfiled), not just the folders. */}
          {unfiledConvs.length > 0 && (
            <div class="sk-sidebar__section" data-testid="sk-unfiled">
            <div class="sk-row" onClick={() => toggleExpanded(UNFILED)}>
              <button
                class="sk-caret"
                type="button"
                data-testid="sk-unfiled-caret"
                aria-expanded={expanded.has(UNFILED)}
                aria-label={expanded.has(UNFILED) ? t('sidebar.collapse') : t('sidebar.expand')}
                onClick={(e) => {
                  (e as MouseEvent).stopPropagation();
                  toggleExpanded(UNFILED);
                }}
              >
                <ChevronIcon size={14} />
              </button>
              <span class="sk-row__label">{t('sidebar.unfiled')}</span>
              <span class="sk-row__count" data-testid="sk-unfiled-count">{unfiledConvs.length}</span>
            </div>
            {expanded.has(UNFILED) && (
              <div class="sk-node__children">
                <ConversationList
                  conversations={unfiledConvs}
                  active={active}
                  tree={tree}
                  mutate={mutate}
                  tags={tags}
                  context={{ kind: 'unfiled' }}
                  activePlatform={platform}
                  onOpen={onOpenConversation}
                />
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {hasArchive && (
        <div class="sk-sidebar__dock" data-testid="sk-archive-dock">
          <details class="sk-sidebar__section" data-testid="sk-archive">
            <summary class="sk-row sk-sidebar__section-head sk-sidebar__section-summary">
              <span class="sk-caret sk-section-caret" aria-hidden="true"><ChevronIcon size={14} /></span>
              <span class="sk-sidebar__heading">{t('sidebar.archive')}</span>
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
                  tags={tags}
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
            <button class="sk-menu__item" data-testid="sk-menu-rename" {...itemProps('rename')}>{t('sidebar.rename')}</button>
            <button class="sk-menu__item" data-testid="sk-menu-pin" {...itemProps('pin')}>{menuTarget.pinned ? t('sidebar.unpin') : t('sidebar.pin')}</button>
            <button class="sk-menu__item" data-testid="sk-menu-archive" {...itemProps('archive')}>{menuTarget.archived ? t('sidebar.unarchive') : t('sidebar.archiveAction')}</button>
            <button class="sk-menu__item" data-testid="sk-menu-move-top" {...itemProps('move-top')}>{t('sidebar.moveTop')}</button>
            <div class="sk-menu__divider" role="separator" aria-orientation="horizontal" />
            <button class="sk-menu__item" data-testid="sk-menu-delete" {...itemProps('delete')}>{t('sidebar.delete')}</button>
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

      {pendingDelete && (
        <Dialog
          open
          onClose={() => setPendingDelete(null)}
          ariaLabel={t('sidebar.confirmDeleteTitle')}
          contentTestId="sk-folder-delete-confirm"
        >
          <div class="sk-dialog__body">
            <h2 class="sk-dialog__title">{t('sidebar.confirmDeleteTitle')}</h2>
            <p class="sk-text sk-text--muted">{t('sidebar.confirmDeleteBody', { name: pendingDelete.name })}</p>
            <p class="sk-text sk-text--muted" data-testid="sk-folder-delete-disposition">
              {(() => {
                const convs = conversations.filter((c) => c.folderId === pendingDelete.id).length;
                const subs = countSubfolders(tree.active, tree.archived, pendingDelete.id);
                // build from catalog pieces
                const parts: string[] = [];
                if (convs > 0) parts.push(t('sidebar.dispositionConvs', { count: convs }));
                if (subs > 0) parts.push(t('sidebar.dispositionSubs', { count: subs }));
                return parts.length === 0
                  ? t('sidebar.dispositionEmpty')
                  : (() => {
                      const joined = parts.join(t('sidebar.dispositionJoin'));
                      return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}${t('sidebar.dispositionSuffix')}`;
                    })();
              })()}
            </p>
            <div class="sk-dialog__actions">
              <button
                type="button"
                class="sk-btn sk-btn--ghost"
                data-testid="sk-folder-delete-cancel"
                onClick={() => setPendingDelete(null)}
              >
                {t('sidebar.cancel')}
              </button>
              <button
                type="button"
                class="sk-btn sk-btn--danger"
                data-testid="sk-folder-delete-confirm-btn"
                onClick={() => {
                  const id = pendingDelete.id;
                  setPendingDelete(null);
                  void mutate({ op: 'folder.delete', id });
                }}
              >
                {t('sidebar.confirmDelete')}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Count a folder's direct subfolders across the active tree and the archived list —
 *  the "moves to the top level" figure shown in the delete-confirm disposition. */
function countSubfolders(activeNodes: FolderTreeNode[], archived: Folder[], id: string): number {
  let n = 0;
  const walk = (nodes: FolderTreeNode[]): void => {
    for (const node of nodes) {
      if (node.folder.parentId === id) n += 1;
      walk(node.children);
    }
  };
  walk(activeNodes);
  for (const f of archived) if (f.parentId === id) n += 1;
  return n;
}

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
  const t = useT();
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
  // The tier quota that refused this create, if any (block-with-nudge): when set
  // the dialog stays open with the typed values intact and shows the upgrade nudge
  // instead of the generic error. Only a create can be quota-refused.
  const [quota, setQuota] = useState<QuotaErrorDetail | null>(null);
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
    setQuota(null);
    setBusy(true);
    let ok: boolean;
    // The typed error from a refused create, to distinguish a quota block from a
    // generic failure once we leave the create branch.
    let createError: MutateResult['error'];
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
      createError = created.error;
    }
    setBusy(false);
    // On success close; otherwise keep the dialog (and the typed values) open and
    // surface the reason — never silently discard input ([PRIV]). A tier quota gets
    // the informational upgrade nudge; anything else, the generic error.
    if (ok) {
      onClose();
      return;
    }
    const q = quotaDetailOf(createError);
    if (q) setQuota(q);
    else setFailed(true);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      ariaLabel={editing ? t('sidebar.editTitle') : t('sidebar.createTitle')}
      contentTestId="sk-folder-dialog"
    >
      <form class="sk-dialog__body sk-folder-form" onSubmit={submit}>
        <div class="sk-dialog__header">
          <h2 class="sk-dialog__title">{editing ? t('sidebar.editTitle') : t('sidebar.createTitle')}</h2>
          <button class="sk-icon-btn" type="button" data-testid="sk-folder-close" aria-label={t('sidebar.close')} onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>

        <label class="sk-field">
          <span class="sk-sidebar__heading">{t('sidebar.name')}</span>
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
              aria-label={t('sidebar.name')}
              placeholder={t('sidebar.namePlaceholder')}
              value={name}
              autoFocus
              onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
            />
          </span>
        </label>

        <fieldset class="sk-field sk-fieldset">
          <legend class="sk-sidebar__heading">{t('sidebar.color')}</legend>
          <div class="sk-swatches" data-testid="sk-folder-colors">
            <button
              type="button"
              class={`sk-swatch sk-swatch--clear${color ? '' : ' sk-swatch--selected'}`}
              aria-label={t('sidebar.clearColor')}
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
          <legend class="sk-sidebar__heading">{t('sidebar.icon')}</legend>
          <div class="sk-icon-grid" data-testid="sk-folder-icons">
            <button
              type="button"
              class={`sk-icon-option sk-icon-option--clear${icon ? '' : ' sk-icon-option--selected'}`}
              aria-label={t('sidebar.clearIcon')}
              aria-pressed={!icon}
              onClick={() => setIcon('')}
            >
              <CloseIcon size={14} />
            </button>
            <button
              type="button"
              class={`sk-icon-option${icon === FOLDER_ICON_SENTINEL ? ' sk-icon-option--selected' : ''}`}
              data-testid="sk-folder-icon-default"
              aria-label={t('sidebar.folderIcon')}
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
          <span class="sk-sidebar__heading">{t('sidebar.parentFolder')}</span>
          <select
            class="sk-select"
            data-testid="sk-folder-parent"
            aria-label={t('sidebar.parentFolder')}
            value={parentId ?? ''}
            onChange={(e) => setParentId((e.currentTarget as HTMLSelectElement).value || null)}
          >
            <option value="">{t('sidebar.topLevel')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {`${'  '.repeat(o.depth)}${o.name}`}
              </option>
            ))}
          </select>
        </label>

        {failed && (
          <p class="sk-dialog__error" data-testid="sk-folder-error" role="alert">{t('sidebar.createError')}</p>
        )}
        {quota && <UpgradeNudge resource="folders" limit={quota.limit} testId="sk-folder-quota-nudge" />}
        <div class="sk-dialog__actions">
          <button class="sk-menu__item" type="button" onClick={onClose}>{t('sidebar.cancel')}</button>
          <button class="sk-btn sk-btn--icon" type="submit" data-testid="sk-folder-submit" disabled={busy} aria-busy={busy}>
            <CheckIcon size={16} />
            {editing ? t('sidebar.save') : t('sidebar.create')}
            <EnterHint />
          </button>
        </div>
      </form>
    </Dialog>
  );
}

