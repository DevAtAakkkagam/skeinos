// The search overlay (design D-7): a command-palette over `search.run`. A pure
// view over worker state — it issues queries through {@link useSearch} and opens
// conversations through the shared `openConversation` router. Styled only from
// `--sk-*` tokens, no host classes, no hard-coded user-facing strings (all in
// STR), and fully keyboard-operable + ARIA-labelled (a combobox driving a listbox
// via `aria-activedescendant`). Each result row shows its platform's brand logo
// from the platform-branding registry (the single source of truth, design D1).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { CloseIcon, FolderIcon, SearchIcon } from '../components/Icon';
import { PlatformLogo } from '../components/PlatformLogo';
import { openConversation } from '../sidebar/openConversation';
import { formatRelativeTime } from '../sidebar/relativeTime';
import type { Folder, PlatformId, SearchResult, SnippetSegment } from '../../shared/types';
import { PLATFORM_LABELS } from '../../shared/branding';
import type { PromptSearchResult } from '../../shared/prompts';
import { useSearch, type SearchView } from './useSearch';
import { usePromptSearch, type PromptSearchView } from './usePromptSearch';

const STR = {
  title: 'Search conversations',
  inputLabel: 'Search query',
  placeholder: 'Search everything…',
  close: 'Close search',
  results: 'Search results',
  filters: 'Search filters',
  platform: 'Platform',
  platformAll: 'All platforms',
  folder: 'Folder',
  folderAll: 'All folders',
  folderUnfiled: 'Uncategorized',
  dateFrom: 'Updated after',
  dateTo: 'Updated before',
  archived: 'Include archived',
  tag: 'Tag',
  tagComingSoon: 'Tag filter — coming soon',
  empty: 'No conversations or prompts match your search.',
  idle: 'Type to search your conversations.',
  groupConversations: 'Conversations',
  groupPrompts: 'Prompts',
  searching: 'Searching…',
  error: 'Search is unavailable right now. Try again.',
  unfiled: 'Uncategorized',
  // Privacy reassurance + keyboard legend pinned to the panel foot (design D-7).
  indexedLocally: 'Indexed locally on your device',
  hintNavigate: 'navigate',
  hintOpen: 'open',
  // Relative-time units for a result's timestamp (terse, to fit the meta line).
  justNow: 'just now',
  minute: 'm',
  hour: 'h',
  day: 'd',
  week: 'w',
  ago: 'ago',
} as const;

// Sentinel for the "Unfiled" folder option (folderId === null), distinct from both
// "no folder filter" (empty string) and any real folder id (UUIDs never match this).
const UNFILED = '__unfiled__';

export interface SearchOverlayProps {
  /** The panel's active-tab platform — routes how a result opens (design D4). */
  activePlatform: PlatformId;
  /** Folders offered in the folder filter. */
  folders?: Folder[];
  /** Platforms offered in the platform filter (those present in the workspace). */
  platforms?: PlatformId[];
  /** Close the overlay (Esc / backdrop / close button / after opening a result). */
  onClose: () => void;
  /** Navigate to a prompt result in the Prompts tab (design D-E). Wired by the shell
   *  to the slice-3 `openPrompt` seam; the overlay stays presentation-only. */
  onOpenPrompt?: (id: string) => void;
  /** Injectable search view for tests; production uses the live worker-backed hook. */
  view?: SearchView;
  /** Injectable prompt-search view for tests; production uses {@link usePromptSearch}. */
  promptView?: PromptSearchView;
}

/** Render a highlighted snippet: matched token runs become `<mark>`, the rest plain
 *  text. Structured segments (never raw HTML) keep this XSS-safe by construction. */
function Snippet({ segments }: { segments: SnippetSegment[] }): JSX.Element {
  return (
    <span class="sk-sr__snippet">
      {segments.map((seg, i) => (
        <span key={i}>
          {i > 0 ? ' ' : ''}
          {seg.match ? <mark class="sk-sr__hit">{seg.text}</mark> : seg.text}
        </span>
      ))}
    </span>
  );
}

export function SearchOverlay({
  activePlatform,
  folders = [],
  platforms = [],
  onClose,
  onOpenPrompt,
  view,
  promptView,
}: SearchOverlayProps) {
  const live = useSearch();
  const search = view ?? live;
  const { queryText, setQueryText, filters, setFilters, results, status } = search;

  // The prompt half of the overlay (design D-D): a second source over the same query
  // text, rendered as its own group. Tests inject `promptView`; production uses the
  // live hook (called unconditionally so hook order is stable).
  const livePrompts = usePromptSearch(queryText);
  const prompts = promptView ?? livePrompts;
  const promptResults = prompts.results;

  // The unified, flattened view-model: conversations then prompts. The active index
  // spans both arrays so ↑/↓ crosses the group boundary; an index ≥ the conversation
  // count maps into the prompt group.
  const convCount = results.length;
  const total = convCount + promptResults.length;

  // Resolve a result's folder to its display path ("Parent / Child"), walking up
  // the parent chain. Built once per folder set; an unfiled result has no chip.
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const folderPath = (folderId: string | null): string | null => {
    if (folderId === null) return null;
    const names: string[] = [];
    let node = folderById.get(folderId);
    // Bound the walk by the folder count so a malformed parent cycle can't spin.
    for (let i = 0; node && i <= folderById.size; i++) {
      names.unshift(node.name);
      node = node.parentId ? folderById.get(node.parentId) : undefined;
    }
    return names.length > 0 ? names.join(' / ') : null;
  };

  // A single render-time clock so every row's relative timestamp is consistent.
  const now = Date.now();

  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on open so the overlay is usable from the keyboard immediately.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset the active row to the top on a new keystroke (a new search) — see the
  // input's `onInput`. Done there, not in a mount-time effect, so the reset can never
  // race a keyboard navigation that happens before the first effect flush. Clamping
  // (below) keeps the index in range when a live re-query shrinks the result set,
  // without yanking the cursor back to the top on every `state.changed`.
  const onQueryInput = (value: string): void => {
    setActive(0);
    setQueryText(value);
  };

  // Local date-string state for the two date inputs, mapped into epoch filters.
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Keep the active row in range as result sets change between renders, without
  // resetting it to the top (that is the query-text effect's job).
  const activeClamped = total > 0 ? Math.min(active, total - 1) : 0;

  const openConversationResult = (result: SearchResult): void => {
    void openConversation({ platform: result.platform, nativeId: result.nativeId }, activePlatform);
    onClose();
  };

  const openPromptResult = (result: PromptSearchResult): void => {
    onOpenPrompt?.(result.id);
    onClose();
  };

  // Open whatever the flattened active index points at: a conversation routes through
  // `openConversation` (unchanged); a prompt navigates via `onOpenPrompt`.
  const openAt = (index: number): void => {
    if (index < convCount) {
      const hit = results[index];
      if (hit) openConversationResult(hit);
    } else {
      const hit = promptResults[index - convCount];
      if (hit) openPromptResult(hit);
    }
  };

  const onKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, total - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openAt(activeClamped);
    }
  };

  const setPlatform = (value: string): void =>
    setFilters({ ...filters, platform: value ? (value as PlatformId) : undefined });
  const setFolder = (value: string): void =>
    setFilters({
      ...filters,
      folderId: value === '' ? undefined : value === UNFILED ? null : value,
    });
  const setArchived = (checked: boolean): void => setFilters({ ...filters, archived: checked });
  const onDateFrom = (value: string): void => {
    setDateFrom(value);
    setFilters({ ...filters, updatedAfter: value ? Date.parse(value) : undefined });
  };
  const onDateTo = (value: string): void => {
    setDateTo(value);
    // End-of-day so the upper bound is inclusive of the chosen day.
    setFilters({ ...filters, updatedBefore: value ? Date.parse(value) + 86_399_999 : undefined });
  };

  const folderValue = useMemo(() => {
    if (filters.folderId === undefined) return '';
    return filters.folderId === null ? UNFILED : filters.folderId;
  }, [filters.folderId]);

  const hasQuery = queryText.trim().length > 0;
  const activeId = total > 0 ? `sk-sr-${activeClamped}` : undefined;
  // Combined overlay state machine over both sources (design D-F): "searching" while
  // either source is in flight and nothing has landed; "error" only when both failed;
  // "empty" only when both returned nothing for a non-empty query.
  const searching = (status === 'searching' || prompts.status === 'searching') && total === 0;
  const errored = status === 'error' && prompts.status === 'error';

  return (
    <div
      class="sk-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={STR.title}
      data-testid="sk-search-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="sk-search-panel">
        <div class="sk-search-panel__head">
          <span class="sk-search-panel__icon" aria-hidden="true">
            <SearchIcon size={16} />
          </span>
          <input
            ref={inputRef}
            type="text"
            class="sk-search-panel__input"
            role="combobox"
            aria-expanded={total > 0}
            aria-controls="sk-search-results"
            aria-activedescendant={activeId}
            aria-label={STR.inputLabel}
            placeholder={STR.placeholder}
            value={queryText}
            data-testid="sk-search-input"
            onInput={(e) => onQueryInput((e.target as HTMLInputElement).value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            class="sk-icon-btn"
            aria-label={STR.close}
            title={STR.close}
            data-testid="sk-search-close"
            onClick={onClose}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div class="sk-search-filters" role="group" aria-label={STR.filters}>
          <label class="sk-search-filter">
            <span class="sk-search-filter__label">{STR.platform}</span>
            <select
              class="sk-search-filter__control"
              data-testid="sk-filter-platform"
              value={filters.platform ?? ''}
              onChange={(e) => setPlatform((e.target as HTMLSelectElement).value)}
            >
              <option value="">{STR.platformAll}</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </label>

          <label class="sk-search-filter">
            <span class="sk-search-filter__label">{STR.folder}</span>
            <select
              class="sk-search-filter__control"
              data-testid="sk-filter-folder"
              value={folderValue}
              onChange={(e) => setFolder((e.target as HTMLSelectElement).value)}
            >
              <option value="">{STR.folderAll}</option>
              <option value={UNFILED}>{STR.folderUnfiled}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <label class="sk-search-filter">
            <span class="sk-search-filter__label">{STR.dateFrom}</span>
            <input
              type="date"
              class="sk-search-filter__control"
              data-testid="sk-filter-from"
              value={dateFrom}
              onInput={(e) => onDateFrom((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="sk-search-filter">
            <span class="sk-search-filter__label">{STR.dateTo}</span>
            <input
              type="date"
              class="sk-search-filter__control"
              data-testid="sk-filter-to"
              value={dateTo}
              onInput={(e) => onDateTo((e.target as HTMLInputElement).value)}
            />
          </label>

          <label class="sk-search-filter sk-search-filter--check">
            <input
              type="checkbox"
              data-testid="sk-filter-archived"
              checked={!!filters.archived}
              onChange={(e) => setArchived((e.target as HTMLInputElement).checked)}
            />
            <span class="sk-search-filter__label">{STR.archived}</span>
          </label>

          {/* C7 seam: the tag filter dimension exists but tag assignment ships in
              C7, so the control is present-but-inert (no hard C7 dependency). */}
          <label class="sk-search-filter sk-search-filter--check" title={STR.tagComingSoon}>
            <input type="checkbox" data-testid="sk-filter-tag" disabled aria-disabled="true" />
            <span class="sk-search-filter__label">{STR.tag}</span>
          </label>
        </div>

        <div class="sk-search-body">
          {!hasQuery ? (
            <p class="sk-search-status" data-testid="sk-search-idle">
              {STR.idle}
            </p>
          ) : searching ? (
            <p class="sk-search-status" data-testid="sk-search-searching">
              {STR.searching}
            </p>
          ) : errored ? (
            <p class="sk-search-status" data-testid="sk-search-error">
              {STR.error}
            </p>
          ) : total === 0 ? (
            <p class="sk-search-status" data-testid="sk-search-empty">
              {STR.empty}
            </p>
          ) : (
            <ul
              class="sk-search-results"
              id="sk-search-results"
              role="listbox"
              aria-label={STR.results}
            >
              {/* Conversations group (design D-F): a group with zero results renders
                  no header, so a prompt-only match shows no empty "Conversations". */}
              {convCount > 0 && (
                <li class="sk-search-group" role="presentation" data-testid="sk-search-group-header">
                  {STR.groupConversations}
                </li>
              )}
              {results.map((r, i) => (
                <li
                  key={r.docId}
                  id={`sk-sr-${i}`}
                  class={`sk-sr${i === activeClamped ? ' sk-sr--active' : ''}`}
                  role="option"
                  aria-selected={i === activeClamped}
                  data-testid="sk-search-result"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => openConversationResult(r)}
                >
                  <span class="sk-sr__logo" aria-hidden="true">
                    <PlatformLogo platform={r.platform} size={16} />
                  </span>
                  <span class="sk-sr__text">
                    <span class="sk-sr__title">{r.title}</span>
                    <Snippet segments={r.snippet} />
                    <span class="sk-sr__meta">
                      {folderPath(r.folderId) ? (
                        <span class="sk-sr__folder" data-testid="sk-sr-folder">
                          <FolderIcon size={12} />
                          {folderPath(r.folderId)}
                        </span>
                      ) : (
                        <span class="sk-sr__folder sk-sr__folder--unfiled" data-testid="sk-sr-folder">
                          {STR.unfiled}
                        </span>
                      )}
                      <span class="sk-sr__dot" aria-hidden="true">·</span>
                      <time
                        class="sk-sr__time"
                        data-testid="sk-sr-time"
                        dateTime={new Date(r.updatedAt).toISOString()}
                      >
                        {formatRelativeTime(r.updatedAt, now, STR)}
                      </time>
                    </span>
                  </span>
                </li>
              ))}

              {/* Prompts group: same listbox, flattened index continues after the
                  conversations so ↑/↓ crosses the boundary seamlessly. */}
              {promptResults.length > 0 && (
                <li class="sk-search-group" role="presentation" data-testid="sk-search-group-header">
                  {STR.groupPrompts}
                </li>
              )}
              {promptResults.map((p, j) => {
                const flat = convCount + j;
                return (
                  <li
                    key={`prompt-${p.id}`}
                    id={`sk-sr-${flat}`}
                    class={`sk-sr sk-sr--prompt${flat === activeClamped ? ' sk-sr--active' : ''}`}
                    role="option"
                    aria-selected={flat === activeClamped}
                    data-testid="sk-search-prompt-result"
                    onMouseEnter={() => setActive(flat)}
                    onClick={() => openPromptResult(p)}
                  >
                    <span class="sk-sr__logo" aria-hidden="true">
                      <SearchIcon size={16} />
                    </span>
                    <span class="sk-sr__text">
                      <span class="sk-sr__title">{p.title}</span>
                      <Snippet segments={p.snippet} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div class="sk-search-foot" data-testid="sk-search-foot">
          <span class="sk-search-foot__privacy">{STR.indexedLocally}</span>
          <span class="sk-search-foot__hints" aria-hidden="true">
            <span class="sk-search-foot__hint">
              <kbd class="sk-kbd">↑</kbd>
              <kbd class="sk-kbd">↓</kbd>
              {STR.hintNavigate}
            </span>
            <span class="sk-search-foot__hint">
              <kbd class="sk-kbd">↵</kbd>
              {STR.hintOpen}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
