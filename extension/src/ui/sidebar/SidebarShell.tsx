// The framed sidebar shell (design screens 01/02): a brand header, a search
// launcher, the section tab strip, a tag filter, the folder body, and a footer
// (tier · sync · settings). It frames the live folder tree (Sidebar) and renders
// the not-yet-built features (search M3, prompts/profiles M4, tags M2, tier M7,
// sync M5) as disabled "coming soon" stubs that reserve their layout slot.
//
// The only live interaction here is the settings gear (opens the options page).
// Everything draws from `--sk-*` tokens and is keyboard-operable and ARIA-labelled.

import type { PlatformId } from '../../shared/types';
import { SearchIcon, SettingsIcon } from '../components/Icon';
import { Sidebar } from './Sidebar';
import { useWorkspace, type WorkspaceView } from './useWorkspace';

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
  tagAll: 'All',
  tagAdd: '+ tag',
  tagFilter: 'Tag filter',
  platformAll: 'All',
  platformFilter: 'Filter by platform',
  sections: 'Sidebar sections',
  tier: 'PRO',
  synced: 'Synced',
  settings: 'Settings',
  comingSoon: 'Coming soon',
} as const;

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
}

export function SidebarShell({ platform, view }: SidebarShellProps) {
  // One workspace view feeds the Folders tab's tree (folders + inline
  // conversations + the Unfiled node), so nothing opens competing subscriptions or
  // diverges. Tests inject `view`; production uses the live worker-backed view.
  const live = useWorkspace(platform);
  const ws = view ?? live;

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
        disabled
        aria-disabled="true"
        title={STR.comingSoon}
      >
        <span class="sk-search__icon" aria-hidden="true"><SearchIcon size={16} /></span>
        <span class="sk-search__placeholder">{STR.searchPlaceholder}</span>
        <kbd class="sk-search__kbd">⌘K</kbd>
      </button>

      <nav class="sk-tabs" role="tablist" aria-label={STR.sections}>
        <button class="sk-tab sk-tab--active" type="button" role="tab" aria-selected="true" data-testid="sk-tab-folders">
          {STR.tabFolders}
        </button>
        <button class="sk-tab" type="button" role="tab" aria-selected="false" aria-disabled="true" disabled data-testid="sk-tab-prompts" title={STR.comingSoon}>
          {STR.tabPrompts}
        </button>
        <button class="sk-tab" type="button" role="tab" aria-selected="false" aria-disabled="true" disabled data-testid="sk-tab-profiles" title={STR.comingSoon}>
          {STR.tabProfiles}
        </button>
      </nav>

      <div class="sk-tags" data-testid="sk-tags" aria-label={STR.tagFilter}>
        <button class="sk-chip sk-chip--active" type="button" disabled aria-disabled="true" title={STR.comingSoon}>{STR.tagAll}</button>
        <button class="sk-chip sk-chip--add" type="button" disabled aria-disabled="true" title={STR.comingSoon}>{STR.tagAdd}</button>
      </div>

      <div
        class="sk-platforms"
        data-testid="sk-platforms"
        role="group"
        aria-label={STR.platformFilter}
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
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      <div class="sk-shell__body" role="tabpanel">
        <Sidebar platform={platform} view={ws} />
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
    </div>
  );
}
