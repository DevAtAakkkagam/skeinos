// Styles for the install welcome page (install-welcome), injected into the same
// shadow root as the rest of the UI (mirrors ONBOARDING_CSS). Everything is
// scoped under `.sk-wl` and styles ONLY from `--sk-*` tokens (no hard-coded
// colors) — the accent appears as tonal `color-mix` tints ("weather, not paint",
// DESIGN.md), never a flat fill outside the brand glyph and focus rings.
//
// The page is a calm single-column document, not a marketing landing: mono
// section overlines (--sk-font-label) with a trailing hairline are the one
// typographic signature. One quiet motion moment — a skein thread that draws
// under the hero — plus a soft reveal, both gated behind prefers-reduced-motion.

export const WELCOME_CSS = `
.sk-wl {
  --wl-tint-08: color-mix(in srgb, var(--sk-color-accent) 8%, transparent);
  --wl-tint-12: color-mix(in srgb, var(--sk-color-accent) 12%, transparent);
  --wl-tint-16: color-mix(in srgb, var(--sk-color-accent) 16%, transparent);
  --wl-tint-24: color-mix(in srgb, var(--sk-color-accent) 24%, transparent);
  --wl-panel: color-mix(in srgb, var(--sk-color-fg) 3%, var(--sk-color-bg));
  min-height: 100vh;
  background: var(--sk-color-bg);
  color: var(--sk-color-fg);
  font-family: var(--sk-font-ui);
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.sk-wl__page {
  max-width: 800px;
  margin: 0 auto;
  padding: clamp(26px, 5vw, 64px) clamp(20px, 5vw, 40px) 56px;
}

/* reveal on mount (reduced-motion gated) */
.sk-wl__r { opacity: 0; transform: translateY(10px); }
.sk-wl.is-revealed .sk-wl__r {
  opacity: 1; transform: none;
  transition: opacity .55s cubic-bezier(.22,1,.36,1), transform .55s cubic-bezier(.22,1,.36,1);
}
.sk-wl.is-revealed .sk-wl__r--2 { transition-delay: .06s; }
.sk-wl.is-revealed .sk-wl__r--3 { transition-delay: .12s; }
.sk-wl.is-revealed .sk-wl__r--4 { transition-delay: .20s; }
.sk-wl.is-revealed .sk-wl__r--5 { transition-delay: .28s; }
.sk-wl.is-revealed .sk-wl__r--6 { transition-delay: .34s; }

/* brand row */
.sk-wl__brand { display: flex; align-items: center; gap: 10px; margin-bottom: 34px; }
.sk-wl__glyph {
  width: 30px; height: 30px; flex: none; border-radius: 8px; overflow: hidden;
  display: grid; place-items: center;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--sk-color-fg) 12%, transparent);
}
.sk-wl__glyph svg { width: 100%; height: 100%; }
.sk-wl__wordmark { font-size: 17px; font-weight: 700; letter-spacing: -.01em; }
.sk-wl__ver { margin-left: auto; font-family: var(--sk-font-label); font-size: 11px; letter-spacing: .04em; color: var(--sk-color-muted); }

/* hero */
.sk-wl__eyebrow { font-family: var(--sk-font-label); font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: var(--sk-color-accent); margin: 0 0 14px; }
.sk-wl__title { font-size: clamp(28px, 4vw, 38px); line-height: 1.12; letter-spacing: -.025em; font-weight: 700; margin: 0 0 14px; text-wrap: balance; }
.sk-wl__lede { font-size: clamp(15px, 1.5vw, 17px); color: var(--sk-color-muted); margin: 0; max-width: 52ch; }

/* woven thread divider (draws once) */
.sk-wl__thread { display: block; width: 100%; height: 18px; margin: 32px 0 10px; color: var(--sk-color-accent); }
.sk-wl__thread path { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: .5; }
.sk-wl.is-revealed .sk-wl__thread path {
  stroke-dasharray: 840; stroke-dashoffset: 840;
  animation: sk-wl-draw 1.5s .3s cubic-bezier(.22,1,.36,1) forwards;
}
@keyframes sk-wl-draw { to { stroke-dashoffset: 0; } }

/* pulse ring on the highlighted toolbar/sidebar icon in the illustration */
.sk-wl__pulse { transform-origin: center; transform-box: fill-box; opacity: 0; }
.sk-wl.is-revealed .sk-wl__pulse { animation: sk-wl-pulse 2.4s ease-out infinite; }
@keyframes sk-wl-pulse { 0% { opacity: .9; transform: scale(1); } 70%, 100% { opacity: 0; transform: scale(1.9); } }

/* section overline */
.sk-wl__overline { font-family: var(--sk-font-label); font-size: 11px; font-weight: 500; letter-spacing: .2em; text-transform: uppercase; color: var(--sk-color-muted); display: flex; align-items: center; gap: 14px; margin: 0 0 20px; }
.sk-wl__overline::after { content: ""; flex: 1; height: 1px; background: var(--sk-color-border); }
.sk-wl__section { margin-top: 48px; }

/* find-it browser illustration */
.sk-wl__browser {
  width: 100%; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--sk-color-border); background: var(--wl-panel);
  box-shadow: 0 18px 40px -28px color-mix(in srgb, var(--sk-color-shadow) 55%, transparent);
}
.sk-wl__browser svg { display: block; width: 100%; height: auto; }
.sk-wl__note { display: flex; align-items: flex-start; gap: 12px; margin-top: 20px; }
.sk-wl__note-icon { width: 30px; height: 30px; flex: none; border-radius: var(--sk-radius); background: var(--wl-tint-12); color: var(--sk-color-accent); display: grid; place-items: center; }
.sk-wl__note p { margin: 0; font-size: 15px; }
.sk-wl__note b { font-weight: 600; }
.sk-wl__note .sk-wl__sub { display: block; color: var(--sk-color-muted); font-size: 13.5px; margin-top: 3px; }

/* emphasized "only works on the four sites" callout (Chrome) */
.sk-wl__only {
  display: flex; gap: 11px; align-items: flex-start; margin-top: 16px;
  padding: 13px 15px; border-radius: var(--sk-radius);
  background: var(--wl-tint-12);
  border: 1px solid color-mix(in srgb, var(--sk-color-accent) 32%, transparent);
  font-size: 14px; line-height: 1.45;
}
.sk-wl__only svg { flex: none; margin-top: 1px; color: var(--sk-color-accent); }
.sk-wl__only b { font-weight: 700; color: var(--sk-color-accent); }

/* how-it-works: 3 steps */
.sk-wl__flow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.sk-wl__step { padding: 22px 20px 24px; border: 1px solid var(--sk-color-border); border-radius: var(--sk-radius); background: var(--sk-color-bg); }
.sk-wl__step-n { font-family: var(--sk-font-label); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; color: var(--sk-color-accent); font-variant-numeric: tabular-nums; }
.sk-wl__art { height: 88px; margin: 12px 0 14px; display: grid; place-items: center; color: var(--sk-color-accent); }
.sk-wl__art svg { width: 100%; height: 100%; }
.sk-wl__step h3 { margin: 0 0 6px; font-size: 16px; font-weight: 700; letter-spacing: -.01em; }
.sk-wl__step p { margin: 0; color: var(--sk-color-muted); font-size: 13.5px; line-height: 1.45; }
.sk-wl__chips { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.sk-wl__chip { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: var(--wl-tint-12); color: var(--sk-color-accent); }

/* reassurance strip */
.sk-wl__assure { display: flex; align-items: center; gap: 12px; margin-top: 40px; padding: 16px 18px; border-radius: var(--sk-radius); background: var(--wl-tint-08); }
.sk-wl__assure svg { color: var(--sk-color-success); flex: none; }
.sk-wl__assure p { margin: 0; font-size: 14.5px; }
.sk-wl__assure b { font-weight: 600; }

/* footer */
.sk-wl__footer { margin-top: 44px; padding-top: 22px; border-top: 1px solid var(--sk-color-border); }
.sk-wl__foot-row { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.sk-wl__foot-brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.sk-wl__foot-glyph { width: 18px; height: 18px; border-radius: 5px; overflow: hidden; display: grid; place-items: center; box-shadow: 0 0 0 1px color-mix(in srgb, var(--sk-color-fg) 12%, transparent); }
.sk-wl__foot-glyph svg { width: 100%; height: 100%; }
.sk-wl__foot-links { margin-left: auto; display: flex; gap: 20px; }
.sk-wl__foot-links a { color: var(--sk-color-muted); text-decoration: none; font-size: 14px; transition: color .16s ease; }
.sk-wl__foot-links a:hover, .sk-wl__foot-links a:focus-visible { color: var(--sk-color-accent); }
.sk-wl__disclaimer { margin: 14px 0 0; font-size: 12px; color: var(--sk-color-muted); }

/* focus */
.sk-wl a:focus-visible, .sk-wl button:focus-visible { outline: 2px solid var(--sk-color-accent); outline-offset: 2px; border-radius: 3px; }

@media (max-width: 640px) {
  .sk-wl__flow { grid-template-columns: 1fr; gap: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .sk-wl__r { opacity: 1 !important; transform: none !important; transition: none !important; }
  .sk-wl__thread path { animation: none !important; stroke-dashoffset: 0 !important; }
  .sk-wl__pulse { animation: none !important; opacity: .5 !important; }
}
`;
