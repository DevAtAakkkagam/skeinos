// Pure, dependency-free ingest helpers shared by the worker pipeline and the
// content/UI client. Kept separate from `pipeline.ts` so the client can build a
// body from messages WITHOUT importing the engine + store (which would drag
// IndexedDB and the postings code into the content-script / side-panel bundles).

/** A message as it crosses the hub — only the text is needed to build the body.
 *  Structurally compatible with the adapter's richer `Message`, so the content
 *  script can pass `Message[]` straight in without `core/` importing `adapters/`. */
export interface IndexableMessage {
  text: string;
}

/** Concatenate message bodies into the searchable body text (newline-joined). */
export function bodyFromMessages(messages: IndexableMessage[]): string {
  return messages.map((m) => m.text).join('\n');
}
