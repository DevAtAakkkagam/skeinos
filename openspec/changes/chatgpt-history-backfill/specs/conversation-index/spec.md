## ADDED Requirements

### Requirement: Backfilled conversations are stamped below the existing recency floor

The indexing pipeline SHALL stamp backfilled conversations below the recency floor of the records
already held for their platform, rather than relative to the current time.

Title ingest stamps each conversation's `updatedAt` from its position in the host list so the
newest-first DOM order is preserved. An ingest flagged as a **backfill** — the result of a
history-expansion sweep that revealed conversations the host had not previously rendered — MUST NOT
use that rule for newly-discovered records, because a conversation discovered deep in the backlog
would then sort as newer than every record ingested in an earlier session, inverting the user's
list.

For a backfill ingest, the pipeline SHALL compute a floor as the minimum `updatedAt` across the
platform's existing records, and SHALL stamp each newly-discovered record strictly below that floor,
decreasing with the record's position in the host list so relative order within the backlog is
preserved. Records that already exist SHALL keep their stored `updatedAt` unchanged — the existing
content-hash gate already makes an unchanged record a no-op.

A non-backfill ingest SHALL keep today's behavior unchanged.

#### Scenario: Backfilled conversations sort below previously-known ones

- **WHEN** a platform has existing indexed conversations, and a backfill ingest arrives carrying
  those conversations plus additional ones discovered further down the host list
- **THEN** every newly-discovered record's `updatedAt` is lower than the lowest `updatedAt` among the
  pre-existing records
- **AND** the pre-existing records' `updatedAt` values are unchanged

#### Scenario: Backlog keeps its relative order

- **WHEN** a backfill ingest discovers several new conversations at consecutive host-list positions
- **THEN** their stamped `updatedAt` values decrease in host-list order, so the one nearest the top
  of the host list sorts newest among them

#### Scenario: Backfill into an empty index

- **WHEN** a backfill ingest arrives for a platform with no existing records
- **THEN** every record is stamped in host-list order with no inversion

#### Scenario: Ordinary ingest is unaffected

- **WHEN** an ingest that is not flagged as a backfill arrives
- **THEN** records are stamped exactly as before this change
