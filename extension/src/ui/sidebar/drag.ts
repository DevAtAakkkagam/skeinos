// The drag MIME + payload shape shared by folder rows and conversation rows, so a
// conversation dragged from an (inline, expanded) list lands in the folder drop
// handler. Kept in its own module so both `Sidebar` and `ConversationList` can
// import it without forming an import cycle.

export const DRAG_MIME = 'application/x-skeinos';
export type DragPayload = { type: 'folder' | 'conversation'; id: string };
