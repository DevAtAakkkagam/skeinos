## ADDED Requirements

### Requirement: Indexing pipeline ingests adapter messages into a ConversationIndex

The system SHALL provide a service-worker indexing pipeline that takes a platform adapter's
`readMessages(nativeId)` output, derives normalized searchable text and a `contentHash`, and persists a
`ConversationIndex` record. Normalization SHALL lowercase, strip punctuation, collapse whitespace, and
apply light stemming. The pipeline SHALL run in the service worker (the single writer); the content-script
adapter SHALL only read the DOM and pass `Message[]` over the messaging hub. `ConversationIndex`,
`indexedText`, and the resulting postings SHALL remain local-only and never enter the sync envelope.

#### Scenario: Fixture conversation is indexed

- **WHEN** the pipeline receives the messages of a fixture conversation for the first time
- **THEN** a `ConversationIndex` record is stored with its `id`, `platform`, `nativeId`, `title`,
  `folderId`, `tags`, normalized `indexedText`, a `contentHash` over the normalized text, and `updatedAt`
- **AND** the conversation's terms become queryable through the search engine

#### Scenario: Normalization is applied before storage

- **WHEN** a conversation containing mixed-case words, punctuation, and irregular whitespace is indexed
- **THEN** the stored `indexedText` is lowercased, punctuation-stripped, whitespace-collapsed, and lightly
  stemmed

### Requirement: Re-indexing is idempotent via contentHash

The pipeline SHALL skip re-indexing when a conversation's recomputed `contentHash` equals the stored
`ConversationIndex.contentHash`, and SHALL re-index (updating the record and the postings) only when the
hash differs.

#### Scenario: Unchanged conversation is not re-indexed

- **WHEN** an already-indexed conversation is submitted again with identical content
- **THEN** the recomputed `contentHash` matches the stored one
- **AND** no postings are rewritten and the `ConversationIndex` record is left unchanged

#### Scenario: Changed conversation is re-indexed

- **WHEN** an already-indexed conversation is submitted with new or edited messages
- **THEN** the recomputed `contentHash` differs from the stored one
- **AND** the `ConversationIndex` record is updated and its postings are updated to reflect only the new
  content

### Requirement: Bulk indexing is chunked and best-effort

The pipeline SHALL process bulk indexing of many conversations in synchronous chunks, yielding between
chunks so a single index operation does not monopolize the worker. Conversations indexed before a worker
interruption SHALL persist, and un-indexed conversations SHALL be re-indexable on a later visit. The
pipeline SHALL expose a `{ done, total }` progress signal over the `state.changed` broadcast for a future
indexing indicator.

#### Scenario: Indexed conversations persist across an interrupted bulk run

- **WHEN** a bulk index of a multi-conversation corpus is interrupted after some conversations are indexed
- **THEN** the already-indexed conversations remain queryable
- **AND** re-running the index over the remaining conversations completes the corpus without duplicating
  postings

#### Scenario: Progress is observable

- **WHEN** a bulk index is in progress
- **THEN** a `{ done, total }` progress signal is broadcast as conversations are indexed
