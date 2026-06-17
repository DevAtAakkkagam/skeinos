// Sidebar feature styles. Like the base component CSS, every rule reads from
// `--sk-*` theme tokens only (no hard-coded colors/spacing) so the sidebar
// re-themes with the rest of the overlay. Injected into the shadow root by
// `mountSidebar`, never the host document.
//
// The interaction-primitives CSS (context menu, dialog surfaces) is appended here
// so every mount site that injects SIDEBAR_CSS picks it up automatically.

import { PRIMITIVES_CSS } from '../primitives/styles';

const SIDEBAR_FEATURE_CSS = `
.sk-sidebar { display: flex; flex-direction: column; gap: var(--sk-space-2); padding: var(--sk-space-2); min-width: 220px; }
.sk-sidebar__section { display: flex; flex-direction: column; gap: var(--sk-space-1); }
/* Overline · dot font · 13 · +34% track (Lattice). Pushed toward fg + weight 600
   so it reads as a structural label, not a faint caption. */
.sk-sidebar__heading { font-family: var(--sk-font-dot); color: color-mix(in srgb, var(--sk-color-muted) 60%, var(--sk-color-fg)); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.34em; margin: var(--sk-space-2) 0 0; }
.sk-row { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: default; }
.sk-row:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-row--drop { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
/* Folder / Unfiled names are the tree's anchors: bold them so conversation titles
   (regular weight) read as the level below. The weight contrast carries hierarchy. */
.sk-row__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.sk-row__count { color: var(--sk-color-muted); font-variant-numeric: tabular-nums; }
.sk-row__icon { width: 1.2em; text-align: center; }
/* Disclosure caret on expandable folder / Unfiled rows; a matching spacer keeps
   non-expandable (pinned/archive) leaf rows aligned with them. */
.sk-caret { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 16px; height: 16px; padding: 0; background: none; border: 0; color: var(--sk-color-muted); cursor: pointer; border-radius: var(--sk-radius); }
.sk-caret:hover, .sk-caret:focus-visible { color: var(--sk-color-fg); outline: none; }
.sk-caret svg { display: block; transition: transform 0.12s ease; }
.sk-caret[aria-expanded="true"] svg { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .sk-caret svg { transition: none; } }
.sk-caret-spacer { display: inline-block; flex: none; width: 16px; }
/* Conversations nested under an expanded folder / Unfiled node. */
.sk-node__children { display: flex; flex-direction: column; gap: var(--sk-space-1); margin-left: 12px; }
/* The FOLDERS overline gets a full-width hairline under it, anchoring the section
   instead of letting the label float over the rows. */
.sk-sidebar__section-head { justify-content: space-between; border-radius: 0; border-bottom: 1px solid var(--sk-color-border); padding-bottom: var(--sk-space-2); margin-bottom: 2px; }
.sk-sidebar__section-head:hover { background: none; }
.sk-icon-btn { display: inline-flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--sk-color-muted); font: inherit; line-height: 1; cursor: pointer; padding: var(--sk-space-1); border-radius: var(--sk-radius); }
.sk-icon-btn:hover, .sk-icon-btn:focus-visible { color: var(--sk-color-fg); background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); outline: none; }
.sk-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--sk-space-2); padding: var(--sk-space-3) var(--sk-space-2); }
.sk-empty__icon { display: inline-flex; color: var(--sk-color-muted); }
.sk-empty__title { font-weight: 600; font-size: 15px; margin: 0; }
.sk-empty__body { color: var(--sk-color-muted); font-size: 13px; margin: 0; }
/* Load states: a delayed spinner (no flash on warm reads) and the failed-load
   retry affordance. Both reuse the centered sk-empty layout. */
.sk-spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--sk-color-muted) 35%, transparent); border-top-color: var(--sk-color-accent); animation: sk-spin 0.7s linear infinite; }
@keyframes sk-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .sk-spinner { animation-duration: 1.6s; } }
/* Inline form error (folder dialog): kept input + a surfaced failure (PRIV). */
.sk-dialog__error { color: var(--sk-color-danger, #d4504e); font-size: 13px; margin: 0; }
/* The context menu and folder dialog surfaces now come from the interaction-
   primitives layer (PRIMITIVES_CSS); only the folder form's own layout lives here. */
.sk-dialog__body { display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-field { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-input { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-1) var(--sk-space-2); font: inherit; }
.sk-dialog__actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--sk-space-2); margin-top: var(--sk-space-1); }

/* --- create / edit folder dialog (design 03·05) ---------------------------- */
.sk-folder-form { min-width: 300px; gap: var(--sk-space-3); }
.sk-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sk-space-2); }
.sk-dialog__title { font-size: 16px; font-weight: 600; margin: 0; }
/* Fieldsets carry the swatch/icon groups but must not draw the native frame. */
.sk-fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.sk-fieldset legend { padding: 0; }
/* Name input with a leading icon preview of the chosen folder glyph. */
.sk-name-field { display: flex; align-items: center; gap: var(--sk-space-2); background: var(--sk-color-bg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-1) var(--sk-space-2); }
.sk-name-field:focus-within { border-color: var(--sk-color-accent); }
.sk-name-field__icon { display: inline-flex; align-items: center; justify-content: center; width: 1.2em; color: var(--sk-color-muted); flex: none; }
.sk-name-field__input { flex: 1; min-width: 0; background: none; border: 0; color: var(--sk-color-fg); font: inherit; padding: 0; }
.sk-name-field__input:focus { outline: none; }
/* Colour swatches: circular, the selected one ringed in the accent. */
.sk-swatches { display: flex; flex-wrap: wrap; gap: var(--sk-space-2); }
.sk-swatch { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--sk-color-fg) 14%, transparent); cursor: pointer; }
.sk-swatch--clear { background: var(--sk-color-bg); position: relative; }
.sk-swatch--clear::after { content: ""; position: absolute; left: 50%; top: 2px; bottom: 2px; width: 1px; background: var(--sk-color-muted); transform: rotate(45deg); }
.sk-swatch--selected { box-shadow: 0 0 0 2px var(--sk-color-bg), 0 0 0 4px var(--sk-color-accent); }
.sk-swatch:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--sk-color-bg), 0 0 0 4px var(--sk-color-accent); }
/* Icon grid: square cells, the selected one outlined + tinted in the accent. */
.sk-icon-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--sk-space-1); }
.sk-icon-option { display: inline-flex; align-items: center; justify-content: center; aspect-ratio: 1; padding: 0; font-size: 16px; line-height: 1; background: var(--sk-color-bg); color: var(--sk-color-muted); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); cursor: pointer; }
.sk-icon-option:hover, .sk-icon-option:focus-visible { border-color: var(--sk-color-accent); outline: none; }
.sk-icon-option--selected { border-color: var(--sk-color-accent); background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-folder-form .sk-select { width: 100%; box-sizing: border-box; }

/* --- Move-to-folder picker (conversation-filing) --------------------------- */
.sk-picker { display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 280px; }
.sk-picker__title { font-weight: 600; font-size: 15px; margin: 0; }
.sk-picker__input { width: 100%; box-sizing: border-box; }
.sk-picker__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow: auto; }
.sk-picker__option { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: pointer; }
.sk-picker__option--active { background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); }
.sk-picker__option--unfile { color: var(--sk-color-muted); }
.sk-picker__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-picker__path { color: var(--sk-color-muted); font-size: 12px; white-space: nowrap; }
.sk-picker__empty { padding: var(--sk-space-2); color: var(--sk-color-muted); font-size: 13px; }

/* --- conversations list (inline, nested under an expanded node) ------------- */
.sk-conv-list { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-conv-list__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sk-conv-row { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: grab; }
.sk-conv-row:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
/* The conversation open in the active tab (aria-current): a deeper accent fill plus
   an accent, bold title so the open chat is unmistakable, not just faintly tinted. */
.sk-conv-row--active { background: color-mix(in srgb, var(--sk-color-accent) 24%, transparent); }
.sk-conv-row--active:hover { background: color-mix(in srgb, var(--sk-color-accent) 30%, transparent); }
.sk-conv-row--active .sk-conv-row__title { font-weight: 700; color: var(--sk-color-accent); }
.sk-conv-row__main { flex: 1; display: flex; flex-direction: row; align-items: center; gap: var(--sk-space-2); min-width: 0; text-align: left; background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; }
.sk-conv-row__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Colour indicator on a coloured conversation row (parity with folder colour). */
.sk-conv-row__dot { flex: none; width: 8px; height: 8px; border-radius: 50%; }
.sk-conv-list__cap { color: var(--sk-color-muted); font-size: 12px; margin: var(--sk-space-1) 0 0; }
/* Inline colour-swatch row inside the conversation context menu (design 08). */
.sk-menu__swatches { display: flex; flex-wrap: wrap; gap: var(--sk-space-1); padding: var(--sk-space-1) var(--sk-space-2); }

/* --- shell frame (header · search · tabs · tags · body · footer) ------------- */
.sk-shell { display: flex; flex-direction: column; height: 100%; min-width: 260px; background: var(--sk-color-bg); color: var(--sk-color-fg); }
.sk-shell__header { display: flex; align-items: center; justify-content: space-between; gap: var(--sk-space-2); padding: var(--sk-space-2) var(--sk-space-3); border-bottom: 1px solid var(--sk-color-border); }
/* The expanded header shows only the workspace label — the app name/glyph live in
   the browser's native side-panel title bar (see SidebarShell), not here. */
.sk-brand { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-brand__sub { display: inline-flex; align-items: center; gap: var(--sk-space-2); color: color-mix(in srgb, var(--sk-color-muted) 45%, var(--sk-color-fg)); font-size: 12px; font-weight: 600; letter-spacing: 0.01em; }
/* Presence dot: the workspace is live/local (design 02 mint indicator). A soft halo
   ring lifts it off the header so "live" reads at a glance. */
.sk-brand__status { width: 7px; height: 7px; border-radius: 50%; background: var(--sk-color-success); flex: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--sk-color-success) 22%, transparent); }
.sk-search { display: flex; align-items: center; gap: var(--sk-space-2); margin: var(--sk-space-2) var(--sk-space-3) 0; padding: var(--sk-space-1) var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-muted); font: inherit; cursor: default; }
.sk-search__icon { display: inline-flex; align-items: center; color: var(--sk-color-muted); }
.sk-search__icon svg { display: block; }
.sk-search__placeholder { flex: 1; text-align: left; }
.sk-search__kbd { font-family: var(--sk-font-system); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: 0 var(--sk-space-1); font-size: 11px; }
.sk-tabs { display: flex; gap: var(--sk-space-1); padding: var(--sk-space-2) var(--sk-space-3) 0; }
.sk-tab { flex: 1; text-align: center; background: none; border: 0; border-bottom: 3px solid transparent; color: var(--sk-color-muted); font: inherit; padding: var(--sk-space-1) var(--sk-space-2); cursor: pointer; }
.sk-tab:not([disabled]):hover { color: var(--sk-color-fg); }
.sk-tab--active { color: var(--sk-color-fg); font-weight: 700; border-bottom-color: var(--sk-color-accent); }
.sk-tags { display: flex; flex-wrap: wrap; gap: var(--sk-space-1); padding: var(--sk-space-2) var(--sk-space-3) 0; }
.sk-chip { background: color-mix(in srgb, var(--sk-color-fg) 8%, transparent); border: 0; border-radius: 999px; color: var(--sk-color-muted); font: inherit; font-size: 12px; padding: 2px var(--sk-space-2); cursor: default; }
.sk-chip--active { background: color-mix(in srgb, var(--sk-color-accent) 18%, transparent); color: var(--sk-color-accent); }
.sk-chip--add { background: none; border: 1px dashed var(--sk-color-border); }
.sk-shell__body { flex: 1; overflow: auto; }
.sk-shell__footer { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-2) var(--sk-space-3); border-top: 1px solid var(--sk-color-border); }
.sk-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--sk-color-accent); background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--sk-color-accent) 40%, transparent); border-radius: var(--sk-radius); padding: 0 var(--sk-space-1); }
.sk-sync { flex: 1; color: var(--sk-color-muted); font-size: 12px; }

/* --- disabled feature stubs: present but visibly inert --------------------- */
.sk-search[disabled], .sk-tab[disabled], .sk-chip[disabled] { opacity: 0.55; cursor: not-allowed; }
`;

export const SIDEBAR_CSS = `${SIDEBAR_FEATURE_CSS}\n${PRIMITIVES_CSS}`;
