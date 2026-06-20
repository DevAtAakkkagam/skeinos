# search Specification

## Purpose

The search capability defines the on-device search engine and its shadow-DOM overlay: prefix-sharded postings storage, incremental per-document add and removal, term-and-filter query parsing with ranked paged results, archived handling, an inert-until-tags-ship tag filter, position-based highlighting, a latency budget at scale, and a keyboard-operable, token-styled search overlay. Search operates entirely on local-only data and never participates in the sync envelope.

## Requirements

### Requirement: Postings are stored as prefix shards

The search engine SHALL store postings in the `searchPostings` store as prefix shards keyed by `prefix`,
where each shard record holds many terms and maps each term to its postings (`docId`, `field`, and token
`positions`). The shard prefix SHALL be the first two characters of the normalized term, or the whole
term when it is shorter than two characters, computed with the same normalization used at query time.

#### Scenario: Terms sharing a prefix occupy one shard

- **WHEN** several distinct terms sharing the same two-character prefix are indexed
- **THEN** they are stored as entries within a single shard record keyed by that prefix
- **AND** each entry records the `docId`, `field`, and token `positions` for that term

#### Scenario: Short terms shard by the whole term

- **WHEN** a one-character term is indexed
- **THEN** it is stored in a shard keyed by that single character

### Requirement: Postings support incremental add and removal per document

The engine SHALL add a document's postings on index and remove exactly that document's postings on
re-index or removal, leaving other documents' postings in the affected shards intact. Removal SHALL be
derived by re-tokenizing the document's previous `indexedText`; the engine SHALL NOT depend on a separate
document-to-terms reverse index.

#### Scenario: Removing a document clears only its postings

- **WHEN** a document is removed from the index
- **THEN** every posting contributed by that document is gone from its shards
- **AND** postings contributed by other documents in those shards are unchanged

#### Scenario: Re-indexing replaces a document's postings

- **WHEN** a document is re-indexed after its content changed
- **THEN** postings for terms it no longer contains are removed
- **AND** postings for its new terms are added, scoped to that document only

### Requirement: Query parses terms and filters and returns ranked results

The engine SHALL accept a `Query` of normalized terms plus optional filters (platform, date range, folder,
archived state, and tag), intersect the matching postings with AND semantics, apply the filters against
`ConversationIndex` metadata, and return ranked, paged `SearchResult`s. Each query term SHALL match indexed
terms by **prefix** (type-ahead): a query term matches any indexed term that begins with it, so an
in-progress word such as `ite` matches `iterative`. AND semantics still require every query term to match
some term in a document. Ranking SHALL score by term frequency with a field boost favoring title over body
and a recency factor favoring more recently updated conversations.

#### Scenario: Ranked results are correct

- **WHEN** a multi-term query is run over an indexed corpus
- **THEN** only conversations in which every query term prefix-matches some indexed term are returned
- **AND** results are ordered by the term-frequency, field-boost, and recency score, title matches
  outranking equivalent body matches

#### Scenario: A typed prefix matches a longer indexed term

- **WHEN** a query term is a prefix of an indexed term (e.g. `ite` against a conversation containing
  `iterative`)
- **THEN** that conversation is returned, with the full matched word highlighted in its snippet

#### Scenario: Filters constrain results

- **WHEN** a query is run with a platform, date-range, and folder filter
- **THEN** only conversations matching all supplied filters appear in the results

### Requirement: Archived conversations stay indexed but are hidden by default

Archived conversations (conversation-organization) SHALL remain indexed and queryable — archiving SHALL
NOT remove a conversation's postings. The query SHALL expose an archived filter dimension; by default a
query SHALL exclude archived conversations from results, matching the conversation list's "archived hidden
but retained" behavior, and SHALL include them only when the archived filter explicitly requests them.

#### Scenario: Archived results are excluded by default

- **WHEN** a query matches both archived and non-archived conversations and no archived filter is supplied
- **THEN** only the non-archived conversations appear in the results
- **AND** the archived conversations remain indexed and are returned when the archived filter requests them

#### Scenario: Results are paged

- **WHEN** a query matches more conversations than one page
- **THEN** results are returned in score order limited to the requested page

### Requirement: Tag filter is defined but inert until tags ship

The `Query` type and engine SHALL define a tag filter dimension. With no tags assigned to any
conversation, the tag filter SHALL act as a no-op and SHALL NOT exclude otherwise-matching results. The
search capability SHALL add no hard dependency on the tags capability.

#### Scenario: Tag filter is a no-op when no tags exist

- **WHEN** a query supplies a tag filter but no conversation carries tags
- **THEN** results are determined by the remaining terms and filters as if no tag filter were supplied

### Requirement: Matches are highlighted from stored positions

The engine SHALL use stored token `positions` to produce in-context highlighted snippets for each result,
indicating where the query terms matched.

#### Scenario: Result snippets highlight matched terms

- **WHEN** a query returns a result
- **THEN** the result carries a snippet with the matched query terms highlighted at their stored positions

### Requirement: Search meets the latency budget at scale

The engine SHALL return results for a query over 5,000 indexed conversations in under 500 ms, verified by a
synthetic-corpus benchmark run in CI as a merge gate.

#### Scenario: Benchmark stays within budget

- **WHEN** the CI benchmark runs a representative query against a synthetic 5,000-conversation corpus
- **THEN** the query completes in under 500 ms

### Requirement: Search overlay is keyboard-operable and token-styled

The system SHALL provide a search overlay mounted in the shadow-DOM UI harness that issues queries through
the `search.run` request and renders highlighted, paged results, filter controls (platform, date, folder,
archived, and an inert tag control), and an empty state. The overlay SHALL ALSO query the prompt library
(via `prompt.search`) over the same query text and render results as **two labelled groups —
conversations and prompts — within one keyboard-navigable listbox**, with focus moving across the group
boundary. Each conversation result row SHALL show its conversation's platform logo drawn from the
platform-branding registry and SHALL be openable to its conversation; each prompt result row SHALL show
its highlighted snippet and SHALL, when selected, **navigate to that prompt in the Prompts tab** (via a
navigation callback) rather than opening a host tab. The overlay SHALL show its empty state only when
**both** sources return nothing for a non-empty query. The overlay SHALL style only from `--sk-*` tokens,
use no host classes or hard-coded user-facing strings, and be fully keyboard-operable and ARIA-labelled.
It SHALL be a pure view over worker state, re-querying both sources on the `state.changed` broadcast.

#### Scenario: Keyboard-only search returns highlighted results

- **WHEN** a user opens the overlay, types a query, and navigates results using only the keyboard
- **THEN** matching results render with the query terms highlighted
- **AND** the focused result can be opened and the overlay dismissed without a pointer

#### Scenario: Prompts appear as their own group

- **WHEN** a query matches both conversations and prompts
- **THEN** the overlay shows a conversations group and a prompts group, each labelled, in one listbox

#### Scenario: Keyboard navigation crosses the group boundary

- **WHEN** the focus is on the last conversation result and the user presses the next-result key
- **THEN** focus moves to the first prompt result (and selection works on either group)

#### Scenario: Selecting a prompt navigates to the Prompts tab

- **WHEN** the user opens a prompt result
- **THEN** the overlay dismisses and the prompt opens in the Prompts tab (no host tab is opened)

#### Scenario: Empty state only when both sources are empty

- **WHEN** a query matches neither conversations nor prompts
- **THEN** the overlay shows its empty state rather than an empty list with no explanation

#### Scenario: A group with no matches shows no header

- **WHEN** a query matches conversations but no prompts
- **THEN** only the conversations group is shown (no empty prompts header)
