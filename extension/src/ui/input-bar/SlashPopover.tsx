// The slash-command prompt popover (design D-4). A Skeinos-owned popover with its
// OWN search field — not host-composer keystroke interception (D-1) — that queries
// the library through the worker via `usePromptSearch` and lists matches. Each row
// shows a generic prompt glyph, the title, a highlighted snippet, and the `/slug`
// alias. Positioning is delegated to the caller's `useFloating` (anchored to the
// bar, opening upward); this component owns only the search field, the listbox, and
// keyboard navigation. Styled from `--sk-*` tokens, fully ARIA-labelled. Dismissing
// (Escape / outside click) inserts nothing — that is the caller's `onClose`.

import { useCallback, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { PromptIcon } from '../components/Icon';
import { usePromptSearch, useRecentPrompts, type PromptSearchView } from '../search/usePromptSearch';
import type { PromptSearchResult, PromptSnapshot } from '../../shared/prompts';
import type { Response } from '../../shared/messages';
import { useAutoFocus, useFocusContainment, useShadowDismiss } from './hooks';
import { STR } from './strings';

type QueryFn = (selector: {
  kind: 'prompt.search';
  terms: string[];
}) => Promise<Response<PromptSnapshot>>;

type RecentsQueryFn = (selector: {
  kind: 'prompt.recents';
  limit: number;
}) => Promise<Response<PromptSnapshot>>;

export interface SlashPopoverProps {
  /** Attach to the floating element (from the caller's `useFloating`). */
  setFloating: (el: HTMLElement | null) => void;
  /** Absolute-positioning styles for the floating element. */
  floatingStyles: JSX.CSSProperties;
  /** Insert the chosen prompt (variable modal handled upstream). */
  onSelect: (result: PromptSearchResult) => void;
  /** Dismiss without inserting (Escape / outside click). */
  onClose: () => void;
  /** Injectable query fn for tests; production uses the live worker client. */
  search?: QueryFn;
  /** Injectable recents query fn for tests; production uses the live worker client. */
  recentsQuery?: RecentsQueryFn;
  /** Injectable search view for tests that bypass the debounce/worker entirely. */
  view?: PromptSearchView;
  /** Injectable recents list for tests that bypass the recents fetch entirely. */
  recents?: PromptSearchResult[];
  /** Contain focus within the popover — only for hosts that force-focus their own
   *  composer (`behaviors.composerStealsFocus`, e.g. Perplexity). Default off. */
  containFocus?: boolean;
}

/** Render a highlighted snippet: matched runs become `<mark>`, the rest plain text.
 *  Structured segments (never raw HTML) keep this XSS-safe by construction. */
function Snippet({ segments }: { segments: PromptSearchResult['snippet'] }): JSX.Element {
  return (
    <span class="sk-ib-row__snippet">
      {segments.map((seg, i) => (
        <span key={i}>
          {i > 0 ? ' ' : ''}
          {seg.match ? <mark class="sk-ib-row__hit">{seg.text}</mark> : seg.text}
        </span>
      ))}
    </span>
  );
}

export function SlashPopover({
  setFloating,
  floatingStyles,
  onSelect,
  onClose,
  search,
  recentsQuery,
  view,
  recents,
  containFocus = false,
}: SlashPopoverProps) {
  const [query, setQuery] = useState('');
  const live = usePromptSearch(query, search);
  const { results: searchResults, status } = view ?? live;
  // Recently-used prompts for the empty state (D-4); `recents` injection bypasses the
  // fetch in unit tests, mirroring how `view` bypasses the search hook.
  const fetchedRecents = useRecentPrompts(recentsQuery);
  const recentResults = recents ?? fetchedRecents;

  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Combined ref for the floating panel: keeps `panelRef` (for outside-click hit
  // testing) AND wires the element into `useFloating`. MUST be memoized — an inline
  // closure here gets a fresh identity every render, so Preact re-runs the ref each
  // render, re-invoking `setFloating` → `computePosition` → `setState` → re-render,
  // an unbounded loop that freezes the tab. `setFloating` is itself stable, so this
  // callback only changes if `setFloating` does (it doesn't).
  const setPanel = useCallback(
    (el: HTMLDivElement | null) => {
      panelRef.current = el;
      setFloating(el);
    },
    [setFloating],
  );

  // Focus on open (race-proof against host auto-focus), keep focus inside on hosts
  // that steal it, and dismiss on an outside click — all shadow-DOM-correct. See the
  // hook docs for why each is needed and why the focus guard is gated behind
  // `containFocus` (it's invasive; only focus-stealing hosts opt in).
  useAutoFocus(inputRef);
  useFocusContainment(panelRef, inputRef, containFocus);
  useShadowDismiss(panelRef, onClose);

  const hasQuery = query.trim().length > 0;
  // Recents are the default result set; live search replaces them once the user types
  // (D-4). Feeding both through one `results` array keeps the nav/select path single.
  const results = hasQuery ? searchResults : recentResults;
  const showRecents = !hasQuery && recentResults.length > 0;
  const total = results.length;
  const activeClamped = total > 0 ? Math.min(active, total - 1) : 0;
  const searching = status === 'searching' && total === 0;
  const errored = status === 'error';

  const onInput = (value: string): void => {
    setActive(0);
    setQuery(value);
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
      const hit = results[activeClamped];
      if (hit) onSelect(hit);
    }
  };

  const activeId = total > 0 ? `sk-ib-row-${activeClamped}` : undefined;

  return (
    <div
      ref={setPanel}
      class="sk-ib-popover"
      style={floatingStyles}
      role="dialog"
      aria-label={STR.popoverLabel}
      data-testid="sk-ib-popover"
      // Keep keystrokes inside the popover. Shadow-DOM events are composed and bubble
      // onto the host page, where editors like Claude's run a document-level
      // "type-anywhere-to-focus-the-composer" handler that would otherwise capture
      // our search keystrokes into the native box. These bubble-phase stoppers run
      // AFTER the input's own handlers, so navigation/typing still work locally.
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
      onInput={(e) => e.stopPropagation()}
      onBeforeInput={(e) => e.stopPropagation()}
    >
      <div class="sk-ib-popover__head">
        <input
          ref={inputRef}
          type="text"
          class="sk-ib-popover__input"
          role="combobox"
          aria-expanded={total > 0}
          aria-controls="sk-ib-results"
          aria-activedescendant={activeId}
          aria-label={STR.searchLabel}
          placeholder={STR.searchPlaceholder}
          value={query}
          data-testid="sk-ib-search"
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
        />
      </div>

      <div class="sk-ib-popover__body">
        {!hasQuery && !showRecents ? (
          // Empty field, nothing used yet → the original hint (D-4).
          <p class="sk-ib-popover__status" data-testid="sk-ib-idle">
            {STR.idle}
          </p>
        ) : hasQuery && searching ? (
          <p class="sk-ib-popover__status" data-testid="sk-ib-searching">
            {STR.searching}
          </p>
        ) : hasQuery && errored ? (
          <p class="sk-ib-popover__status" data-testid="sk-ib-error">
            {STR.error}
          </p>
        ) : hasQuery && total === 0 ? (
          <p class="sk-ib-popover__status" data-testid="sk-ib-empty">
            {STR.empty}
          </p>
        ) : (
          <>
            {showRecents ? (
              <p
                class="sk-ib-popover__group"
                id="sk-ib-recents-head"
                data-testid="sk-ib-recents-head"
              >
                {STR.lastUsed}
              </p>
            ) : null}
            <ul
              class="sk-ib-results"
              id="sk-ib-results"
              role="listbox"
              aria-label={showRecents ? STR.lastUsed : STR.results}
            >
              {results.map((r, i) => (
              <li
                key={r.id}
                id={`sk-ib-row-${i}`}
                class={`sk-ib-row${i === activeClamped ? ' sk-ib-row--active' : ''}`}
                role="option"
                aria-selected={i === activeClamped}
                data-testid="sk-ib-result"
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(r)}
              >
                <span class="sk-ib-row__glyph" aria-hidden="true">
                  <PromptIcon size={16} />
                </span>
                <span class="sk-ib-row__text">
                  <span class="sk-ib-row__title">{r.title}</span>
                  <Snippet segments={r.snippet} />
                </span>
                {r.slug ? (
                  <span class="sk-ib-row__slug" data-testid="sk-ib-slug">
                    {r.slug.startsWith('/') ? r.slug : `/${r.slug}`}
                  </span>
                ) : null}
              </li>
            ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
