// A single prompt card (the narrow-column reflow of the design's 3-up grid card).
// Shows the title, a body excerpt with `{{variables}}` rendered as highlighted chips
// via the SHARED tokenizer (so the highlight can never disagree with the parsed
// variable list), the variable count, the target-platform brand logos, and an
// overflow `Menu` (Edit / Delete). A
// destructive delete is confirmed through a lightweight `Dialog` before it runs
// (PRIV: deletes are explicit and never lose work silently). Styled only from
// `--sk-*` tokens, keyboard-operable, and ARIA-labelled.

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { tokenizeTemplate } from '../../core/prompts';
import { PlatformLogo, PLATFORM_LOGOS } from '../components/PlatformLogo';
import { MoreIcon } from '../components/Icon';
import { Dialog } from '../primitives/Dialog';
import { OverflowMenu } from './OverflowMenu';
import type { Prompt } from '../../shared/types';
import { PLATFORM_LABELS } from '../../shared/branding';
import { useT } from '../../core/i18n';

/** Max characters of body rendered in the excerpt before truncating (variable chips
 *  count as their name length). Keeps cards a stable height in the narrow column. */
const EXCERPT_BUDGET = 140;

/** Render the body as a truncated run of text + highlighted variable chips, derived
 *  from the same scan as the parsed variables. Truncation respects token boundaries
 *  so a `{{var}}` is never sliced mid-chip. */
function BodyExcerpt({ body }: { body: string }): JSX.Element {
  const nodes: JSX.Element[] = [];
  let used = 0;
  let truncated = false;
  for (const token of tokenizeTemplate(body)) {
    if (used >= EXCERPT_BUDGET) {
      truncated = true;
      break;
    }
    if (token.kind === 'text') {
      const remaining = EXCERPT_BUDGET - used;
      const text = token.text.length > remaining ? token.text.slice(0, remaining) : token.text;
      if (text.length < token.text.length) truncated = true;
      used += text.length;
      nodes.push(<span key={nodes.length}>{text}</span>);
    } else {
      used += token.name.length;
      nodes.push(
        <span key={nodes.length} class="sk-prompt-var" data-testid="sk-prompt-var">
          {token.name}
        </span>,
      );
    }
  }
  return (
    <p class="sk-prompt-card__excerpt" data-testid="sk-prompt-card-excerpt">
      {nodes}
      {truncated ? <span class="sk-prompt-card__ellipsis">…</span> : null}
    </p>
  );
}

export interface PromptCardProps {
  prompt: Prompt;
  onEdit: (prompt: Prompt) => void;
  onDelete: (prompt: Prompt) => void;
}

export function PromptCard({ prompt, onEdit, onDelete }: PromptCardProps): JSX.Element {
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Only target platforms that actually have a brand mark draw a logo; the rest are
  // skipped (a prompt with no targetable models shows no platform logo).
  const logos = prompt.targetModels.filter((p) => PLATFORM_LOGOS[p]);

  const onMenuSelect = (value: string): void => {
    if (value === 'edit') onEdit(prompt);
    else if (value === 'delete') setConfirmOpen(true);
  };

  return (
    <article class="sk-prompt-card" data-testid="sk-prompt-card">
      <div class="sk-prompt-card__head">
        <h3 class="sk-prompt-card__title" data-testid="sk-prompt-card-title">
          {prompt.title}
        </h3>
        <span class="sk-prompt-card__menu">
          <OverflowMenu
            trigger={<MoreIcon size={16} />}
            ariaLabel={t('prompts.cardMenu')}
            triggerTestId="sk-prompt-card-menu"
            contentTestId="sk-prompt-card-menu-content"
            onSelect={onMenuSelect}
            items={[
              { value: 'edit', label: t('prompts.edit'), testid: 'sk-prompt-edit' },
              { value: 'delete', label: t('prompts.delete'), testid: 'sk-prompt-delete' },
            ]}
          />
        </span>
      </div>

      <BodyExcerpt body={prompt.body} />

      <div class="sk-prompt-card__foot">
        <span class="sk-prompt-card__vars" data-testid="sk-prompt-card-vars">
          {t('prompts.varsCount', { count: prompt.variables.length })}
        </span>
        {logos.length > 0 ? (
          <span class="sk-prompt-card__logos" data-testid="sk-prompt-card-logos">
            {logos.map((p) => (
              <span key={p} class="sk-prompt-card__logo" title={PLATFORM_LABELS[p]} aria-label={PLATFORM_LABELS[p]}>
                <PlatformLogo platform={p} size={14} />
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        ariaLabel={t('prompts.confirmDeletePromptTitle')}
        contentTestId="sk-prompt-delete-confirm"
      >
        <div class="sk-dialog__body">
          <h2 class="sk-dialog__title">{t('prompts.confirmDeletePromptTitle')}</h2>
          <p class="sk-text sk-text--muted">{t('prompts.confirmDeletePromptBody', { title: prompt.title })}</p>
          <div class="sk-dialog__actions">
            <button
              type="button"
              class="sk-btn sk-btn--ghost"
              data-testid="sk-prompt-delete-cancel"
              onClick={() => setConfirmOpen(false)}
            >
              {t('prompts.cancel')}
            </button>
            <button
              type="button"
              class="sk-btn sk-btn--danger"
              data-testid="sk-prompt-delete-confirm-btn"
              onClick={() => {
                setConfirmOpen(false);
                onDelete(prompt);
              }}
            >
              {t('prompts.confirmDelete')}
            </button>
          </div>
        </div>
      </Dialog>
    </article>
  );
}
