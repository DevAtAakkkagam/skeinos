// Starter-kit provenance band styles (starter-kit-provenance). Token-only like the
// rest of the overlay; appended to SIDEBAR_CSS so the side panel's single mount site
// picks it up. The band reads as a quiet, accent-tinted strip — subordinate to the
// cards below it (it labels them, it is not one of them).

export const STARTER_KIT_CSS = `
.sk-starter-kit {
  display: flex; align-items: flex-start; gap: var(--sk-space-2);
  margin-bottom: var(--sk-space-2); padding: var(--sk-space-2) var(--sk-space-3);
  border-radius: var(--sk-radius);
  background: color-mix(in srgb, var(--sk-color-accent) 8%, transparent);
}
/* A small token-driven accent marker (not an emoji/icon) anchoring the band. */
.sk-starter-kit__dot {
  flex: none; width: 8px; height: 8px; margin-top: 5px; border-radius: 999px;
  background: var(--sk-color-accent);
}
.sk-starter-kit__text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sk-starter-kit__label {
  font-size: var(--sk-text-sm); font-weight: 600; color: var(--sk-color-fg);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sk-starter-kit__caption { font-size: var(--sk-text-xs); color: var(--sk-color-muted); }
/* A quiet text button — the band's only action; styled like a link, accent on focus. */
.sk-starter-kit__change {
  flex: none; align-self: center; background: none; border: 0; cursor: pointer;
  padding: var(--sk-space-1) var(--sk-space-2); border-radius: var(--sk-radius);
  font-size: var(--sk-text-sm); font-weight: 500; color: var(--sk-color-accent);
}
.sk-starter-kit__change:hover { background: color-mix(in srgb, var(--sk-color-accent) 14%, transparent); }
.sk-starter-kit__change:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: -2px; }
`;
