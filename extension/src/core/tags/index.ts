// core/tags — the tag organization layer (C7/M2, LLD T2.3). Pure tag logic + the
// client-side derivations (`tags`) plus the worker query/mutate handlers (`handlers`)
// that persist through the store. Tags ride the shared `workspace.query`/`mutate`
// kinds (the folders handler registers them and delegates the `tag.*` variants here),
// so there is no separate client — the UI uses the workspace remote from `core/folders`.
// Nothing here touches the DOM (LLD §2, dependencies inward).

export * from './tags';
export { TagError, queryTags, mutateTags, type TagOp } from './handlers';
