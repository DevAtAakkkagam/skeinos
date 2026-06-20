// Shared defaults for creating a folder, used by both the create/edit dialog
// (Sidebar) and the inline "create folder" affordance in the move-to-folder
// picker. Kept in its own module so the picker can reuse them without importing
// Sidebar (which would close a Sidebar→ConversationList→picker→Sidebar cycle).

/** Default colour for a new folder (palette blue) — preselected in the dialog. */
export const DEFAULT_FOLDER_COLOR = '#5aa9e6';

/** A fresh folder id, fixed once per create so a retry overwrites the same row
 *  (after a possibly-committed-but-unacknowledged attempt) instead of duplicating. */
export function makeFolderId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
