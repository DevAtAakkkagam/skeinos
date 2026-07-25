# install-welcome Specification

## Purpose

The install-welcome capability defines the extension's browser-orientation signpost: a welcome page
opened once, on first install only, that tells the user where Skeinos lives in their browser and what
to do next. Its content is selected at build time per target browser — the Chrome build points at the
toolbar icon and stresses that it only opens on the four supported AI sites, the Firefox build points
at the sidebar. It is deliberately decoupled from the `onboarding` capability: the welcome page never
writes `onboardingCompleted`, so the in-panel onboarding stepper still runs on the first supported-site
visit. It adds no host or API permissions.

## Requirements

### Requirement: Open the welcome page on first install only

The system SHALL open the welcome page (`welcome.html`) in a new tab when the extension is installed for the first time, and SHALL NOT open it on updates or other `onInstalled` reasons. The open MUST be idempotent across repeated install events (including an unpacked developer reload, which also fires `onInstalled` with reason `install`), guarded by a device-local `welcomeShown` settings flag.

#### Scenario: First install opens the welcome tab

- **WHEN** the service worker receives `onInstalled` with reason `install` and `welcomeShown` is not set
- **THEN** it sets `welcomeShown` to `true` and opens a new tab at `runtime.getURL('welcome.html')`

#### Scenario: A later install event does not reopen the tab

- **WHEN** `onInstalled` with reason `install` fires again and `welcomeShown` is already `true`
- **THEN** no new welcome tab is opened

#### Scenario: Non-install reasons never open the tab

- **WHEN** `onInstalled` fires with reason `update` (or any reason other than `install`)
- **THEN** no welcome tab is opened

#### Scenario: Missing extension APIs are a safe no-op

- **WHEN** `chrome.tabs.create` or `runtime.getURL` is unavailable (e.g. a non-extension runtime)
- **THEN** the open attempt resolves without error and opens nothing

### Requirement: The welcome page is decoupled from onboarding

The welcome page SHALL be a browser-orientation signpost that never writes `onboardingCompleted`. The in-panel onboarding stepper's behavior MUST be unchanged by this capability.

#### Scenario: Viewing or dismissing the welcome page leaves onboarding pending

- **WHEN** the welcome page is opened and the user reads or closes it
- **THEN** `onboardingCompleted` is unchanged, so the in-panel onboarding stepper still shows on the first supported-site visit

### Requirement: Browser-specific getting-started content

The welcome page SHALL present orientation content selected at build time for the target browser (`import.meta.env.BROWSER`), with no runtime user-agent detection. The Chrome build SHALL show how to find and use the toolbar icon; the Firefox build SHALL show how to open and use the sidebar. The page SHALL show, in plain language without technical jargon: where Skeinos lives in the browser, that opening a supported chat site gathers the visible chats into the sidebar on the user's own device, the four supported sites, and a privacy reassurance.

#### Scenario: Chrome build shows the toolbar guidance

- **WHEN** the Chrome build's welcome page renders
- **THEN** it shows the Chrome toolbar illustration and instructions to pin and click the Skeinos icon

#### Scenario: Firefox build shows the sidebar guidance

- **WHEN** the Firefox build's welcome page renders
- **THEN** it shows the Firefox sidebar illustration and instructions to open the sidebar and choose Skeinos

#### Scenario: The four supported sites are listed

- **WHEN** the welcome page renders
- **THEN** it lists Claude, Gemini, Perplexity, and ChatGPT as the sites where Skeinos works

### Requirement: Chrome emphasizes the supported-site limitation

On the Chrome build, the welcome page SHALL prominently state that the toolbar button only opens the panel on the four supported AI sites, so that a click doing nothing elsewhere reads as expected rather than broken. This emphasis is Chrome-only (the Firefox sidebar opens globally).

#### Scenario: Chrome shows the "only on the four sites" caveat

- **WHEN** the Chrome build's welcome page renders
- **THEN** an emphasized note states the button only opens on the four AI sites

#### Scenario: Firefox omits the caveat

- **WHEN** the Firefox build's welcome page renders
- **THEN** the Chrome-only caveat is not shown

### Requirement: Localized, themed, and permission-neutral

All welcome-page copy SHALL come from the `welcome.*` i18n namespace, present in every supported locale so the catalog-completeness check passes. The page SHALL mount through the shared shadow-DOM host and style only from `--sk-*` tokens, adapt to light and dark themes, and gate all motion behind `prefers-reduced-motion`. The capability SHALL add no new host or API permissions.

#### Scenario: Copy is fully localized

- **WHEN** the locale-catalog completeness check runs
- **THEN** every `welcome.*` key defined in English exists in de, fr, es, and pt

#### Scenario: No new permissions

- **WHEN** the manifest is generated for Chrome and Firefox
- **THEN** the permission set and host permissions are unchanged from before this capability

