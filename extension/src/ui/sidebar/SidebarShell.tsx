// The framed sidebar shell (design screens 01/02): a brand header, a search
// launcher, the section tab strip, a tag filter, the folder body, and a footer
// (local-only status · settings). It frames the live folder tree (Sidebar). The
// footer states the honest resting state (data is local to this device); the tier
// badge and cross-device sync return when billing + sync ship (M5).
//
// The only live interaction here is the settings gear (opens the options page).
// Everything draws from `--sk-*` tokens and is keyboard-operable and ARIA-labelled.

import { useEffect, useState } from 'preact/hooks';
import type { Folder, PlatformId } from '../../shared/types';
import { extApi } from '../../core/platform/ext-api';
import { LockIcon, SearchIcon, SettingsIcon } from '../components/Icon';
import { PlatformLogo } from '../components/PlatformLogo';
import { PLATFORM_LABELS } from '../../shared/branding';
import { SearchOverlay } from '../search/SearchOverlay';
import { PromptsPanel } from '../prompts/PromptsPanel';
import { PromptCategoryChips } from '../prompts/PromptCategoryChips';
import { usePromptsController } from '../prompts/usePromptsController';
import type { PromptLibraryView } from '../prompts/usePromptLibrary';
import { ProfilesPanel } from '../profiles/ProfilesPanel';
import { useProfilesController } from '../profiles/useProfilesController';
import type { ProfileLibraryView } from '../profiles/useProfileLibrary';
import { TagFilterChips } from '../tags/TagFilterChips';
import { useTagLibrary, type TagLibraryView } from '../tags/useTagLibrary';
import { countByTag } from '../../core/tags';
import { Sidebar } from './Sidebar';
import { IndexingIndicator } from './IndexingIndicator';
import { useWorkspace, type WorkspaceView } from './useWorkspace';
import type { FolderTreeSnapshot } from '../../shared/workspace';
import { useT } from '../../core/i18n';

/** The interactive shell tabs. All three (Folders / Prompts / Profiles) switch the
 *  body region; the Profiles tab became interactive in the profiles-library slice.
 *  Tags are a cross-cutting facet (not a section), so they have no tab — they live in
 *  the Folders filter row + the per-conversation picker. */
type ActiveTab = 'folders' | 'prompts' | 'profiles';

// The header omits the app name/glyph on purpose: the browser's native side-panel
// title bar already shows the Skeinos name + icon, so repeating them here would be
// redundant. The sub-line is a calm identity label, not a feature list: it states
// the why (the skein — one thread from many strands, the chats + prompts scattered
// across every AI woven into one) and leaves the what to the tabs below. Privacy
// is shown by behaviour, not asserted here; the mint presence dot carries "live".
/** True on macOS, where the accelerator is ⌘K rather than Ctrl+K. Reads the modern
 *  `userAgentData.platform` first, falling back to the legacy `platform`/UA string.
 *  Mirrors the input bar's detection so both shortcuts stay OS-consistent. */
function detectIsMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
  return /mac/i.test(platform);
}

/** Open the extension options page. Guarded so a non-extension context (tests
 *  without a chrome shim) is a no-op rather than a throw. */
function openOptions(): void {
  const c = extApi<{ runtime?: { openOptionsPage?: () => void } }>();
  c?.runtime?.openOptionsPage?.();
}

export interface SidebarShellProps {
  platform: PlatformId;
  /** Injectable for tests; forwarded to the folder body. */
  view?: WorkspaceView;
  /** Injectable prompt-library view for tests; forwarded to the prompts controller. */
  promptView?: PromptLibraryView;
  /** Injectable profile-library view for tests; forwarded to the profiles controller. */
  profileView?: ProfileLibraryView;
  /** Injectable tag-library view for tests; defaults to the live worker-backed hook. */
  tagView?: TagLibraryView;
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

export function SidebarShell({ platform, view, promptView, profileView, tagView, bindOpenPrompt }: SidebarShellProps) {
  const t = useT();
  // One workspace view feeds the Folders tab's tree (folders + inline
  // conversations + the Unfiled node), so nothing opens competing subscriptions or
  // diverges. Tests inject `view`; production uses the live worker-backed view.
  const live = useWorkspace(platform);
  const ws = view ?? live;

  // The tag library is held ONCE here (the tags analog of `useWorkspace`): the
  // Folders-tab filter control, the per-row assignment picker, and the Tags tab all
  // read/mutate this single view, so they can never diverge. Tests inject `tagView`.
  const liveTags = useTagLibrary();
  const tagLib = tagView ?? liveTags;

  // The prompt library is held ONCE here (the prompts analog of `useWorkspace`): the
  // category/tag chip row in the filter slot and the prompt body below both read and
  // mutate this single controller, so they can never diverge. Tests inject `promptView`.
  const prompts = usePromptsController(promptView);

  // The profile library is likewise held ONCE here (the profiles analog): the Profiles
  // tab body reads and mutates this single controller. Tests inject `profileView`.
  const profiles = useProfilesController(profileView);

  // The active section tab (D-A). The shell swaps the body region between the folder
  // tree, the prompt library, and the Profiles view (all three interactive).
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

  // OS-aware accelerator for "Search everything": ⌘K on macOS, Ctrl+K elsewhere —
  // the same convention the input bar uses for its ⌘/ chord. Computed once (the
  // platform never changes within a session) and used for both the badge and the hint.
  const isMac = detectIsMac();
  const searchKbd = isMac ? '⌘K' : 'Ctrl+K';

  // Global accelerator — Cmd/Ctrl + K opens the search overlay (the badge on the
  // launcher advertised it, but nothing bound it until now). Bound on the shell's
  // `ownerDocument` so it works wherever the panel is mounted; it only opens, never
  // toggles, so the overlay owns its own dismissal (Esc / backdrop). A single named
  // chord that never inspects typed content, in line with the privacy stance.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // `Cmd/Ctrl + K` with no other modifier: exactly one of meta (macOS) / ctrl
      // (others), never Alt/Shift.
      if ((e.key !== 'k' && e.key !== 'K') || e.altKey || e.shiftKey || e.metaKey === e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      setSearchOpen(true);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

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
            {t('shell.workspace')}
          </span>
        </div>
      </header>

      <button
        class="sk-search"
        type="button"
        data-testid="sk-search"
        aria-haspopup="dialog"
        aria-expanded={searchOpen}
        title={t('shell.search')}
        onClick={() => setSearchOpen(true)}
      >
        <span class="sk-search__icon" aria-hidden="true"><SearchIcon size={16} /></span>
        <span class="sk-search__placeholder">{t('shell.searchPlaceholder')}</span>
        <kbd class="sk-search__kbd">{searchKbd}</kbd>
      </button>

      <nav class="sk-tabs" role="tablist" aria-label={t('shell.sections')}>
        <button
          class={`sk-tab${activeTab === 'folders' ? ' sk-tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'folders'}
          data-testid="sk-tab-folders"
          onClick={() => setActiveTab('folders')}
        >
          {t('shell.tabFolders')}
        </button>
        <button
          class={`sk-tab${activeTab === 'prompts' ? ' sk-tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'prompts'}
          data-testid="sk-tab-prompts"
          onClick={() => setActiveTab('prompts')}
        >
          {t('shell.tabPrompts')}
        </button>
        <button
          class={`sk-tab${activeTab === 'profiles' ? ' sk-tab--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'profiles'}
          data-testid="sk-tab-profiles"
          onClick={() => setActiveTab('profiles')}
        >
          {t('shell.tabProfiles')}
        </button>
      </nav>

      {/* Non-blocking bulk-index progress (loading-states, D-3): sits below the tab
          strip, removes itself when nothing is indexing, and blocks no interaction. */}
      <IndexingIndicator />

      {/* The platform filter row, the tag filter row, and the collapsed-list nudge are
          folder-specific chrome (D-A): rendered only under the Folders tab so they never
          leak into Prompts. The platform filter is the "All" reset chip + one live chip
          per platform present (D28); the tag filter (C7/M2) is a sibling chip group with
          a live "+ Tag" picker over the existing tags. */}
      {activeTab === 'folders' && (
        <>
          <div class="sk-filters" data-testid="sk-filters">
            <div
              class="sk-filter-row__chips"
              data-testid="sk-platforms"
              role="group"
              aria-label={t('shell.filterLabel')}
            >
              <button
                class={`sk-chip${ws.platformFilter === 'all' ? ' sk-chip--active' : ''}`}
                type="button"
                data-testid="sk-platform-all"
                aria-pressed={ws.platformFilter === 'all'}
                onClick={() => ws.setPlatformFilter('all')}
              >
                {t('shell.platformAll')}
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
              {/* Tag filter shares the one filter row (no second row): selected tags as
                  removable chips + a tag affordance opening the shared picker. */}
              <TagFilterChips
                tags={tagLib.tags}
                selected={ws.tagFilter}
                onChange={ws.setTagFilter}
                mutate={tagLib.mutate}
                counts={countByTag(ws.conversations)}
              />
            </div>
          </div>

          {(ws.active?.listCollapsedHint || ws.listCollapsed) && (
            <div class="sk-nudge" role="status" data-testid="sk-collapsed-list-nudge">
              <span class="sk-nudge__logo" aria-hidden="true">
                <PlatformLogo platform={platform} size={16} />
              </span>
              <span class="sk-nudge__text">
                {t('shell.collapsedListNudge', { label: PLATFORM_LABELS[platform] })}
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
          <Sidebar platform={platform} view={ws} tags={tagLib.tags} />
        ) : activeTab === 'prompts' ? (
          <PromptsPanel controller={prompts} />
        ) : (
          <ProfilesPanel controller={profiles} />
        )}
      </div>

      <footer class="sk-shell__footer">
        {/* Honest resting status: data is local to this device. No tier badge and no
            "Synced" stub — both over-promised (Pro isn't purchasable, sync ships M5).
            This slot upgrades to real Syncing…/Synced/Offline states when sync lands. */}
        <span class="sk-status" data-testid="sk-status" role="status" title={t('shell.localOnlyTitle')}>
          <LockIcon size={14} />
          {t('shell.localOnly')}
        </span>
        <button
          class="sk-icon-btn"
          type="button"
          data-testid="sk-settings"
          aria-label={t('shell.settings')}
          title={t('shell.settings')}
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
