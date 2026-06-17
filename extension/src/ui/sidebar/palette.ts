// The curated organisation palette shared by the folder edit dialog (design 03·05)
// and the conversation context menu (design 08). A folder or conversation can also
// have no colour — call sites pair this with a leading "clear" chip that resets it.
// Values are literal hex (not `--sk-*` tokens) because they are user content stored
// on the record, not chrome styling.
export const FOLDER_COLORS = [
  '#e8b64c',
  '#5aa9e6',
  '#5cb98b',
  '#e8945a',
  '#e86aa6',
  '#8b8ff0',
  '#9aa0ab',
] as const;
