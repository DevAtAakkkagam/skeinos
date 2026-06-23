// The Folders-tab tag filter, living INLINE in the single filter row beside the
// platform chips (no second row, no tab). Selected tags render as removable colored
// chips; a compact tag affordance opens the shared {@link TagPicker} (filter mode +
// inline management). Selecting narrows the library (AND) as ephemeral view state —
// the parent owns the selection; this never mutates a record except via the picker's
// explicit CRUD.

import { useRef, useState } from 'preact/hooks';
import type { Tag } from '../../shared/types';
import { PlusIcon } from '../components/Icon';
import { TagPicker } from './TagPicker';
import type { TagLibraryView } from './useTagLibrary';
import { useT } from '../../core/i18n';

export interface TagFilterChipsProps {
  tags: Tag[];
  selected: string[];
  onChange: (ids: string[]) => void;
  mutate: TagLibraryView['mutate'];
  /** Live usage counts shown next to each tag in the picker. */
  counts?: Record<string, number>;
}

export function TagFilterChips({ tags, selected, onChange, mutate, counts }: TagFilterChipsProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const byId = new Map(tags.map((t) => [t.id, t]));
  // Only render selected ids that still resolve to a live tag (a deleted tag drops out
  // of the filter on the next tag-list read — never a dangling chip).
  const selectedTags = selected.map((id) => byId.get(id)).filter((t): t is Tag => !!t);

  return (
    <>
      {selectedTags.map((tag) => (
        <button
          key={tag.id}
          class="sk-chip sk-chip--active sk-chip--tag"
          type="button"
          data-testid={`sk-tag-chip-${tag.id}`}
          aria-pressed="true"
          aria-label={t('tags.remove', { label: tag.label })}
          onClick={() => onChange(selected.filter((x) => x !== tag.id))}
        >
          <span class="sk-tag-dot" aria-hidden="true" style={tag.color ? { background: tag.color } : undefined} />
          {tag.label}
        </button>
      ))}
      <button
        ref={triggerRef}
        class="sk-chip sk-chip--add"
        type="button"
        data-testid="sk-tag-add"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span class="sk-chip__logo" aria-hidden="true"><PlusIcon size={13} /></span>
        {t('tags.add')}
      </button>
      {open && (
        <TagPicker
          anchor={triggerRef.current}
          label={t('tags.pickerLabel')}
          tags={tags}
          selected={selected}
          counts={counts}
          mutate={mutate}
          onToggle={(id, next) => onChange(next ? [...selected, id] : selected.filter((x) => x !== id))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
