// core/profiles — the instruction-profile layer. The worker query/mutate handlers
// (`handlers`) persist the library through the store and broadcast changes, and the
// content/UI client (`client`) talks to them over the messaging seam. Nothing here
// touches the DOM; the Profiles tab UI lives outside `core/` (LLD §2, deps inward).
// CRUD + view only this slice — no activation or injection.

export {
  ProfileError,
  PROFILE_ERROR,
  queryProfileLibrary,
  mutateProfileLibrary,
  registerProfileHandlers,
} from './handlers';
export {
  queryProfilesRemote,
  mutateProfilesRemote,
  installProfileSeedsRemote,
} from './client';
export { installProfileSeeds } from './seed';
export { PROFILE_CATALOG, profileSeedsForDomain, type SeedProfile } from './catalog';
