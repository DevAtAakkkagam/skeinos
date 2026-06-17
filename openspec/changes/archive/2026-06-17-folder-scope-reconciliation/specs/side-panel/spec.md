## MODIFIED Requirements

### Requirement: Panel scopes to the active tab's platform

The side panel SHALL determine the active platform from the active tab and use it for
the **active-conversation context** (the card reflecting the conversation open in that
tab) and for **host gating** (enabling the panel only on supported hosts), re-deriving
when the active tab changes. The **folder/workspace browser SHALL be unified** — its
folder contents and counts span every platform and are NOT scoped to the active tab's
platform; an optional platform view-filter (default "All") may narrow them. When no
supported host tab is active, the panel SHALL show a neutral prompt rather than stale or
incorrect data.

#### Scenario: Active-conversation context reflects the active host

- **WHEN** the active tab is a supported host with an open conversation
- **THEN** the panel's active-conversation context reflects that tab's platform and
  conversation

#### Scenario: Folder browser stays unified across the active host

- **WHEN** the active tab is a supported host
- **THEN** the folder browser still shows folders' conversations from every platform
  (it is not narrowed to the active tab's platform unless the user applies the platform
  filter)

#### Scenario: Active-conversation context re-derives when the active tab changes

- **WHEN** the user switches to a different supported host tab
- **THEN** the active-conversation context re-derives to the newly active platform,
  while the unified folder browser is unaffected

#### Scenario: Neutral state with no supported tab

- **WHEN** no supported host tab is active
- **THEN** the panel shows a neutral "open a supported chat" prompt
