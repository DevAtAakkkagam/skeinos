// Onboarding-surface styles (onboarding-foundation). Token-only, shadow-scoped —
// no hard-coded colours except the brand chip's fixed dark plate, which is part of
// the logo identity (the same plate the extension icon uses) and must not invert
// with the theme. Injected into the panel shadow root alongside SIDEBAR_CSS.

export const ONBOARDING_CSS = `
.sk-onb { overflow: hidden; }

.sk-onb__scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-gutter: stable;
  display: flex;
  flex-direction: column;
  /* Centre the content block in the available height, but let it scroll (rather
     than clip) when the panel is shorter than the content. */
  justify-content: center;
  gap: var(--sk-space-3);
  padding: var(--sk-space-3) var(--sk-space-3);
}
/* Keep the centred block from being clipped at the top in a short panel. */
.sk-onb__scroll > * { flex: 0 0 auto; }

/* Hero — centred brand chip, eyebrow, title, lede. */
.sk-onb__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--sk-space-2);
  padding-top: var(--sk-space-2);
}
.sk-onb__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  /* Fixed brand plate — identity, deliberately theme-independent. */
  background: #16151f;
  color: #fbfcff;
  margin-bottom: var(--sk-space-1);
}
.sk-onb__eyebrow {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sk-color-muted);
}
.sk-onb__title {
  margin: 0;
  font-size: 19px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--sk-color-fg);
}
.sk-onb__body {
  margin: 0;
  max-width: 34ch;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sk-color-muted);
}

/* Assurance cards — local-first / metadata-only. */
.sk-onb__features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sk-space-2);
}
.sk-onb__feature {
  display: flex;
  gap: var(--sk-space-3);
  padding: var(--sk-space-3);
  border: 1px solid var(--sk-color-border);
  border-radius: var(--sk-radius);
}
.sk-onb__feature-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--sk-color-success) 26%, transparent);
  color: var(--sk-color-fg);
}
.sk-onb__feature-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}
.sk-onb__feature-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--sk-color-fg);
}
.sk-onb__feature-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--sk-color-muted);
}

/* Step indicator — static in this slice (the multi-step flow lands in
   onboarding-flow); the first dot is the active welcome step. */
.sk-onb__dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  padding: var(--sk-space-1) 0 var(--sk-space-3);
}
.sk-onb__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sk-color-border);
}
.sk-onb__dot--active {
  width: 18px;
  border-radius: 3px;
  background: var(--sk-color-accent);
}

/* Footer — secondary link left, primary CTA right. */
.sk-onb__footer { justify-content: space-between; }
.sk-btn--link {
  background: none;
  border: 0;
  padding: var(--sk-space-1) 0;
  font: inherit;
  color: var(--sk-color-muted);
  cursor: pointer;
}
.sk-btn--link:hover, .sk-btn--link:focus-visible {
  color: var(--sk-color-fg);
  text-decoration: underline;
  outline: none;
}
`;
