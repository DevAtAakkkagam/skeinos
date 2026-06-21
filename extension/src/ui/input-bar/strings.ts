// All user-facing strings for the input action bar in one place (i18n-ready: no
// inline literals in markup, per the PREACT guardrail). Functions interpolate
// rather than concatenate fragments so a translator owns the whole phrase.

export const STR = {
  // Bar chrome
  brand: 'Skeinos',
  barLabel: 'Skeinos input bar',
  slashTrigger: 'Insert prompt',
  // Visible keyboard hint on the trigger — the `Cmd/Ctrl + /` accelerator, rendered
  // per-OS (⌘ on macOS, Ctrl elsewhere). Decorative (aria-hidden); the trigger's
  // accessible name stays `slashTrigger`.
  shortcutHint: (isMac: boolean): string => (isMac ? '⌘/' : 'Ctrl+/'),
  // Profile chip (profile-activation): a functional control that lists saved
  // instruction profiles, marks the active one, and on selection composes +
  // inserts the instruction (PREPEND, append-only). Replaces the old disabled stub.
  profileChip: 'Profile',
  profileChipLabel: 'Instruction profile',
  profileMenuLabel: 'Choose an instruction profile',
  profileActiveLabel: (name: string): string => `Instruction profile: ${name}`,
  // Shown on the chip when the active profile does not apply to this platform — it
  // stays selected globally but cannot inject here (D-3).
  profileInactiveHere: 'This profile is not available on this site',
  // Per-item hint when a profile's `appliesTo` excludes the current platform.
  profileNotApplicable: 'Not available on this site',
  // Active-item indicator (decorative; the accessible state is `aria-checked`).
  profileActiveMark: '✓',
  profileMenuEmpty: 'No profiles yet. Create one in the Profiles tab.',
  profileMenuLoading: 'Loading your profiles…',
  profileMenuError: 'Couldn’t load your profiles.',
  profileMenuRetry: 'Try again',

  // Deferred model control (C24) — a disabled stub that reserves layout so the bar
  // does not reflow when that feature lands (design D-7).
  modelStub: 'Model',
  modelStubHint: 'Model selection — coming soon',

  // Slash popover
  popoverLabel: 'Prompt picker',
  searchLabel: 'Search prompts',
  searchPlaceholder: 'Search prompts…',
  idle: 'Type to search your prompts.',
  lastUsed: 'Last used',
  searching: 'Searching…',
  error: 'Prompt search is unavailable right now. Try again.',
  empty: 'No prompts match your search.',
  results: 'Matching prompts',
  close: 'Close',

  // Variable-fill modal
  modalLabel: 'Fill in prompt variables',
  modalTitle: (title: string): string => `Fill in: ${title}`,
  insert: 'Insert',
  cancel: 'Cancel',
} as const;
