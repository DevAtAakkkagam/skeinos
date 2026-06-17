// The inline conversation list (conversation-filing, path A): the conversations
// belonging to one folder (or the "Unfiled" node), rendered *inside* the folder
// tree when that node is expanded — not a standalone "Conversations" section.
// Activating a row opens that conversation in the active tab (the row's title is a
// button — the keyboard path). Each row carries a context menu (right-click + a
// keyboard-reachable `⋯` trigger) mirroring the folder menu in `Sidebar.tsx`:
// Move to… (the existing filing picker), Pin to top, Archive, and an inline colour
// swatch row. Pinned conversations sort to the top; archived ones are hidden. A row
// can also be dragged onto a folder node (a pointer enhancement — never the only
// route, honoring the PREACT "everything keyboard-operable" rule). The conversation
// open in the active tab is highlighted (`aria-current`). It is a pure view: rows
// come from the caller (scoped by folder) and every action dispatches a worker
// mutation. Tokens only, no hard-coded strings.

import { useRef, useState } from 'preact/hooks';
import type { ActiveConversation, ConversationIndex } from '../../shared/types';
import { conversationId, type FolderTreeSnapshot, type MutationOp } from '../../shared/workspace';
import { MoreIcon } from '../components/Icon';
import { useMenu, mergeProps, getNodeRoot } from '../primitives';
import { FOLDER_COLORS } from './palette';
import { MoveToFolderPicker } from './MoveToFolderPicker';
import { openConversation } from './openConversation';
import { DRAG_MIME, type DragPayload } from './drag';
import type { MutateResult } from './useWorkspace';

// Cap the rendered rows so a folder with hundreds of ingested conversations does
// not render them all at once; the cap is surfaced (never a silent truncation).
// Virtualization is a marked follow-up (with the deferred detail view).
const RENDER_CAP = 50;

const STR = {
  emptyFolder: 'Nothing here yet',
  emptyUnfiled: 'No unfiled conversations',
  open: 'Open conversation',
  menuTrigger: 'Conversation actions',
  move: 'Move to folder',
  pin: 'Pin to top',
  unpin: 'Unpin',
  archiveAction: 'Archive',
  unarchive: 'Unarchive',
  color: 'Colour',
  clearColor: 'No colour',
  capNote: 'Showing the most recent',
  of: 'of',
} as const;

// Context-menu action values (the menu item `value`s the Zag menu reports back).
// Colour choices ride the same channel as `color:<hex>` / `color:clear`.
const COLOR_PREFIX = 'color:';
type ConvMenuAction = 'move' | 'pin' | 'archive' | `${typeof COLOR_PREFIX}${string}`;

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

/** What this list is the contents of — drives the empty-state copy. */
export type ConversationListContext = { kind: 'folder'; name: string } | { kind: 'unfiled' };

export interface ConversationListProps {
  /** Conversations already scoped to this node (one folder, or the unfiled set). */
  conversations: ConversationIndex[];
  /** The conversation open in the active tab, for highlighting (or null). */
  active: ActiveConversation | null;
  tree: FolderTreeSnapshot;
  mutate: (op: MutationOp) => Promise<MutateResult>;
  context: ConversationListContext;
  /** Open a conversation in the active tab. Defaults to the live tab-navigation
   *  helper; injectable for tests. */
  onOpen?: (conv: ConversationIndex) => void;
}

export function ConversationList({
  conversations,
  active,
  tree,
  mutate,
  context,
  onOpen = (c) => void openConversation(c),
}: ConversationListProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  // Which conversation the open context menu acts on (the row last triggered).
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);

  // Hide archived, then pinned-to-top / recent-within-group; cap the result.
  const ordered = sortConversations(nonArchivedConversations(conversations));
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
    } else if (value.startsWith(COLOR_PREFIX)) {
      const picked = value.slice(COLOR_PREFIX.length);
      void mutate({
        op: 'conversation.recolor',
        conversationId: conv.id,
        color: picked === 'clear' ? undefined : picked,
      });
    }
  };

  // One menu machine for this list; each row is both a context trigger (right-click)
  // and a keyboard/click trigger (the `⋯` button). Zag owns positioning, roving
  // focus, dismissal, ARIA, and focus restoration.
  const menu = useMenu({
    getRootNode: () => getNodeRoot(rootRef.current),
    onSelect: (value) => performMenuAction(value as ConvMenuAction),
  });

  // A menu item: Zag's accessible item props + our explicit click action.
  const itemProps = (value: ConvMenuAction) =>
    mergeProps(menu.getItemProps({ value }), { onClick: () => performMenuAction(value) });

  const renderRow = (c: ConversationIndex) => {
    const isActive = c.id === activeId;
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
        {...mergeProps(menu.getContextTriggerProps({ value: c.id }), {
          onContextMenu: () => setMenuTargetId(c.id),
        })}
      >
        <button
          class="sk-conv-row__main"
          type="button"
          data-testid="sk-conv-open"
          aria-label={STR.open}
          title={c.title}
          onClick={() => onOpen(c)}
        >
          {c.color ? (
            <span class="sk-conv-row__dot" aria-hidden="true" style={{ background: c.color }} />
          ) : null}
          <span class="sk-conv-row__title" data-testid="sk-conv-title">{c.title}</span>
        </button>
        <button
          class="sk-icon-btn"
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
          {context.kind === 'unfiled' ? STR.emptyUnfiled : STR.emptyFolder}
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
            <div class="sk-menu__swatches" role="group" aria-label={STR.color} data-testid="sk-conv-colors">
              <button
                {...itemProps('color:clear')}
                class={`sk-swatch sk-swatch--clear${menuTarget.color ? '' : ' sk-swatch--selected'}`}
                data-testid="sk-conv-color-clear"
                aria-label={STR.clearColor}
              />
              {FOLDER_COLORS.map((col) => (
                <button
                  {...itemProps(`${COLOR_PREFIX}${col}`)}
                  key={col}
                  class={`sk-swatch${menuTarget.color === col ? ' sk-swatch--selected' : ''}`}
                  style={{ background: col }}
                  data-testid="sk-conv-color"
                  aria-label={col}
                />
              ))}
            </div>
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
