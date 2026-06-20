// core/search — pure normalization + the prefix-shard postings engine (build,
// incremental add/remove, query). No storage of its own beyond the `Repo`s it is
// handed, no DOM, no messaging — so it runs inside the service worker and is driven
// directly by the benchmark over a synthetic corpus.

export {
  normalize,
  stem,
  tokenize,
  prefixOf,
  hashContent,
  indexableText,
  type Token,
} from './normalize';
export {
  applyPostingsBatch,
  indexPostings,
  removePostings,
  runSearch,
  type IndexEntry,
} from './engine';
