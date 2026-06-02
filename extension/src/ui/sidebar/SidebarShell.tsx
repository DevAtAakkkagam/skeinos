// The framed sidebar shell (design screens 01/02): a brand header, a search
// launcher, the section tab strip, a tag filter, the folder body, and a footer
// (tier · sync · settings). It frames the live folder tree (Sidebar) and renders
// the not-yet-built features (search M3, prompts/profiles M4, tags M2, tier M7,
// sync M5) as disabled "coming soon" stubs that reserve their layout slot.
//
// The only live interaction here is the settings gear (opens the options page).
// Everything draws from `--sk-*` tokens and is keyboard-operable and ARIA-labelled.

import type { PlatformId } from '../../shared/types';
import { Sidebar } from './Sidebar';
import type { WorkspaceView } from './useWorkspace';

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
  return (
    <div class="sk-shell" data-testid="sk-shell">
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
        <span class="sk-search__icon" aria-hidden="true">⌕</span>
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

      <div class="sk-shell__body" role="tabpanel">
        <Sidebar platform={platform} view={view} />
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
          ⚙
        </button>
      </footer>
    </div>
  );
}
