// Sidebar feature styles. Like the base component CSS, every rule reads from
// `--sk-*` theme tokens only (no hard-coded colors/spacing) so the sidebar
// re-themes with the rest of the overlay. Injected into the shadow root by
// `mountSidebar`, never the host document.
//
// The interaction-primitives CSS (context menu, dialog surfaces) is appended here
// so every mount site that injects SIDEBAR_CSS picks it up automatically.

import { PRIMITIVES_CSS } from '../primitives/styles';
import { SEARCH_CSS } from '../search/styles';
import { PROMPTS_CSS } from '../prompts/styles';

const SIDEBAR_FEATURE_CSS = `
/* The sidebar fills the shell body and splits into a scrolling region (pinned ·
   folders · unfiled) and a bottom-docked archive region, so the archive sections
   never scroll out of reach behind a long folder list. */
.sk-sidebar { display: flex; flex-direction: column; min-width: 220px; flex: 1 1 auto; min-height: 0; }
.sk-sidebar__scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: var(--sk-space-2); padding: var(--sk-space-2); }
/* The archive dock: pinned below the scroll region with its own hairline + bg so
   scrolled rows never show through. Caps its own height (expanded archive scrolls
   internally) so it can never crowd out the live tree above it. */
.sk-sidebar__dock { flex: none; display: flex; flex-direction: column; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2) var(--sk-space-2); border-top: 1px solid var(--sk-color-border); background: var(--sk-color-bg); max-height: 50%; overflow-y: auto; scrollbar-gutter: stable; }
.sk-sidebar__section { display: flex; flex-direction: column; gap: var(--sk-space-1); }
/* Overline · dot font · 13 · +34% track (Lattice). Pushed toward fg + weight 600
   so it reads as a structural label, not a faint caption. */
.sk-sidebar__heading { font-family: var(--sk-font-label); color: color-mix(in srgb, var(--sk-color-muted) 60%, var(--sk-color-fg)); font-size: var(--sk-text-sm); font-weight: 500; text-transform: uppercase; letter-spacing: 0.2em; margin: var(--sk-space-2) 0 0; }
/* A standalone heading (PINNED) sits directly in the section, not inside a padded
   .sk-row like FOLDERS/ARCHIVE — so add the row's inline padding to line its label
   up with the other section labels. */
.sk-sidebar__heading--block { padding-inline: var(--sk-space-2); }
.sk-row { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: default; }
.sk-row:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-row--drop { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
/* A pinned shortcut row jumps to the folder's canonical tree copy — show it is
   activatable, and give keyboard users a visible focus ring. */
.sk-row--jump { cursor: pointer; }
.sk-row--jump:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
/* Subtle pulse on the tree row a jump lands on, so the eye catches where it went:
   a soft accent wash plus a ring that swells then settles — a gentle nudge, not a
   flash. */
.sk-row[data-jump-flash] { animation: sk-jump-flash 1.1s cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes sk-jump-flash {
  0% {
    background: color-mix(in srgb, var(--sk-color-accent) 22%, transparent);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--sk-color-accent) 45%, transparent);
  }
  35% {
    background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--sk-color-accent) 28%, transparent);
  }
  100% {
    background: transparent;
    box-shadow: 0 0 0 0 transparent;
  }
}
@media (prefers-reduced-motion: reduce) { .sk-row[data-jump-flash] { animation: none; } }
/* Folder / Unfiled names are the tree's anchors: bold them so conversation titles
   (regular weight) read as the level below. The weight contrast carries hierarchy. */
.sk-row__label { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.sk-row__count { color: var(--sk-color-muted); font-variant-numeric: tabular-nums; }
.sk-row__icon { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 1.2em; }
.sk-row__icon svg { display: block; }
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
.sk-sidebar__section-head { justify-content: space-between; border-radius: 0; padding-bottom: var(--sk-space-2); margin-bottom: 2px; }
/* The heading underline divides it from its list — only meaningful when expanded.
   When collapsed it would stack against the footer's top border (double rule). */
details[open] > .sk-sidebar__section-head { border-bottom: 1px solid var(--sk-color-border); }
.sk-sidebar__section-head:hover { background: none; }
/* Inside a head row the overline drops its own top margin so the caret, label, and
   trailing meta (+ / count) center on one line; section spacing comes from the
   sidebar/section gaps. The label grows to push the trailing meta to the far edge. */
.sk-sidebar__section-head .sk-sidebar__heading { margin: 0; flex: 1 1 auto; }
/* The collapsible Archive header reuses the FOLDERS framing, with the browser's
   default disclosure triangle swapped for the tree's own chevron so every section
   title reads identically. */
.sk-sidebar__section-summary { cursor: pointer; list-style: none; }
.sk-sidebar__section-summary::-webkit-details-marker { display: none; }
.sk-sidebar__section-summary:hover { background: none; }
.sk-sidebar__section-summary:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
.sk-section-caret { pointer-events: none; order: 3; margin-left: var(--sk-space-2); }
details[open] > .sk-sidebar__section-summary .sk-section-caret svg { transform: rotate(90deg); }
.sk-icon-btn { display: inline-flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--sk-color-muted); font: inherit; line-height: 1; cursor: pointer; padding: var(--sk-space-1); border-radius: var(--sk-radius); }
.sk-icon-btn:hover, .sk-icon-btn:focus-visible { color: var(--sk-color-fg); background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); outline: none; }
/* The create action (＋) in a section header reads as the action, not another view
   toggle: tinted to the accent at rest so it stands out from the muted expand/collapse
   icons beside it, while staying a quiet 16px glyph (one accent mark per header). Both
   tabs' "new" buttons use it, so the create affordance matches across Folders / Prompts. */
.sk-icon-btn--accent { color: var(--sk-color-accent); }
.sk-icon-btn--accent:hover, .sk-icon-btn--accent:focus-visible { color: var(--sk-color-accent); }
/* The per-row actions trigger (⋯) stays out of the resting row: revealed on row
   hover or keyboard focus (and held open while its menu is). Opacity-only so it
   keeps its slot and the count never reflows; flex:none so it never shrinks. */
.sk-row-menu { flex: none; margin-left: auto; opacity: 0; transition: opacity 0.12s ease; }
.sk-row:hover .sk-row-menu, .sk-row:focus-within .sk-row-menu,
.sk-conv-row:hover .sk-row-menu, .sk-conv-row:focus-within .sk-row-menu,
.sk-row-menu:focus-visible, .sk-row-menu[data-state="open"] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .sk-row-menu { transition: none; } }
.sk-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--sk-space-2); padding: var(--sk-space-3) var(--sk-space-2); }
.sk-empty__icon { display: inline-flex; color: var(--sk-color-muted); }
.sk-empty__title { font-weight: 600; font-size: var(--sk-text-title); margin: 0; }
.sk-empty__body { color: var(--sk-color-muted); font-size: var(--sk-text-base); margin: 0; }
/* Demoted create affordance: when there are no folders yet but the user already
   has unfiled/archived conversations, the full blank-slate card would wrongly lead
   over real content. Instead a slim dashed "New folder" row sits under the FOLDERS
   header (same dashed-ghost language as the "+ Tag" filter seam), muted at rest and
   warming to the accent on hover/focus — a quiet invitation, not a pitch. */
.sk-ghost-row { display: flex; align-items: center; gap: var(--sk-space-2); width: 100%; padding: var(--sk-space-1) var(--sk-space-2); border: 1px dashed var(--sk-color-border); border-radius: var(--sk-radius); background: none; color: var(--sk-color-muted); font: inherit; text-align: left; cursor: pointer; }
.sk-ghost-row:hover, .sk-ghost-row:focus-visible { color: var(--sk-color-accent); border-color: color-mix(in srgb, var(--sk-color-accent) 50%, var(--sk-color-border)); background: color-mix(in srgb, var(--sk-color-accent) 8%, transparent); outline: none; }
.sk-ghost-row svg { display: block; flex: none; }
/* Load states: a delayed spinner (no flash on warm reads) and the failed-load
   retry affordance. Both reuse the centered sk-empty layout. */
.sk-spinner { width: 22px; height: 22px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--sk-color-muted) 35%, transparent); border-top-color: var(--sk-color-accent); animation: sk-spin 0.7s linear infinite; }
@keyframes sk-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .sk-spinner { animation-duration: 1.6s; } }
/* Inline form error (folder dialog): kept input + a surfaced failure (PRIV). */
.sk-dialog__error { color: var(--sk-color-danger, #d4504e); font-size: var(--sk-text-base); margin: 0; }
/* The context menu and folder dialog surfaces now come from the interaction-
   primitives layer (PRIMITIVES_CSS); only the folder form's own layout lives here. */
.sk-dialog__body { display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-field { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-input { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-1) var(--sk-space-2); font: inherit; }
.sk-dialog__actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--sk-space-2); margin-top: var(--sk-space-1); }

/* --- create / edit folder dialog (design 03·05) ---------------------------- */
.sk-folder-form { min-width: 300px; gap: var(--sk-space-3); }
.sk-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sk-space-2); }
.sk-dialog__title { font-size: var(--sk-text-title); font-weight: 600; margin: 0; }
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
.sk-picker__title { font-weight: 600; font-size: var(--sk-text-title); margin: 0; }
.sk-picker__input { width: 100%; box-sizing: border-box; }
.sk-picker__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow: auto; scrollbar-gutter: stable; }
.sk-picker__option { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: pointer; }
.sk-picker__option--active { background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); }
.sk-picker__option--unfile { color: var(--sk-color-muted); }
.sk-picker__option--create { color: var(--sk-color-accent); }
.sk-picker__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-picker__path { color: var(--sk-color-muted); font-size: var(--sk-text-sm); white-space: nowrap; }
.sk-picker__empty { padding: var(--sk-space-2); color: var(--sk-color-muted); font-size: var(--sk-text-base); }

/* --- conversations list (inline, nested under an expanded node) ------------- */
.sk-conv-list { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-conv-list__items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
/* Left padding lines the row's leading logo up with the parent folder's icon: the
   folder row reserves caret(16px)+gap(8px) before its icon, the nested list only
   recovers 12px of that via .sk-node__children margin — so add the remaining 12px. */
.sk-conv-row { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2) var(--sk-space-1) calc(var(--sk-space-2) + var(--sk-space-3)); border-radius: var(--sk-radius); cursor: grab; }
.sk-conv-row:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
/* The conversation open in the active tab (aria-current): a deeper accent fill plus
   an accent, bold title so the open chat is unmistakable, not just faintly tinted. */
.sk-conv-row--active { background: color-mix(in srgb, var(--sk-color-accent) 24%, transparent); }
.sk-conv-row--active:hover { background: color-mix(in srgb, var(--sk-color-accent) 30%, transparent); }
.sk-conv-row--active .sk-conv-row__title { font-weight: 700; color: var(--sk-color-accent); }
/* Logo top-aligns with the title (not floating between the two lines); the row
   itself still centres the trailing pin/⋯ controls. */
.sk-conv-row__main { flex: 1; display: flex; flex-direction: row; align-items: flex-start; gap: var(--sk-space-2); min-width: 0; text-align: left; background: none; border: 0; padding: 0; margin: 0; font: inherit; color: inherit; cursor: pointer; }
/* Two-line text column: title on top, a muted meta line (relative time) below. */
.sk-conv-row__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.sk-conv-row__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-conv-row__meta { display: flex; align-items: center; gap: var(--sk-space-1); min-width: 0; }
.sk-conv-row__time { color: var(--sk-color-muted); font-size: var(--sk-text-sm); line-height: 1; white-space: nowrap; }
/* Platform brand logo: the row's leading mark (always present), keyed by the
   conversation's platform. Fixed box so titles align regardless of glyph. */
.sk-conv-row__logo { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; margin-top: 2px; }
.sk-conv-row__logo svg { display: block; }
/* Pinned badge: an always-visible status marker (unlike the hover-only ⋯ menu) in
   the accent colour, so a pinned row reads as pinned at a glance. */
.sk-conv-row__pin { flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--sk-color-accent); }
.sk-conv-row__pin svg { display: block; }
.sk-conv-list__cap { color: var(--sk-color-muted); font-size: var(--sk-text-sm); margin: var(--sk-space-1) 0 0; }

/* --- shell frame (header · search · tabs · filters · body · footer) --------- */
.sk-shell { position: relative; display: flex; flex-direction: column; height: 100%; min-width: 260px; background: var(--sk-color-bg); color: var(--sk-color-fg); }
.sk-shell__header { display: flex; align-items: center; justify-content: space-between; gap: var(--sk-space-2); padding: var(--sk-space-2) var(--sk-space-3); border-bottom: 1px solid var(--sk-color-border); }
/* The expanded header shows only the workspace label — the app name/glyph live in
   the browser's native side-panel title bar (see SidebarShell), not here. */
.sk-brand { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-brand__sub { display: inline-flex; align-items: center; gap: var(--sk-space-2); color: color-mix(in srgb, var(--sk-color-muted) 45%, var(--sk-color-fg)); font-size: var(--sk-text-sm); font-weight: 600; letter-spacing: 0.01em; }
/* Presence dot: the workspace is live/local (design 02 mint indicator). A soft halo
   ring lifts it off the header so "live" reads at a glance. */
.sk-brand__status { width: 7px; height: 7px; border-radius: 50%; background: var(--sk-color-success); flex: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--sk-color-success) 22%, transparent); }
.sk-search { display: flex; align-items: center; gap: var(--sk-space-2); margin: var(--sk-space-2) var(--sk-space-3) 0; padding: var(--sk-space-1) var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-muted); font: inherit; cursor: default; }
.sk-search__icon { display: inline-flex; align-items: center; color: var(--sk-color-muted); }
.sk-search__icon svg { display: block; }
.sk-search__placeholder { flex: 1; text-align: left; }
.sk-search__kbd { font-family: var(--sk-font-system); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: 0 var(--sk-space-1); font-size: var(--sk-text-xs); }
.sk-tabs { display: flex; gap: var(--sk-space-1); padding: var(--sk-space-2) var(--sk-space-3) 0; }
.sk-tab { flex: 1; text-align: center; background: none; border: 0; border-bottom: 3px solid transparent; color: var(--sk-color-muted); font: inherit; padding: var(--sk-space-1) var(--sk-space-2); cursor: pointer; }
.sk-tab:not([disabled]):hover { color: var(--sk-color-fg); }
.sk-tab--active { color: var(--sk-color-fg); font-weight: 700; border-bottom-color: var(--sk-color-accent); }
/* One unified filter row: platform chips and the inert "+ Tag" seam share a single
   wrapping chip flow. No leading captions — a lone "All" reset chip needs none. */
.sk-filters { padding: var(--sk-space-3) var(--sk-space-3) 0; }
.sk-filter-row__chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sk-space-1); }
/* Live filter chips (D28): pointer, hover lift, and a visible focus ring; the active
   chip keeps its accent tint through hover. The disabled "+ Tag" seam opts out below. */
.sk-chip { background: color-mix(in srgb, var(--sk-color-fg) 8%, transparent); border: 0; border-radius: 999px; color: var(--sk-color-muted); font: inherit; font-size: var(--sk-text-sm); padding: 2px var(--sk-space-2); cursor: pointer; }
.sk-chip:not([disabled]):hover { color: var(--sk-color-fg); }
.sk-chip--active { background: color-mix(in srgb, var(--sk-color-accent) 18%, transparent); color: color-mix(in srgb, var(--sk-color-accent) 70%, var(--sk-color-fg)); }
.sk-chip--active:hover { color: color-mix(in srgb, var(--sk-color-accent) 70%, var(--sk-color-fg)); }
.sk-chip:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: 2px; }
/* The "+ Tag" seam (inert until C7/M2): a dashed ghost that reads as a future add. */
.sk-chip--add { background: none; border: 1px dashed var(--sk-color-border); }
/* Brand logo before a platform chip's label (the "All" chip carries none). */
.sk-chip__logo { display: inline-flex; align-items: center; vertical-align: -2px; margin-right: 4px; }
.sk-chip__logo svg { display: block; }
/* Collapsed-list nudge: a soft accent-tinted hint shown when a platform hides its
   conversation list behind a collapsed drawer (Gemini). Sits between the filter row
   and the folder body; reads from tokens only. */
.sk-nudge { display: flex; align-items: flex-start; gap: var(--sk-space-2); margin: var(--sk-space-2) var(--sk-space-3) 0; padding: var(--sk-space-2); border: 1px solid color-mix(in srgb, var(--sk-color-accent) 35%, transparent); background: color-mix(in srgb, var(--sk-color-accent) 10%, transparent); border-radius: var(--sk-radius); }
.sk-nudge__logo { display: inline-flex; flex: none; margin-top: 1px; }
.sk-nudge__logo svg { display: block; }
.sk-nudge__text { color: var(--sk-color-fg); font-size: var(--sk-text-sm); line-height: 1.4; }
/* The body delegates scrolling to the sidebar's own scroll region so the archive
   dock can stay pinned to the bottom; it only frames the sidebar to fill height. */
.sk-shell__body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.sk-shell__footer { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-2) var(--sk-space-3); border-top: 1px solid var(--sk-color-border); }
.sk-badge { font-size: var(--sk-text-xs); font-weight: 700; letter-spacing: 0.04em; color: color-mix(in srgb, var(--sk-color-accent) 70%, var(--sk-color-fg)); background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--sk-color-accent) 40%, transparent); border-radius: var(--sk-radius); padding: 0 var(--sk-space-1); }
.sk-sync { flex: 1; color: var(--sk-color-muted); font-size: var(--sk-text-sm); }

/* --- disabled feature stubs: present but visibly inert --------------------- */
.sk-search[disabled], .sk-tab[disabled], .sk-chip[disabled] { opacity: 0.55; cursor: not-allowed; }
`;

export const SIDEBAR_CSS = `${SIDEBAR_FEATURE_CSS}\n${PRIMITIVES_CSS}\n${SEARCH_CSS}\n${PROMPTS_CSS}`;
