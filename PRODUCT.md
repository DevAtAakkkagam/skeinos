# Product

## Register

product

## Users

Multi-LLM power users: people who run parallel conversations across Claude, Gemini,
Perplexity (and later Grok, DeepSeek, ChatGPT, Mistral) and lose track of where things
live. Researchers, builders, writers, and analysts who treat chat assistants as daily
tools. Their context is an LLM tab they already have open; Skeinos is a shadow-DOM overlay
panel riding on top of that host chat, not a destination they navigate to. They are
privacy-conscious by disposition, which is why a local-first tool earns their trust.

The job to be done: impose one organisation, search, and prompt layer across every LLM
site, without content ever leaving the device. On any given screen the primary task is
small and frequent (file this chat, find that old thread, drop in a saved prompt, compare
two models), so the panel must resolve it fast and then recede from attention.

## Product Purpose

Skeinos is a Manifest V3 browser extension that overlays a unified organisation, search,
prompt-library, and multi-model-comparison layer on top of LLM chat sites. It is
local-first and privacy-first: in v1 everything is stored locally and nothing leaves the
device, with no account and no sync. It exists because the assistants are silos: each has
its own history, folders (or none), and prompt storage, and none talk to each other.
Skeinos is the connective tissue across all of them.

Success looks like: a user with conversations scattered across three LLM sites can file,
re-find, and reuse them in seconds from one panel; trusts that nothing leaves their device;
and reaches for Skeinos reflexively instead of scrolling each platform's native history.

## Brand Personality

Calm, precise, trustworthy. The voice is quiet and competent: it states system status
plainly ("Saved locally", "Couldn't load your folders, try again"), never shouts, never
gamifies. Confidence comes from restraint and reliability, not decoration or reassurance
copy. The product should feel like an instrument that respects the user's attention and
their data. Where personality surfaces, it draws on the namesake (a skein, a thread,
weaving many strands into one) as a quiet, tactile signature rather than a loud mascot.

## Anti-references

- **Default indigo SaaS.** The generic Tailwind-indigo-on-white admin panel; Stripe-clone
  dashboards; hero-metric cards and identical card grids. The current chrome leans this way
  and should move away from it.
- **The host LLM UIs.** Must not mimic or blend into Claude, Gemini, or Perplexity's own
  chrome. Skeinos is a distinct, neutral layer that sits over all of them; it cannot read
  as belonging to any one platform, or it loses its cross-platform identity.
- **Dark hacker terminal.** No neon-on-black, monospace-everything, cyberpunk privacy-tool
  cliché. Privacy is conveyed through calm and clarity, not theatrics.
- **Playful consumer toy.** No bubbly mascots, bright gradients, bouncy/elastic motion,
  emoji spam, or gamification. This is a serious daily workspace, not a novelty.

## Design Principles

- **Neutral layer, not a fourth chat app.** Skeinos overlays many platforms and must read
  as owned-yet-impartial: distinct from every host UI, partial to none, and visually quiet
  against a noisy host page.
- **Show the content, not the chrome.** Lead with the user's conversations, folders, and
  prompts. Empty states and self-promoting nudges are demoted to where they belong; they
  never sit front-and-center over real data that already exists.
- **Trust is the feature.** Local-first and privacy-first are the product, not a bullet
  point. Surface system status honestly and legibly; never lose user input; make the
  stays-on-device boundary visible through behaviour rather than asserted in copy.
- **Resolve and recede, reward fluency.** Each task is small and frequent. Finish it fast
  and return attention to the conversation. Built for repeat daily use: keyboard-first,
  discoverable shortcuts, consistent patterns across tabs so muscle memory transfers.
- **One thread from many strands.** The skein metaphor is the throughline; coherence across
  scattered platforms is both the function and the felt identity.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Full keyboard operability for every interaction (the panel must be
usable without a mouse), AA contrast on all text and UI chrome, and ARIA roles and labels
throughout. All UI mounts in a shadow root and styles only from `--sk-*` tokens; no
hard-coded user-facing strings (i18n-ready via `STR` maps). `prefers-reduced-motion` is
honored for all animation as a first-class path, not an afterthought; motion eases out,
never bounces.
