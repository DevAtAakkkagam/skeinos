// useFloating in real Chromium — real layout so offset/flip/shift actually run.
// Maps to the "Floating positioning helper" requirement scenarios.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import type { Placement } from '@floating-ui/dom';
import { useFloating } from '../../src/ui/primitives/useFloating';

let host: HTMLElement | null = null;

afterEach(() => {
  if (host) render(null, host);
  document.body.innerHTML = '';
  host = null;
});

interface HarnessProps {
  placement: Placement;
  refTop: number;
  refLeft: number;
  offset?: number;
}

function Harness({ placement, refTop, refLeft, offset = 8 }: HarnessProps) {
  const f = useFloating({ placement, offset });
  return (
    <div>
      <div
        ref={f.setReference}
        data-testid="ref"
        style={{ position: 'absolute', top: `${refTop}px`, left: `${refLeft}px`, width: '40px', height: '20px' }}
      />
      <div
        ref={f.setFloating}
        data-testid="float"
        data-placement={f.placement}
        style={{ ...f.floatingStyles, width: '120px', height: '80px' }}
      />
    </div>
  );
}

function mountHarness(props: HarnessProps) {
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<Harness {...props} />, host);
  const float = () => host!.querySelector('[data-testid=float]') as HTMLElement;
  return { float };
}

describe('useFloating (real browser)', () => {
  it('offsets the floating element from its anchor on the preferred side', async () => {
    const { float } = mountHarness({ placement: 'bottom-start', refTop: 100, refLeft: 100 });
    await vi.waitFor(() => {
      expect(float().dataset.placement).toBe('bottom-start');
      // bottom-start: floating top sits below the 20px-tall anchor + 8px offset.
      expect(parseFloat(float().style.top)).toBeGreaterThanOrEqual(100 + 20 + 8 - 1);
      expect(parseFloat(float().style.left)).toBeCloseTo(100, 0);
    });
  });

  it('flips to the opposite side near a viewport edge', async () => {
    // Anchor pinned near the bottom: a bottom placement would clip, so it flips up.
    const { float } = mountHarness({
      placement: 'bottom-start',
      refTop: window.innerHeight - 25,
      refLeft: 100,
    });
    await vi.waitFor(() => {
      expect(float().dataset.placement?.startsWith('top')).toBe(true);
    });
  });

  it('shifts along the cross-axis to stay within the viewport', async () => {
    // Anchor near the right edge: the 120px-wide floating element must shift left.
    const { float } = mountHarness({
      placement: 'bottom-start',
      refTop: 100,
      refLeft: window.innerWidth - 30,
    });
    await vi.waitFor(() => {
      const left = parseFloat(float().style.left);
      expect(left + 120).toBeLessThanOrEqual(window.innerWidth + 1);
    });
  });
});
