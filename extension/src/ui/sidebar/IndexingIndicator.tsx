// The non-blocking indexing indicator (loading-states, D-3): a slim banner that
// reports background bulk-index progress ("Indexing N conversations… X%") with a
// progress bar. It is a pure view over `useIndexProgress()` — it holds no state, sits
// in the shell's flow below the tab strip, blocks no interaction, and removes itself
// when nothing is indexing (the hook returns null on completion / idle).
//
// Tokens only (PREACT). `aria-hidden` is NOT used: an aria-live region announces
// indexing politely once, but the bar itself conveys the live detail visually.

import type { JSX } from 'preact';
import { useIndexProgress, type IndexProgress } from './useIndexProgress';
import { useT } from '../../core/i18n';

export interface IndexingIndicatorProps {
  /** Test/override seam: when provided, render this instead of the live hook value
   *  (`null` forces the hidden state). Omit in production to use `useIndexProgress`. */
  progress?: IndexProgress | null;
}

export function IndexingIndicator({ progress: override }: IndexingIndicatorProps = {}): JSX.Element | null {
  const t = useT();
  // Always call the hook (rules of hooks); prefer an explicit override when passed.
  const live = useIndexProgress();
  const progress = override !== undefined ? override : live;
  if (!progress) return null;

  const { done, total } = progress;
  const pct = Math.round((done / total) * 100);

  return (
    <div class="sk-indexing" data-testid="sk-indexing" role="status" aria-live="polite">
      <div class="sk-indexing__line">
        <span class="sk-indexing__label">{t('indexing.label', { count: total })}</span>
        <span class="sk-indexing__pct" data-testid="sk-indexing-pct">{t('indexing.percent', { percent: pct })}</span>
      </div>
      <div
        class="sk-indexing__track"
        role="progressbar"
        aria-label={t('indexing.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div class="sk-indexing__bar" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
    </div>
  );
}
