# ui-shell Specification

## Purpose

The ui-shell capability defines the shadow-DOM mount harness, host-CSS isolation guarantees, theme tokens (light/dark/system), and the base UI component primitives that the extension's overlay UI is built from.

## Requirements

### Requirement: Shadow-DOM mount harness

The system SHALL provide a reusable harness that mounts a Preact UI tree inside an open shadow root attached to a host-page element, and SHALL provide a disposer that unmounts it and removes the host node.

#### Scenario: Panel renders in a shadow root

- **WHEN** the harness mounts a sample panel onto a mock host page
- **THEN** the panel's DOM exists inside a shadow root (`host.shadowRoot` is present)
- **AND** the panel content is rendered and visible

#### Scenario: Mount can be disposed

- **WHEN** the disposer returned by the harness is called
- **THEN** the Preact tree is unmounted
- **AND** the host mount node is removed from the page

### Requirement: Host-CSS isolation

The mounted UI SHALL be isolated from the host page's styles in both directions: host-page CSS SHALL NOT affect the extension UI, and the extension UI's CSS SHALL NOT affect the host page.

#### Scenario: Host styles do not bleed into the extension UI

- **WHEN** the mock host page defines aggressive global styles (e.g. `* { color: red !important }`)
- **AND** the harness mounts the sample panel
- **THEN** the panel's computed styles reflect the extension's own tokens, not the host's global styles

#### Scenario: Extension styles do not bleed into the host page

- **WHEN** the sample panel is mounted with its component styles
- **THEN** the host page's own elements retain their original computed styles, unaffected by the extension's CSS

### Requirement: Theme tokens with light and dark modes

The UI shell SHALL define theme tokens as shadow-scoped CSS custom properties with light and dark modes plus a system-driven default, and base components SHALL consume tokens rather than hard-coded values.

#### Scenario: Theme can be toggled

- **WHEN** the active theme is switched between light and dark on a mounted panel
- **THEN** the panel's token-derived colors update to match the selected mode

#### Scenario: System mode follows the OS preference

- **WHEN** the theme is set to system mode
- **AND** the OS `prefers-color-scheme` is dark
- **THEN** the panel renders with dark-mode tokens

#### Scenario: Tokens are scoped to the shadow root

- **WHEN** the theme tokens are applied
- **THEN** the token custom properties are defined on the shadow root host and are not present on the host page's document root

### Requirement: Base UI components

The UI shell SHALL provide a small set of base components (primitives) that render correctly inside the shadow-DOM harness and style themselves exclusively from theme tokens.

#### Scenario: Base components render from tokens

- **WHEN** a base component is rendered inside a mounted panel
- **THEN** it appears with styling derived from the active theme tokens
- **AND** changing the active theme updates the component's appearance accordingly
