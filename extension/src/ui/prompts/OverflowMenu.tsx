// A small overflow (`⋯`) menu for the prompt card and category chips, built on the
// `useMenu` primitive but with each item carrying an explicit `onClick` action in
// addition to Zag's `onSelect` (mouse selection routes through `onClick`; keyboard
// ENTER through `onSelect`). This mirrors the proven, testable pattern in
// `ConversationList` — Zag's `onSelect` alone does not fire on a synthetic click —
// and dedupes the case where a highlighted mouse click fires both within one tick.

import { useRef } from 'preact/hooks';
import type { ComponentChild } from 'preact';
import { useMenu, mergeProps, getNodeRoot } from '../primitives';

export interface OverflowMenuItem {
  value: string;
  label: ComponentChild;
  testid?: string;
}

export interface OverflowMenuProps {
  trigger: ComponentChild;
  items: OverflowMenuItem[];
  onSelect: (value: string) => void;
  /** Accessible name for the trigger button. */
  ariaLabel: string;
  triggerClass?: string;
  triggerTestId?: string;
  contentTestId?: string;
}

export function OverflowMenu({
  trigger,
  items,
  onSelect,
  ariaLabel,
  triggerClass = 'sk-icon-btn',
  triggerTestId,
  contentTestId,
}: OverflowMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Dedup mouse onClick + keyboard onSelect firing within one tick (per value).
  const actedRef = useRef<string | null>(null);
  const act = (value: string) => {
    if (actedRef.current === value) return;
    actedRef.current = value;
    setTimeout(() => {
      if (actedRef.current === value) actedRef.current = null;
    }, 0);
    onSelect(value);
  };

  const menu = useMenu({
    getRootNode: () => getNodeRoot(rootRef.current),
    onSelect: act,
  });

  const itemProps = (value: string) =>
    mergeProps(menu.getItemProps({ value }), { onClick: () => act(value) });

  return (
    <span ref={rootRef} class="sk-menu-root">
      <button class={triggerClass} type="button" aria-label={ariaLabel} title={ariaLabel} data-testid={triggerTestId} {...menu.getTriggerProps()}>
        {trigger}
      </button>
      {menu.open && (
        <div class="sk-menu__positioner" {...menu.getPositionerProps()}>
          <div class="sk-menu" data-testid={contentTestId} {...menu.getContentProps()}>
            {items.map((it) => (
              <button key={it.value} class="sk-menu__item" data-testid={it.testid} {...itemProps(it.value)}>
                {it.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}
