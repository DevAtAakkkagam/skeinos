// All user-facing strings for the Prompts tab in one place (i18n-ready: no inline
// literals in markup, per the PREACT guardrail). Functions interpolate rather than
// concatenate fragments so a translator owns the whole phrase.

export const STR = {
  // Panel chrome
  panelLabel: 'Prompt library',
  sectionTitle: 'Prompts',
  newPrompt: '+ New prompt',
  newPromptShort: 'New prompt',
  filterLabel: 'Filter prompts',
  categoryFilterLabel: 'Filter by category',
  tagFilterLabel: 'Filter by tag',
  all: 'All',
  uncategorized: 'Uncategorized',
  newCategory: '+ New category',
  addTag: '+ Tag',

  // Card
  cardMenu: 'Prompt actions',
  edit: 'Edit',
  delete: 'Delete',
  varsCount: (n: number): string => (n === 1 ? '1 var' : `${n} vars`),

  // Load / empty states
  loading: 'Loading your prompts…',
  errorTitle: 'Couldn’t load your prompts',
  errorBody: 'Something went wrong reading the library. Try again.',
  retry: 'Try again',
  firstRunTitle: 'No prompts yet',
  firstRunBody: 'Create a reusable prompt with {{variables}} you can fill in later.',
  createFirst: 'Create your first prompt',

  // Starter-pack seeding from the empty state (shown only when no domain is chosen
  // yet — the recovery path for users who skipped onboarding's domain pick).
  seedTitle: 'Or start from a starter pack',
  seedDomainLabel: 'Field',
  seedAdd: 'Add starter prompts',

  noMatchTitle: 'No prompts match this filter',
  noMatchBody: 'Try a different category or tag, or clear the filter.',
  clearFilter: 'Clear filter',

  // Editor
  editorNewTitle: 'New prompt',
  editorEditTitle: 'Edit prompt',
  close: 'Close',
  fieldTitle: 'Title',
  fieldTitlePlaceholder: 'Name this prompt',
  fieldBody: 'Prompt',
  fieldBodyPlaceholder: 'Write your prompt. Use {{variable}} for fill-in fields.',
  fieldDescription: 'Description',
  fieldDescriptionPlaceholder: 'Optional — what is this for?',
  fieldTags: 'Tags',
  fieldTagsPlaceholder: 'Comma-separated',
  fieldTargets: 'Target platforms',
  fieldCategory: 'Category',
  variablesPreview: 'Variables',
  variablesNone: 'No variables yet — add {{name}} to the prompt.',
  varType: (type: string): string => (type === 'select' ? 'select' : 'text'),
  varDefault: (value: string): string => `default: ${value}`,
  save: 'Save',
  add: 'Add',
  cancel: 'Cancel',
  titleRequired: 'A title is required.',
  targetsRequired: 'Select at least one target platform.',

  // Category management
  renameCategory: 'Rename',
  deleteCategory: 'Delete category',
  categoryNamePlaceholder: 'Category name',
  createCategoryTitle: 'New category',
  renameCategoryTitle: 'Rename category',

  // Confirm dialogs
  confirmDeletePromptTitle: 'Delete this prompt?',
  confirmDeletePromptBody: (title: string): string => `“${title}” will be permanently removed.`,
  confirmDeleteCategoryTitle: 'Delete this category?',
  confirmDeleteCategoryBody: (name: string): string =>
    `“${name}” will be removed and its prompts become uncategorized.`,
  confirmDelete: 'Delete',
} as const;

// Platform labels and the targetable set both come from the single platform
// registry (`shared/branding`); re-exported here so existing call sites keep their
// import path. `TARGETABLE_PLATFORMS` is exactly the supported set.
export { PLATFORM_LABELS, SUPPORTED_PLATFORMS as TARGETABLE_PLATFORMS } from '../../shared/branding';
