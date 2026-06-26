## ADDED Requirements

### Requirement: Non-modal popover outside-dismiss does not pass through

The system SHALL ensure that, while a non-modal popover surface produced by this
layer is open (e.g. a context menu or a popover), a pointer interaction outside the
surface that dismisses it does NOT also deliver a pointer activation (click, toggle,
or open) to the element behind it. The first outside interaction SHALL only dismiss
the surface. This guarantee SHALL be provided structurally — by a dismissal scrim
element rendered beneath the open surface and above page content that absorbs the
interaction — rather than by cancelling events after the surface has closed.

The dismissal scrim SHALL be transparent (it does not visually dim or obscure the
surface behind it, unlike the modal dialog backdrop), SHALL cover the overlay
surface so an interaction anywhere outside the popover lands on it, and SHALL sit at
a stacking order below the popover it guards (so the popover remains interactive) and
above the page content it shields.

#### Scenario: Outside click dismisses without activating the element behind

- **WHEN** a non-modal popover surface is open
- **AND** the user presses and releases a pointer on a control outside the surface
  (including a control directly behind where the surface was shown)
- **THEN** the surface closes
- **AND** the control behind it is not activated (no click, toggle, or navigation occurs)

#### Scenario: Dismissal survives a held press across a frame

- **WHEN** a non-modal popover surface is open
- **AND** the user holds the outside press long enough for the surface's own
  outside-dismiss to close it before the pointer is released
- **THEN** on release the element behind is still not activated

#### Scenario: Scrim does not obscure the popover

- **WHEN** a non-modal popover surface is open with its dismissal scrim present
- **THEN** the popover and its controls remain visible and interactive above the scrim
- **AND** the scrim is visually transparent

## MODIFIED Requirements

### Requirement: Accessible menu widget

The system SHALL provide an accessible menu widget, built on the Zag.js `menu`
machine and positioned by the floating helper, for use by context menus and similar
action lists. The menu SHALL expose correct menu/menuitem roles, support keyboard
navigation (arrow keys to move focus, `Enter`/`Space` to activate, `Escape` to
close), close on outside click, and restore focus to its trigger on close. When the
menu closes on an outside pointer interaction, that interaction SHALL NOT activate
the element behind the menu.

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
- **AND** the control behind the menu is not activated by that same interaction

#### Scenario: Menu stays on-screen near a viewport edge

- **WHEN** the menu is opened from a trigger close to a viewport edge
- **THEN** the menu is repositioned by the floating helper to remain fully visible
