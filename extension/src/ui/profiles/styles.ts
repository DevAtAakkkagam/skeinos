// Profiles-tab (Instruction profiles) styles. Like the rest of the overlay, every
// rule reads from `--sk-*` theme tokens only — no hard-coded colors/spacing, no host
// classes — so the panel re-themes with everything else. Appended to SIDEBAR_CSS so
// the side panel's single mount site picks it up automatically.

export const PROFILES_CSS = `
/* --- panel frame (mirrors the Prompts body) -------------------------------- */
.sk-profiles { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
.sk-profiles__scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: var(--sk-space-2); padding: var(--sk-space-2); }
.sk-profiles__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-profiles__item { display: block; }

/* A profile row: a full-width clickable card (opens the editor modal). */
.sk-profiles__row {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; cursor: pointer;
  border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius);
  background: var(--sk-color-bg); padding: var(--sk-space-2) var(--sk-space-3);
}
.sk-profiles__row:hover, .sk-profiles__row:focus-visible { border-color: var(--sk-color-accent); outline: none; }
.sk-profiles__head { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-profiles__name { flex: 1 1 auto; min-width: 0; font-size: var(--sk-text-title); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-profiles__desc { font-size: var(--sk-text-sm); color: var(--sk-color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-profiles__logos { flex: none; display: inline-flex; align-items: center; gap: var(--sk-space-1); margin-left: auto; }
.sk-profiles__logo { display: inline-flex; align-items: center; }
.sk-profiles__logo svg { display: block; }

/* --- editor dialog (same modal style as the prompt editor) ----------------- */
.sk-profile-editor { display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 320px; max-width: 92vw; }
.sk-profile-editor__instruction { resize: vertical; min-height: 96px; font-family: inherit; line-height: 1.45; }

/* APPLY TO rows: a platform toggle chip + its (PREPEND) mode label. */
.sk-profile-editor__applies { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-profile-editor__applies-row { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-profile-editor__mode {
  font-family: var(--sk-font-label, monospace); font-size: var(--sk-text-xs); letter-spacing: 0.04em;
  color: var(--sk-color-muted);
}

/* Response style: two labelled segmented controls. */
.sk-profile-editor__style-group { display: flex; flex-direction: column; gap: 2px; }
.sk-profile-editor__style-label { font-size: var(--sk-text-xs); color: var(--sk-color-muted); }
.sk-segmented { display: inline-flex; border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); overflow: hidden; align-self: flex-start; }
.sk-segmented__btn {
  background: var(--sk-color-bg); color: var(--sk-color-fg); border: 0; border-left: 1px solid var(--sk-color-border);
  padding: var(--sk-space-1) var(--sk-space-3); cursor: pointer; font-size: var(--sk-text-sm);
}
.sk-segmented__btn:first-child { border-left: 0; }
.sk-segmented__btn:not(.sk-segmented__btn--active):hover, .sk-segmented__btn:not(.sk-segmented__btn--active):focus-visible { outline: none; background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-segmented__btn--active { background: var(--sk-color-accent); color: var(--sk-color-bg); }
.sk-segmented__btn--active:hover, .sk-segmented__btn--active:focus-visible { outline: none; background: color-mix(in srgb, var(--sk-color-accent) 85%, black); }

/* The editor's action row: Delete sits left, Cancel/Save right. */
.sk-profile-editor__actions { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-profile-editor__delete { margin-right: auto; }
`;
