// ui/tags — the tag surfaces. Tags are a cross-cutting facet (no dedicated tab):
// the data hook, one reusable `TagPicker` popover (filter + assign + inline CRUD),
// and the `TagFilterChips` that places the filter inline in the Folders filter row.

export { useTagLibrary, type TagLibraryView, type TagMutationOp, type TagMutateResult } from './useTagLibrary';
export { TagPicker } from './TagPicker';
export { TagFilterChips } from './TagFilterChips';
export { TAGS_CSS } from './styles';
