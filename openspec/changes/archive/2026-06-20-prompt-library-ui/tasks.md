## 1. Data layer

- [x] 1.1 Create `extension/src/ui/prompts/usePromptLibrary.ts` mirroring `useWorkspace` (minus platform
  machinery): `prompts`/`folders` state, `loading|ready|error` status, `state.changed` subscription,
  coalesced `refresh`, and visibility/focus self-heal. Reads via `queryPromptLibraryRemote`.
- [x] 1.2 Implement `mutate(op)` → `{ ok, applied }`: send once via `mutatePromptLibraryRemote`, then
  re-read; judge `applied` for create (present) / delete (absent) / rename (new name) when the ack is lost.
- [x] 1.3 Define an injectable `PromptLibraryView` interface (like `WorkspaceView`) so the panel can be
  unit-tested with a stub view.

## 2. Card + panel

- [x] 2.1 Create `extension/src/ui/prompts/PromptCard.tsx`: title, body excerpt via `tokenizeTemplate`
  with `{{var}}` chips, variable count, `targetModels` logos (`PlatformLogo`), inert `slug` badge, and a
  `Menu` overflow (Edit / Delete with confirm).
- [x] 2.2 Create `extension/src/ui/prompts/PromptsPanel.tsx`: toolbar (**+ New prompt**), category chip
  row (`All` + per-category, client-derived counts), tag filter, the 1-up card list, and empty/loading/
  error states.
- [x] 2.3 Implement filtering as ephemeral view state: AND of active category + selected tags; derive all
  counts from the loaded prompt list (D-B). `All` clears the category narrowing.

## 3. Editor + category management

- [x] 3.1 Create `extension/src/ui/prompts/PromptEditor.tsx` as a `Dialog`: title, body, description,
  tags, `targetModels` multi-select (platform toggle chips), category picker (existing or create inline),
  slug. Live variable preview from `parseVariables` on body input.
- [x] 3.2 Wire save: `prompt.create` / `prompt.update` carrying `body` + metadata, **never `variables`**;
  clear-to-empty optional fields send `''` (D-E). Delete via confirm.
- [x] 3.3 Category management: create (inline + a `+ New category` affordance), rename, and delete (with a
  confirm warning that prompts become uncategorized) via a category-chip `Menu`.

## 4. Shell integration

- [x] 4.1 In `SidebarShell.tsx`, add `activeTab` state; make the Prompts tab interactive (drop its
  disabled/coming-soon attrs); keep Profiles disabled.
- [x] 4.2 Render the folder-specific region (platform filter + collapsed-list nudge + `Sidebar`) only
  under Folders; render `PromptsPanel` under Prompts. Header, search launcher, tabs, footer stay.
- [x] 4.3 Expose an `openPrompt(id)` seam (select Prompts tab + open that prompt's editor) for slice 4.

## 5. Styles

- [x] 5.1 Add token-only `sk-*` styles (shadow-DOM scoped, `--sk-*` only) for the panel, toolbar, chips,
  cards, variable chips, platform logos, and editor dialog. No hard-coded colors.
- [x] 5.2 All interactive elements keyboard-operable and ARIA-labelled; all user-facing strings in a `STR`
  map (i18n-ready).

## 6. Tests

- [x] 6.1 Vitest + happy-dom with an injected view: card renders variable chips + count + platform logos +
  inert slug badge.
- [x] 6.2 Panel: category/tag filtering narrows the list; counts equal the rows; `All` resets; first-run
  and no-match empty states; loading/error not shown as empty.
- [x] 6.3 Editor: live variable preview updates on body input; create sends `body` and no `variables`;
  update sends the changed body; multi-select target platforms persist.
- [x] 6.4 Category lifecycle through the UI: create + assign surfaces a counted category; confirmed delete
  reassigns prompts to uncategorized.
- [x] 6.5 Observe-don't-replay: a mutation re-reads and reconciles; a `state.changed` broadcast triggers a
  re-read.
- [x] 6.6 Shell: switching to Prompts shows the panel and hides the folder filter/nudge; switching back
  restores folders; Profiles stays inert. Existing shell/folder + browser tests stay green.
- [x] 6.7 Real-browser (`tests/browser/`): tab switch + shadow-DOM token resolution; keyboard operation of
  the editor `Dialog` and card `Menu`.

## 7. Verify

- [x] 7.1 `npm run typecheck`, `npm run lint`, `npm test`; then `npm run test:browser`. All green.
- [x] 7.2 `npm run build` + `npm run check:size` — the prompt UI stays within bundle budgets.
