// core/prompts — the prompt-library layer. Pure `{{variable}}` template logic
// (`template`, slice 1) plus the worker query/mutate handlers (`handlers`, slice 2)
// that persist the library through the store and broadcast changes, and the
// content/UI client (`client`). Nothing here touches the DOM; the Prompts tab UI
// lives outside `core/` (dependencies inward).

export * from './template';
export {
  PromptError,
  PROMPT_ERROR,
  queryPromptLibrary,
  mutatePromptLibrary,
  registerPromptHandlers,
} from './handlers';
export {
  queryPromptLibraryRemote,
  mutatePromptLibraryRemote,
  installPromptSeedsRemote,
} from './client';
export { installSeeds } from './seed';
export { CATALOG, seedsForDomain, type SeedPrompt } from './catalog';
