import type { ComponentChildren } from 'preact';

export interface TextProps {
  children?: ComponentChildren;
  muted?: boolean;
}

export function Text({ children, muted }: TextProps) {
  return <p class={muted ? 'sk-text sk-text--muted' : 'sk-text'}>{children}</p>;
}
