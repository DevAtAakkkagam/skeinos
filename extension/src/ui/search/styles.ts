// Search-overlay styles. Like the rest of the UI, every rule reads from `--sk-*`
// theme tokens only (no hard-coded colors/spacing, no host classes) so the overlay
// re-themes with everything else. Appended to the side panel's injected CSS so the
// single mount site picks it up automatically.

export const SEARCH_CSS = `
.sk-search-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: var(--sk-space-3);
  background: color-mix(in srgb, var(--sk-color-bg) 70%, transparent);
}
.sk-search-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 100%;
  background: var(--sk-color-bg);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
  box-shadow: 0 8px 32px color-mix(in srgb, var(--sk-color-fg) 18%, transparent);
  overflow: hidden;
}
.sk-search-panel__head {
  display: flex;
  align-items: center;
  gap: var(--sk-space-2);
  padding: var(--sk-space-2);
  border-bottom: 1px solid var(--sk-color-border);
}
.sk-search-panel__icon { display: inline-flex; color: var(--sk-color-muted); flex: none; }
.sk-search-panel__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  color: var(--sk-color-fg);
  font: inherit;
  font-size: 15px;
}
.sk-search-panel__input::placeholder { color: var(--sk-color-muted); }

.sk-search-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sk-space-2);
  padding: var(--sk-space-2);
  border-bottom: 1px solid var(--sk-color-border);
}
.sk-search-filter { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.sk-search-filter--check { flex-direction: row; align-items: center; gap: var(--sk-space-1); align-self: end; }
.sk-search-filter__label { color: var(--sk-color-muted); }
.sk-search-filter__control {
  background: var(--sk-color-bg);
  color: var(--sk-color-fg);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
  padding: 2px var(--sk-space-1);
  font: inherit;
  font-size: 12px;
}
.sk-search-filter input:disabled,
.sk-search-filter--check[title] input:disabled { cursor: not-allowed; opacity: 0.5; }

.sk-search-body { overflow-y: auto; padding: var(--sk-space-1); }
.sk-search-status { color: var(--sk-color-muted); padding: var(--sk-space-3); text-align: center; margin: 0; }

.sk-search-results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sk-sr {
  display: flex;
  align-items: flex-start;
  gap: var(--sk-space-2);
  padding: var(--sk-space-2);
  border-radius: var(--sk-radius);
  cursor: pointer;
}
.sk-sr--active, .sk-sr:hover { background: color-mix(in srgb, var(--sk-color-accent) 14%, transparent); }
.sk-sr__logo { flex: none; display: inline-flex; margin-top: 2px; }
.sk-sr__logo svg { display: block; }
.sk-sr__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.sk-sr__title { font-weight: 600; color: var(--sk-color-fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sk-sr__snippet { color: var(--sk-color-muted); font-size: 12px; line-height: 1.4; }
.sk-sr__hit { background: color-mix(in srgb, var(--sk-color-accent) 30%, transparent); color: var(--sk-color-fg); border-radius: 2px; }
.sk-sr__meta {
  display: flex;
  align-items: center;
  gap: var(--sk-space-1);
  margin-top: 2px;
  color: var(--sk-color-muted);
  font-size: 11px;
  min-width: 0;
}
.sk-sr__folder {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sk-sr__folder svg { flex: none; }
/* The italic label's slant overruns the right edge; don't clip it (it never
   needs ellipsis the way a long folder path does). */
.sk-sr__folder--unfiled { font-style: italic; overflow: visible; padding-right: 1px; }
.sk-sr__dot { flex: none; }
.sk-sr__time { flex: none; }

.sk-search-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sk-space-2);
  padding: var(--sk-space-1) var(--sk-space-2);
  border-top: 1px solid var(--sk-color-border);
  color: var(--sk-color-muted);
  font-size: 11px;
}
.sk-search-foot__hints { display: flex; align-items: center; gap: var(--sk-space-2); }
.sk-search-foot__hint { display: inline-flex; align-items: center; gap: 4px; }
.sk-kbd {
  font-family: var(--sk-font-system);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
  padding: 0 4px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--sk-color-fg);
}
`;
