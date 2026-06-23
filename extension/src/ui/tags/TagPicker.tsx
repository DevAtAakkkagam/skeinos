// One reusable tag popover (design: management folded into the picker). It anchors
// to a trigger and serves three jobs through the same surface:
//   · filter   — toggling a tag narrows the library (the caller owns the view state);
//   · assign   — toggling a tag tags/untags one conversation (the caller dispatches);
//   · manage   — rename / recolor / delete each tag, and create new ones, INLINE —
//                so tag CRUD lives where tags are used (no dedicated tab/screen).
// The caller decides what a toggle means via `onToggle`; this component owns only the
// selection UI and the CRUD (through `mutate`). Tokens-only, keyboard-operable, and
// shadow-DOM aware (Esc / outside-click dismissal off the mounting root).

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Tag } from '../../shared/types';
import { makeTagId } from '../../core/tags';
import { quotaDetailOf, type QuotaErrorDetail } from '../../core/tier';
import { useFloating, getNodeRoot } from '../primitives';
import { CheckIcon, MoreIcon, PlusIcon } from '../components/Icon';
import { UpgradeNudge } from '../components/UpgradeNudge';
import { FOLDER_COLORS } from '../sidebar/palette';
import type { TagLibraryView } from './useTagLibrary';
import { useT } from '../../core/i18n';

export interface TagPickerProps {
  /** The anchor element the popover positions against. */
  anchor: HTMLElement | null;
  /** Accessible label for the popover group. */
  label: string;
  /** Every existing tag (the options). */
  tags: Tag[];
  /** The currently-selected ids (filter selection, or a conversation's tags). */
  selected: string[];
  /** Toggle a tag on/off — the caller decides the meaning (filter vs assign). */
  onToggle: (id: string, next: boolean) => void;
  /** Tag CRUD (create/rename/recolor/delete). Both the workspace and tag-library
   *  mutate satisfy this — tag ops are a subset of `MutationOp`. */
  mutate: TagLibraryView['mutate'];
  /** Optional usage counts (filter mode shows them next to each tag). */
  counts?: Record<string, number>;
  /** Dismiss the popover. */
  onClose: () => void;
}

export function TagPicker({ anchor, label, tags, selected, onToggle, mutate, counts, onClose }: TagPickerProps) {
  const t = useT();
  const { setReference, setFloating, floatingStyles } = useFloating({
    placement: 'bottom-start',
    strategy: 'fixed',
    open: true,
  });
  const popRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Anchor the popover to the trigger. `setReference` is stable (memoized in
  // useFloating), so this runs only when the anchor changes — never per render.
  useEffect(() => {
    setReference(anchor);
  }, [anchor, setReference]);

  // A STABLE ref callback for the floating element: an inline arrow would be a new
  // identity each render, so Preact would re-invoke it (and setFloating → update →
  // setState) every render — an infinite loop. Memoizing keeps it mount-only.
  const setPop = useCallback(
    (el: HTMLDivElement | null) => {
      popRef.current = el;
      setFloating(el);
    },
    [setFloating],
  );

  // Dismiss on Esc / outside-click (shadow-aware via the mounting root).
  useEffect(() => {
    const root = getNodeRoot(popRef.current ?? anchor) as unknown as Document | ShadowRoot;
    const inside = (t: Node | null) =>
      !!t && (popRef.current?.contains(t) || (!!anchor && anchor.contains(t)));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: Event) => {
      if (!inside(e.target as Node)) onClose();
    };
    root.addEventListener('keydown', onKey as EventListener, true);
    root.addEventListener('mousedown', onDown, true);
    return () => {
      root.removeEventListener('keydown', onKey as EventListener, true);
      root.removeEventListener('mousedown', onDown, true);
    };
  }, [anchor, onClose]);

  const sorted = [...tags].sort((a, b) => a.label.localeCompare(b.label));
  const q = query.trim().toLowerCase();
  const shown = q ? sorted.filter((tag) => tag.label.toLowerCase().includes(q)) : sorted;
  const showSearch = tags.length > 6;

  return (
    <div
      ref={setPop}
      class="sk-tag-popover"
      data-testid="sk-tag-popover"
      role="group"
      aria-label={label}
      style={floatingStyles}
    >
      {showSearch && (
        <input
          class="sk-tag-popover__search"
          data-testid="sk-tag-search"
          type="text"
          aria-label={t('tags.search')}
          placeholder={t('tags.search')}
          value={query}
          autoFocus
          onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
        />
      )}

      <div class="sk-tag-popover__list">
        {shown.length === 0 && !creating && (
          <p class="sk-tag-popover__empty" data-testid="sk-tag-popover-empty">{t('tags.empty')}</p>
        )}
        {shown.map((tag) =>
          editingId === tag.id ? (
            <TagEditForm
              key={tag.id}
              initialLabel={tag.label}
              initialColor={tag.color ?? ''}
              submitLabel={t('tags.save')}
              onSubmit={async (lbl, color) => {
                const renamed = await mutate({ op: 'tag.rename', id: tag.id, label: lbl });
                const recolored = await mutate({ op: 'tag.recolor', id: tag.id, color: color || undefined });
                return renamed.ok || renamed.applied ? recolored : renamed;
              }}
              onDelete={async () => {
                await mutate({ op: 'tag.delete', id: tag.id });
                setEditingId(null);
              }}
              onDone={() => setEditingId(null)}
            />
          ) : (
            <div key={tag.id} class="sk-tag-opt" data-testid="sk-tag-opt" data-tag-id={tag.id}>
              <button
                class={`sk-tag-opt__toggle${selected.includes(tag.id) ? ' sk-tag-opt__toggle--on' : ''}`}
                type="button"
                data-testid={`sk-tag-opt-${tag.id}`}
                role="checkbox"
                aria-checked={selected.includes(tag.id)}
                onClick={() => onToggle(tag.id, !selected.includes(tag.id))}
              >
                <span class="sk-tag-opt__check" aria-hidden="true">
                  {selected.includes(tag.id) && <CheckIcon size={12} />}
                </span>
                <span class="sk-tag-dot" aria-hidden="true" style={tag.color ? { background: tag.color } : undefined} />
                <span class="sk-tag-opt__label">{tag.label}</span>
                {counts && <span class="sk-tag-opt__count" data-testid="sk-tag-count">{counts[tag.id] ?? 0}</span>}
              </button>
              <button
                class="sk-icon-btn sk-tag-opt__manage"
                type="button"
                data-testid={`sk-tag-manage-${tag.id}`}
                aria-label={`${t('tags.manage')}: ${tag.label}`}
                title={t('tags.manage')}
                onClick={(e) => {
                  (e as MouseEvent).stopPropagation();
                  setCreating(false);
                  setEditingId(tag.id);
                }}
              >
                <MoreIcon size={14} />
              </button>
            </div>
          ),
        )}
      </div>

      <div class="sk-tag-popover__foot">
        {creating ? (
          <TagEditForm
            initialLabel={query}
            initialColor={FOLDER_COLORS[0]}
            submitLabel={t('tags.create')}
            onSubmit={(lbl, color) => mutate({ op: 'tag.create', id: makeTagId(), label: lbl, color: color || undefined })}
            onDone={() => {
              setCreating(false);
              setQuery('');
            }}
          />
        ) : (
          <button
            class="sk-tag-popover__new"
            type="button"
            data-testid="sk-tag-new"
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
          >
            <PlusIcon size={14} />
            {t('tags.newTag')}
          </button>
        )}
      </div>
    </div>
  );
}

interface TagEditFormProps {
  initialLabel: string;
  initialColor: string;
  submitLabel: string;
  /** Persist the label/colour; resolves with the mutation outcome. */
  onSubmit: (label: string, color: string) => Promise<{ ok: boolean; applied: boolean; error?: { code?: string; detail?: unknown } }>;
  /** Remove the tag (edit mode only). */
  onDelete?: () => void;
  /** Close the form (on success or cancel). */
  onDone: () => void;
}

/** The inline create/edit form (label + colour swatches + save/delete), reused for
 *  both "+ New tag" and per-tag editing. Block-with-nudge on a tier quota: keeps the
 *  typed label and shows the upgrade nudge rather than discarding input (PRIV). */
function TagEditForm({ initialLabel, initialColor, submitLabel, onSubmit, onDelete, onDone }: TagEditFormProps) {
  const t = useT();
  const [label, setLabel] = useState(initialLabel);
  const [color, setColor] = useState(initialColor);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [quota, setQuota] = useState<QuotaErrorDetail | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setFailed(false);
    setQuota(null);
    const res = await onSubmit(trimmed, color);
    setBusy(false);
    if (res.ok || res.applied) {
      onDone();
      return;
    }
    const detail = quotaDetailOf(res.error);
    if (detail) setQuota(detail);
    else setFailed(true);
  };

  return (
    <form class="sk-tag-edit" data-testid="sk-tag-edit" onSubmit={submit}>
      <input
        class="sk-tag-edit__name"
        data-testid="sk-tag-name"
        type="text"
        aria-label={t('tags.namePlaceholder')}
        placeholder={t('tags.namePlaceholder')}
        value={label}
        autoFocus
        onInput={(e) => setLabel((e.currentTarget as HTMLInputElement).value)}
      />
      <div class="sk-tag-edit__swatches" data-testid="sk-tag-colors" role="group" aria-label={t('tags.clearColor')}>
        <button
          type="button"
          class={`sk-swatch sk-swatch--clear${color ? '' : ' sk-swatch--selected'}`}
          aria-label={t('tags.clearColor')}
          aria-pressed={!color}
          onClick={() => setColor('')}
        />
        {FOLDER_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            class={`sk-swatch${color === c ? ' sk-swatch--selected' : ''}`}
            style={{ background: c }}
            aria-label={c}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
      {failed && <p class="sk-tag-edit__error" role="alert">{t('tags.createError')}</p>}
      {quota && <UpgradeNudge resource="tags" limit={quota.limit} testId="sk-tag-quota-nudge" />}
      <div class="sk-tag-edit__actions">
        {onDelete && (
          <button class="sk-tag-edit__delete" type="button" data-testid="sk-tag-delete" onClick={onDelete} disabled={busy}>
            {t('tags.delete')}
          </button>
        )}
        <span class="sk-tag-edit__spacer" />
        <button class="sk-tag-edit__cancel" type="button" onClick={onDone}>{t('tags.cancel')}</button>
        <button class="sk-btn sk-btn--icon" type="submit" data-testid="sk-tag-submit" disabled={busy} aria-busy={busy}>
          <CheckIcon size={14} />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
