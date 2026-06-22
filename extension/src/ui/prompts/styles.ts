// Prompt-library (Prompts tab) styles. Like the rest of the overlay, every rule
// reads from `--sk-*` theme tokens only — no hard-coded colors/spacing, no host
// classes — so the panel re-themes with everything else. Appended to SIDEBAR_CSS so
// the side panel's single mount site picks it up automatically (the prompts panel
// lives inside the shell).

export const PROMPTS_CSS = `
/* --- panel frame ----------------------------------------------------------- */
/* Mirrors the folder body (sk-sidebar / sk-sidebar__scroll): a PROMPTS section header
   (reusing sk-sidebar__section-head) over a scrolling card list, so the two tabs share
   one body structure. The filter chips live in the shell's filter slot. */
.sk-prompts { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.sk-prompts__scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: var(--sk-space-2); padding: var(--sk-space-2); }
.sk-prompts__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-prompts__item { display: block; }

/* A chip's trailing client-derived count (category + tag filters). */
.sk-chip__count { margin-left: 4px; font-variant-numeric: tabular-nums; opacity: 0.75; }

/* Tag chips share the one filter row with categories; a quiet leading "#" marks them
   as tags (the conventional notation) without forcing a separate row or label. */
.sk-chip--tag::before { content: '#'; margin-right: 1px; opacity: 0.55; }

/* A category chip is ONE pill that pairs its select button with a compact rename /
   delete overflow menu. The pill surface lives on the wrapper so the label and the ⋯
   trigger read as a single unit: the inner select button is transparent, the wrapper
   carries the resting/active tint (via :has), and — mirroring the conversation-row
   menu (.sk-row-menu) — the ⋯ stays hidden until the pill is hovered, focused, or its
   category is active. Opacity-only reveal so the slot is reserved and nothing reflows. */
.sk-prompt-cat { display: inline-flex; align-items: center; border-radius: 999px; background: color-mix(in srgb, var(--sk-color-fg) 8%, transparent); }
.sk-prompt-cat:hover { background: color-mix(in srgb, var(--sk-color-fg) 12%, transparent); }
.sk-prompt-cat:has(.sk-chip--active) { background: color-mix(in srgb, var(--sk-color-accent) 18%, transparent); }
.sk-prompt-cat .sk-chip { background: none; border-radius: 999px 0 0 999px; padding-right: var(--sk-space-1); }
.sk-prompt-cat .sk-chip:focus-visible { outline-offset: -1px; }
.sk-prompt-cat__menu, .sk-prompt-cat__menu .sk-menu-root { display: inline-flex; }
.sk-prompt-cat__menu .sk-icon-btn { padding: 2px; margin-right: 4px; border-radius: 999px; opacity: 0; transition: opacity 0.12s ease; }
.sk-prompt-cat:hover .sk-prompt-cat__menu .sk-icon-btn,
.sk-prompt-cat:focus-within .sk-prompt-cat__menu .sk-icon-btn,
.sk-prompt-cat:has(.sk-chip--active) .sk-prompt-cat__menu .sk-icon-btn { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .sk-prompt-cat__menu .sk-icon-btn { transition: none; } }

/* --- prompt card ----------------------------------------------------------- */
.sk-prompt-card {
  display: flex; flex-direction: column; gap: var(--sk-space-2);
  border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius);
  background: var(--sk-color-bg); padding: var(--sk-space-2) var(--sk-space-3);
}
.sk-prompt-card__head { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-prompt-card__title { flex: 1 1 auto; min-width: 0; margin: 0; font-size: var(--sk-text-base); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The card's overflow trigger reuses the icon-button look (Menu's filled sk-btn is
   overridden here only inside the card). */
.sk-prompt-card__menu .sk-menu-root { display: inline-flex; }
.sk-prompt-card__menu .sk-btn {
  background: none; color: var(--sk-color-muted); border: 0; padding: var(--sk-space-1);
  border-radius: var(--sk-radius); cursor: pointer; display: inline-flex; align-items: center;
}
.sk-prompt-card__menu .sk-btn:hover, .sk-prompt-card__menu .sk-btn:focus-visible {
  color: var(--sk-color-fg); background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); outline: none;
}
.sk-prompt-card__menu .sk-btn svg { display: block; }
.sk-prompt-card__excerpt {
  margin: 0; color: var(--sk-color-muted); font-size: var(--sk-text-base); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.sk-prompt-card__ellipsis { color: var(--sk-color-muted); }
.sk-prompt-card__foot { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-prompt-card__vars { font-size: var(--sk-text-sm); color: var(--sk-color-muted); font-variant-numeric: tabular-nums; }
.sk-prompt-card__logos { display: inline-flex; align-items: center; gap: var(--sk-space-1); margin-left: auto; }
.sk-prompt-card__logo { display: inline-flex; align-items: center; }
.sk-prompt-card__logo svg { display: block; }

/* The highlighted {{variable}} chip in a body excerpt / editor preview — derived
   from the same tokenizer scan as the parsed variable list. */
.sk-prompt-var {
  font-family: var(--sk-font-label, monospace); font-size: 0.92em; color: var(--sk-color-accent);
  background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent);
  border-radius: var(--sk-radius); padding: 0 3px; white-space: nowrap;
}

/* --- editor dialog --------------------------------------------------------- */
.sk-prompt-editor { display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 320px; max-width: 92vw; }
.sk-field__label { font-size: var(--sk-text-sm); font-weight: 600; color: var(--sk-color-muted); }
.sk-prompt-editor__body { resize: vertical; min-height: 96px; font-family: inherit; line-height: 1.45; }
.sk-prompt-editor__vars { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-prompt-editor__vars-empty { font-size: var(--sk-text-sm); margin: 0; }
.sk-prompt-editor__var-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sk-space-1); }
.sk-prompt-editor__var { display: inline-flex; align-items: center; gap: var(--sk-space-1); font-size: var(--sk-text-sm); }
.sk-prompt-editor__var-type { color: var(--sk-color-muted); font-size: var(--sk-text-xs); text-transform: uppercase; letter-spacing: 0.04em; }
.sk-prompt-editor__var-default { color: var(--sk-color-muted); font-size: var(--sk-text-xs); }
.sk-prompt-editor__targets { display: flex; flex-wrap: wrap; gap: var(--sk-space-1); }
.sk-prompt-editor__new-category { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-prompt-editor__new-category .sk-input { flex: 1 1 auto; }

/* --- starter-pack seeding from the empty state (no-domain recovery path) -----
   Stacked layout (label · full-width picker · full-width action) so the longest
   domain ("Software engineering") never truncates inside the narrow side panel.
   Left-aligned as a small form; the parent .sk-empty centers the block itself. */
.sk-prompts__seed { display: flex; flex-direction: column; gap: var(--sk-space-2); margin-top: var(--sk-space-3); padding-top: var(--sk-space-3); border-top: 1px solid var(--sk-color-border); width: 100%; max-width: 300px; text-align: left; }
.sk-prompts__seed-label { margin: 0; font-size: var(--sk-text-sm); font-weight: 600; color: var(--sk-color-fg); }
.sk-prompts__seed-row { display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-prompts__seed-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sk-prompts__seed-field-label { font-size: var(--sk-text-xs); color: var(--sk-color-muted); }
.sk-prompts__seed-field .sk-select { width: 100%; box-sizing: border-box; }
.sk-prompts__seed-row .sk-btn { align-self: stretch; justify-content: center; }

/* --- shared button variants (ghost / danger) ------------------------------- */
.sk-btn--ghost { background: none; color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); }
.sk-btn--ghost:hover, .sk-btn--ghost:focus-visible { border-color: var(--sk-color-accent); outline: none; }
.sk-btn--danger { background: var(--sk-color-danger, #d4504e); color: var(--sk-color-bg); }
.sk-btn--danger:hover, .sk-btn--danger:focus-visible { filter: brightness(1.08); outline: none; }
`;
