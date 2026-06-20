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

/* TEMPORARY starter-prompt control (prompt-seed-catalog) — removed with the onboarding picker. */
.sk-prompts__starter { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sk-space-2); padding: 0 var(--sk-space-1) var(--sk-space-2); }
.sk-prompts__starter-label { font-size: 12px; color: var(--sk-color-muted); }
.sk-prompts__starter-status { flex-basis: 100%; font-size: 12px; color: var(--sk-color-muted); }

/* A chip's trailing client-derived count (category + tag filters). */
.sk-chip__count { margin-left: 4px; font-variant-numeric: tabular-nums; opacity: 0.75; }

/* Tag chips share the one filter row with categories; a quiet leading "#" marks them
   as tags (the conventional notation) without forcing a separate row or label. */
.sk-chip--tag::before { content: '#'; margin-right: 1px; opacity: 0.55; }

/* A category chip pairs its select button with a compact overflow menu (rename /
   delete). The menu trigger reuses the icon-button look, not the filled accent btn. */
.sk-prompt-cat { display: inline-flex; align-items: center; gap: 2px; }
.sk-prompt-cat__menu .sk-menu-root { display: inline-flex; }
.sk-prompt-cat__menu .sk-btn {
  background: none; color: var(--sk-color-muted); border: 0; padding: 2px;
  border-radius: var(--sk-radius); cursor: pointer; display: inline-flex; align-items: center;
}
.sk-prompt-cat__menu .sk-btn:hover, .sk-prompt-cat__menu .sk-btn:focus-visible {
  color: var(--sk-color-fg); background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); outline: none;
}
.sk-prompt-cat__menu .sk-btn svg { display: block; }

/* --- prompt card ----------------------------------------------------------- */
.sk-prompt-card {
  display: flex; flex-direction: column; gap: var(--sk-space-2);
  border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius);
  background: var(--sk-color-bg); padding: var(--sk-space-2) var(--sk-space-3);
}
.sk-prompt-card__head { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-prompt-card__title { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The inert slash alias (no insertion until C13): a quiet monospace badge. */
.sk-prompt-card__slug {
  flex: none; font-family: var(--sk-font-dot, monospace); font-size: 11px; color: var(--sk-color-accent);
  background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--sk-color-accent) 35%, transparent);
  border-radius: var(--sk-radius); padding: 0 var(--sk-space-1);
}
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
  margin: 0; color: var(--sk-color-muted); font-size: 13px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.sk-prompt-card__ellipsis { color: var(--sk-color-muted); }
.sk-prompt-card__foot { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-prompt-card__vars { font-size: 12px; color: var(--sk-color-muted); font-variant-numeric: tabular-nums; }
.sk-prompt-card__logos { display: inline-flex; align-items: center; gap: var(--sk-space-1); margin-left: auto; }
.sk-prompt-card__logo { display: inline-flex; align-items: center; }
.sk-prompt-card__logo svg { display: block; }

/* The highlighted {{variable}} chip in a body excerpt / editor preview — derived
   from the same tokenizer scan as the parsed variable list. */
.sk-prompt-var {
  font-family: var(--sk-font-dot, monospace); font-size: 0.92em; color: var(--sk-color-accent);
  background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent);
  border-radius: var(--sk-radius); padding: 0 3px; white-space: nowrap;
}

/* --- editor dialog --------------------------------------------------------- */
.sk-prompt-editor { display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 320px; max-width: 92vw; }
.sk-field__label { font-size: 12px; font-weight: 600; color: var(--sk-color-muted); }
.sk-prompt-editor__body { resize: vertical; min-height: 96px; font-family: inherit; line-height: 1.45; }
.sk-prompt-editor__vars { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-prompt-editor__vars-empty { font-size: 12px; margin: 0; }
.sk-prompt-editor__var-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sk-space-1); }
.sk-prompt-editor__var { display: inline-flex; align-items: center; gap: var(--sk-space-1); font-size: 12px; }
.sk-prompt-editor__var-type { color: var(--sk-color-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.sk-prompt-editor__var-default { color: var(--sk-color-muted); font-size: 11px; }
.sk-prompt-editor__targets { display: flex; flex-wrap: wrap; gap: var(--sk-space-1); }
.sk-prompt-editor__row { display: flex; gap: var(--sk-space-2); }
.sk-prompt-editor__col { flex: 1 1 0; min-width: 0; }
.sk-prompt-editor__col .sk-select { width: 100%; box-sizing: border-box; }
.sk-prompt-editor__new-category { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-prompt-editor__new-category .sk-input { flex: 1 1 auto; }

/* --- shared button variants (ghost / danger) ------------------------------- */
.sk-btn--ghost { background: none; color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); }
.sk-btn--ghost:hover, .sk-btn--ghost:focus-visible { border-color: var(--sk-color-accent); outline: none; }
.sk-btn--danger { background: var(--sk-color-danger, #d4504e); color: var(--sk-color-bg); }
.sk-btn--danger:hover, .sk-btn--danger:focus-visible { filter: brightness(1.08); outline: none; }
`;
