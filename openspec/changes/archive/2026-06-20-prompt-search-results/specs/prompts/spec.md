## ADDED Requirements

### Requirement: Prompt search query

The system SHALL provide a `prompt.search` selector on the `prompts.query` request that returns the
library's prompts matching all supplied query terms. A prompt SHALL match when every term appears
(case-insensitively, normalized as conversation search normalizes) in at least one of its title, body,
description, tags, or slug. Results SHALL be ranked with title matches outweighing body/description
matches and ties broken by recency, SHALL each carry a highlighted snippet (reusing the search overlay's
snippet-segment shape), and SHALL exclude tombstoned prompts. The search SHALL run entirely on-device
over the local library; prompt content SHALL NOT enter the conversation postings index or the sync
envelope.

#### Scenario: Matches across searchable fields
- **WHEN** a `prompt.search` with terms that appear in a prompt's title, body, tags, or slug is handled
- **THEN** that prompt is included in the results

#### Scenario: AND semantics across terms
- **WHEN** a query has multiple terms
- **THEN** only prompts in which every term appears (in any searchable field) are returned

#### Scenario: Title matches rank above body matches
- **WHEN** one prompt matches a term in its title and another only in its body
- **THEN** the title match is ranked ahead of the body match

#### Scenario: Results carry a highlighted snippet
- **WHEN** a prompt matches
- **THEN** its result carries a snippet whose matching runs are flagged for highlighting

#### Scenario: Tombstoned prompts are excluded
- **WHEN** a deleted (tombstoned) prompt would otherwise match
- **THEN** it does not appear in the results

#### Scenario: Empty query returns nothing
- **WHEN** a `prompt.search` is handled with no terms
- **THEN** it returns an empty result set (not the whole library)
