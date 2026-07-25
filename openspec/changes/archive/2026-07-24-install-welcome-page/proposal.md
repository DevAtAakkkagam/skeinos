## Why

A freshly-installed extension is invisible: it does nothing on the store page or a new tab, and on Chrome the toolbar icon is disabled on every non-supported host, so clicking it does nothing and Skeinos reads as broken. Nothing today orients a brand-new user toward where the panel actually lives. A one-time, browser-specific getting-started page shown on install closes that gap.

## What Changes

- On **first install only** (`onInstalled`, reason `install`), open a full-tab welcome page in a new tab, in both Chrome and Firefox.
- The page is a **decoupled signpost**, not onboarding: it never writes `onboardingCompleted`, so the in-panel onboarding stepper still runs unchanged on the first supported-site visit.
- Content is a **browser-specific, diagram-led getting-started guide**, not a second store listing: an illustration of the user's own browser pointing at where Skeinos lives (Chrome toolbar icon vs Firefox sidebar button), a plain-language 3-step "how it works" flow (open a chat → Skeinos gathers the chats you can see, on your device → find and organize), and a one-line privacy reassurance. Browser variant is selected at **build time** (`import.meta.env.BROWSER`), with no runtime user-agent sniffing.
- On Chrome, the page carries an **emphasized caveat**: the toolbar button only opens the panel on the four supported AI sites.
- A new device-local `welcomeShown` settings flag makes the open **idempotent** (an unpacked dev reload also fires `onInstalled` with reason `install`; the guard prevents re-opening).
- New `welcome.*` i18n namespace, translated across en/de/fr/es/pt (pseudo-locale derives automatically).
- **No new permissions**: `tabs.create` on the extension's own `runtime.getURL('welcome.html')` needs none; host permissions are unchanged.

## Capabilities

### New Capabilities
- `install-welcome`: A first-run, install-only welcome tab that orients the user to where Skeinos lives in their specific browser and what happens when they open a supported chat site, without coupling to the onboarding completion gate.

### Modified Capabilities
<!-- None. The welcome page is a decoupled signpost: it changes no existing spec's
     requirements. It only adds an optional `welcomeShown` settings key and new i18n
     message keys — additive implementation details, not requirement-level changes to
     the `settings`, `i18n`, or `onboarding` capabilities. -->

## Impact

- **New**: `src/entrypoints/welcome/` (WXT entrypoint → `welcome.html`), `src/ui/welcome/` (WelcomeApp + styles), `src/background/welcomeTab.ts` (open-on-install), `welcome.*` keys in `src/locales/*`.
- **Modified**: `src/background/index.ts` (register the install hook), `src/shared/settings.ts` (additive `welcomeShown?: boolean`).
- **Surfaces reused**: the shadow-DOM `ui/mount` + `--sk-*` theme tokens + `core/i18n` `ensureLocale`, same bootstrap as the options page.
- **No permission/manifest changes**; no impact on the sync boundary (nothing new is stored beyond a device-local boolean).
