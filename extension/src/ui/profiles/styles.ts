// Profiles-tab (Instruction profiles) styles. Like the rest of the overlay, every
// rule reads from `--sk-*` theme tokens only — no hard-coded colors/spacing, no host
// classes — so the panel re-themes with everything else. Appended to SIDEBAR_CSS so
// the side panel's single mount site picks it up automatically.

export const PROFILES_CSS = `
/* --- panel frame (mirrors the Prompts body) -------------------------------- */
.sk-profiles { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.sk-profiles__scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: var(--sk-space-2); padding: var(--sk-space-2); }
.sk-profiles__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sk-space-2); }

/* A profile card: the name/description body grows; the platform logos and the overflow
   (⋯) actions menu sit top-aligned to its right — mirroring the conversation/prompt
   rows. The body is non-interactive (actions are in the ⋯ menu), so the border accents
   only on keyboard focus-within, never on hover. */
.sk-profiles__item {
  display: flex; align-items: flex-start; gap: var(--sk-space-2);
  border-radius: var(--sk-radius); background: var(--sk-color-bg);
  padding: var(--sk-space-2) var(--sk-space-2) var(--sk-space-3) var(--sk-space-3);
}
.sk-profiles__row {
  flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left;
  color: var(--sk-color-fg);
}
.sk-profiles__name { font-size: var(--sk-text-base); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-profiles__desc { font-size: var(--sk-text-sm); color: var(--sk-color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-profiles__logos { flex: none; display: inline-flex; align-items: center; gap: var(--sk-space-1); padding-top: 2px; }
.sk-profiles__logo { display: inline-flex; align-items: center; }
.sk-profiles__logo svg { display: block; }
/* The ⋯ trigger keeps its slot (opacity-only reveal, base rule in SIDEBAR_CSS) so the
   row never reflows; it stays visible while its menu is open (Zag data-state). */
.sk-profiles__menu { flex: none; }
.sk-profiles__item:hover .sk-row-menu, .sk-profiles__item:focus-within .sk-row-menu,
.sk-profiles__menu .sk-row-menu[data-state="open"] { opacity: 1; }

/* --- editor dialog (same modal style as the prompt editor) ----------------- */
.sk-profile-editor { display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 320px; max-width: 92vw; }
.sk-profile-editor__instruction { resize: vertical; min-height: 96px; font-family: inherit; line-height: 1.45; }

/* APPLY TO: a wrapping cluster of platform toggle chips, then one quiet mode caption.
   The chips reuse the shared .sk-chip selection vocabulary; the mode (PREPEND-only this
   slice) is stated once below rather than repeated per row. */
.sk-profile-editor__applies { display: flex; flex-wrap: wrap; gap: var(--sk-space-1); }
.sk-profile-editor__apply-note { margin: 2px 0 0; font-size: var(--sk-text-xs); color: var(--sk-color-muted); }

/* Response style: two label-left rows, each a segmented control pushed to the right so
   the controls align in a column and the labels read as a leading gutter. */
.sk-profile-editor__style-row { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-profile-editor__style-label { flex: none; font-size: var(--sk-text-sm); color: var(--sk-color-muted); }
.sk-profile-editor__style-row .sk-segmented { margin-left: auto; }

/* Segmented control (DESIGN §5): equal segments share one inset, Muted-tinted track; the
   active segment lifts to a Page-coloured thumb (Ink, 600) with a subtle shadow — the one
   floating surface here. Flat-accent fill stays reserved for the Save button (Weather-Not-
   Paint), so these never compete with it. */
.sk-segmented { display: inline-flex; gap: 2px; padding: 3px; background: color-mix(in srgb, var(--sk-color-muted) 12%, transparent); border-radius: calc(var(--sk-radius) + 3px); }
.sk-segmented__btn {
  background: none; color: var(--sk-color-muted); border: 0; border-radius: var(--sk-radius);
  padding: var(--sk-space-1) var(--sk-space-3); cursor: pointer; font-size: var(--sk-text-sm);
  transition: color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
}
.sk-segmented__btn:not(.sk-segmented__btn--active):hover { color: var(--sk-color-fg); }
.sk-segmented__btn:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
.sk-segmented__btn--active { color: var(--sk-color-fg); font-weight: 600; background: var(--sk-color-bg); box-shadow: 0 1px 2px color-mix(in srgb, var(--sk-color-shadow) 14%, transparent), 0 0 0 0.5px color-mix(in srgb, var(--sk-color-border) 70%, transparent); }
@media (prefers-reduced-motion: reduce) { .sk-segmented__btn { transition: none; } }

/* The editor's action row: Delete sits left, Cancel/Save right. */
.sk-profile-editor__actions { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-profile-editor__delete {
  margin-right: auto;
  color: var(--sk-color-muted);
  font-size: var(--sk-text-sm);
}
.sk-profile-editor__delete:hover, .sk-profile-editor__delete:focus-visible {
  color: var(--sk-color-danger);
  background: color-mix(in srgb, var(--sk-color-danger) 10%, transparent);
}
`;
