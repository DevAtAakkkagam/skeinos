// Accessible modal dialog built on the Zag.js `dialog` machine (decision D-IP1).
// Zag provides the focus trap, focus restoration, scroll lock, `role="dialog"` +
// `aria-modal`, and Escape/backdrop dismissal. The dialog is controlled: the parent
// mounts it with `open` and is notified through `onClose` when the user dismisses it.

import { useRef, useState } from 'preact/hooks';
import type { ComponentChild } from 'preact';
import * as dialog from '@zag-js/dialog';
import { useMachine, normalizeProps } from './machine';
import { getNodeRoot, nextId } from './shadow';

export type DialogApi = ReturnType<typeof dialog.connect>;

export interface UseDialogOptions {
  id?: string;
  open: boolean;
  onClose?: () => void;
  ariaLabel?: string;
  getRootNode?: () => Document | ShadowRoot;
}

export function useDialog(options: UseDialogOptions): DialogApi {
  const [id] = useState(() => options.id ?? nextId('sk-dialog'));
  const service = useMachine(dialog.machine, {
    id,
    open: options.open,
    'aria-label': options.ariaLabel,
    getRootNode: options.getRootNode,
    onOpenChange: (details: { open: boolean }) => {
      if (!details.open) options.onClose?.();
    },
  });
  return dialog.connect(service, normalizeProps);
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name when no visible title element is rendered. */
  ariaLabel?: string;
  /** `data-testid` for the content element. */
  contentTestId?: string;
  id?: string;
  children: ComponentChild;
}

/** A modal dialog. Backdrop + content mount only while open, inside the shadow root. */
export function Dialog({ open, onClose, ariaLabel, contentTestId, id, children }: DialogProps) {
  const root = useRef<HTMLDivElement>(null);
  const api = useDialog({ id, open, onClose, ariaLabel, getRootNode: () => getNodeRoot(root.current) });

  return (
    <div ref={root} class="sk-dialog-host">
      {api.open && (
        <>
          <div class="sk-dialog__backdrop" {...api.getBackdropProps()} />
          <div class="sk-dialog__positioner" {...api.getPositionerProps()}>
            <div class="sk-dialog" data-testid={contentTestId} {...api.getContentProps()}>
              {children}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
