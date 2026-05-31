import type { ComponentChildren } from 'preact';

export interface ButtonProps {
  children?: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
}

export function Button({ children, onClick }: ButtonProps) {
  return (
    <button class="sk-btn" type="button" onClick={onClick}>
      {children}
    </button>
  );
}
