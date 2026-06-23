// The input action bar (design D-1/D-2): a content-script shadow-DOM overlay docked
// above the host composer. It owns a Skeinos `/` trigger that opens the slash popover
// (a prompt picker with its OWN search field — no host-keystroke interception), and
// orchestrates the pick → variable-fill → insert flow. The Profile chip (C14) sits
// alongside it; the prompt-picker trigger is pushed to the right end as the bar's
// primary action.
//
// The bar is a pure view: it never touches storage or the DOM directly. Insertion is
// delegated to `onInsert` (wired to `adapter.insertText`, append-only, never
// `submit()` — design D-5), and library reads go through an injected `query` fn
// (the worker client by default; stubbed in tests).

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { BrandGlyph } from '../components/BrandGlyph';
import { EraserIcon } from '../components/Icon';
import { useFloating } from '../primitives/useFloating';
import { parseVariables } from '../../core/prompts/template';
import { mutatePromptLibraryRemote, queryPromptLibraryRemote } from '../../core/prompts/client';
import type { PlatformId, Prompt, PromptVar } from '../../shared/types';
import type {
  MutationResult,
  PromptMutationOp,
  PromptSearchResult,
  PromptSelector,
  PromptSnapshot,
} from '../../shared/prompts';
import type { ProfileSelector, ProfileSnapshot } from '../../shared/profiles';
import type { Response } from '../../shared/messages';
import { SlashPopover } from './SlashPopover';
import { ProfileChip } from './ProfileChip';
import { mountVariableModal } from './mountVariableModal';
import { substituteVariables } from './substitute';
import { useT } from '../../core/i18n';

type QueryFn = (selector: PromptSelector) => Promise<Response<PromptSnapshot>>;
type MutateFn = (op: PromptMutationOp) => Promise<Response<MutationResult>>;
type QueryProfilesFn = (selector: ProfileSelector) => Promise<Response<ProfileSnapshot>>;

/** True on macOS, where the accelerator is ⌘/ rather than Ctrl+/. Reads the modern
 *  `userAgentData.platform` first, falling back to the legacy `platform`/UA string. */
function detectIsMac(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
  return /mac/i.test(platform);
}

export interface InputBarProps {
  /** The current platform — drives the Profile chip's `appliesTo` gating. */
  platform: PlatformId;
  /** Commit the final text into the host composer (append-only, no auto-submit). */
  onInsert: (text: string) => void;
  /** Wipe the host composer entirely (replace its contents with empty, no submit).
   *  Wired to `adapter.insertText('', { replace: true })`. Optional — omitted in
   *  tests that don't exercise the clear action. */
  onClear?: () => void;
  /** Open the Skeinos workspace side panel — wired to the brand mark. Optional;
   *  when omitted the brand renders as a plain, non-interactive label. */
  onOpenSidebar?: () => void;
  /** Whether the host composer is empty right now. Gates prepending the active
   *  profile: it rides a prompt insert only into an empty composer, so a standing
   *  instruction never clobbers or duplicates over a draft. Defaults to "empty". */
  isComposerEmpty?: () => boolean;
  /** Library reads (search + body resolution). Injectable for tests. */
  query?: QueryFn;
  /** Library writes (records prompt usage on insert). Injectable for tests. */
  mutate?: MutateFn;
  /** Profile-library reads for the chip. Injectable for tests; defaults to the
   *  live worker client inside {@link ProfileChip}. */
  queryProfiles?: QueryProfilesFn;
  /** Contain popover focus — for hosts that force-focus their own composer
   *  (`behaviors.composerStealsFocus`, e.g. Perplexity). Default off. */
  containFocus?: boolean;
}

interface Pending {
  id: string;
  title: string;
  body: string;
  variables: PromptVar[];
}

export function InputBar({
  platform,
  onInsert,
  onClear,
  onOpenSidebar,
  isComposerEmpty = () => true,
  query = queryPromptLibraryRemote,
  mutate = mutatePromptLibraryRemote,
  queryProfiles,
  containFocus = false,
}: InputBarProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  // Root ref: the source of the bar's `ownerDocument` for the keyboard accelerator.
  const rootRef = useRef<HTMLDivElement>(null);
  // Text queued by the modal's confirm, committed only AFTER the modal unmounts (see
  // the effect below) so the host composer can take focus.
  const queuedInsert = useRef<string | null>(null);
  // The active profile's composed text (null when none applies here), reported up from
  // the chip. Held in a ref so the insert paths read the current value without
  // re-subscribing or tearing down the open variable modal on a profile change.
  const activeProfileText = useRef<string | null>(null);

  // Prepend the active profile above a prompt body — but ONLY into an empty composer,
  // so the profile reads as the standing instruction for this message and never
  // duplicates over an existing draft (profile-prepend). The chip merely activates a
  // profile now; this is where its text actually lands, riding the next prompt insert.
  const withActiveProfile = useCallback(
    (body: string): string => {
      const profile = activeProfileText.current;
      return profile && isComposerEmpty() ? `${profile}\n\n${body}` : body;
    },
    [isComposerEmpty],
  );

  // Record a prompt use, fire-and-forget (prompt-recents D-2): fired at the real
  // insertion moments, never awaited before inserting, so a lost ack never blocks the
  // user — the next `state.changed` re-read reconciles. Errors are swallowed. Memoized
  // (stable across renders unless `mutate` changes) so the modal effect can depend on
  // it without spuriously tearing down the open modal.
  const recordUse = useCallback(
    (id: string): void => {
      void mutate({ op: 'prompt.recordUse', id }).catch(() => {});
    },
    [mutate],
  );

  // Commit a queued insert once the variable modal has closed. Inserting while the
  // modal is open fails on real hosts: the Dialog's focus trap pulls focus back from
  // the host composer the instant `insertText` focuses it, so `execCommand` targets
  // the dialog instead of the composer and the text is dropped. Waiting for the
  // modal to unmount (this effect runs after its focus trap is torn down) lets the
  // composer keep focus for the insert.
  useEffect(() => {
    if (pending === null && queuedInsert.current !== null) {
      const text = queuedInsert.current;
      queuedInsert.current = null;
      onInsert(withActiveProfile(text));
    }
  }, [pending, onInsert, withActiveProfile]);

  // Render the variable modal as its OWN viewport-level overlay (mountVariableModal),
  // not inside this bar's composer-anchored tree: a transformed/contained ancestor of
  // the bar would otherwise clip the modal's full-screen `position: fixed` backdrop to
  // the composer's box (the Gemini "grey overlay only over the input box" bug). Mount
  // on open, dispose on close — Preact runs this cleanup (which tears down the modal's
  // focus trap) BEFORE the queued-insert effect above runs, so the composer can take
  // focus for the insert.
  useEffect(() => {
    if (!pending) return undefined;
    const { id, title, body, variables } = pending;
    const handle = mountVariableModal({
      title,
      variables,
      onConfirm: (values) => {
        queuedInsert.current = substituteVariables(body, values);
        // Record the use only on confirm — a cancelled modal never counts (D-2).
        recordUse(id);
        setPending(null);
      },
      onCancel: () => setPending(null),
    });
    return () => handle.dispose();
  }, [pending, recordUse]);

  // Fixed local accelerator — Cmd/Ctrl + / toggles the popover (input-bar-shortcut
  // D-2/D-3). Bound on the bar's `ownerDocument` in the CAPTURE phase so it pre-empts
  // the host's "type-anywhere-to-focus-the-composer" handler (the same hazard the
  // popover already guards against); opening focuses the search field via the normal
  // render path. The cleanup removes the listener, so the content script's teardown
  // (which unmounts the bar — design D-6) disposes it for free. A single named chord:
  // it never inspects composer typing, so it stays within D-1's privacy stance.
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument;
    if (!doc) return undefined;
    const onKeyDown = (e: KeyboardEvent): void => {
      // `Cmd/Ctrl + /` with no other modifier: exactly one of meta (macOS) / ctrl
      // (others), never Alt/Shift.
      if (e.key !== '/' || e.altKey || e.shiftKey || e.metaKey === e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((v) => !v);
    };
    doc.addEventListener('keydown', onKeyDown, true);
    return () => doc.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // The popover opens upward over the composer, anchored to the bar (design D-4).
  const floating = useFloating({ placement: 'top-start', open });

  // Resolve the full prompt (body + variables) for a chosen search hit. The search
  // result carries no body (the prompts capability is unchanged — design D-7), so we
  // read the library and look the prompt up by id. One extra read on selection only.
  const resolvePrompt = async (id: string): Promise<Prompt | null> => {
    const res = await query({ kind: 'prompt.library' });
    if (res.ok && res.data.kind === 'prompt.library') {
      return res.data.prompts.find((p) => p.id === id) ?? null;
    }
    return null;
  };

  const handleSelect = async (result: PromptSearchResult): Promise<void> => {
    setOpen(false);
    const prompt = await resolvePrompt(result.id);
    if (!prompt) return;
    const variables = parseVariables(prompt.body);
    if (variables.length === 0) {
      // No variables: insert the body straight away (design D-5) and record the use.
      onInsert(withActiveProfile(prompt.body));
      recordUse(prompt.id);
      return;
    }
    setPending({ id: prompt.id, title: prompt.title, body: prompt.body, variables });
  };

  return (
    <div
      ref={rootRef}
      class="sk-input-bar"
      role="toolbar"
      aria-label={t('inputBar.barLabel')}
      data-testid="sk-input-bar"
    >
      {/* Brand mark + wordmark so the bar reads as Skeinos, distinct from the host's
          own composer chrome. When `onOpenSidebar` is wired it becomes the bar's
          handle to the workspace side panel — rendered as a real button (keyboard-
          operable, labelled); otherwise it stays a plain, non-interactive label. */}
      {onOpenSidebar ? (
        <button
          type="button"
          class="sk-ib-brand sk-ib-brand--action"
          aria-label={t('inputBar.openSidebar')}
          title={t('inputBar.openSidebar')}
          data-testid="sk-ib-brand"
          onClick={() => onOpenSidebar()}
        >
          <BrandGlyph size={16} />
          <span class="sk-ib-brand__name">{t('inputBar.brand')}</span>
        </button>
      ) : (
        <span class="sk-ib-brand" data-testid="sk-ib-brand">
          <BrandGlyph size={16} />
          <span class="sk-ib-brand__name">{t('inputBar.brand')}</span>
        </span>
      )}

      {/* The functional Profile chip (profile-activation): lists profiles and marks
          the active one. Selecting only ACTIVATES it; its composed text is reported
          up via `onActiveProfileChange` and prepended on the next prompt insert. */}
      <ProfileChip
        platform={platform}
        onActiveProfileChange={(text) => {
          activeProfileText.current = text;
        }}
        queryProfiles={queryProfiles}
      />

      {/* Icon-only clear button, immediately left of the trigger. Wipes the host
          composer entirely (replace-with-empty, never submits). `margin-left: auto`
          floats this whole right-hand group; the trigger then follows on the gap. */}
      {onClear ? (
        <button
          type="button"
          class="sk-ib-clear"
          aria-label={t('inputBar.clearComposer')}
          title={t('inputBar.clearComposer')}
          data-testid="sk-ib-clear"
          onClick={() => onClear()}
        >
          <EraserIcon size={16} />
        </button>
      ) : null}

      {/* The Skeinos prompt-picker trigger — pushed to the right end of the bar,
          the bar's primary action. */}
      <button
        type="button"
        class="sk-ib-trigger"
        aria-label={t('inputBar.slashTrigger')}
        title={t('inputBar.slashTrigger')}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="sk-ib-trigger"
        ref={floating.setReference}
        onClick={() => setOpen((v) => !v)}
      >
        {t('inputBar.slashTrigger')}
        {/* OS-aware shortcut hint (⌘/ or Ctrl+/). Decorative: the accessible name is
            the explicit `aria-label`, so the chip never leaks into it. */}
        <kbd class="sk-ib-kbd" aria-hidden="true" data-testid="sk-ib-kbd">
          {detectIsMac() ? t('inputBar.shortcutHintMac') : t('inputBar.shortcutHint')}
        </kbd>
      </button>

      {open ? (
        <SlashPopover
          setFloating={floating.setFloating}
          floatingStyles={floating.floatingStyles}
          search={query}
          recentsQuery={query}
          containFocus={containFocus}
          onSelect={(r) => void handleSelect(r)}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {/* The variable modal is mounted at the viewport root by the effect above, not
          rendered here, so its backdrop is never clipped by a transformed ancestor. */}
    </div>
  );
}
