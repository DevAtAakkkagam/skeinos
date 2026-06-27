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

import { Fragment } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { ActiveConversation, ConversationIndex, PlatformId, Tag } from '../../shared/types';
import { conversationId, type FolderTreeSnapshot, type MutationOp } from '../../shared/workspace';
import { MoreIcon, PinIcon } from '../components/Icon';
import { PlatformLogo } from '../components/PlatformLogo';
import { useMenu, mergeProps, getNodeRoot, PopoverScrim } from '../primitives';
import { TagPicker } from '../tags/TagPicker';
import { MoveToFolderPicker } from './MoveToFolderPicker';
import { openConversation } from './openConversation';
import { DRAG_MIME, type DragPayload } from './drag';
import { formatRelativeTime } from './relativeTime';
import type { MutateResult } from './useWorkspace';
import { useT, activeLocale } from '../../core/i18n';
import type { MessageKey } from '../../core/i18n/catalog';

// Render rows a page at a time so a folder with hundreds of ingested conversations
// does not mount them all at once. The first page shows `PAGE_SIZE`; a "Show more"
// control reveals the next page on demand (never a silent truncation, and never a
// dead-end caption). Full virtualization remains a marked follow-up.
const PAGE_SIZE = 50;

// Below this many live rows the list stays flat: date overlines would be noise on a
// short folder. Above it, rows group under relative-date headers so a long list is
// scannable at a glance instead of an undifferentiated wall.
const GROUP_MIN = 12;

const DAY_MS = 86_400_000;

/** Relative-date bucket for one conversation, by local calendar day. Pinned rows are
 *  bucketed by the caller (they lead, regardless of age). Pure + `now`-injectable. */
export type ConvGroupKey = 'pinned' | 'today' | 'yesterday' | 'week' | 'older';
const GROUP_ORDER: ConvGroupKey[] = ['pinned', 'today', 'yesterday', 'week', 'older'];
const GROUP_LABEL_KEY: Record<ConvGroupKey, MessageKey> = {
  pinned: 'conv.groupPinned',
  today: 'conv.groupToday',
  yesterday: 'conv.groupYesterday',
  week: 'conv.groupThisWeek',
  older: 'conv.groupOlder',
};

export function dateBucket(updatedAt: number, now: number): Exclude<ConvGroupKey, 'pinned'> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  if (updatedAt >= today) return 'today';
  if (updatedAt >= today - DAY_MS) return 'yesterday';
  if (updatedAt >= today - 7 * DAY_MS) return 'week';
  return 'older';
}

export interface ConvGroup {
  key: ConvGroupKey;
  items: ConversationIndex[];
}

/** Partition already-sorted rows (pinned-first, recent-within) into ordered relative-
 *  date groups. Order is fixed (pinned → today → … → older); empty groups are dropped,
 *  and within each group the caller's order is preserved. Pure + stable to test. */
export function groupConversations(rows: ConversationIndex[], now: number): ConvGroup[] {
  const buckets = new Map<ConvGroupKey, ConversationIndex[]>();
  for (const c of rows) {
    const key: ConvGroupKey = c.pinned ? 'pinned' : dateBucket(c.updatedAt, now);
    const bucket = buckets.get(key) ?? buckets.set(key, []).get(key)!;
    bucket.push(c);
  }
  return GROUP_ORDER.filter((k) => buckets.has(k)).map((k) => ({ key: k, items: buckets.get(k)! }));
}

// Context-menu action values (the menu item `value`s the Zag menu reports back).
type ConvMenuAction = 'move' | 'tags' | 'pin' | 'archive';

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
  /** The tag library, for the per-row tag-assignment picker. Defaults to none. */
  tags?: Tag[];
  context: ConversationListContext;
  /** Suppress the "nothing here yet" empty caption when the list is empty — set for a
   *  folder that still has subfolders, so the node never reads as bare under them. */
  suppressEmpty?: boolean;
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
  tags = [],
  context,
  suppressEmpty = false,
  activePlatform,
  onOpen = (c) => void openConversation(c, activePlatform),
}: ConversationListProps) {
  const t = useT();
  const locale = activeLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  // How many rows are currently revealed; grows a page at a time via "Show more".
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pickingId, setPickingId] = useState<string | null>(null);
  // Which conversation the tag-assignment picker is open for, plus the row element it
  // anchors to (the `⋯` → Tags… target). Anchored popover, not a centered modal.
  const [tagging, setTagging] = useState<{ id: string; anchor: HTMLElement | null } | null>(null);
  const byTagId = new Map(tags.map((t) => [t.id, t]));
  // Which conversation the open context menu acts on (the row last triggered).
  const [menuTargetId, setMenuTargetId] = useState<string | null>(null);

  // The Archived section lists archived rows (recent-first); every other context
  // hides archived, then sorts pinned-to-top / recent-within-group. Cap the result.
  const ordered =
    context.kind === 'archived'
      ? sortConversations(archivedConversations(conversations))
      : sortConversations(nonArchivedConversations(conversations));
  const rows = ordered.slice(0, limit);
  const hidden = ordered.length - rows.length;
  const activeId = active ? conversationId(active.platform, active.nativeId) : null;
  const picking = pickingId ? conversations.find((c) => c.id === pickingId) : undefined;
  const taggingConv = tagging ? conversations.find((c) => c.id === tagging.id) : undefined;
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
    } else if (value === 'tags') {
      // Anchor the picker to this row's ⋯ trigger (the menu that just closed).
      const anchor = rootRef.current?.querySelector<HTMLElement>(
        `[data-conversation-id="${conv.id}"] [data-testid=sk-conv-menu]`,
      );
      setTagging({ id: conv.id, anchor: anchor ?? null });
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

  // Group rows under relative-date overlines once a list is long enough to warrant the
  // structure (short folders stay flat). Archived stays flat — the dock is its own band.
  const grouped =
    context.kind !== 'archived' && ordered.length > GROUP_MIN ? groupConversations(rows, now) : null;

  // Mini tag chips on a row (full labels), resolving ids → live tags and capping the
  // count so a heavily-tagged row never overruns the narrow panel (overflow as "+k").
  // Two is the most that fits one line beside the time + ⋯ in a ~360px panel.
  const ROW_TAG_CAP = 2;
  const renderRowTags = (c: ConversationIndex) => {
    const resolved = c.tags.map((id) => byTagId.get(id)).filter((t): t is Tag => !!t);
    if (resolved.length === 0) return null;
    const head = resolved.slice(0, ROW_TAG_CAP);
    const extra = resolved.length - head.length;
    return (
      <span class="sk-conv-row__tags" data-testid="sk-conv-row-tags" aria-label={t('conv.tagsLabel')}>
        {head.map((t) => (
          <span key={t.id} class="sk-conv-tag" data-testid={`sk-conv-tag-${t.id}`} title={t.label}>
            <span class="sk-tag-dot" aria-hidden="true" style={t.color ? { background: t.color } : undefined} />
            {t.label}
          </span>
        ))}
        {extra > 0 && <span class="sk-conv-tag sk-conv-tag--more">{t('conv.moreTags', { count: extra })}</span>}
      </span>
    );
  };

  const renderRow = (c: ConversationIndex) => {
    const isActive = c.id === activeId;
    const when = formatRelativeTime(c.updatedAt, now, locale, t('time.justNow'));
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
          aria-label={t('conv.open')}
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
              {renderRowTags(c)}
            </span>
          </span>
        </button>
        {c.pinned && (
          <span
            class="sk-conv-row__pin"
            data-testid="sk-conv-pinned"
            aria-label={t('conv.pinnedBadge')}
            title={t('conv.pinnedBadge')}
          >
            <PinIcon size={12} />
          </span>
        )}
        <button
          class={`sk-icon-btn sk-row-menu${menu.open && menuTargetId === c.id ? ' sk-row-menu--open' : ''}`}
          data-testid="sk-conv-menu"
          aria-label={t('conv.menuTrigger')}
          title={t('conv.menuTrigger')}
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
        <ul class="sk-conv-list__items">
          {grouped
            ? grouped.map((g) => (
                <Fragment key={g.key}>
                  <li
                    class="sk-conv-group-label"
                    role="presentation"
                    data-testid={`sk-conv-group-${g.key}`}
                  >
                    {t(GROUP_LABEL_KEY[g.key])}
                  </li>
                  {g.items.map(renderRow)}
                </Fragment>
              ))
            : rows.map(renderRow)}
        </ul>
      ) : suppressEmpty ? null : (
        <p class="sk-empty__body sk-conv-list__empty" data-testid="sk-conv-empty">
          {context.kind === 'unfiled'
            ? t('conv.emptyUnfiled')
            : context.kind === 'archived'
              ? t('conv.emptyArchived')
              : t('conv.emptyFolder')}
        </p>
      )}

      {hidden > 0 && (
        <button
          type="button"
          class="sk-conv-more"
          data-testid="sk-conv-more"
          onClick={() => setLimit((n) => n + PAGE_SIZE)}
        >
          {t('conv.showMore', { count: hidden })}
        </button>
      )}

      {menu.open && menuTarget && (
        <PopoverScrim variant="menu" onDismiss={() => menu.setOpen(false)} testid="sk-conv-menu-scrim" />
      )}

      {menu.open && menuTarget && (
        <div class="sk-menu__positioner" {...menu.getPositionerProps()}>
          <div class="sk-menu" data-testid="sk-conv-context-menu" {...menu.getContentProps()}>
            <button class="sk-menu__item" data-testid="sk-conv-menu-move" {...itemProps('move')}>
              {t('conv.move')}
            </button>
            <button class="sk-menu__item" data-testid="sk-conv-menu-pin" {...itemProps('pin')}>
              {menuTarget.pinned ? t('conv.unpin') : t('conv.pin')}
            </button>
            <button class="sk-menu__item" data-testid="sk-conv-menu-archive" {...itemProps('archive')}>
              {menuTarget.archived ? t('conv.unarchive') : t('conv.archiveAction')}
            </button>
            <button class="sk-menu__item" data-testid="sk-conv-menu-tags" {...itemProps('tags')}>
              {t('conv.tags')}
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

      {tagging && taggingConv && (
        <TagPicker
          anchor={tagging.anchor}
          label={t('conv.tagsLabel')}
          tags={tags}
          selected={taggingConv.tags}
          mutate={mutate}
          onToggle={(tagId, next) =>
            void mutate({ op: 'conversation.tag', id: taggingConv.id, tagId, assigned: next })
          }
          onClose={() => setTagging(null)}
        />
      )}
    </div>
  );
}
