// Accessible menu built on the Zag.js `menu` machine (decision D-IP1). Zag supplies
// roving focus, typeahead, Escape/outside-click dismissal, ARIA roles, and floating-
// UI-based positioning that flips/shifts to stay on-screen. `useMenu` is the hook the
// sidebar's context menu wires by hand (per-row context triggers); `Menu` is the
// trigger-button component used by tests and any future simple menu.

import { useRef, useState } from 'preact/hooks';
import type { ComponentChild } from 'preact';
import * as menu from '@zag-js/menu';
import { useMachine, normalizeProps } from './machine';
import { getNodeRoot, nextId } from './shadow';

export type MenuApi = ReturnType<typeof menu.connect>;

export interface UseMenuOptions {
  id?: string;
  /** Fired with the selected item's `value`. */
  onSelect?: (value: string) => void;
  /** Root node Zag queries against — defaults to the caller-supplied shadow root. */
  getRootNode?: () => Document | ShadowRoot;
}

export function useMenu(options: UseMenuOptions = {}): MenuApi {
  const [id] = useState(() => options.id ?? nextId('sk-menu'));
  const service = useMachine(menu.machine, {
    id,
    getRootNode: options.getRootNode,
    onSelect: (details: { value: string }) => options.onSelect?.(details.value),
  });
  return menu.connect(service, normalizeProps);
}

export interface MenuItemSpec {
  value: string;
  label: ComponentChild;
  testid?: string;
  disabled?: boolean;
}

export interface MenuProps {
  /** Trigger button content. */
  trigger: ComponentChild;
  items: MenuItemSpec[];
  onSelect?: (value: string) => void;
  /** `data-testid` for the content element. */
  contentTestId?: string;
  triggerTestId?: string;
  id?: string;
}

/** A trigger-button menu. Content mounts only while open, inside the shadow root. */
export function Menu({ trigger, items, onSelect, contentTestId, triggerTestId, id }: MenuProps) {
  // The wrapper ref lets us hand Zag this subtree's shadow root.
  const root = useRef<HTMLDivElement>(null);
  const api = useMenu({ id, onSelect, getRootNode: () => getNodeRoot(root.current) });

  return (
    <div ref={root} class="sk-menu-root">
      <button class="sk-btn" data-testid={triggerTestId} {...api.getTriggerProps()}>
        {trigger}
      </button>
      {api.open && (
        <div class="sk-menu__positioner" {...api.getPositionerProps()}>
          <div class="sk-menu" data-testid={contentTestId} {...api.getContentProps()}>
            {items.map((it) => (
              <button
                key={it.value}
                class="sk-menu__item"
                data-testid={it.testid}
                {...api.getItemProps({ value: it.value, disabled: it.disabled })}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
