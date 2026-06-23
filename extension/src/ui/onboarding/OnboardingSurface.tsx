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
import { ConsentToggle } from '../components/ConsentToggle';
import { CheckIcon, ChevronIcon, FolderIcon, ShieldIcon } from '../components/Icon';
import { setSettings } from '../../core/settings';
import { DOMAIN_REGISTRY, type DomainId } from '../../shared/domains';
import { seedsForDomain } from '../../core/prompts/catalog';
import { installPromptSeedsRemote } from '../../core/prompts/client';
import { installProfileSeedsRemote } from '../../core/profiles/client';
import { mutateWorkspaceRemote } from '../../core/folders/client';
import { DEFAULT_FOLDER_COLOR, makeFolderId } from '../sidebar/folderDefaults';
import type { PlatformId } from '../../shared/types';
import { completeOnboarding, setOnboardingDomain } from './gate';
import { useT, type MessageKey } from '../../core/i18n';

// Per-site priming copy (informational only — Option A, D-3). No `chrome.permissions`
// call and no prompt: the hosts are already granted via the static `host_permissions`.
const PERM_SITES: readonly { id: string; host: string; forKey: MessageKey }[] = [
  {
    id: 'claude',
    host: 'claude.ai',
    forKey: 'onboarding.permForClaude',
  },
  {
    id: 'gemini',
    host: 'gemini.google.com',
    forKey: 'onboarding.permForGemini',
  },
  {
    id: 'perplexity',
    host: 'perplexity.ai',
    forKey: 'onboarding.permForPerplexity',
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
  /** Override the consent persister (tests). Defaults to the real settings writer. */
  persistConsent?: (partial: { diagnosticsOptIn?: boolean }) => void | Promise<void>;
}

/** Default seed installer: through the worker, seeding BOTH the prompt library and the
 *  instruction-profile library for the picked domain. Returns the prompt count (which
 *  drives the confirmation's title-chip preview); profile seeding rides alongside and
 *  is idempotent. A failed profile install never blocks the prompt-driven flow. */
async function defaultInstallSeeds(domain: DomainId): Promise<number> {
  const [promptRes] = await Promise.all([
    installPromptSeedsRemote(domain),
    installProfileSeedsRemote(domain).catch(() => undefined),
  ]);
  return promptRes.ok ? promptRes.data.installed : 0;
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
  persistConsent = (partial) => setSettings(partial),
}: OnboardingSurfaceProps) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Diagnostics consent, surfaced on the FINAL step as an explicit opt-IN: the box
  // starts unchecked and diagnostics stay off unless the user ticks it before
  // finishing. Loaded from durable settings so a returning user sees their choice
  // (default off, so unchecked on a fresh install).
  const [consent, setConsent] = useState({ diagnosticsOptIn: false });
  // The onboarding toggle is pure local opt-in state — it always starts unchecked and
  // is NOT pre-loaded from settings (a returning/leftover value must not pre-check an
  // opt-in). The chosen value is committed to durable settings on finish (below).
  const toggleConsent = (key: 'diagnosticsOptIn', value: boolean) => {
    setConsent((c) => ({ ...c, [key]: value }));
  };

  // Starter-library sub-state: which domain was picked, the install reply count,
  // and any non-blocking install error (retryable — the gate is not yet complete).
  const [picked, setPicked] = useState<DomainId | null>(null);
  const [installed, setInstalled] = useState<number | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // Terminal completion: commit the diagnostics opt-in to durable settings (so the
  // stored value matches the box the user saw — unticked stays off, ticked turns on),
  // then write the gate once, guarding re-entry. The settings write broadcasts via
  // storage.onChanged, so the subscribed panel re-scopes out of onboarding — no
  // reload (D-2).
  const finish = (before?: () => Promise<void> | void) => {
    if (busy) return;
    setBusy(true);
    void Promise.resolve(persistConsent({ diagnosticsOptIn: consent.diagnosticsOptIn }))
      .then(() => before?.())
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

        <div class="sk-onb__dots" role="img" aria-label={t('onboarding.stepLabel', { current: step + 1, total: STEP_COUNT })}>
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
            {t('onboarding.haveAccount')}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--icon"
            data-testid="sk-onboarding-start"
            onClick={next}
          >
            {t('onboarding.getStarted')}
            <ChevronIcon size={16} />
          </button>
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <button type="button" class="sk-btn--link" data-testid="sk-onboarding-back" onClick={back}>
            {t('onboarding.back')}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--icon"
            data-testid="sk-onboarding-continue"
            onClick={next}
          >
            {t('onboarding.continue')}
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
            {t('onboarding.browseLibrary')}
          </button>
          <button
            type="button"
            class="sk-btn sk-btn--icon"
            data-testid="sk-onboarding-continue"
            onClick={next}
          >
            {t('onboarding.continue')}
            <ChevronIcon size={16} />
          </button>
        </>
      );
    }

    // Step 3 (get started): the primary actions are the cards above; the footer
    // keeps only Back so the user can step back through the flow.
    return (
      <button type="button" class="sk-btn--link" data-testid="sk-onboarding-back" onClick={back}>
        {t('onboarding.back')}
      </button>
    );
  }

  function GetStartedStep() {
    const canCreateFolder = platform != null;
    return (
      <div class="sk-onb__step" data-testid="sk-onboarding-step-getstarted">
        <div class="sk-onb__hero">
          <p class="sk-onb__eyebrow">{t('onboarding.doneEyebrow')}</p>
          <h1 class="sk-onb__title">{t('onboarding.doneTitle')}</h1>
          <p class="sk-onb__body">{t('onboarding.doneBody')}</p>
        </div>

        <div class="sk-onb__actions">
          {canCreateFolder ? (
            <button
              type="button"
              class="sk-onb__action"
              data-testid="sk-onboarding-create-folder"
              disabled={busy}
              onClick={() => finish(() => createFolder(t('onboarding.createFolderName'), platform!))}
            >
              <span class="sk-onb__action-icon" aria-hidden="true">
                <FolderIcon size={18} />
              </span>
              <span class="sk-onb__action-text">
                <span class="sk-onb__action-title">{t('onboarding.createFolderTitle')}</span>
                <span class="sk-onb__action-body">{t('onboarding.createFolderBody')}</span>
              </span>
              <ChevronIcon size={16} />
            </button>
          ) : null}
        </div>

        {/* Diagnostics consent — the final, explicit trust moment (onboarding spec).
            Shown unchecked: an opt-IN the user actively makes before finishing. */}
        <div class="sk-onb__consent" data-testid="sk-onboarding-consent">
          <p class="sk-onb__eyebrow">{t('onboarding.consentHeading')}</p>
          <ConsentToggle
            testId="sk-onboarding-consent-diagnostics"
            label={t('onboarding.consentDiagnosticsLabel')}
            body={t('onboarding.consentDiagnosticsBody')}
            checked={consent.diagnosticsOptIn}
            onChange={(v) => toggleConsent('diagnosticsOptIn', v)}
          />
        </div>

        <button
          type="button"
          class="sk-btn sk-btn--icon sk-onb__finish"
          data-testid="sk-onboarding-finish"
          disabled={busy}
          onClick={() => finish()}
        >
          <CheckIcon size={16} />
          {t('onboarding.finishSetup')}
        </button>
      </div>
    );
  }
}

function WelcomeStep() {
  const t = useT();
  return (
    <div class="sk-onb__step" data-testid="sk-onboarding-step-welcome">
      <div class="sk-onb__hero">
        <span class="sk-onb__glyph" aria-hidden="true">
          <BrandGlyph size={22} />
        </span>
        <p class="sk-onb__eyebrow">{t('onboarding.eyebrow')}</p>
        <h1 class="sk-onb__title">{t('onboarding.title')}</h1>
        <p class="sk-onb__body">{t('onboarding.body')}</p>
      </div>

      <p
        class="sk-onb__assurance sk-onb__assurance--solo"
        data-testid="sk-onboarding-welcome-assurance"
      >
        <span class="sk-onb__assurance-icon" aria-hidden="true">
          <ShieldIcon size={14} />
        </span>
        {t('onboarding.privacy')}
      </p>
    </div>
  );
}

function PermissionsStep() {
  const t = useT();
  return (
    <div class="sk-onb__step" data-testid="sk-onboarding-step-permissions">
      <div class="sk-onb__hero">
        <p class="sk-onb__eyebrow">{t('onboarding.permEyebrow')}</p>
        <h1 class="sk-onb__title">{t('onboarding.permTitle')}</h1>
        <p class="sk-onb__body">{t('onboarding.permBody')}</p>
      </div>

      <ul class="sk-onb__sites" data-testid="sk-onboarding-perm-sites">
        {PERM_SITES.map((site) => (
          <li class="sk-onb__site" data-site={site.id}>
            <span class="sk-onb__site-mark" aria-hidden="true">
              {site.host.charAt(0).toUpperCase()}
            </span>
            <div class="sk-onb__site-text">
              <p class="sk-onb__site-host">{site.host}</p>
              <p class="sk-onb__site-for">{t(site.forKey)}</p>
            </div>
            <span class="sk-onb__site-badge">{t('onboarding.permBadge')}</span>
          </li>
        ))}
      </ul>

      <p class="sk-onb__assurance" data-testid="sk-onboarding-perm-assurance">
        <span class="sk-onb__assurance-icon" aria-hidden="true">
          <ShieldIcon size={14} />
        </span>
        {t('onboarding.permAssurance')}
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
  const t = useT();
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
            {installed === 0 ? t('onboarding.confirmTitleNone') : t('onboarding.confirmTitle', { count: installed })}
          </h1>
          <p class="sk-onb__body">{t('onboarding.confirmBody')}</p>
        </div>
        <ul class="sk-onb__chips" data-testid="sk-onboarding-confirm-chips">
          {sample.map((t) => (
            <li class="sk-onb__chip">{t}</li>
          ))}
          {rest > 0 ? <li class="sk-onb__chip sk-onb__chip--more">{t('onboarding.moreCount', { count: rest })}</li> : null}
        </ul>
      </div>
    );
  }

  // Picker sub-state (with an inline error/retry banner if the last install failed).
  return (
    <div class="sk-onb__step" data-testid="sk-onboarding-step-starter">
      <div class="sk-onb__hero">
        <p class="sk-onb__eyebrow">{t('onboarding.starterEyebrow')}</p>
        <h1 class="sk-onb__title">{t('onboarding.starterTitle')}</h1>
        <p class="sk-onb__body">{t('onboarding.starterBody')}</p>
      </div>

      {installError ? (
        <div class="sk-onb__error" role="alert" data-testid="sk-onboarding-starter-error">
          <p class="sk-onb__error-title">{t('onboarding.starterErrorTitle')}</p>
          <p class="sk-onb__error-body">{t('onboarding.starterErrorBody')}</p>
          <button
            type="button"
            class="sk-btn sk-btn--ghost"
            data-testid="sk-onboarding-starter-retry"
            onClick={() => picked && onPick(picked)}
          >
            {t('onboarding.starterRetry')}
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
                <span class="sk-spinner" aria-label={t('onboarding.starterInstalling')} />
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
