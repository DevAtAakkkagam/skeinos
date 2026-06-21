// Input-bar feature styles. Every rule reads from `--sk-*` theme tokens only (no
// hard-coded colors/spacing) so the bar re-themes with the rest of the overlay.
// Injected into the bar's shadow root by `mountInputBar`, never the host document.
//
// `PRIMITIVES_CSS` (the dialog/menu surfaces) is appended so the variable-fill modal
// — which mounts the shared `Dialog` primitive — is styled inside this shadow root.
// The form classes the modal reuses (`sk-field`, `sk-input`, `sk-dialog__*`) live in
// the sidebar/prompts bundles, which the bar does not load, so the small set it needs
// is defined here too (kept token-only and in sync with those definitions).

import { PRIMITIVES_CSS } from '../primitives/styles';

const INPUT_BAR_FEATURE_CSS = `
/* The docked bar: a slim horizontal strip above the host composer. Token-styled so
   it sits in the overlay's visual language regardless of the host page. Forced to a
   full-width block with a high stacking context so it sits ON TOP of the host
   composer chrome consistently (some hosts, e.g. Perplexity, otherwise clip or paint
   over it). The mount host is also block/full-width so the bar lands on its own line
   regardless of the anchor's display. */
.sk-input-bar { position: relative; z-index: 2147483646; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: var(--sk-space-1); padding: var(--sk-space-2) var(--sk-space-3); background: var(--sk-color-bg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); font-family: var(--sk-font-body); color: var(--sk-color-fg); }

/* Brand mark + wordmark: identifies the strip as Skeinos, set apart from the host's
   own composer controls. The glyph carries the fixed brand accent; the wordmark uses
   the muted ramp so it reads as a label, not a button. */
.sk-ib-brand { display: inline-flex; align-items: center; gap: var(--sk-space-1); color: var(--sk-color-accent); padding-right: var(--sk-space-1); margin-right: var(--sk-space-1); border-right: 1px solid var(--sk-color-border); }
.sk-ib-brand__name { font-size: var(--sk-text-sm); font-weight: 600; letter-spacing: 0.01em; color: var(--sk-color-fg); }

/* The Skeinos prompt-picker trigger — the one active control on the bar today.
   Labelled "Insert prompt" (input-bar-shortcut D-1); sized to its text like the
   sibling stub controls, not the old fixed slash-glyph square. */
.sk-ib-trigger { display: inline-flex; align-items: center; gap: var(--sk-space-1); height: 28px; padding: 0 var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-fg); font: inherit; font-size: var(--sk-text-sm); cursor: pointer; }
.sk-ib-trigger:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-ib-trigger:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: 2px; }
.sk-ib-trigger[aria-expanded="true"] { background: color-mix(in srgb, var(--sk-color-accent) 18%, transparent); }

/* OS-aware keyboard hint (⌘/ · Ctrl+/) on the trigger: a quiet inset badge so the
   shortcut is discoverable without competing with the label. */
.sk-ib-kbd { display: inline-flex; align-items: center; padding: 1px var(--sk-space-1); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: color-mix(in srgb, var(--sk-color-fg) 6%, transparent); color: var(--sk-color-muted); font-family: var(--sk-font-mono, monospace); font-size: var(--sk-text-xs); line-height: 1.4; }

/* Deferred-control stub (C24 model): visibly inert, reserving layout. */
.sk-ib-stub { display: inline-flex; align-items: center; height: 28px; padding: 0 var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: transparent; color: var(--sk-color-muted); font: inherit; font-size: var(--sk-text-sm); opacity: 0.55; cursor: not-allowed; }

/* The functional Profile chip (profile-activation): same footprint as the trigger so
   the bar keeps its rhythm. Shows the active profile's name and opens the menu. The
   --inactive variant marks an active profile that does not apply to this site. */
.sk-ib-chip { display: inline-flex; align-items: center; gap: var(--sk-space-1); max-width: 160px; height: 28px; padding: 0 var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-fg); font: inherit; font-size: var(--sk-text-sm); cursor: pointer; }
.sk-ib-chip:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-ib-chip:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: 2px; }
.sk-ib-chip[aria-expanded="true"] { background: color-mix(in srgb, var(--sk-color-accent) 18%, transparent); }
.sk-ib-chip--inactive { color: var(--sk-color-muted); }
.sk-ib-chip__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* The Profile menu: a floating panel positioned by useFloating (opens upward), styled
   like the slash popover so the two read as one family. */
.sk-ib-menu { position: absolute; z-index: 2147483646; width: 260px; max-width: 90vw; display: flex; flex-direction: column; background: var(--sk-color-bg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); box-shadow: 0 8px 28px color-mix(in srgb, var(--sk-color-fg) 22%, transparent); overflow: hidden; padding: var(--sk-space-1); }
.sk-ib-menu__status { margin: 0; padding: var(--sk-space-3) var(--sk-space-2); color: var(--sk-color-muted); font-size: var(--sk-text-sm); text-align: center; display: flex; flex-direction: column; align-items: center; gap: var(--sk-space-2); }
.sk-ib-menu__retry { padding: var(--sk-space-1) var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-fg); font: inherit; font-size: var(--sk-text-sm); cursor: pointer; }
.sk-ib-menu__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sk-ib-menu__item { width: 100%; box-sizing: border-box; display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border: none; border-radius: var(--sk-radius); background: transparent; color: var(--sk-color-fg); font: inherit; font-size: var(--sk-text-sm); text-align: left; cursor: pointer; }
.sk-ib-menu__item:hover:not(:disabled) { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-ib-menu__item:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
.sk-ib-menu__item--active { font-weight: 600; }
.sk-ib-menu__item:disabled { color: var(--sk-color-muted); opacity: 0.6; cursor: not-allowed; }
.sk-ib-menu__mark { flex: none; width: 1em; color: var(--sk-color-accent); }
.sk-ib-menu__name { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-ib-menu__note { flex: none; font-size: var(--sk-text-xs); color: var(--sk-color-muted); }

/* The slash popover: a floating panel positioned by useFloating (opens upward). */
.sk-ib-popover { position: absolute; z-index: 2147483646; width: 340px; max-width: 90vw; display: flex; flex-direction: column; background: var(--sk-color-bg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); box-shadow: 0 8px 28px color-mix(in srgb, var(--sk-color-fg) 22%, transparent); overflow: hidden; }
.sk-ib-popover__head { padding: var(--sk-space-2); border-bottom: 1px solid var(--sk-color-border); }
.sk-ib-popover__input { width: 100%; box-sizing: border-box; background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-1) var(--sk-space-2); font: inherit; }
.sk-ib-popover__input:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: 1px; }
.sk-ib-popover__body { max-height: 320px; overflow-y: auto; }
.sk-ib-popover__status { margin: 0; padding: var(--sk-space-3) var(--sk-space-2); color: var(--sk-color-muted); font-size: var(--sk-text-sm); text-align: center; }

/* "Last used" group heading above the recents list (prompt-recents D-4): a quiet,
   uppercase label so the empty-state list reads as a section, not a result. */
.sk-ib-popover__group { margin: 0; padding: var(--sk-space-2) var(--sk-space-2) var(--sk-space-1); color: var(--sk-color-muted); font-size: var(--sk-text-xs); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }

.sk-ib-results { list-style: none; margin: 0; padding: var(--sk-space-1); display: flex; flex-direction: column; gap: 2px; }
.sk-ib-row { display: flex; align-items: flex-start; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: pointer; }
.sk-ib-row--active, .sk-ib-row:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-ib-row__glyph { flex: none; color: var(--sk-color-muted); margin-top: 2px; }
.sk-ib-row__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.sk-ib-row__title { font-size: var(--sk-text-base); font-weight: 600; color: var(--sk-color-fg); }
.sk-ib-row__snippet { font-size: var(--sk-text-sm); color: var(--sk-color-muted); overflow: hidden; text-overflow: ellipsis; }
.sk-ib-row__hit { background: color-mix(in srgb, var(--sk-color-accent) 28%, transparent); color: inherit; border-radius: 2px; }
.sk-ib-row__slug { flex: none; align-self: center; font-family: var(--sk-font-mono, monospace); font-size: var(--sk-text-xs); color: var(--sk-color-muted); }

/* The variable-fill modal body (the Dialog shell comes from PRIMITIVES_CSS). */
.sk-ib-modal { display: flex; flex-direction: column; gap: var(--sk-space-2); min-width: 280px; max-width: 420px; }

/* Form + dialog classes the modal reuses — token-only, mirrored from the sidebar/
   prompts bundles (which this shadow root does not load). */
.sk-field { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-field__label { font-size: var(--sk-text-sm); font-weight: 600; color: var(--sk-color-muted); }
.sk-input { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-1) var(--sk-space-2); font: inherit; }
.sk-dialog__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sk-space-2); }
.sk-dialog__title { font-size: var(--sk-text-title); font-weight: 600; margin: 0; }
.sk-dialog__actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--sk-space-2); margin-top: var(--sk-space-1); }
`;

export const INPUT_BAR_CSS = `${INPUT_BAR_FEATURE_CSS}\n${PRIMITIVES_CSS}`;
