## 1. Tier model + limits (core)

- [ ] 1.1 Add `tier: 'FREE' | 'PRO'` to `Settings` in `shared/settings.ts`; default `FREE` in `DEFAULT_SETTINGS`
- [ ] 1.2 Create `core/tier/limits.ts`: `Tier`, `Resource`, `RESOURCES`, `TIER_LIMITS` (FREE = folders 5 / prompts 25 / profiles 3 / tags 10; PRO = Infinity)
- [ ] 1.3 Add shared `QuotaError` + stable `quota_exceeded` code and `{ resource, count, limit }` detail (alongside existing AppError shapes)
- [ ] 1.4 Implement `assertWithinQuota(resource, currentCount, tier)` (pure) — throws `QuotaError` at/over limit, no-op for `PRO`/Infinity
- [ ] 1.5 Unit tests for `limits.ts` + `assertWithinQuota`: boundary (count = limit-1, limit, limit+1) per resource, and PRO unlimited

## 2. Worker enforcement

- [ ] 2.1 In `core/folders/handlers.ts` `folder.create`: read tier via `getSettings()`, call `assertWithinQuota('folders', folders.length, tier)` before `put()`
- [ ] 2.2 In `core/prompts/handlers.ts` `prompt.create`: same guard with the prompts count
- [ ] 2.3 In `core/profiles/handlers.ts` `profile.create`: same guard with the profiles count
- [ ] 2.4 Verify the throw aborts before `put()` and emits no `state.changed` broadcast for that store
- [ ] 2.5 Handler tests: at-limit create rejected with `quota_exceeded` (correct resource/count/limit), under-limit succeeds, delete-then-create succeeds, PRO bypasses — per folders/prompts/profiles

## 3. Block-with-nudge UI

- [ ] 3.1 Add an upgrade-nudge component (reuse `.sk-nudge` styles) that names the reached limit; informational only, no checkout
- [ ] 3.2 Folder create flow: catch `quota_exceeded`, keep form values, show the nudge, allow retry/cancel without data loss
- [ ] 3.3 Prompt create flow: same catch + non-destructive nudge
- [ ] 3.4 Profile create flow: same catch + non-destructive nudge
- [ ] 3.5 Centralize nudge copy in the relevant `strings.ts` tables (i18n-ready); derive numbers from `TIER_LIMITS`
- [ ] 3.6 Tests: rejected create keeps entered values intact and renders the nudge; nudge presents no purchase action

## 4. Dynamic tier badge

- [ ] 4.1 `ui/sidebar/SidebarShell.tsx`: read effective tier from settings; render `FREE`/`PRO` instead of hardcoded `STR.tier='PRO'`
- [ ] 4.2 Badge re-renders on tier change (settings subscription) without reload
- [ ] 4.3 Update/extend `sk-pro-badge` tests for free-tier label and tier-change re-render

## 5. Verification

- [ ] 5.1 `npm run typecheck` + `npm test` green
- [ ] 5.2 `npm run test:browser` green (shadow-DOM badge + nudge)
- [ ] 5.3 Confirm specs ↔ tests mapping; check `tasks.md` boxes
- [ ] 5.4 Note for C7 (`tags`): tag-create handler must call `assertWithinQuota('tags', …)` — leave a pointer in the tags proposal/design
