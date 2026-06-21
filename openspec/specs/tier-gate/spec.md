# tier-gate Specification

## Purpose

The tier-gate capability defines the free/pro tier model and its enforcement: a single source of
truth for the user's tier (persisted in settings, defaulting to FREE), a centralized per-tier quota
table, worker-side enforcement that rejects quota-governed creates before any write, a
block-with-nudge UX that preserves user input, and a sidebar tier badge that reflects the real tier.

## Requirements

### Requirement: Tier state with a default of FREE

The system SHALL represent the user's tier as one of `FREE` or `PRO`, persisted in settings,
and SHALL treat the tier as `FREE` whenever no tier has been set. Both the service worker and
the UI SHALL derive tier from this single source.

#### Scenario: A fresh install is on the free tier

- **WHEN** settings contain no `tier` value
- **THEN** the effective tier resolves to `FREE`
- **AND** free-tier limits are enforced

#### Scenario: Tier is read consistently by worker and UI

- **WHEN** the persisted tier is `PRO`
- **THEN** the worker's quota checks use the `PRO` limits
- **AND** the UI badge reflects `PRO`

### Requirement: Per-tier quota table

The system SHALL define a single, centralized limit table mapping each tier to a maximum count
for folders, prompts, profiles, and tags. The `FREE` limits SHALL be 5 folders, 25 prompts,
3 profiles, and 10 tags (PRD §7). The `PRO` tier SHALL be unlimited for every resource.

#### Scenario: Free limits match the published values

- **WHEN** the tier is `FREE`
- **THEN** the limits are folders=5, prompts=25, profiles=3, tags=10

#### Scenario: Pro is unlimited

- **WHEN** the tier is `PRO`
- **THEN** no resource count is ever rejected for exceeding a limit

### Requirement: Worker-side quota enforcement on create

The service worker, as the single writer, SHALL reject any quota-governed create operation when
the current count of that resource is at or above the tier's limit, BEFORE persisting any record.
The rejection SHALL be a typed error with a stable `quota_exceeded` code carrying the resource,
the current count, and the applicable limit. A rejected create SHALL leave storage unchanged.

#### Scenario: Creating at the limit is rejected

- **WHEN** the tier is `FREE` and 5 folders already exist and a 6th folder create arrives
- **THEN** the operation is rejected with a `quota_exceeded` error naming `folders`, count 5, limit 5
- **AND** no new folder record is written
- **AND** no state-changed broadcast for folders is emitted

#### Scenario: Creating below the limit succeeds

- **WHEN** the tier is `FREE` and 4 folders exist and a 5th folder create arrives
- **THEN** the folder is persisted normally

#### Scenario: Deleting frees quota

- **WHEN** the resource is at its limit and one record is deleted
- **THEN** a subsequent create of that resource succeeds

#### Scenario: Pro bypasses enforcement

- **WHEN** the tier is `PRO`
- **THEN** a create succeeds regardless of how many of that resource already exist

### Requirement: Block-with-nudge preserves user input

When a create is refused for exceeding quota, the UI SHALL keep the user's entered values intact
(the draft or modal stays open and editable) and SHALL present an informational upgrade nudge that
names the limit reached. The UI SHALL NOT discard, truncate, or partially save the input. Because
Pro is not yet purchasable, the nudge SHALL be informational and SHALL NOT present a checkout flow.

#### Scenario: Refused create keeps the form open

- **WHEN** a user submits a create that the worker rejects with `quota_exceeded`
- **THEN** the entered values remain in the form
- **AND** an upgrade nudge naming the reached limit is shown
- **AND** the user can edit and retry or cancel without data loss

#### Scenario: Nudge is informational only

- **WHEN** the upgrade nudge is shown
- **THEN** it explains the free-tier limit and that higher limits arrive with Pro
- **AND** it does not initiate a purchase or checkout

### Requirement: Tier badge reflects real state

The sidebar tier badge SHALL render the effective tier from settings rather than a hardcoded value.

#### Scenario: Free tier shows a free badge

- **WHEN** the effective tier is `FREE`
- **THEN** the badge displays the free-tier label, not `PRO`

#### Scenario: Badge updates when tier changes

- **WHEN** the persisted tier changes
- **THEN** the badge re-renders to the new tier without a reload
