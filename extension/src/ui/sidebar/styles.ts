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
/* Overline · dot font · 13 · +34% track (Lattice). */
.sk-sidebar__heading { font-family: var(--sk-font-dot); color: var(--sk-color-muted); font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.34em; margin: var(--sk-space-2) 0 0; }
.sk-row { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius); cursor: default; }
.sk-row:hover { background: color-mix(in srgb, var(--sk-color-accent) 12%, transparent); }
.sk-row--drop { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
.sk-row__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-row__count { color: var(--sk-color-muted); font-variant-numeric: tabular-nums; }
.sk-row__icon { width: 1.2em; text-align: center; }
.sk-sidebar__section-head { justify-content: space-between; }
.sk-icon-btn { background: none; border: 0; color: var(--sk-color-muted); font: inherit; line-height: 1; cursor: pointer; padding: 0 var(--sk-space-1); border-radius: var(--sk-radius); }
.sk-icon-btn:hover, .sk-icon-btn:focus-visible { color: var(--sk-color-fg); background: color-mix(in srgb, var(--sk-color-accent) 16%, transparent); outline: none; }
.sk-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--sk-space-2); padding: var(--sk-space-3) var(--sk-space-2); }
.sk-empty__icon { color: var(--sk-color-muted); }
.sk-empty__title { font-weight: 600; font-size: 15px; margin: 0; }
.sk-empty__body { color: var(--sk-color-muted); font-size: 13px; margin: 0; }
/* The context menu and folder dialog surfaces now come from the interaction-
   primitives layer (PRIMITIVES_CSS); only the folder form's own layout lives here. */
.sk-dialog__body { display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-field { display: flex; flex-direction: column; gap: var(--sk-space-1); }
.sk-input { background: var(--sk-color-bg); color: var(--sk-color-fg); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: var(--sk-space-1) var(--sk-space-2); font: inherit; }
.sk-dialog__actions { display: flex; justify-content: flex-end; gap: var(--sk-space-2); }

/* --- shell frame (header · search · tabs · tags · body · footer) ------------- */
.sk-shell { display: flex; flex-direction: column; height: 100%; min-width: 260px; background: var(--sk-color-bg); color: var(--sk-color-fg); }
.sk-shell__header { display: flex; align-items: center; justify-content: space-between; gap: var(--sk-space-2); padding: var(--sk-space-2) var(--sk-space-3); border-bottom: 1px solid var(--sk-color-border); }
/* The expanded header shows only the workspace label — the app name/glyph live in
   the browser's native side-panel title bar (see SidebarShell), not here. */
.sk-brand { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-brand__sub { display: inline-flex; align-items: center; gap: var(--sk-space-1); color: color-mix(in srgb, var(--sk-color-muted) 80%, var(--sk-color-fg)); font-size: 11px; letter-spacing: 0.04em; }
/* Presence dot: the workspace is live/local (design 02 mint indicator). */
.sk-brand__status { width: 6px; height: 6px; border-radius: 50%; background: var(--sk-color-success); flex: none; }
.sk-search { display: flex; align-items: center; gap: var(--sk-space-2); margin: var(--sk-space-2) var(--sk-space-3) 0; padding: var(--sk-space-1) var(--sk-space-2); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); color: var(--sk-color-muted); font: inherit; cursor: default; }
.sk-search__placeholder { flex: 1; text-align: left; }
.sk-search__kbd { font-family: var(--sk-font-system); border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); padding: 0 var(--sk-space-1); font-size: 11px; }
.sk-tabs { display: flex; gap: var(--sk-space-1); padding: var(--sk-space-2) var(--sk-space-3) 0; }
.sk-tab { flex: 1; text-align: center; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--sk-color-muted); font: inherit; padding: var(--sk-space-1) var(--sk-space-2); cursor: pointer; }
.sk-tab--active { color: var(--sk-color-fg); border-bottom-color: var(--sk-color-accent); }
.sk-tags { display: flex; flex-wrap: wrap; gap: var(--sk-space-1); padding: var(--sk-space-2) var(--sk-space-3) 0; }
.sk-chip { background: color-mix(in srgb, var(--sk-color-fg) 8%, transparent); border: 0; border-radius: 999px; color: var(--sk-color-muted); font: inherit; font-size: 12px; padding: 2px var(--sk-space-2); cursor: default; }
.sk-chip--active { background: color-mix(in srgb, var(--sk-color-accent) 18%, transparent); color: var(--sk-color-accent); }
.sk-chip--add { background: none; border: 1px dashed var(--sk-color-border); }
.sk-shell__body { flex: 1; overflow: auto; }
.sk-shell__footer { display: flex; align-items: center; gap: var(--sk-space-2); padding: var(--sk-space-2) var(--sk-space-3); border-top: 1px solid var(--sk-color-border); }
.sk-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--sk-color-accent); border: 1px solid color-mix(in srgb, var(--sk-color-accent) 40%, transparent); border-radius: var(--sk-radius); padding: 0 var(--sk-space-1); }
.sk-sync { flex: 1; color: var(--sk-color-muted); font-size: 12px; }

/* --- disabled feature stubs: present but visibly inert --------------------- */
.sk-search[disabled], .sk-tab[disabled], .sk-chip[disabled] { opacity: 0.55; cursor: not-allowed; }
`;

export const SIDEBAR_CSS = `${SIDEBAR_FEATURE_CSS}\n${PRIMITIVES_CSS}`;
