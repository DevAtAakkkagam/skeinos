import type { ComponentChildren } from 'preact';
import { Button } from './Button';
import { Text } from './Text';

export interface PanelProps {
  children?: ComponentChildren;
}

export function Panel({ children }: PanelProps) {
  return <div class="sk-panel sk-stack">{children}</div>;
}

// Sample panel composing the base components. Used as the mount target in tests
// and as a smoke surface for the harness; not a real feature — so its copy is
// intentionally NOT routed through the i18n catalog (it never ships to a user).
/* eslint-disable react/jsx-no-literals -- non-shipping smoke surface, see above */
export function SamplePanel() {
  return (
    <Panel>
      <div data-testid="sk-panel" class="sk-stack">
        <Text>Skeinos</Text>
        <Text muted>Your LLM workspace.</Text>
        <Button>Open workspace</Button>
      </div>
    </Panel>
  );
}
/* eslint-enable react/jsx-no-literals */
