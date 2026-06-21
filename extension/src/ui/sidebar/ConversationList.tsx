// The inline conversation list (conversation-filing, path A): the conversations
// belonging to one folder (or the "Unfiled" node), rendered *inside* the folder
// tree when that node is expanded — not a standalone "Conversations" section.
// Each row leads with its platform brand logo (the row's at-a-glance identity).
// Activating a row opens that conversation via platform-aware routing (same tab
// when it belongs to the active-tab platform, else a side-by-side window) — the
// row's title is a button (the keyboard path). Each row carries an actions menu
// opened from a `⋯` button (revealed on row hover / keyboard focus) mirroring the
// folder menu in `Sidebar.tsx`: Move to… (the existing filing picker), Pin to top,
// and Archive.
// Pinned conversations sort to the top; archived ones are hidden. A row can also be
// dragged onto a folder node (a pointer enhancement — never the only route,
// honoring the PREACT "everything keyboard-operable" rule). The conversation open
// in the active tab is highlighted (`aria-current`). It is a pure view: rows come
// from the caller (scoped by folder) and every action dispatches a worker mutation.
// Tokens only, no hard-coded strings.

import { useRef, useState } from 'preact/hooks';
import type { ActiveConversation, ConversationIndex, PlatformId } from '../../shared/types';
import { conversationId, type FolderTreeSnapshot, type MutationOp } from '../../shared/workspace';
import { MoreIcon, PinIcon } from '../components/Icon';
import { PlatformLogo } from '../components/PlatformLogo';
import { useMenu, mergeProps, getNodeRoot } from '../primitives';
import { MoveToFolderPicker } from './MoveToFolderPicker';
import { openConversation } from './openConversation';
import { DRAG_MIME, type DragPayload } from './drag';
import { formatRelativeTime } from './relativeTime';
import type { MutateResult } from './useWorkspace';

// Cap the rendered rows so a folder with hundreds of ingested conversations does
// not render them all at once; the cap is surfaced (never a silent truncation).
// Virtualization is a marked follow-up (with the deferred detail view).
const RENDER_CAP = 50;

const STR = {
  emptyFolder: 'Nothing here yet',
  emptyUnfiled: 'No uncategorized conversations',
  open: 'Open conversation',
  menuTrigger: 'Conversation actions',
  move: 'Move to folder',
  pin: 'Pin to top',
  unpin: 'Unpin',
  pinnedBadge: 'Pinned',
  archiveAction: 'Archive',
  unarchive: 'Unarchive',
  emptyArchived: 'No archived conversations',
  capNote: 'Showing the most recent',
  of: 'of',
  // Relative-time units for the row's timestamp (kept terse to fit the meta line).
  justNow: 'just now',
  minute: 'm',
  hour: 'h',
  day: 'd',
  week: 'w',
  ago: 'ago',
} as const;

// Context-menu action values (the menu item `value`s the Zag menu reports back).
type ConvMenuAction = 'move' | 'pin' | 'archive';

/** Hide archived conversations from the main list (they remain in the store). */
export function nonArchivedConversations(convs: ConversationIndex[]): ConversationIndex[] {
  return convs.filter((c) => !c.archived);
}

/** Pinned first, then most-recent-first within each group. Pure + stable to test. */
export function sortConversations(convs: ConversationIndex[]): ConversationIndex[] {
  return [...convs].sort((a, b) => {
    const byPin = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    return byPin !== 0 ? byPin : b.updatedAt - a.updatedAt;
  });
}

/** Keep only archived conversations (the dedicated Archived section's contents). */
export function archivedConversations(convs: ConversationIndex[]): ConversationIndex[] {
  return convs.filter((c) => c.archived);
}

/** What this list is the contents of — drives the empty-state copy and whether the
 *  list shows the live (`folder`/`unfiled`) set or the archived set. */
export type ConversationListContext =
  | { kind: 'folder'; name: string }
  | { kind: 'unfiled' }
  | { kind: 'archived' };

export interface ConversationListProps {
  /** Conversations already scoped to this node (one folder, or the unfiled set). */
  conversations: ConversationIndex[];
  /** The conversation open in the active tab, for highlighting (or null). */
  active: ActiveConversation | null;
  tree: FolderTreeSnapshot;
  mutate: (op: MutationOp) => Promise<MutateResult>;
  context: ConversationListContext;
  /** The panel's active-tab platform — drives open routing (same tab vs side by
   *  side) in the default `onOpen`. */
  activePlatform?: PlatformId;
  /** Open a conversation. Defaults to the platform-aware routing helper; injectable
   *  for tests. */
  onOpen?: (conv: ConversationIndex) => void;
}

export function ConversationList({
  conversations,
  active,
  tree,
  mutate,
  context,
  activePlatform,
  onOpen = (c) => void openConversation(c, activePlatform),
}: ConversationListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  // Which conversation the open context menu acts on (the row last triggered).
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);

  // The Archived section lists archived rows (recent-first); every other context
  // hides archived, then sorts pinned-to-top / recent-within-group. Cap the result.
  const ordered =
    context.kind === 'archived'
      ? sortConversations(archivedConversations(conversations))
      : sortConversations(nonArchivedConversations(conversations));
  const rows = ordered.slice(0, RENDER_CAP);
  const activeId = active ? conversationId(active.platform, active.nativeId) : null;
  const picking = pickingId ? conversations.find((c) => c.id === pickingId) : undefined;
  const menuTarget = menuTargetId ? conversations.find((c) => c.id === menuTargetId) : undefined;

  // Mouse selection routes through each item's own `onClick`; keyboard ENTER routes
  // through Zag's `onSelect`. `actedRef` dedupes the case where a highlighted mouse
  // click fires both within one tick (mirrors the folder menu in Sidebar.tsx).
  const actedRef = useRef<string | null>(null);
  const performMenuAction = (value: ConvMenuAction) => {
    if (actedRef.current === value) return;
    actedRef.current = value;
    setTimeout(() => {
      if (actedRef.current === value) actedRef.current = null;
    }, 0);

    const conv = menuTargetId ? conversations.find((c) => c.id === menuTargetId) : undefined;
    if (!conv) return;
    if (value === 'move') {
      setPickingId(conv.id);
    } else if (value === 'pin') {
      void mutate({ op: 'conversation.pin', conversationId: conv.id, pinned: !conv.pinned });
    } else if (value === 'archive') {
      void mutate({ op: 'conversation.archive', conversationId: conv.id, archived: !conv.archived });
    }
  };

  // One menu machine for this list; each row's `⋯` button is the trigger (click +
  // keyboard). Zag owns positioning, roving focus, dismissal, ARIA, and focus
  // restoration.
  const menu = useMenu({
    getRootNode: () => getNodeRoot(rootRef.current),
    onSelect: (value) => performMenuAction(value as ConvMenuAction),
  });

  // A menu item: Zag's accessible item props + our explicit click action.
  const itemProps = (value: ConvMenuAction) =>
    mergeProps(menu.getItemProps({ value }), { onClick: () => performMenuAction(value) });

  // A single render-time clock so every row's relative timestamp is consistent.
  const now = Date.now();

  const renderRow = (c: ConversationIndex) => {
    const isActive = c.id === activeId;
    const when = formatRelativeTime(c.updatedAt, now, STR);
    return (
      <li
        key={c.id}
        class={`sk-conv-row${isActive ? ' sk-conv-row--active' : ''}`}
        data-testid="sk-conv-row"
        data-conversation-id={c.id}
        aria-current={isActive ? 'true' : undefined}
        draggable
        onDragStart={(e) =>
          (e as DragEvent).dataTransfer?.setData(
            DRAG_MIME,
            JSON.stringify({ type: 'conversation', id: c.id } satisfies DragPayload),
          )
        }
      >
        <button
          class="sk-conv-row__main"
          type="button"
          data-testid="sk-conv-open"
          aria-label={STR.open}
          title={c.title}
          onClick={() => onOpen(c)}
        >
          <span class="sk-conv-row__logo" data-testid="sk-conv-logo" aria-hidden="true">
            <PlatformLogo platform={c.platform} size={16} />
          </span>
          <span class="sk-conv-row__text">
            <span class="sk-conv-row__title" data-testid="sk-conv-title">{c.title}</span>
            <span class="sk-conv-row__meta">
              <time
                class="sk-conv-row__time"
                data-testid="sk-conv-time"
                dateTime={new Date(c.updatedAt).toISOString()}
              >
                {when}
              </time>
            </span>
          </span>
        </button>
        {c.pinned && (
          <span
            class="sk-conv-row__pin"
            data-testid="sk-conv-pinned"
            aria-label={STR.pinnedBadge}
            title={STR.pinnedBadge}
          >
            <PinIcon size={12} />
          </span>
        )}
        <button
          class={`sk-icon-btn sk-row-menu${menu.open && menuTargetId === c.id ? ' sk-row-menu--open' : ''}`}
          data-testid="sk-conv-menu"
          aria-label={STR.menuTrigger}
          title={STR.menuTrigger}
          {...mergeProps(menu.getTriggerProps({ value: c.id }), {
            onClick: () => setMenuTargetId(c.id),
          })}
        >
          <MoreIcon size={16} />
        </button>
      </li>
    );
  };

  return (
    <div ref={rootRef} class="sk-conv-list" data-testid="sk-conversation-list">
      {rows.length > 0 ? (
        <ul class="sk-conv-list__items">{rows.map(renderRow)}</ul>
      ) : (
        <p class="sk-empty__body" data-testid="sk-conv-empty">
          {context.kind === 'unfiled'
            ? STR.emptyUnfiled
            : context.kind === 'archived'
              ? STR.emptyArchived
              : STR.emptyFolder}
        </p>
      )}

      {ordered.length > RENDER_CAP && (
        <p class="sk-conv-list__cap" data-testid="sk-conv-cap">
          {`${STR.capNote} ${RENDER_CAP} ${STR.of} ${ordered.length}`}
        </p>
      )}

      {menu.open && menuTarget && (
        <div class="sk-menu__positioner" {...menu.getPositionerProps()}>
          <div class="sk-menu" data-testid="sk-conv-context-menu" {...menu.getContentProps()}>
            <button class="sk-menu__item" data-testid="sk-conv-menu-move" {...itemProps('move')}>
              {STR.move}
            </button>
            <button class="sk-menu__item" data-testid="sk-conv-menu-pin" {...itemProps('pin')}>
              {menuTarget.pinned ? STR.unpin : STR.pin}
            </button>
            <button class="sk-menu__item" data-testid="sk-conv-menu-archive" {...itemProps('archive')}>
              {menuTarget.archived ? STR.unarchive : STR.archiveAction}
            </button>
          </div>
        </div>
      )}

      {picking && (
        <MoveToFolderPicker
          conversation={{ id: picking.id, title: picking.title, folderId: picking.folderId }}
          tree={tree}
          onSubmit={mutate}
          onClose={() => setPickingId(null)}
        />
      )}
    </div>
  );
}
