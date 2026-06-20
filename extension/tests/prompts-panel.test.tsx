// Prompts tab UI (happy-dom) over an injected library view — no worker. Covers the
// card (variable chips · count · platform logos · inert slug), the panel's category/
// tag filtering with client-derived counts, the empty/loading/error states, the
// editor's live variable preview + create/update wiring (body, never `variables`),
// and the category create/rename/delete lifecycle. Maps to the prompts spec.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { PromptCard } from '../src/ui/prompts/PromptCard';
import { PromptsPanel } from '../src/ui/prompts/PromptsPanel';
import { PromptCategoryChips } from '../src/ui/prompts/PromptCategoryChips';
import { usePromptsController } from '../src/ui/prompts/usePromptsController';
import type { PromptLibraryView } from '../src/ui/prompts/usePromptLibrary';
import type { Prompt, PromptFolder } from '../src/shared/types';

// The shell holds one controller and renders the category/tag chips (filter slot) and
// the panel body over it; this harness reproduces that pairing so a single mount
// exercises the chips + body together over an injected library view.
function Tab({ view }: { view: PromptLibraryView }) {
  const c = usePromptsController(view);
  return (
    <>
      <PromptCategoryChips controller={c} />
      <PromptsPanel controller={c} />
    </>
  );
}

function prompt(id: string, over: Partial<Prompt> = {}): Prompt {
  return {
    id, title: id, body: '', variables: [], tags: [], targetModels: [], promptFolderId: null,
    usageCount: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h', ...over,
  };
}
function folder(id: string, name: string): PromptFolder {
  return { id, name, parentId: null, order: 0, rev: 1, updatedAt: 0, deviceId: 'd', hash: 'h' };
}
function makeView(over: Partial<PromptLibraryView> = {}): PromptLibraryView {
  return {
    prompts: [], folders: [], status: 'ready',
    refresh: vi.fn(), retry: vi.fn(),
    mutate: vi.fn(async () => ({ ok: true, applied: true })),
    ...over,
  };
}

let container: HTMLElement | null = null;
const $ = (sel: string) => container!.querySelector(sel) as HTMLElement | null;
const $$ = (sel: string) => [...container!.querySelectorAll(sel)] as HTMLElement[];
const flush = async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};
function mount(node: preact.ComponentChild) {
  container = document.createElement('div');
  document.body.appendChild(container);
  render(node, container);
}
function setValue(el: HTMLElement | null, value: string) {
  (el as HTMLInputElement).value = value;
  el!.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  if (container) render(null, container);
  document.body.innerHTML = '';
  container = null;
});

// --- 6.1 card ----------------------------------------------------------------
describe('PromptCard (6.1)', () => {
  it('renders variable chips, the variable count, platform logos, and the inert slug', () => {
    const p = prompt('p1', {
      title: 'Explainer',
      body: 'Write about {{topic}} for {{audience}}',
      variables: [{ name: 'topic', type: 'text' }, { name: 'audience', type: 'text' }],
      targetModels: ['claude', 'gemini'],
      slug: '/exp',
    });
    mount(<PromptCard prompt={p} onEdit={vi.fn()} onDelete={vi.fn()} />);

    expect($('[data-testid=sk-prompt-card-title]')!.textContent).toBe('Explainer');
    // The body excerpt renders {{var}} spans as highlighted chips (shared tokenizer).
    const chips = $$('[data-testid=sk-prompt-var]').map((c) => c.textContent);
    expect(chips).toEqual(['topic', 'audience']);
    expect($('[data-testid=sk-prompt-card-vars]')!.textContent).toBe('2 vars');
    // One brand logo per targetable platform; the slug badge shows verbatim.
    expect($$('[data-testid=sk-prompt-card-logos] svg')).toHaveLength(2);
    expect($('[data-testid=sk-prompt-card-slug]')!.textContent).toBe('/exp');
  });

  it('shows no platform logos for a prompt with no target models, and no slug badge', () => {
    mount(<PromptCard prompt={prompt('p1', { targetModels: [] })} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect($('[data-testid=sk-prompt-card-logos]')).toBeNull();
    expect($('[data-testid=sk-prompt-card-slug]')).toBeNull();
  });

  it('the overflow menu deletes only after an explicit confirm', async () => {
    const onDelete = vi.fn();
    const p = prompt('p1', { title: 'Doomed' });
    mount(<PromptCard prompt={p} onEdit={vi.fn()} onDelete={onDelete} />);

    $('[data-testid=sk-prompt-card-menu]')!.click();
    await flush();
    $('[data-testid=sk-prompt-delete]')!.click();
    await flush();
    // The delete confirm is shown; nothing deleted yet.
    expect($('[data-testid=sk-prompt-delete-confirm]')).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    $('[data-testid=sk-prompt-delete-confirm-btn]')!.click();
    await flush();
    expect(onDelete).toHaveBeenCalledWith(p);
  });
});

// --- 6.2 panel filtering + counts + empty states -----------------------------
describe('PromptsPanel filtering and counts (6.2)', () => {
  const work = folder('f-work', 'Work');
  const play = folder('f-play', 'Play');
  const prompts = [
    prompt('a', { promptFolderId: 'f-work', tags: ['email'] }),
    prompt('b', { promptFolderId: 'f-work', tags: ['code'] }),
    prompt('c', { promptFolderId: 'f-play', tags: ['email'] }),
    prompt('d', { promptFolderId: null }),
  ];

  it('category chips show client-derived counts equal to the rows, and All is the total', () => {
    mount(<Tab view={makeView({ prompts, folders: [work, play] })} />);
    expect($('[data-testid=sk-prompt-cat-all]')!.textContent).toContain('4');
    expect($('[data-testid=sk-prompt-cat-f-work]')!.textContent).toContain('2');
    expect($('[data-testid=sk-prompt-cat-f-play]')!.textContent).toContain('1');
    expect($$('[data-testid=sk-prompt-card]')).toHaveLength(4);
  });

  it('selecting a category narrows the list; All restores it', async () => {
    mount(<Tab view={makeView({ prompts, folders: [work, play] })} />);
    $('[data-testid=sk-prompt-cat-f-work]')!.click();
    await flush();
    expect($$('[data-testid=sk-prompt-card]')).toHaveLength(2);
    $('[data-testid=sk-prompt-cat-all]')!.click();
    await flush();
    expect($$('[data-testid=sk-prompt-card]')).toHaveLength(4);
  });

  it('a tag filter narrows within the active category', async () => {
    mount(<Tab view={makeView({ prompts, folders: [work, play] })} />);
    $('[data-testid=sk-prompt-cat-f-work]')!.click();
    await flush();
    // Within Work, the tag chips are scoped to Work's prompts (email · code).
    $('[data-testid=sk-prompt-tag-email]')!.click();
    await flush();
    expect($$('[data-testid=sk-prompt-card]')).toHaveLength(1);
  });

  it('shows a first-run empty state (not a blank list) when there are no prompts', () => {
    mount(<Tab view={makeView({ prompts: [], folders: [] })} />);
    expect($('[data-testid=sk-prompts-empty-first-run]')).toBeTruthy();
    expect($('[data-testid=sk-prompts-create-first]')).toBeTruthy();
  });

  it('shows a distinct no-match empty state when a filter excludes everything', async () => {
    mount(<Tab view={makeView({ prompts: [prompt('a', { promptFolderId: 'f-work' })], folders: [work, play] })} />);
    $('[data-testid=sk-prompt-cat-f-play]')!.click();
    await flush();
    expect($('[data-testid=sk-prompts-empty-no-match]')).toBeTruthy();
    $('[data-testid=sk-prompts-clear-filter]')!.click();
    await flush();
    expect($$('[data-testid=sk-prompt-card]')).toHaveLength(1);
  });

  it('loading and error states are not rendered as an empty library', () => {
    mount(<Tab view={makeView({ status: 'loading' })} />);
    expect($('[data-testid=sk-prompts-loading]')).toBeTruthy();
    expect($('[data-testid=sk-prompts-empty-first-run]')).toBeNull();
    render(null, container!);

    mount(<Tab view={makeView({ status: 'error' })} />);
    expect($('[data-testid=sk-prompts-error]')).toBeTruthy();
    expect($('[data-testid=sk-prompts-empty-first-run]')).toBeNull();
  });
});

// --- 6.3 editor --------------------------------------------------------------
describe('PromptEditor through the panel (6.3)', () => {
  it('create sends `body` and metadata but never `variables`, with a live var preview', async () => {
    const view = makeView({ prompts: [], folders: [] });
    mount(<Tab view={view} />);

    $('[data-testid=sk-prompt-new]')!.click();
    await flush();
    setValue($('[data-testid=sk-prompt-editor-title]'), 'Audience picker');
    setValue($('[data-testid=sk-prompt-editor-body]'), 'For {{audience = devs | execs}}');
    await flush();
    // The live preview shows the parsed select variable as it is typed.
    expect($('[data-testid=sk-prompt-editor-vars]')!.textContent).toContain('audience');
    expect($('[data-testid=sk-prompt-editor-vars]')!.textContent).toContain('select');

    $('[data-testid=sk-prompt-editor-save]')!.click();
    await flush();
    expect(view.mutate).toHaveBeenCalledTimes(1);
    const op = (view.mutate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(op.op).toBe('prompt.create');
    expect(op.body).toBe('For {{audience = devs | execs}}');
    expect(op.title).toBe('Audience picker');
    expect(Object.keys(op)).not.toContain('variables');
  });

  it('multi-select target platforms persist on the created op', async () => {
    const view = makeView({ prompts: [], folders: [] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-prompt-new]')!.click();
    await flush();
    setValue($('[data-testid=sk-prompt-editor-title]'), 'Targeted');
    $('[data-testid=sk-prompt-editor-target-claude]')!.click();
    $('[data-testid=sk-prompt-editor-target-gemini]')!.click();
    await flush();
    $('[data-testid=sk-prompt-editor-save]')!.click();
    await flush();
    const op = (view.mutate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(op.targetModels).toEqual(['claude', 'gemini']);
  });

  it('editing a prompt sends a prompt.update carrying the changed body', async () => {
    const p = prompt('p1', { title: 'Original', body: 'old' });
    const view = makeView({ prompts: [p], folders: [] });
    mount(<Tab view={view} />);

    $('[data-testid=sk-prompt-card-menu]')!.click();
    await flush();
    $('[data-testid=sk-prompt-edit]')!.click();
    await flush();
    setValue($('[data-testid=sk-prompt-editor-body]'), 'new body {{x}}');
    await flush();
    $('[data-testid=sk-prompt-editor-save]')!.click();
    await flush();
    const op = (view.mutate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(op).toMatchObject({ op: 'prompt.update', id: 'p1', body: 'new body {{x}}' });
    expect(Object.keys(op)).not.toContain('variables');
  });

  it('requires a title before it will create', async () => {
    const view = makeView({ prompts: [], folders: [] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-prompt-new]')!.click();
    await flush();
    $('[data-testid=sk-prompt-editor-save]')!.click();
    await flush();
    expect(view.mutate).not.toHaveBeenCalled();
    expect($('[data-testid=sk-prompt-editor-error]')).toBeTruthy();
  });
});

// --- 6.4 category lifecycle --------------------------------------------------
describe('Category lifecycle through the panel (6.4)', () => {
  it('a created + assigned category surfaces with its count', () => {
    // The reconciled snapshot the worker would return after create+assign.
    const work = folder('f-work', 'Work');
    const view = makeView({ prompts: [prompt('a', { promptFolderId: 'f-work' })], folders: [work] });
    mount(<Tab view={view} />);
    expect($('[data-testid=sk-prompt-cat-f-work]')!.textContent).toContain('Work');
    expect($('[data-testid=sk-prompt-cat-f-work]')!.textContent).toContain('1');
  });

  it('the + New category affordance creates a category by name', async () => {
    const view = makeView({ prompts: [], folders: [] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-prompt-new-category]')!.click();
    await flush();
    setValue($('[data-testid=sk-prompt-category-name]'), 'Research');
    await flush();
    $('[data-testid=sk-prompt-category-save]')!.click();
    await flush();
    const op = (view.mutate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(op).toMatchObject({ op: 'promptFolder.create', name: 'Research' });
  });

  it('deleting a category is confirmed before it reassigns its prompts', async () => {
    const work = folder('f-work', 'Work');
    const view = makeView({ prompts: [prompt('a', { promptFolderId: 'f-work' })], folders: [work] });
    mount(<Tab view={view} />);

    $('[data-testid=sk-prompt-cat-menu-f-work]')!.click();
    await flush();
    $('[data-testid=sk-prompt-cat-delete-f-work]')!.click();
    await flush();
    // Confirm dialog up; nothing deleted yet.
    expect($('[data-testid=sk-prompt-category-delete-confirm]')).toBeTruthy();
    expect(view.mutate).not.toHaveBeenCalled();

    $('[data-testid=sk-prompt-category-delete-confirm-btn]')!.click();
    await flush();
    expect(view.mutate).toHaveBeenCalledWith({ op: 'promptFolder.delete', id: 'f-work' });
  });

  it('renaming a category through its chip menu sends a rename', async () => {
    const work = folder('f-work', 'Work');
    const view = makeView({ prompts: [], folders: [work] });
    mount(<Tab view={view} />);
    $('[data-testid=sk-prompt-cat-menu-f-work]')!.click();
    await flush();
    $('[data-testid=sk-prompt-cat-rename-f-work]')!.click();
    await flush();
    setValue($('[data-testid=sk-prompt-category-name]'), 'Office');
    await flush();
    $('[data-testid=sk-prompt-category-save]')!.click();
    await flush();
    expect(view.mutate).toHaveBeenCalledWith({ op: 'promptFolder.rename', id: 'f-work', name: 'Office' });
  });
});
