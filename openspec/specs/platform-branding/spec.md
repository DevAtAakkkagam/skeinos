# platform-branding Specification

## Purpose

The platform-branding capability provides a single in-bundle registry that maps each `PlatformId` to its brand logo and canonical web origin. It is the single source of truth for the platform logos shown across the UI (conversation rows, platform view-filter chips) and for resolving a platform-relative conversation id into an absolute URL when routing a conversation open.

## Requirements

### Requirement: Platform branding registry keyed by PlatformId

The system SHALL provide a single branding registry that maps each `PlatformId` to its brand
**logo** and its canonical web **origin**. The logo SHALL be a vendored, in-bundle SVG component
(no remote code, no runtime fetch) that mounts in the shadow root and is styled consistently with
the existing icon set. The origin SHALL be the platform's canonical absolute web origin (e.g.
`claude → https://claude.ai`, `gemini → https://gemini.google.com`,
`perplexity → https://www.perplexity.ai`). This registry SHALL be the single source of truth for
platform logos shown in the UI and for resolving a platform-relative conversation id into an
absolute URL.

#### Scenario: Logo resolves for a known platform

- **WHEN** the UI requests the logo for a `PlatformId` present in the registry
- **THEN** the registry returns that platform's vendored SVG logo component
- **AND** the logo renders inline in the shadow root without any network request

#### Scenario: Origin resolves a relative conversation id

- **WHEN** a relative `nativeId` (e.g. `/chat/abc`) is resolved against a platform's registry origin
- **THEN** the result is the absolute conversation URL on that platform's origin

#### Scenario: Registry is the single source for logo and origin

- **WHEN** both a platform logo and its origin are needed (e.g. rendering a row and routing its open)
- **THEN** both derive from the same per-`PlatformId` registry entry
