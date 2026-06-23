// Tag-surface styles (tokens only, no host classes / hard-coded colours): the inline
// filter chips, the shared TagPicker popover (filter + assign + inline CRUD), and the
// per-conversation-row tag chips. Concatenated into SIDEBAR_CSS alongside the other
// feature blocks.

export const TAGS_CSS = `
/* A small colour dot standing in for a tag's colour (or neutral when unset). */
.sk-tag-dot { display: inline-block; width: 9px; height: 9px; border-radius: 999px; background: var(--sk-color-border); flex: none; }

/* Inline filter chip variant: a leading tag-colour dot sits before the label. */
.sk-chip--tag .sk-tag-dot { margin-right: 4px; vertical-align: 0; }

/* ---- TagPicker popover (anchored via floating-ui; one surface for all tag jobs) -- */
.sk-tag-popover { position: fixed; z-index: 30; width: 240px; max-height: 320px; display: flex; flex-direction: column; padding: var(--sk-space-1); background: var(--sk-color-bg); border: 1px solid color-mix(in srgb, var(--sk-color-fg) 14%, var(--sk-color-border)); border-radius: var(--sk-radius); box-shadow: 0 12px 32px -8px color-mix(in srgb, var(--sk-color-shadow) 40%, transparent), 0 2px 6px color-mix(in srgb, var(--sk-color-shadow) 24%, transparent); }
.sk-tag-popover__search { margin: 0 0 var(--sk-space-1); padding: var(--sk-space-1) var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-fg); font: inherit; font-size: var(--sk-text-sm); }
.sk-tag-popover__search:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -1px; }
.sk-tag-popover__list { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
.sk-tag-popover__empty { margin: 0; padding: var(--sk-space-2); color: var(--sk-color-muted); font-size: var(--sk-text-sm); text-align: center; }

/* A tag option row: a toggle (check + dot + label [+ count]) plus a manage button. */
.sk-tag-opt { display: flex; align-items: center; }
.sk-tag-opt__toggle { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: var(--sk-space-1); padding: var(--sk-space-1) var(--sk-space-2); border: 0; border-radius: var(--sk-radius); background: none; color: var(--sk-color-fg); font: inherit; font-size: var(--sk-text-sm); text-align: left; cursor: pointer; }
.sk-tag-opt__toggle:hover { background: color-mix(in srgb, var(--sk-color-fg) 8%, transparent); }
.sk-tag-opt__toggle:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
.sk-tag-opt__check { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex: none; border: 1px solid var(--sk-color-border); border-radius: 3px; color: var(--sk-color-accent); }
.sk-tag-opt__toggle--on .sk-tag-opt__check { border-color: var(--sk-color-accent); background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); }
.sk-tag-opt__label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-tag-opt__count { color: var(--sk-color-muted); font-size: var(--sk-text-xs); flex: none; }
.sk-tag-opt__manage { flex: none; opacity: 0; }
.sk-tag-opt:hover .sk-tag-opt__manage, .sk-tag-opt:focus-within .sk-tag-opt__manage { opacity: 1; }

.sk-tag-popover__foot { border-top: 1px solid var(--sk-color-border); margin-top: var(--sk-space-1); padding-top: var(--sk-space-1); }
.sk-tag-popover__new { width: 100%; display: flex; align-items: center; gap: var(--sk-space-1); padding: var(--sk-space-1) var(--sk-space-2); border: 0; border-radius: var(--sk-radius); background: none; color: var(--sk-color-accent); font: inherit; font-size: var(--sk-text-sm); text-align: left; cursor: pointer; }
.sk-tag-popover__new:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-tag-popover__new:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }

/* The inline create/edit form within the popover. */
.sk-tag-edit { display: flex; flex-direction: column; gap: var(--sk-space-1); padding: var(--sk-space-1); }
.sk-tag-edit__name { padding: var(--sk-space-1) var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-fg); font: inherit; font-size: var(--sk-text-sm); }
.sk-tag-edit__name:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -1px; }
.sk-tag-edit__swatches { display: flex; flex-wrap: wrap; gap: 6px; margin: var(--sk-space-2) 0; }
.sk-tag-edit__error { margin: 0; color: var(--sk-color-danger); font-size: var(--sk-text-xs); }
.sk-tag-edit__actions { display: flex; align-items: center; gap: var(--sk-space-1); }
.sk-tag-edit__spacer { flex: 1; }
.sk-tag-edit__delete { border: 0; background: none; color: var(--sk-color-danger); font: inherit; font-size: var(--sk-text-sm); cursor: pointer; padding: 2px var(--sk-space-1); }
.sk-tag-edit__cancel { border: 0; background: none; color: var(--sk-color-muted); font: inherit; font-size: var(--sk-text-sm); cursor: pointer; padding: 2px var(--sk-space-1); }

/* Per-conversation-row tag chips: compact labelled pills on the row's meta line. */
/* One line, never wrapping (a wrapped chip would grow row height and crowd the ⋯
   menu): the row stays compact and clips gracefully. Chips may shrink + ellipsize;
   the "+N" overflow badge is pinned so it is never the thing that gets cut. */
.sk-conv-row__tags { display: flex; flex-wrap: nowrap; align-items: center; gap: 4px; min-width: 0; overflow: hidden; }
.sk-conv-tag { display: inline-flex; align-items: center; gap: 3px; min-width: 0; max-width: 92px; flex: 0 1 auto; padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, var(--sk-color-fg) 8%, transparent); color: var(--sk-color-muted); font-size: var(--sk-text-xs); line-height: 1.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-conv-tag .sk-tag-dot { flex: none; }
.sk-conv-tag--more { flex: none; color: var(--sk-color-muted); }
`;
