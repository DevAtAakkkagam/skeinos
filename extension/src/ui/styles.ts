// Base component styles. Every rule reads from theme tokens only (no hard-coded
// colors/spacing) so components re-theme automatically. Scoped class names keep
// this from matching host-page elements once injected into the shadow root.

export const COMPONENT_CSS = `
.sk-panel {
  background: var(--sk-color-bg);
  color: var(--sk-color-fg);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
  padding: var(--sk-space-3);
}
.sk-stack { display: flex; flex-direction: column; gap: var(--sk-space-2); }
.sk-text { color: var(--sk-color-fg); margin: 0; }
.sk-text--muted { color: var(--sk-color-muted); }
.sk-btn {
  background: var(--sk-color-accent);
  color: var(--sk-color-bg);
  border: 0;
  border-radius: var(--sk-radius);
  padding: var(--sk-space-2) var(--sk-space-3);
  font: inherit;
  cursor: pointer;
}
`;
