## ADDED Requirements

### Requirement: Floating positioning helper

The system SHALL provide a positioning helper, built on `@floating-ui/dom`, that
anchors a floating element to a reference element and keeps it within the visible
viewport. The helper SHALL apply offset, flip, and shift behavior so a floating
element near a viewport edge is repositioned to remain fully on-screen rather than
clipping. The helper SHALL compute positions using the overlay's shadow root as the
positioning context so it is unaffected by host-page layout.

#### Scenario: Floating element is offset from its anchor

- **WHEN** the helper positions a floating element against an anchor with a configured offset
- **THEN** the floating element is placed adjacent to the anchor at the requested side
- **AND** separated from it by the configured offset distance

#### Scenario: Floating element flips away from a viewport edge

- **WHEN** an anchor is close enough to a viewport edge that the preferred side would clip the floating element
- **THEN** the helper places the floating element on the opposite side so it stays fully visible

#### Scenario: Floating element shifts to stay within the viewport

- **WHEN** a floating element would overflow the cross-axis edge of the viewport at its anchored position
- **THEN** the helper shifts the element along that axis to keep it within the visible bounds

### Requirement: Zag.js machine bridge for Preact

The system SHALL provide a bridge that drives a Zag.js interaction state machine
from Preact, exposing the machine's current state and its element prop-getters to a
component, and re-rendering the component when the machine's state changes. The
bridge SHALL be the only mechanism by which UI components consume Zag.js machines.

#### Scenario: Component reflects machine state

- **WHEN** a component is wired to a machine through the bridge
- **AND** an interaction transitions the machine to a new state
- **THEN** the component re-renders with the machine's updated state and prop-getters applied

#### Scenario: Machine is disposed with the component

- **WHEN** a component using the bridge is unmounted
- **THEN** the machine's listeners and any document-level handlers it registered are removed

### Requirement: Shadow-root scoped floating widgets

The system SHALL render every floating, portaled, or overlay element produced by
this layer (menus, dialogs, popovers, and later widgets built on it) inside the
overlay's shadow root, and SHALL NOT append any of them to the host page's
`document.body`, so that each inherits the `--sk-*` tokens and remains isolated from
host-page CSS.

#### Scenario: A floating widget stays inside the shadow root

- **WHEN** a menu, dialog, or other floating widget from this layer is opened
- **THEN** its DOM nodes exist within the overlay's shadow root
- **AND** none of its nodes are appended to the host page's light DOM

### Requirement: Accessible menu widget

The system SHALL provide an accessible menu widget, built on the Zag.js `menu`
machine and positioned by the floating helper, for use by context menus and similar
action lists. The menu SHALL expose correct menu/menuitem roles, support keyboard
navigation (arrow keys to move focus, `Enter`/`Space` to activate, `Escape` to
close), close on outside click, and restore focus to its trigger on close.

#### Scenario: Menu is keyboard operable

- **WHEN** the menu is open and the user presses the arrow keys
- **THEN** focus moves between menu items
- **AND** pressing `Enter` or `Space` activates the focused item

#### Scenario: Menu closes on Escape and restores focus

- **WHEN** the menu is open and the user presses `Escape`
- **THEN** the menu closes
- **AND** focus returns to the element that opened it

#### Scenario: Menu closes on outside interaction

- **WHEN** the menu is open and the user clicks or focuses outside it
- **THEN** the menu closes without activating any item

#### Scenario: Menu stays on-screen near a viewport edge

- **WHEN** the menu is opened from a trigger close to a viewport edge
- **THEN** the menu is repositioned by the floating helper to remain fully visible

### Requirement: Accessible modal dialog widget

The system SHALL provide an accessible modal dialog widget, built on the Zag.js
`dialog` machine, for use by forms such as the folder create/edit dialog. While
open, the dialog SHALL trap focus within itself, mark itself as a modal dialog for
assistive technology (`role="dialog"`, `aria-modal`), close on `Escape` and on
backdrop interaction, and restore focus to the element that opened it on close.

#### Scenario: Focus is trapped while the dialog is open

- **WHEN** the dialog is open and the user advances focus past its last focusable element
- **THEN** focus wraps to the first focusable element within the dialog rather than leaving it

#### Scenario: Dialog closes on Escape and restores focus

- **WHEN** the dialog is open and the user presses `Escape`
- **THEN** the dialog closes
- **AND** focus returns to the control that opened it

#### Scenario: Dialog is announced as modal

- **WHEN** the dialog is open
- **THEN** its container exposes `role="dialog"` and `aria-modal="true"` to assistive technology
