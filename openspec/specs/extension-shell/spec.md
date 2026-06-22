# extension-shell Specification

## Purpose

The extension-shell capability defines the installable Manifest V3 browser extension package: how it builds, what host permissions it requests, how it injects content scripts on supported host pages, and how CI produces a loadable artifact.

## Requirements

### Requirement: Installable MV3 extension build

The system SHALL provide a Manifest V3 browser extension that builds via WXT and loads as an unpacked extension in a Chromium browser without errors.

#### Scenario: Extension loads in Chrome

- **WHEN** the built extension is loaded unpacked in a Chromium browser
- **THEN** the extension installs with no manifest or load errors
- **AND** the background service worker registers successfully

#### Scenario: Manifest is Manifest V3

- **WHEN** the generated manifest is inspected
- **THEN** `manifest_version` is `3`
- **AND** the background is declared as a service worker

### Requirement: Minimum host permissions

The extension SHALL request host permissions only for the supported launch platforms (claude.ai, gemini.google.com, perplexity.ai, chatgpt.com) and SHALL NOT request broad (`<all_urls>`) host access or any permission granting access to user credentials.

#### Scenario: Only supported hosts are requested

- **WHEN** the generated manifest's host permissions are inspected
- **THEN** the host match patterns cover only the supported launch platforms
- **AND** no `<all_urls>` pattern is present

#### Scenario: No credential-bearing permissions

- **WHEN** the manifest permission list is inspected
- **THEN** it contains no permission that grants access to cookies, passwords, or other host credentials

### Requirement: Content-script injection on host pages

The extension SHALL inject a content script on supported host LLM pages, and that script SHALL signal successful injection.

#### Scenario: Content script runs on a host page

- **WHEN** a supported P0 host page is opened with the extension installed
- **THEN** the content script executes
- **AND** it emits an identifiable load log indicating successful injection

#### Scenario: Content script does not run on unsupported pages

- **WHEN** a page outside the declared host match patterns is opened
- **THEN** the content script does not execute

### Requirement: CI build produces a loadable package

The system SHALL build the extension in CI and produce a packaged zip artifact that can be loaded as an extension.

#### Scenario: CI emits a zip artifact

- **WHEN** the CI build job runs on the repository
- **THEN** the build completes successfully
- **AND** a zip artifact of the extension is produced

### Requirement: Extension branding icons

The built extension SHALL declare branding icons in its manifest so it presents the Skeinos
mark — rather than the browser default — in the install dialog, the extensions management
page, the Web Store/AMO listing, and the browser toolbar. The manifest's extension `icons`
map SHALL include at least the 16, 32, 48, and 128 px sizes, each referencing a valid PNG
bundled in the package.

#### Scenario: Manifest declares required icon sizes

- **WHEN** the generated manifest is inspected
- **THEN** `icons` is present
- **AND** it includes entries for sizes 16, 32, 48, and 128
- **AND** each referenced icon file exists in the build output

#### Scenario: Icon files are valid PNGs of the declared dimensions

- **WHEN** each file referenced by `icons` is read
- **THEN** it is a valid PNG
- **AND** its pixel dimensions match the declared size key

### Requirement: Branded toolbar action

The extension SHALL declare a toolbar `action` so a branded button appears in the browser
toolbar. The action SHALL carry a human-readable title and SHALL resolve to the Skeinos icon
(via its own `default_icon` or by falling back to the extension `icons`). The action's click
behaviour is out of scope for this capability and MAY be a no-op.

#### Scenario: Toolbar action is declared with a title

- **WHEN** the generated manifest is inspected
- **THEN** an `action` block is present
- **AND** it declares a non-empty `default_title`

#### Scenario: Toolbar button resolves to a branding icon

- **WHEN** the action is rendered in the toolbar
- **THEN** it displays the Skeinos icon, sourced from `action.default_icon` when present or
  from the extension `icons` map otherwise

### Requirement: Theme-adaptive toolbar icon on Firefox

The Firefox build of the extension SHALL provide `theme_icons` so the toolbar icon adapts to
light and dark browser themes, using monochrome glyph variants.

#### Scenario: Firefox manifest declares theme_icons

- **WHEN** the manifest generated for the Firefox target is inspected
- **THEN** `theme_icons` is present
- **AND** it pairs a light-theme and a dark-theme icon for at least one size
- **AND** each referenced glyph file exists in the build output

### Requirement: Extension pages reference a favicon

Pages owned by the extension (the options/settings page) SHALL reference a bundled favicon so
the browser tab shows the Skeinos mark instead of a blank icon.

#### Scenario: Options page links a favicon

- **WHEN** the options page HTML is inspected
- **THEN** it contains a `<link rel="icon">` referencing a bundled icon asset
- **AND** that asset exists in the build output

### Requirement: Side panel registered with minimum permission

The extension SHALL register a side-panel page in its manifest and request the
`sidePanel` permission, adding no host access. Any additional permission needed to
scope the panel to the active tab (e.g. reading the active tab's URL) SHALL be the
minimum required and justified, consistent with the privacy-first posture.

#### Scenario: Manifest declares the side panel and permission

- **WHEN** the built manifest is inspected
- **THEN** it declares a side-panel page path
- **AND** it lists the `sidePanel` permission
- **AND** it grants no new host permissions for the side panel
