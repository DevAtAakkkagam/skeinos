## 1. Always-present Uncategorized section

- [x] 1.1 In `ui/sidebar/Sidebar.tsx`, remove the `unfiledConvs.length > 0 &&` guard around the
  Unfiled section so it renders unconditionally (caret + `sidebar.unfiled` label + count badge
  showing `unfiledConvs.length`, including `0`).
- [x] 1.2 Keep the section seeded as expanded (the `expanded` set already includes `UNFILED`);
  in `expandAll`, always include `UNFILED` (drop the `unfiledConvs.length > 0` condition).
- [x] 1.3 Confirm the empty Uncategorized body routes through `ConversationList` with
  `context.kind === 'unfiled'` (no separate empty markup added in `Sidebar.tsx`).

## 2. Retire the "No folders yet" card

- [x] 2.1 In the `status === 'ready'` + no-active-folders branch of `Sidebar.tsx`, always render
  the slim ghost "+ New folder" row; remove the `hasContentElsewhere` fork and the
  `sk-folders-empty` card markup (icon + title + body + button).
- [x] 2.2 Remove now-dead helpers/markup tied only to the card; keep the section-header "+" and
  the ghost row as the folder-creation affordances.

## 3. Unified empty copy + i18n

- [x] 3.1 Update the `kind: 'unfiled'` empty message in `ui/sidebar/ConversationList.tsx` to the
  unified string ("Your chats will appear here once you start chatting on a supported AI").
- [x] 3.2 Add/repoint the locale key in `src/locales/en.ts` and translate it in
  `de.ts`, `fr.ts`, `es.ts`, `pt.ts` (+ pseudo-locale) so the i18n completeness test passes.
- [x] 3.3 Remove the now-unreferenced `sidebar.noFolders` and `sidebar.emptyBody` keys (and any
  other strings only used by the retired card) across all locales.

## 4. Tests

- [x] 4.1 Update/replace any test asserting `sk-folders-empty` or "No folders yet" to expect the
  ghost create-folder row when a read succeeds with no folders.
- [x] 4.2 Add a test: with zero unfiled conversations and `status === 'ready'`, the Uncategorized
  section renders with a `0` count and, when expanded, shows the unified empty-state message.
- [x] 4.3 Add a test: the Uncategorized section is expanded on first paint and is included by
  "expand all".
- [x] 4.4 Run `npm run typecheck`, `npm test`, then `npm run test:browser`; fix fallout.

## 5. Verification

- [x] 5.1 Manually verify the empty workspace (no folders, no chats): ghost "+ New folder" row +
  expanded Uncategorized with the unified message; and a populated workspace still shows unfiled
  chats with a matching count.
- [x] 5.2 Run `openspec validate "always-show-uncategorized" --strict`.
