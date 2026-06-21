// All user-facing strings for the Profiles tab in one place (i18n-ready: no inline
// literals in markup, per the PREACT guardrail). Functions interpolate rather than
// concatenate fragments so a translator owns the whole phrase.

export const STR = {
  // Panel chrome
  panelLabel: 'Instruction profiles',
  sectionTitle: 'Profiles',
  newProfile: 'New profile',
  listLabel: 'Saved profiles',
  defaultName: 'Untitled profile',

  // Load / empty states
  loading: 'Loading your profiles…',
  errorTitle: 'Couldn’t load your profiles',
  errorBody: 'Something went wrong reading your profiles. Try again.',
  retry: 'Try again',
  firstRunTitle: 'No profiles yet',
  firstRunBody: 'Save a named set of standing instructions to reuse across your chats.',
  // Editor (modal, matching the prompt/folder editors)
  editorNewTitle: 'New profile',
  editorEditTitle: 'Edit profile',
  save: 'Save',
  nameRequired: 'A name is required.',
  fieldName: 'Name',
  fieldNamePlaceholder: 'Name this profile',
  fieldDescription: 'Description',
  fieldDescriptionPlaceholder: 'Optional — what is this for?',
  fieldInstruction: 'Instructions',
  fieldInstructionPlaceholder: 'e.g. Act as a senior staff engineer. Be terse.',

  // Apply-to (per-platform)
  appliesToLegend: 'Apply to',
  // The injection mode shown per platform. PREPEND-only this slice (D-3 / D13): no
  // system-prompt mode is advertised until the injection exists.
  modePrepend: 'PREPEND',

  // Response style
  responseStyleLegend: 'Response style',
  verbosityLabel: 'Verbosity',
  verbosityBrief: 'Brief',
  verbosityBalanced: 'Balanced',
  verbosityThorough: 'Thorough',
  formatLabel: 'Format',
  formatMarkdown: 'Markdown',
  formatPlain: 'Plain',

  // Actions
  rowMenu: 'Profile actions',
  edit: 'Edit',
  delete: 'Delete',
  deleteProfile: 'Delete profile',
  confirmDeleteTitle: 'Delete this profile?',
  confirmDeleteBody: (name: string): string => `“${name}” will be permanently removed.`,
  confirmDelete: 'Delete',
  cancel: 'Cancel',
} as const;

/** Display labels for the per-platform apply-to rows (keyed by `PlatformId`). */
import type { PlatformId } from '../../shared/types';
export const PLATFORM_LABELS: Record<PlatformId, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  grok: 'Grok',
  deepseek: 'DeepSeek',
  chatgpt: 'ChatGPT',
  mistral: 'Mistral',
};
