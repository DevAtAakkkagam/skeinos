// Sidebar folder-body coverage (happy-dom) using the injectable `view` seam, so
// these run without the worker or IndexedDB. Maps to the sidebar-shell empty-state
// requirement and the folders delta (pinned/archive rows show icon · color · count).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { Sidebar } from '../src/ui/sidebar/Sidebar';
import type { WorkspaceView } from '../src/ui/sidebar/useWorkspace';
import type { Folder, FolderTreeNode } from '../src/shared/types';
import type { FolderTreeSnapshot } from '../src/shared/workspace';

function folder(id: string, over: Partial<Folder> = {}): Folder {
  return {
    id,
    name: id,
    parentId: null,
    platformScope: 'unified',
    order: 0,
    rev: 1,
    updatedAt: 0,
    deviceId: 'd',
    hash: 'h',
    ...over,
  };
}
const node = (f: Folder): FolderTreeNode => ({ folder: f, depth: 1, children: [] });

function makeView(tree: FolderTreeSnapshot, counts: Record<string, number> = {}): WorkspaceView {
  return { tree, counts, conversations: [], refresh: vi.fn(), mutate: vi.fn(async () => true) };
}

let container: HTMLElement | null = null;
function renderSidebar(view: WorkspaceView): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(<Sidebar platform="claude" view={view} />, container);
  return container;
}
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

describe('Sidebar empty state (sidebar-shell)', () => {
  it('renders the empty-state card with a New folder CTA when no active folders exist', () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    const empty = $('[data-testid=sk-folders-empty]');
    expect(empty).toBeTruthy();
    expect(empty!.textContent).toContain('No folders yet');
    expect($('[data-testid=sk-empty-new-folder]')).toBeTruthy();
  });

  it('the empty-state CTA opens the create-folder dialog', async () => {
    renderSidebar(makeView({ active: [], pinned: [], archived: [] }));
    expect($('[data-testid=sk-folder-dialog]')).toBeNull();
    $('[data-testid=sk-empty-new-folder]')!.click();
    await new Promise((r) => setTimeout(r, 0)); // let Preact flush the state update
    expect($('[data-testid=sk-folder-dialog]')).toBeTruthy();
  });
});

describe('Sidebar pinned & archive rows (folders delta)', () => {
  it('a pinned row shows the folder icon, color, and count', () => {
    const pin = folder('p1', { name: 'Launch brief', icon: '📌', color: '#f80', pinned: true });
    renderSidebar(makeView({ active: [], pinned: [pin], archived: [] }, { p1: 5 }));

    const row = $('[data-pinned-id=p1]')!;
    expect(row).toBeTruthy();
    expect(row.querySelector('.sk-row__icon')!.textContent).toBe('📌');
    expect((row.querySelector('.sk-row__label') as HTMLElement).style.color).toBeTruthy();
    expect(row.querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('5');
  });

  it('an archive row shows the folder count', () => {
    const arc = folder('a1', { name: 'Old work', archived: true });
    renderSidebar(makeView({ active: [node(folder('x'))], pinned: [], archived: [arc] }, { a1: 31 }));

    const row = $('[data-archived-id=a1]')!;
    expect(row).toBeTruthy();
    expect(row.querySelector('[data-testid=sk-folder-count]')!.textContent).toBe('31');
  });

  it('does not render a standalone unfiled conversation list', () => {
    renderSidebar(makeView({ active: [node(folder('x'))], pinned: [], archived: [] }));
    expect($('[data-testid=sk-conversation]')).toBeNull();
    expect($('[data-testid=sk-conversations-empty]')).toBeNull();
  });
});
