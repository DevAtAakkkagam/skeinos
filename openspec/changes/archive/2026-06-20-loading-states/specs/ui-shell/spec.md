## ADDED Requirements

### Requirement: Skeleton loader primitive

The UI shell SHALL provide a `Skeleton` base component that renders a placeholder block inside the
shadow-DOM harness, styling itself exclusively from theme tokens, and exposing size/shape options
so it can stand in for a line, a row, or a block. The placeholder SHALL NOT be announced to
assistive technology as content.

#### Scenario: Skeleton renders from tokens

- **WHEN** a `Skeleton` is rendered inside a mounted panel
- **THEN** it appears as a placeholder styled from the active theme tokens
- **AND** changing the active theme updates its appearance accordingly

#### Scenario: Skeleton is not announced as content

- **WHEN** a `Skeleton` is rendered
- **THEN** it is hidden from assistive technology (it conveys no real content)
