## ADDED Requirements

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

The extension SHALL request host permissions only for the P0 launch platforms (claude.ai, gemini.google.com, perplexity.ai) and SHALL NOT request broad (`<all_urls>`) host access or any permission granting access to user credentials.

#### Scenario: Only P0 hosts are requested

- **WHEN** the generated manifest's host permissions are inspected
- **THEN** the host match patterns cover only the P0 launch platforms
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
