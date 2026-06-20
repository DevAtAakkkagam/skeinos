// The first-run onboarding stepper (onboarding-flow, D17). Replaces the foundation's
// single welcome placeholder with the four design screens behind the same mount point
// and gate contract: welcome → permissions priming → starter library → get started.
// `SidePanelApp` still just asks "complete?" and renders this surface or not — the
// step index lives in ephemeral local state (a mid-flow reload restarts at welcome,
// which matches the gate's "not complete → show onboarding" semantics, D-1).
//
// Completion is durable and happens ONLY at the terminal actions (D-2): the welcome
// "I already have an account" skip and the final-step actions ("Create your first
// folder", "Finish setup"). "Get started"/"Continue"/"Back" only move between steps.

import { useState } from 'preact/hooks';
import { BrandGlyph } from '../components/BrandGlyph';
import { CheckIcon, ChevronIcon, FolderIcon, LockIcon, ShieldIcon } from '../components/Icon';
import { DOMAIN_REGISTRY, type DomainId } from '../../shared/domains';
import { seedsForDomain } from '../../core/prompts/catalog';
import { installPromptSeedsRemote } from '../../core/prompts/client';
import { mutateWorkspaceRemote } from '../../core/folders/client';
import { DEFAULT_FOLDER_COLOR, makeFolderId } from '../sidebar/folderDefaults';
import type { PlatformId } from '../../shared/types';
import { completeOnboarding, setOnboardingDomain } from './gate';

// i18n-ready strings (PREACT: no hard-coded user-facing literals in markup).
const STR = {
  // Welcome
  eyebrow: 'Welcome to Skeinos',
  title: 'One workspace across every AI chat',
  body: 'Folders, search, prompts and instruction profiles that follow you across Claude, Gemini, Perplexity and more — laid over the sites you already use.',
  localTitle: 'Local-first by design',
  localBody:
    'Your conversations are read and indexed on your device. Message content never reaches our servers.',
  syncTitle: 'Only metadata syncs',
  syncBody:
    'Folders, prompts and tags sync end-to-end encrypted. Nothing else leaves your machine.',
  haveAccount: 'I already have an account',
  getStarted: 'Get started',

  // Permissions priming
  permEyebrow: 'Step 2 · Permissions',
  permTitle: 'Why Skeinos asks for access',
  permBody:
    'Your browser will request permission for each site next. Here’s exactly what each one is for — and what it isn’t.',
  permBadge: 'Read & type',
  permAssurance:
    'Permissions are per-site and revocable any time in Settings. We never read credentials or send content anywhere.',

  // Starter library
  starterEyebrow: 'Step 3 · Starter library',
  starterTitle: 'Pick a starting point',
  starterBody:
    'Choose your field and we’ll seed your library with a curated starter pack. Everything is editable — rename, retag, or delete any of them.',
  starterInstalling: 'Adding starter prompts…',
  starterErrorTitle: 'Couldn’t add starter prompts',
  starterErrorBody: 'Something went wrong. Your library is unchanged — try again.',
  starterRetry: 'Try again',
  confirmTitle: (n: number): string =>
    n === 1 ? '1 starter prompt added' : `${n} starter prompts added`,
  confirmTitleNone: 'Starter prompts already in your library',
  confirmBody:
    'We seeded your library with a curated starter pack so you have something useful from minute one. Everything is editable — rename, retag, or delete any of them.',
  browseLibrary: 'Browse library',
  moreCount: (n: number): string => `+${n} more`,

  // Get started
  doneEyebrow: 'You’re all set',
  doneTitle: 'Where would you like to start?',
  doneBody:
    'Create a home for your conversations — Skeinos is already running on this platform.',
  createFolderTitle: 'Create your first folder',
  createFolderBody: 'Group chats by project, topic or client',
  createFolderName: 'My first folder',
  finishSetup: 'Finish setup',

  // Shared
  back: 'Back',
  continue: 'Continue',
  stepLabel: (i: number, n: number): string => `Step ${i + 1} of ${n}`,
} as const;

// Per-site priming copy (informational only — Option A, D-3). No `chrome.permissions`
// call and no prompt: the hosts are already granted via the static `host_permissions`.
const PERM_SITES: readonly { id: string; host: string; for: string }[] = [
  {
    id: 'claude',
    host: 'claude.ai',
    for: 'Read the page to index & organise your chats; type prompts when you ask.',
  },
  {
    id: 'gemini',
    host: 'gemini.google.com',
    for: 'Same — read to index, type to insert. No background access.',
  },
  {
    id: 'perplexity',
    host: 'perplexity.ai',
    for: 'Read to index; type to insert. We never read while the tab is in the background.',
  },
];

const STEP_COUNT = 4;
/** How many seeded titles to preview as chips in the confirmation (rest collapse). */
const SAMPLE_TITLES = 6;

export interface OnboardingSurfaceProps {
  /** The active tab's resolved platform — the scope for the first folder (D-5).
   *  `null`/`undefined` when no supported host is active (the create-folder action
   *  is hidden then, but the panel is only enabled on supported hosts in practice). */
  platform?: PlatformId | null;
  /** Override the completion writer (tests). Defaults to the real gate writer. */
  onComplete?: () => void | Promise<void>;
  /** Override the seed installer (tests). Defaults to the real worker client. */
  installSeeds?: (domain: DomainId) => Promise<number>;
  /** Override the domain-persist writer (tests). Defaults to the real gate writer. */
  persistDomain?: (domain: DomainId) => void | Promise<void>;
  /** Override the folder-create writer (tests). Defaults to the real worker client. */
  createFolder?: (name: string, platform: PlatformId) => void | Promise<void>;
}

/** Default seed installer: through the worker, returning the inserted count. */
async function defaultInstallSeeds(domain: DomainId): Promise<number> {
  const res = await installPromptSeedsRemote(domain);
  return res.ok ? res.data.installed : 0;
}

/** Default folder-create: the `folder.create` workspace op, scoped to the platform,
 *  reusing `folderDefaults` for a retry-stable id (D-5). NOT `useWorkspace` (a
 *  platform-hook-bound seam that cannot run from this surface). */
async function defaultCreateFolder(name: string, platform: PlatformId): Promise<void> {
  await mutateWorkspaceRemote({
    op: 'folder.create',
    id: makeFolderId(),
    name,
    color: DEFAULT_FOLDER_COLOR,
    platformScope: platform,
  });
}

export function OnboardingSurface({
  platform,
  onComplete = completeOnboarding,
  installSeeds = defaultInstallSeeds,
  persistDomain = setOnboardingDomain,
  createFolder = defaultCreateFolder,
}: OnboardingSurfaceProps) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Starter-library sub-state: which domain was picked, the install reply count,
  // and any non-blocking install error (retryable — the gate is not yet complete).
  const [picked, setPicked] = useState<DomainId | null>(null);
  const [installed, setInstalled] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // Terminal completion: write the gate once, guarding re-entry. The settings write
  // broadcasts via storage.onChanged, so the subscribed panel re-scopes out of
  // onboarding — no reload (D-2).
  const finish = (before?: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(before?.())
      .then(() => onComplete())
      .catch(() => setBusy(false));
  };

  // Starter-library: pick a domain → install its seeds (idempotent) → persist the
  // domain → show the confirmation with the ACTUAL inserted count (D-4). On failure
  // surface a retryable error; the gate is untouched, so nothing is lost.
  const pickDomain = (domain: DomainId) => {
    if (installing) return;
    setPicked(domain);
    setInstalling(true);
    setInstallError(false);
    void installSeeds(domain)
      .then((count) => Promise.resolve(persistDomain(domain)).then(() => count))
      .then((count) => {
        setInstalled(count);
        setInstalling(false);
      })
      .catch(() => {
        setInstalling(false);
        setInstallError(true);
      });
  };

  return (
    <div class="sk-shell sk-onb" data-testid="sk-onboarding" data-step={step}>
      <div class="sk-onb__scroll">
        {step === 0 ? <WelcomeStep /> : null}
        {step === 1 ? <PermissionsStep /> : null}
        {step === 2 ? (
          <StarterStep
            picked={picked}
            installed={installed}
            installing={installing}
            installError={installError}
            onPick={pickDomain}
          />
        ) : null}
        {step === 3 ? <GetStartedStep /> : null}

        <div class="sk-onb__dots" role="img" aria-label={STR.stepLabel(step, STEP_COUNT)}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span class={`sk-onb__dot${i === step ? ' sk-onb__dot--active' : ''}`} />
          ))}
        </div>
      </div>

      <div class="sk-shell__footer sk-onb__footer">{renderFooter()}</div>
    </div>
  );

  function renderFooter() {
    if (step === 0) {
      return (
        <>
          <button
            type="button"
            class="sk-btn--link"
            data-testid="sk-onboarding-skip"
            onClick={() => finish()}
            disabled={busy}
          >
            {STR.haveAccount}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--icon"
            data-testid="sk-onboarding-start"
            onClick={next}
          >
            {STR.getStarted}
            <ChevronIcon size={16} />
          </button>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <button type="button" class="sk-btn--link" data-testid="sk-onboarding-back" onClick={back}>
            {STR.back}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--icon"
            data-testid="sk-onboarding-continue"
            onClick={next}
          >
            {STR.continue}
            <ChevronIcon size={16} />
          </button>
        </>
      );
    }

    if (step === 2) {
      // "Browse library" leaves the step (advances) like "Continue" — both lead to
      // the get-started step; the prompt browser is the user's next stop afterwards.
      return (
        <>
          <button
            type="button"
            class="sk-btn--link"
            data-testid="sk-onboarding-browse"
            onClick={next}
          >
            {STR.browseLibrary}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--icon"
            data-testid="sk-onboarding-continue"
            onClick={next}
          >
            {STR.continue}
            <ChevronIcon size={16} />
          </button>
        </>
      );
    }

    // Step 3 (get started) has no footer nav — its actions are the cards above.
    return null;
  }

  function GetStartedStep() {
    const canCreateFolder = platform != null;
    return (
      <div class="sk-onb__step" data-testid="sk-onboarding-step-getstarted">
        <div class="sk-onb__hero">
          <p class="sk-onb__eyebrow">{STR.doneEyebrow}</p>
          <h1 class="sk-onb__title">{STR.doneTitle}</h1>
          <p class="sk-onb__body">{STR.doneBody}</p>
        </div>

        <div class="sk-onb__actions">
          {canCreateFolder ? (
            <button
              type="button"
              class="sk-onb__action"
              data-testid="sk-onboarding-create-folder"
              disabled={busy}
              onClick={() => finish(() => createFolder(STR.createFolderName, platform!))}
            >
              <span class="sk-onb__action-icon" aria-hidden="true">
                <FolderIcon size={18} />
              </span>
              <span class="sk-onb__action-text">
                <span class="sk-onb__action-title">{STR.createFolderTitle}</span>
                <span class="sk-onb__action-body">{STR.createFolderBody}</span>
              </span>
              <ChevronIcon size={16} />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          class="sk-btn sk-btn--icon sk-onb__finish"
          data-testid="sk-onboarding-finish"
          disabled={busy}
          onClick={() => finish()}
        >
          <CheckIcon size={16} />
          {STR.finishSetup}
        </button>
      </div>
    );
  }
}

function WelcomeStep() {
  return (
    <div class="sk-onb__step" data-testid="sk-onboarding-step-welcome">
      <div class="sk-onb__hero">
        <span class="sk-onb__glyph" aria-hidden="true">
          <BrandGlyph size={22} />
        </span>
        <p class="sk-onb__eyebrow">{STR.eyebrow}</p>
        <h1 class="sk-onb__title">{STR.title}</h1>
        <p class="sk-onb__body">{STR.body}</p>
      </div>

      <ul class="sk-onb__features">
        <li class="sk-onb__feature">
          <span class="sk-onb__feature-icon" aria-hidden="true">
            <ShieldIcon size={18} />
          </span>
          <div class="sk-onb__feature-text">
            <p class="sk-onb__feature-title">{STR.localTitle}</p>
            <p class="sk-onb__feature-body">{STR.localBody}</p>
          </div>
        </li>
        <li class="sk-onb__feature">
          <span class="sk-onb__feature-icon" aria-hidden="true">
            <LockIcon size={18} />
          </span>
          <div class="sk-onb__feature-text">
            <p class="sk-onb__feature-title">{STR.syncTitle}</p>
            <p class="sk-onb__feature-body">{STR.syncBody}</p>
          </div>
        </li>
      </ul>
    </div>
  );
}

function PermissionsStep() {
  return (
    <div class="sk-onb__step" data-testid="sk-onboarding-step-permissions">
      <div class="sk-onb__hero">
        <p class="sk-onb__eyebrow">{STR.permEyebrow}</p>
        <h1 class="sk-onb__title">{STR.permTitle}</h1>
        <p class="sk-onb__body">{STR.permBody}</p>
      </div>

      <ul class="sk-onb__sites" data-testid="sk-onboarding-perm-sites">
        {PERM_SITES.map((site) => (
          <li class="sk-onb__site" data-site={site.id}>
            <span class="sk-onb__site-mark" aria-hidden="true">
              {site.host.charAt(0).toUpperCase()}
            </span>
            <div class="sk-onb__site-text">
              <p class="sk-onb__site-host">{site.host}</p>
              <p class="sk-onb__site-for">{site.for}</p>
            </div>
            <span class="sk-onb__site-badge">{STR.permBadge}</span>
          </li>
        ))}
      </ul>

      <p class="sk-onb__assurance" data-testid="sk-onboarding-perm-assurance">
        <span class="sk-onb__assurance-icon" aria-hidden="true">
          <ShieldIcon size={14} />
        </span>
        {STR.permAssurance}
      </p>
    </div>
  );
}

interface StarterStepProps {
  picked: DomainId | null;
  installed: number | null;
  installing: boolean;
  installError: boolean;
  onPick: (domain: DomainId) => void;
}

function StarterStep({ picked, installed, installing, installError, onPick }: StarterStepProps) {
  // Confirmation sub-state: a domain has been picked and its seeds installed (the
  // count is from the install reply, never hard-coded — D-4). Sample titles are read
  // from the bundled catalog (pure data, no store), mirroring what was seeded.
  if (picked && installed !== null && !installError) {
    const titles = seedsForDomain(picked).map((s) => s.title);
    const sample = titles.slice(0, SAMPLE_TITLES);
    const rest = titles.length - sample.length;
    return (
      <div class="sk-onb__step" data-testid="sk-onboarding-step-starter">
        <div class="sk-onb__hero">
          <span class="sk-onb__check" aria-hidden="true">
            <CheckIcon size={20} />
          </span>
          <h1 class="sk-onb__title" data-testid="sk-onboarding-confirm-title">
            {installed === 0 ? STR.confirmTitleNone : STR.confirmTitle(installed)}
          </h1>
          <p class="sk-onb__body">{STR.confirmBody}</p>
        </div>
        <ul class="sk-onb__chips" data-testid="sk-onboarding-confirm-chips">
          {sample.map((t) => (
            <li class="sk-onb__chip">{t}</li>
          ))}
          {rest > 0 ? <li class="sk-onb__chip sk-onb__chip--more">{STR.moreCount(rest)}</li> : null}
        </ul>
      </div>
    );
  }

  // Picker sub-state (with an inline error/retry banner if the last install failed).
  return (
    <div class="sk-onb__step" data-testid="sk-onboarding-step-starter">
      <div class="sk-onb__hero">
        <p class="sk-onb__eyebrow">{STR.starterEyebrow}</p>
        <h1 class="sk-onb__title">{STR.starterTitle}</h1>
        <p class="sk-onb__body">{STR.starterBody}</p>
      </div>

      {installError ? (
        <div class="sk-onb__error" role="alert" data-testid="sk-onboarding-starter-error">
          <p class="sk-onb__error-title">{STR.starterErrorTitle}</p>
          <p class="sk-onb__error-body">{STR.starterErrorBody}</p>
          <button
            type="button"
            class="sk-btn sk-btn--ghost"
            data-testid="sk-onboarding-starter-retry"
            onClick={() => picked && onPick(picked)}
          >
            {STR.starterRetry}
          </button>
        </div>
      ) : null}

      <ul class="sk-onb__domains" data-testid="sk-onboarding-domains">
        {DOMAIN_REGISTRY.map((d) => (
          <li>
            <button
              type="button"
              class="sk-onb__domain"
              data-testid={`sk-onboarding-domain-${d.id}`}
              data-domain={d.id}
              disabled={installing}
              aria-busy={installing && picked === d.id}
              onClick={() => onPick(d.id)}
            >
              <span class="sk-onb__domain-label">{d.label}</span>
              {installing && picked === d.id ? (
                <span class="sk-spinner" aria-label={STR.starterInstalling} />
              ) : (
                <ChevronIcon size={16} />
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
