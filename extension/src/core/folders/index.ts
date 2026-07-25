// core/folders — the folder organization layer. Pure tree logic
// (`tree`) plus the worker query/mutate handlers (`handlers`) that persist it
// through the store and broadcast changes. Nothing here touches the DOM; the
// sidebar UI and adapter reads live outside `core/` (dependencies inward).

export * from './tree';
export { FolderError, queryWorkspace, mutateWorkspace, registerFolderHandlers } from './handlers';
export { queryWorkspaceRemote, mutateWorkspaceRemote } from './client';
