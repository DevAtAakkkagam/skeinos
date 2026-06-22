---
name: Skeinos
description: A calm, neutral organisation layer woven over many LLM chat sites.
colors:
  accent: "#4f46e5"
  bg: "#fbfcff"
  fg: "#181a23"
  muted: "#63677d"
  border: "#e0e1e7"
  success: "#84c9b0"
  danger: "#c74b47"
typography:
  display:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.2em"
  title:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "20px"
    letterSpacing: "normal"
  label:
    fontFamily: "Urbanist, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
rounded:
  base: "6px"
  pill: "999px"
  full: "50%"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.bg}"
    rounded: "{rounded.base}"
    padding: "8px 12px"
  button-ghost:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.base}"
    padding: "8px 12px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.bg}"
    rounded: "{rounded.base}"
    padding: "8px 12px"
  chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  chip-active:
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  card-prompt:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.base}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.base}"
    padding: "4px 8px"
  badge:
    textColor: "{colors.accent}"
    rounded: "{rounded.base}"
    padding: "0 4px"
---

# Design System: Skeinos

## 1. Overview

**Creative North Star: "The Quiet Loom"**

Skeinos is a calm, structured surface that takes the threads of a user's work, scattered
across Claude, Gemini, and Perplexity, and weaves them into one legible order. It is a
shadow-DOM overlay riding on top of a host chat page, so its first job is to read as a
distinct, neutral layer: owned, but partial to none of the platforms it sits over, and
visually quiet against whatever busy UI is underneath it. The loom is structure without
noise. Hairline rules and tonal tints do the organising; nothing shouts.

The system is information-dense in the manner of tools power users already trust (Linear,
Raycast), but it earns that density through restraint: a single accent, tinted-neutral
surfaces, one corner radius, and a 4/8/12 spacing rhythm. Depth is conveyed by tonal
layering (`color-mix` washes of the accent) rather than shadows; real shadow is reserved
for surfaces that genuinely float (the search overlay, the breakage snackbar). Motion is a
quiet confirmation, never choreography, and every animation yields to
`prefers-reduced-motion`.

It explicitly rejects four things: the default Tailwind-indigo-on-white SaaS admin panel;
mimicry of any host LLM's own chrome; the neon-on-black hacker-terminal privacy cliché;
and the bubbly, gamified consumer toy. Privacy and competence are conveyed through calm
and clarity, not theatrics.

**Key Characteristics:**
- One accent, tinted-neutral surfaces, a single 6px radius.
- Flat by default; depth from tonal tint, shadow only for floating surfaces.
- Content leads; empty states and self-promoting nudges are demoted beneath real data.
- Keyboard-first, ARIA-throughout, motion gated behind reduced-motion.
- A precise monospaced overline (IBM Plex Mono) is the one typographic signature, a quiet
  technical counterpoint to Urbanist.

## 2. Colors

A restrained palette: one indigo accent carried by tonal tint, on near-neutral surfaces,
with a single mint signal and a single danger red.

### Primary
- **Loom Indigo** (`#4f46e5` light / `#818cf8` dark): the sole accent. Almost never used as
  a flat fill; instead it is mixed into surfaces at low percentages (8% hover, 12% resting
  tint, 16% icon-button hover, 18% active chip, 24% active conversation row) so the
  interface reads as neutral with indigo *weather*, not indigo paint. Full-strength fill is
  reserved for the one primary button and focus rings.

### Neutral
All neutrals are tinted toward Loom Indigo (hue ~277°), retuned from OKLCH; none are pure.
- **Page** (`#fbfcff` light / `#191a21` dark, `oklch(99% .004 277)` / `oklch(22% .014 277)`):
  panel and card background.
- **Ink** (`#181a23` light / `#f2f3f7` dark): primary text. AA+ on Page (16.9:1).
- **Muted Ink** (`#63677d` light / `#a0a4b5` dark): secondary text, meta lines, icon rest
  state, section overlines. Holds AA on Page (5.4:1 light / 7:1 dark).
- **Hairline** (`#e0e1e7` light / `#3f424d` dark): every border, divider, and dashed-ghost
  seam. One weight, 1px, everywhere.

### Tertiary (signals only)
- **Live Mint** (`#84c9b0`): the workspace presence dot and "live/local" status, with a soft
  22% halo ring. The only warm note in the chrome.
- **Breakage Red** (`#d4504e`): destructive actions and surfaced load failures, nothing else.

### Named Rules
**The Weather, Not Paint Rule.** The accent is mixed into surfaces, not laid on flat. If a
component needs the accent, reach for a `color-mix(... N%, transparent)` tint first; a solid
accent fill is allowed only on the single primary button and focus outlines.

**The No-Pure-Value Rule.** `#000` and `#fff` are prohibited. Every neutral carries a faint
indigo tint (chroma ~0.004–0.035 in OKLCH at hue 277°). Page, Ink, Muted, and Hairline are
all retuned from OKLCH; do not reintroduce pure white or gray.

## 3. Typography

**Display / Overline Font:** IBM Plex Mono (with `ui-monospace`, SFMono, Menlo fallback /
`--sk-font-label`) — a monospaced face used only for structural section overlines.
**Body / UI Font:** Urbanist (with system-ui fallback).
**Keycap Font:** system-ui, deliberately, so `⌘K` and shortcut hints render as native OS
keycaps rather than brand type.

**Character:** Urbanist carries the calm, even-tempered voice of the UI; IBM Plex Mono is the
one typographic counterpoint, a precise, technical monospace used sparingly on overlines
(FOLDERS, PROMPTS, ARCHIVE) and on code-like marks (the slash alias, `{{variable}}` chips),
so structure and machinery read distinctly from prose without becoming decoration. The loom
metaphor now lives in the product and the structural restraint (hairlines, tonal tint), not
in the typeface.

### Hierarchy
- **Display / Overline** (IBM Plex Mono, 500, 12px, `letter-spacing: 0.2em`, uppercase):
  section labels only. The monospace and open tracking make them read as architecture, not
  captions.
- **Title** (Urbanist, 600, 16px literal): dialog and picker headings; empty-state titles
  step down to 15px.
- **Card Title** (Urbanist, 700, 15px / `--sk-text-title`): prompt-card titles. A clear step
  above body (~1.15 ratio) reinforced by weight (700 vs 500), sized to anchor a dense list
  of tiles without reading as a page heading. Dense tree-anchor names stay at body size and
  lean on weight alone, to keep row height tight.
- **Body** (Urbanist, 500, 13px / 20px / `--sk-text-base`): the default. Excerpts relax to
  `line-height: 1.45`.
- **Label / Meta** (Urbanist, 500–600, 11–12px): counts, relative time, result-group labels,
  variable-type tags. `font-variant-numeric: tabular-nums` on all counts and times.

### Named Rules
**The Weight-Carries-Hierarchy Rule.** Title-to-body separation rides on weight (700/600 vs
500) plus a real size step, never colour. Sizes come from one ramp (`--sk-text-xs` 11 /
`--sk-text-sm` 12 / `--sk-text-base` 13 / `--sk-text-title` 15 / `--sk-text-heading` 18);
when a step must read louder, move up the ramp or add weight, never recolour. Card titles
use `--sk-text-title` (15) so the step over body is ~1.15: distinct from the muddy 14/13 it
replaced, but calmer than 16, which read as a heading and dominated each tile.

## 4. Elevation

Flat by default. The system conveys depth through tonal layering: surfaces tint with
`color-mix` washes of the accent on hover/active rather than lifting on shadows. The archive
dock separates from the scrolling tree with a single hairline and an opaque background, not
a shadow.

### Shadow Vocabulary (floating surfaces only)
- **Overlay lift** (`box-shadow: 0 8px 32px color-mix(in srgb, var(--sk-color-fg) 18%, transparent)`):
  the search panel, which floats over the shell.
- **Snackbar lift** (`box-shadow: 0 6px 24px color-mix(in srgb, var(--sk-color-fg) 16%, transparent)`):
  the breakage snackbar. Token-tinted, consistent with the overlay lift.
- **Focus ring** (`outline: 2px solid var(--sk-color-accent); outline-offset: 2px`): the
  universal focus treatment. Icon buttons swap the ring for a tint-fill to avoid double rings.
- **Selection double-ring** (`box-shadow: 0 0 0 2px Page, 0 0 0 4px accent`): chosen colour
  swatch in the folder dialog.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A real `box-shadow` is permitted
only on a surface that genuinely floats above the shell (overlay, snackbar) or lifts off an
inset track (the active segmented-control thumb). Everywhere else, depth is a tonal tint,
never a shadow.

## 5. Components

Refined and restrained: quiet surfaces, hairline borders, tonal tints over shadows, one
radius, decisive focus states.

### Buttons
- **Shape:** one 6px radius (`{rounded.base}`); padding `8px 12px`.
- **Primary:** flat accent fill (`#4f46e5`), Page-coloured text. The only flat-accent surface
  in the system. Used once per view (the true primary action).
- **Ghost:** transparent background, 1px Hairline border, Ink text; border warms to the
  accent on hover/focus.
- **Danger:** Breakage Red fill, brightens 8% on hover. Destructive confirms only.
- **Icon button:** no border, Muted icon at rest, accent-16%-tint fill on hover/focus (no
  outline ring, to avoid doubling).
- **Icon button, create variant** (`.sk-icon-btn--accent`): the section-header `+` (new
  folder / new prompt) is tinted to the accent at rest so the create action reads as the
  action, not another view toggle beside the muted expand/collapse icons. Both tabs use it,
  so the persistent create affordance is identical across Folders and Prompts. One accent
  glyph per header; the big primary button is reserved for the genuinely-empty first run.

### Chips
- **Filter chip:** pill (`999px`), `fg 8%` tinted background, Muted text, 12px. A filter
  control, never an action.
- **Active filter chip:** accent-18% tint, accent text, holds its tint through hover.
- **Add seam (`+ Tag` / `+ New category`):** a 1px *dashed* ghost, transparent fill. This
  dashed language is the system's signal for "a future or creating action," distinct from the
  solid selectable chips. Keep create-affordances dashed and selection-chips solid so the two
  never blur.

### Cards
- **Prompt card:** 6px radius, Page background, 1px Hairline border, `8px 12px` padding.
  Vertical stack: title row, 3-line clamped excerpt, footer (variable count + platform logos).
  Single-level only; nested cards are forbidden.
- **Corner / border / shadow:** rounded 6px, hairline border, no shadow (flat by default).

### Inputs / Fields
- **Style:** Page background, 1px Hairline border, 6px radius, `4px 8px` padding.
- **Focus:** border shifts to the accent (`:focus-within` on composite fields); the bare
  search-overlay input drops its own outline since the panel frames it.
- **Disabled:** `opacity: 0.55`, `not-allowed` cursor. Inert feature stubs (Profiles tab,
  `+ Tag` seam) use this to read as present-but-not-yet.

### Navigation (tabs)
- **Style:** a segmented control — equal-width segments sharing one inset, Muted-tinted
  track. The active segment lifts to a Page-coloured thumb (Ink text, 600 weight) with a
  subtle shadow; it is the one floating surface in the chrome and so earns a real shadow
  under the Flat-By-Default rule. Inactive segments sit flat on the track in Muted text.
  Disabled tabs dim to 0.55.

### Signature: the Section Overline
The IBM Plex Mono overline (FOLDERS / PROMPTS / ARCHIVE) with 0.2em tracking and a full-width
hairline beneath when its section is open. The monospace gives the chrome its one distinct
typographic voice, precise and structural, a quiet machine-label register set against
Urbanist's prose.

## 6. Do's and Don'ts

### Do:
- **Do** mix the accent into surfaces as a `color-mix(... N%, transparent)` tint; reserve a
  flat `#4f46e5` fill for the single primary button and focus rings.
- **Do** keep every border, divider, and seam at 1px Hairline; one weight everywhere.
- **Do** lead with the user's real content. Demote empty states and create-nudges to a slim
  dashed ghost-row (`.sk-ghost-row`) when conversations or prompts already exist.
- **Do** carry hierarchy on weight (700/600 vs 500) and tonal tint, not on new colours.
- **Do** keep the system flat; add a real shadow only to a surface that floats over the shell
  or lifts off an inset track (the active segmented-control thumb).
- **Do** gate every animation behind `prefers-reduced-motion: reduce`, and ease out
  (`cubic-bezier(0.22, 1, 0.36, 1)`), never bounce or elastic.
- **Do** use `system-ui` for keycaps so shortcut hints read as the user's real OS keys.

### Don't:
- **Don't** ship the default Tailwind-indigo-on-white SaaS admin look: no hero-metric cards,
  no gradient accents, no identical icon-heading-text card grids.
- **Don't** mimic or blend into Claude, Gemini, or Perplexity's own chrome; Skeinos must read
  as a distinct, neutral layer over all of them.
- **Don't** drift toward the neon-on-black hacker terminal, or toward a bubbly, gamified
  consumer toy. No mascots, bright gradients, emoji spam, or elastic motion.
- **Don't** use `#000` or `#fff`, or reintroduce stock Tailwind grays; every neutral is
  tinted toward Loom Indigo (hue 277°).
- **Don't** use `border-left`/`border-right` greater than 1px as a coloured accent stripe;
  use a full hairline, a tonal tint, or a leading icon instead.
- **Don't** make a selection chip and a create-action chip look alike; selection is a solid
  pill, creation is a dashed ghost.
- **Don't** nest cards, and don't reach for a modal when an inline or progressive affordance
  would do.
