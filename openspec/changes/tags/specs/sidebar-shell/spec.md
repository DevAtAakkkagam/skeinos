## MODIFIED Requirements

### Requirement: Disabled stubs reserve layout for unbuilt features

The shell SHALL render the search launcher (with a ⌘K hint), the tier (PRO) badge, and
the sync-status indicator as visually-present but disabled elements that dispatch no
action, reserving their layout slots for the search, tier, and sync features
respectively. The tag-filter row is no longer an inert stub — it is a live control (see
the Tag view-filter control requirement).

#### Scenario: Search launcher is an inert stub

- **WHEN** the shell renders the search launcher
- **THEN** the launcher and its ⌘K hint are shown
- **AND** the launcher is disabled and triggers nothing when activated

#### Scenario: Tier and sync indicators are inert stubs

- **WHEN** the shell renders the footer
- **THEN** the PRO badge and sync-status indicator are shown
- **AND** neither dispatches an action when activated

## ADDED Requirements

### Requirement: Tag view-filter control

The shell SHALL render the tag-filter as a live chip group within the Folders-tab filter
area, sibling to the platform view-filter. It SHALL render one toggleable chip per tag
currently used to filter, plus a "+ Tag" affordance that lets the user pick which tags to
filter by from the existing tags. Selecting tag chips SHALL narrow the rendered
conversation list (AND semantics, per the `tags` capability) as ephemeral view state, and
deselecting all SHALL restore the unified list. Each tag chip SHALL carry the tag's color
when set. The control SHALL be token-styled and fully keyboard-operable with an accessible
group label, and SHALL be shown only on the Folders tab (like the platform filter).

#### Scenario: The "+ Tag" affordance is live

- **WHEN** the shell renders the Folders-tab filter row
- **THEN** the "+ Tag" affordance is enabled and opens a way to choose tags to filter by

#### Scenario: Selecting a tag chip narrows the list

- **WHEN** the user activates a tag chip in the filter
- **THEN** the rendered conversation list narrows to conversations carrying that tag
- **AND** deselecting all tag chips restores the unified list

#### Scenario: Tag filter is keyboard-operable and labelled

- **WHEN** a keyboard user navigates the tag-filter chip group
- **THEN** the group exposes an accessible label and each chip is reachable and toggleable by keyboard

#### Scenario: Tag filter is hidden off the Folders tab

- **WHEN** the Prompts tab is active
- **THEN** the Folders-tab tag-filter chip group is not shown
