// The framed sidebar shell (design screens 01/02): a brand header, a search
// launcher, the section tab strip, a tag filter, the folder body, and a footer
// (tier · sync · settings). It frames the live folder tree (Sidebar) and renders
// the not-yet-built features (search M3, prompts/profiles M4, tags M2, tier M7,
// sync M5) as disabled "coming soon" stubs that reserve their layout slot.
//
// The only live interaction here is the settings gear (opens the options page).
// Everything draws from `--sk-*` tokens and is keyboard-operable and ARIA-labelled.

import { useEffect, useState } from 'preact/hooks';
import type { Folder, PlatformId } from '../../shared/types';
import { SearchIcon, SettingsIcon } from '../components/Icon';
import { PlatformLogo } from '../components/PlatformLogo';
import { SearchOverlay } from '../search/SearchOverlay';
import { PromptsPanel } from '../prompts/PromptsPanel';
import { PromptCategoryChips } from '../prompts/PromptCategoryChips';
import { usePromptsController } from '../prompts/usePromptsController';
import type { PromptLibraryView } from '../prompts/usePromptLibrary';
import { Sidebar } from './Sidebar';
import { useWorkspace, type WorkspaceView } from './useWorkspace';
import type { FolderTreeSnapshot } from '../../shared/workspace';

/** The interactive shell tabs (Profiles stays a disabled stub until its feature
 *  ships, so it is not part of the switchable union). */
type ActiveTab = 'folders' | 'prompts';

/** Display labels for the platform view-filter chips (i18n-ready; no inline
 *  literals in markup). Keyed by `PlatformId`. */
const PLATFORM_LABELS: Record<PlatformId, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
  deepseek: 'DeepSeek',
  chatgpt: 'ChatGPT',
  mistral: 'Mistral',
};

// The header omits the app name/glyph on purpose: the browser's native side-panel
// title bar already shows the Skeinos name + icon, so repeating them here would be
// redundant. We keep only the live workspace label + presence dot.
const STR = {
  workspace: 'Personal workspace',
  searchPlaceholder: 'Search everything…',
  search: 'Search',
  tabFolders: 'Folders',
  tabPrompts: 'Prompts',
  tabProfiles: 'Profiles',
  tagAdd: '+ Tag',
  platformAll: 'All',
  filterLabel: 'Filter conversations',
  sections: 'Sidebar sections',
  tier: 'PRO',
  synced: 'Synced',
  settings: 'Settings',
  comingSoon: 'Coming soon',
} as const;

/** The collapsed-list nudge copy (i18n-ready: the platform name is interpolated,
 *  not concatenated from fragments). Shown when the active tab's platform reports
 *  an open conversation but an empty list — its side drawer is collapsed and it
 *  hides the list when collapsed (Gemini). */
const collapsedListNudge = (label: string): string =>
  `${label}'s chat list is hidden while its sidebar is collapsed. Open it once to sync all your conversations here.`;

/** Open the extension options page. Guarded so a non-extension context (tests
 *  without a chrome shim) is a no-op rather than a throw. */
function openOptions(): void {
  const c = (globalThis as { chrome?: { runtime?: { openOptionsPage?: () => void } } }).chrome;
  c?.runtime?.openOptionsPage?.();
}

export interface SidebarShellProps {
  platform: PlatformId;
  /** Injectable for tests; forwarded to the folder body. */
  view?: WorkspaceView;
  /** Injectable prompt-library view for tests; forwarded to the prompts controller. */
  promptView?: PromptLibraryView;
  /** Receives the imperative `openPrompt(id)` seam (D-F): selects the Prompts tab
   *  and opens that prompt's editor. Slice 4's search → prompt navigation binds it. */
  bindOpenPrompt?: (openPrompt: (id: string) => void) => void;
}

/** Flatten the folder tree snapshot into a flat list for the search folder filter
 *  (active subtree + pinned + archived, de-duplicated by id). */
function flattenFolders(tree: FolderTreeSnapshot): Folder[] {
  const out: Folder[] = [];
  const seen = new Set<string>();
  const push = (f: Folder) => {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      out.push(f);
    }
  };
  const walk = (nodes: FolderTreeSnapshot['active']) => {
    for (const n of nodes) {
      push(n.folder);
      walk(n.children);
    }
  };
  walk(tree.active);
  tree.pinned.forEach(push);
  tree.archived.forEach(push);
  return out;
}

export function SidebarShell({ platform, view, promptView, bindOpenPrompt }: SidebarShellProps) {
  // One workspace view feeds the Folders tab's tree (folders + inline
  // conversations + the Unfiled node), so nothing opens competing subscriptions or
  // diverges. Tests inject `view`; production uses the live worker-backed view.
  const live = useWorkspace(platform);
  const ws = view ?? live;

  // The prompt library is held ONCE here (the prompts analog of `useWorkspace`): the
  // category/tag chip row in the filter slot and the prompt body below both read and
  // mutate this single controller, so they can never diverge. Tests inject `promptView`.
  const prompts = usePromptsController(promptView);

  // The active section tab (D-A). The shell swaps the body region between the
  // folder tree and the prompt library; Profiles stays a disabled stub.
  const [activeTab, setActiveTab] = useState<ActiveTab>('folders');

  // Expose the `openPrompt(id)` seam to a parent (slice 4's search navigation): jump
  // to the Prompts tab and hand the controller the target prompt to open.
  useEffect(() => {
    bindOpenPrompt?.((id: string) => {
      setActiveTab('prompts');
      prompts.openPrompt(id);
    });
  }, [bindOpenPrompt, prompts]);

  // The search overlay (C8) is opened from the search launcher; it is a pure view
  // over worker state and holds no workspace data of its own.
  const [searchOpen, setSearchOpen] = useState(false);

  // The platform view-filter chips (D28): "All" (unified) plus one chip per
  // platform actually present in the workspace, so the control never offers a
  // platform the user has no conversations for. Derived from the unified list and
  // de-duplicated; the active platform sorts first when present so the common
  // single-platform user sees a stable, familiar order.
  const presentPlatforms = (() => {
    const seen = new Set<PlatformId>();
    for (const c of ws.conversations) seen.add(c.platform);
    const ids = [...seen];
    return ids.sort((a, b) => {
      if (a === platform) return -1;
      if (b === platform) return 1;
      return PLATFORM_LABELS[a].localeCompare(PLATFORM_LABELS[b]);
    });
  })();

  // Suppress the browser's native context menu inside the panel — it has nothing
  // useful for our chrome (Back/Reload/Inspect) and obscures the workspace. Folder
  // rows open our own menu via Zag (which already preventDefaults); this catches the
  // areas without a context trigger (conversation rows, empty space, headers). We
  // still defer to the native menu on editable fields so right-click paste works.
  const suppressNativeMenu = (e: Event) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    e.preventDefault();
  };

  return (
    <div class="sk-shell" data-testid="sk-shell" onContextMenu={suppressNativeMenu}>
      <header class="sk-shell__header">
        <div class="sk-brand">
          <span class="sk-brand__sub">
            <span class="sk-brand__status" aria-hidden="true" />
            {STR.workspace}
          </span>
        </div>
      </header>

      <button
        class="sk-search"
        type="button"
        data-testid="sk-search"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        title={STR.search}
        onClick={() => setSearchOpen(true)}
      >
        <span class="sk-search__icon" aria-hidden="true"><SearchIcon size={16} /></span>
        <span class="sk-search__placeholder">{STR.searchPlaceholder}</span>
        <kbd class="sk-search__kbd">⌘K</kbd>
      </button>

      <nav class="sk-tabs" role="tablist" aria-label={STR.sections}>
        <button
          class={`sk-tab${activeTab === 'folders' ? ' sk-tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'folders'}
          data-testid="sk-tab-folders"
          onClick={() => setActiveTab('folders')}
        >
          {STR.tabFolders}
        </button>
        <button
          class={`sk-tab${activeTab === 'prompts' ? ' sk-tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'prompts'}
          data-testid="sk-tab-prompts"
          onClick={() => setActiveTab('prompts')}
        >
          {STR.tabPrompts}
        </button>
        <button class="sk-tab" type="button" role="tab" aria-selected="false" aria-disabled="true" disabled data-testid="sk-tab-profiles" title={STR.comingSoon}>
          {STR.tabProfiles}
        </button>
      </nav>

      {/* The platform filter row + collapsed-list nudge are folder-specific chrome
          (D-A): rendered only under the Folders tab so they never leak into Prompts.
          One unified filter row (no Platform/Tags split): the "All" reset chip, one
          live chip per platform present in the workspace (D28), then the inert "+ Tag"
          ghost marking where tag chips will join the same flow when C7/M2 lands. */}
      {activeTab === 'folders' && (
        <>
          <div class="sk-filters" data-testid="sk-filters">
            <div
              class="sk-filter-row__chips"
              data-testid="sk-platforms"
              role="group"
              aria-label={STR.filterLabel}
            >
              <button
                class={`sk-chip${ws.platformFilter === 'all' ? ' sk-chip--active' : ''}`}
                type="button"
                data-testid="sk-platform-all"
                aria-pressed={ws.platformFilter === 'all'}
                onClick={() => ws.setPlatformFilter('all')}
              >
                {STR.platformAll}
              </button>
              {presentPlatforms.map((p) => (
                <button
                  key={p}
                  class={`sk-chip${ws.platformFilter === p ? ' sk-chip--active' : ''}`}
                  type="button"
                  data-testid={`sk-platform-${p}`}
                  aria-pressed={ws.platformFilter === p}
                  onClick={() => ws.setPlatformFilter(p)}
                >
                  <span class="sk-chip__logo" aria-hidden="true"><PlatformLogo platform={p} size={14} /></span>
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
              <button class="sk-chip sk-chip--add" type="button" data-testid="sk-tag-add" disabled aria-disabled="true" title={STR.comingSoon}>{STR.tagAdd}</button>
            </div>
          </div>

          {ws.active?.listCollapsedHint && (
            <div class="sk-nudge" role="status" data-testid="sk-collapsed-list-nudge">
              <span class="sk-nudge__logo" aria-hidden="true">
                <PlatformLogo platform={ws.active.platform} size={16} />
              </span>
              <span class="sk-nudge__text">
                {collapsedListNudge(PLATFORM_LABELS[ws.active.platform])}
              </span>
            </div>
          )}
        </>
      )}

      {/* The Prompts tab's filter slot — the category/tag chips, the prompt analog of
          the platform chips above. Same slot, same structure (D-A uniformity). */}
      {activeTab === 'prompts' && <PromptCategoryChips controller={prompts} />}

      <div class="sk-shell__body" role="tabpanel">
        {activeTab === 'folders' ? (
          <Sidebar platform={platform} view={ws} />
        ) : (
          <PromptsPanel controller={prompts} />
        )}
      </div>

      <footer class="sk-shell__footer">
        <span class="sk-badge" data-testid="sk-pro-badge" title={STR.comingSoon}>{STR.tier}</span>
        <span class="sk-sync" data-testid="sk-sync" aria-disabled="true" title={STR.comingSoon}>{STR.synced}</span>
        <button
          class="sk-icon-btn"
          type="button"
          data-testid="sk-settings"
          aria-label={STR.settings}
          title={STR.settings}
          onClick={openOptions}
        >
          <SettingsIcon size={16} />
        </button>
      </footer>

      {searchOpen && (
        <SearchOverlay
          activePlatform={platform}
          folders={flattenFolders(ws.tree)}
          platforms={presentPlatforms}
          onClose={() => setSearchOpen(false)}
          onOpenPrompt={(id) => {
            setActiveTab('prompts');
            prompts.openPrompt(id);
            setSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}
