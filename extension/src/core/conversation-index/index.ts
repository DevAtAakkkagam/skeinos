// core/conversation-index — the ingest pipeline (worker) plus the search/index
// client (content/UI) and worker handler registration. The pipeline + handlers
// live in the service worker (the single writer); the client carries only `send`
// calls so importing it never pulls the engine or IndexedDB into a tab bundle.

export {
  indexConversation,
  indexConversationFromMessages,
  indexConversationTitle,
  removeConversation,
  bulkIndex,
  createSearchEngine,
} from './pipeline';
export { bodyFromMessages, type IndexableMessage } from './pipeline-types';
export { registerSearchHandlers } from './handlers';
export {
  searchRemote,
  indexConversationRemote,
  indexConversationFromMessagesRemote,
  indexBulkRemote,
} from './client';
