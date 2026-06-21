## ADDED Requirements

### Requirement: Prompt creation respects the tier quota

`prompt.create` SHALL be rejected when the current prompt count is at or above the active tier's
prompt limit, before any record is written, with a `quota_exceeded` error naming `prompts`. Counts
exclude tombstoned records. Editing and deleting prompts are unaffected by the quota.

#### Scenario: Creating a prompt over quota is rejected

- **WHEN** the tier is `FREE`, 25 prompts exist, and a prompt create arrives
- **THEN** the create is rejected with a `quota_exceeded` error for `prompts`
- **AND** no prompt is persisted

#### Scenario: Editing a prompt at quota still works

- **WHEN** the prompt count is at the limit
- **THEN** editing an existing prompt completes normally
