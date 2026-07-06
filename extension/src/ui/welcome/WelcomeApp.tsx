// The install welcome page (install-welcome). A full-tab, browser-specific
// getting-started guide opened once on first install — where to find Skeinos in
// THIS browser, and what happens when you open a supported chat site. It is a
// decoupled signpost: it never writes `onboardingCompleted` (the in-panel
// stepper still runs on the first supported-site visit). Content leads with a
// diagram of the user's own browser; copy is plain, no jargon (DESIGN.md).
//
// Browser variant is chosen at BUILD time via `import.meta.env.BROWSER` (WXT
// emits a separate bundle per browser), so there is no runtime UA sniffing: the
// Chrome build ships the toolbar illustration + "only opens on the four sites"
// caveat; the Firefox build ships the sidebar illustration.

import { useEffect, useState } from 'preact/hooks';
import { LockIcon } from '../components/Icon';
import { extApi } from '../../core/platform/ext-api';
import { FEEDBACK_URL, isExternalHttp } from '../../shared/links';
import { useT } from '../../core/i18n';

// True on the Firefox build. `import.meta.env.BROWSER` is inlined by WXT; under
// test (happy-dom) it is undefined, which correctly falls through to the Chrome
// variant — the default the unit test asserts.
const IS_FIREFOX = import.meta.env.BROWSER === 'firefox';

// The four supported hosts, shown as chips in step 1. Brand names/hosts are not
// translatable, so they live in a const (mirrors onboarding's PERM_SITES) rather
// than as inline JSX literals.
const SITES = [
  { name: 'Claude', host: 'claude.ai' },
  { name: 'Gemini', host: 'gemini.google.com' },
  { name: 'Perplexity', host: 'perplexity.ai' },
  { name: 'ChatGPT', host: 'chatgpt.com' },
] as const;


// The wordmark is a proper noun, not a translatable string — kept as a const so
// it reads as an expression (not a bare JSX literal, which the lint rule rejects).
const BRAND = 'Skeinos';

// The actual installed toolbar icon, reproduced inline so the page shows the exact
// mark the user sees in their browser (public/icon/*.png). Unlike `BrandGlyph`
// (which recolours with its chip), this is the FIXED-color app tile: a dark
// #1b1b21 square with a white # skein and one purple thread — the same in both
// themes, because the real browser icon does not change with the page theme. A
// hairline ring (in CSS) keeps the dark tile legible on a dark-themed page.
function AppIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#1b1b21" />
      <g stroke-width="4.2" stroke-linecap="round">
        <line x1="2.2" y1="8" x2="21.8" y2="8" stroke="#f4f4f6" />
        <line x1="16" y1="2.2" x2="16" y2="21.8" stroke="#f4f4f6" />
        <line x1="8" y1="2.2" x2="8" y2="21.8" stroke="#8b7fed" />
        <line x1="2.2" y1="16" x2="21.8" y2="16" stroke="#f4f4f6" />
      </g>
    </svg>
  );
}

interface RuntimeApi {
  openOptionsPage?: () => void;
  getURL?: (path: string) => string;
}

/** Open the options page — the native API when present, else a new tab to its URL. */
function openSettings(e: Event): void {
  e.preventDefault();
  const rt = extApi<{ runtime?: RuntimeApi }>()?.runtime;
  if (rt?.openOptionsPage) rt.openOptionsPage();
  else if (rt?.getURL) window.open(rt.getURL('options.html'), '_blank', 'noopener');
}

export function WelcomeApp() {
  const t = useT();
  // Soft entrance reveal, gated in CSS behind prefers-reduced-motion. Flipped one
  // frame after mount so the initial (hidden) state paints first.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div class={`sk-wl${revealed ? ' is-revealed' : ''}`} data-testid="sk-welcome">
      <div class="sk-wl__page">
        <header class="sk-wl__brand sk-wl__r">
          <span class="sk-wl__glyph" aria-hidden="true">
            <AppIcon size={30} />
          </span>
          <span class="sk-wl__wordmark">{BRAND}</span>
          <span class="sk-wl__ver">{t('onboarding.doneEyebrow')}</span>
        </header>

        <p class="sk-wl__eyebrow sk-wl__r">{t('welcome.eyebrow')}</p>
        <h1 class="sk-wl__title sk-wl__r sk-wl__r--2">
          {t(IS_FIREFOX ? 'welcome.titleFirefox' : 'welcome.titleChrome')}
        </h1>
        <p class="sk-wl__lede sk-wl__r sk-wl__r--2">{t('welcome.lede')}</p>

        <svg
          class="sk-wl__thread sk-wl__r sk-wl__r--2"
          viewBox="0 0 800 18"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 9 C 66 -3,133 21,200 9 S 333 -3,400 9 S 533 21,600 9 S 733 -3,800 9" />
        </svg>

        <section class="sk-wl__section sk-wl__r sk-wl__r--3">
          <p class="sk-wl__overline">{t(IS_FIREFOX ? 'welcome.findFirefox' : 'welcome.findChrome')}</p>
          <div
            class="sk-wl__browser"
            role="img"
            aria-label={t(IS_FIREFOX ? 'welcome.diagramFirefox' : 'welcome.diagramChrome')}
          >
            {IS_FIREFOX ? <FirefoxScene callout={t('welcome.calloutFirefox')} /> : <ChromeScene callout={t('welcome.calloutChrome')} />}
          </div>

          <div class="sk-wl__note">
            <span class="sk-wl__note-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 3v6m0 0l-4 4v3h8v-3l-4-4M12 18v3" />
              </svg>
            </span>
            <p>
              <b>{t(IS_FIREFOX ? 'welcome.sidebarTitle' : 'welcome.pinTitle')}</b>
              <span class="sk-wl__sub">{t(IS_FIREFOX ? 'welcome.sidebarBody' : 'welcome.pinBody')}</span>
            </p>
          </div>

          {IS_FIREFOX ? null : (
            <p class="sk-wl__only" data-testid="sk-welcome-only">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8h.01M11 12h1v4h1" />
              </svg>
              <span>
                <b>{t('welcome.onlyLead')}</b> {t('welcome.onlyRest')}
              </span>
            </p>
          )}
        </section>

        <section class="sk-wl__section sk-wl__r sk-wl__r--4">
          <p class="sk-wl__overline">{t('welcome.howHeading')}</p>
          <div class="sk-wl__flow">
            <div class="sk-wl__step">
              <span class="sk-wl__step-n">{t('welcome.stepLabel', { n: 1 })}</span>
              <div class="sk-wl__art" aria-hidden="true">
                <svg viewBox="0 0 120 88" fill="none">
                  <rect x="18" y="14" width="84" height="60" rx="8" stroke="currentColor" stroke-width="1.6" />
                  <line x1="18" y1="30" x2="102" y2="30" stroke="currentColor" stroke-width="1.6" />
                  <circle cx="27" cy="22" r="2.4" fill="currentColor" />
                  <circle cx="35" cy="22" r="2.4" fill="currentColor" />
                  <rect x="30" y="42" width="44" height="7" rx="3.5" fill="currentColor" opacity=".7" />
                  <rect x="30" y="55" width="60" height="7" rx="3.5" fill="currentColor" opacity=".35" />
                </svg>
              </div>
              <h3>{t('welcome.step1Title')}</h3>
              <p>{t('welcome.step1Body')}</p>
              <div class="sk-wl__chips">
                {SITES.map((s) => (
                  <span class="sk-wl__chip">{s.name}</span>
                ))}
              </div>
            </div>

            <div class="sk-wl__step">
              <span class="sk-wl__step-n">{t('welcome.stepLabel', { n: 2 })}</span>
              <div class="sk-wl__art" aria-hidden="true">
                <svg viewBox="0 0 120 88" fill="none">
                  <rect x="10" y="20" width="30" height="8" rx="4" fill="currentColor" opacity=".55" />
                  <rect x="10" y="36" width="30" height="8" rx="4" fill="currentColor" opacity=".4" />
                  <rect x="10" y="52" width="30" height="8" rx="4" fill="currentColor" opacity=".3" />
                  <path
                    d="M42 24 C 66 24, 70 44, 92 44 M42 40 C 66 40, 70 44, 92 44 M42 56 C 66 56, 70 44, 92 44"
                    stroke="currentColor"
                    stroke-width="1.4"
                    opacity=".7"
                  />
                  <path
                    d="M82 40 h20 a3 3 0 0 1 3 3 v18 a3 3 0 0 1-3 3 H82 a3 3 0 0 1-3-3 V37 a3 3 0 0 1 3-3 h6 l4 4"
                    stroke="currentColor"
                    stroke-width="1.6"
                    fill="var(--wl-tint-12)"
                  />
                </svg>
              </div>
              <h3>{t('welcome.step2Title')}</h3>
              <p>{t('welcome.step2Body')}</p>
            </div>

            <div class="sk-wl__step">
              <span class="sk-wl__step-n">{t('welcome.stepLabel', { n: 3 })}</span>
              <div class="sk-wl__art" aria-hidden="true">
                <svg viewBox="0 0 120 88" fill="none">
                  <rect x="30" y="10" width="60" height="68" rx="7" stroke="currentColor" stroke-width="1.6" />
                  <rect x="38" y="20" width="44" height="12" rx="6" stroke="currentColor" stroke-width="1.4" />
                  <circle cx="46" cy="26" r="3" stroke="currentColor" stroke-width="1.4" />
                  <line x1="49" y1="29" x2="53" y2="33" stroke="currentColor" stroke-width="1.4" />
                  <rect x="38" y="40" width="44" height="8" rx="4" fill="currentColor" opacity=".6" />
                  <rect x="38" y="52" width="30" height="8" rx="4" fill="currentColor" opacity=".35" />
                  <rect x="38" y="64" width="36" height="8" rx="4" fill="currentColor" opacity=".35" />
                </svg>
              </div>
              <h3>{t('welcome.step3Title')}</h3>
              <p>{t('welcome.step3Body')}</p>
            </div>
          </div>
        </section>

        <div class="sk-wl__assure sk-wl__r sk-wl__r--5">
          <LockIcon size={20} />
          <p>
            <b>{t('welcome.assureLead')}</b> {t('welcome.assureBody')}
          </p>
        </div>

        <footer class="sk-wl__footer sk-wl__r sk-wl__r--6">
          <div class="sk-wl__foot-row">
            <span class="sk-wl__foot-brand">
              <span class="sk-wl__foot-glyph" aria-hidden="true">
                <AppIcon size={18} />
              </span>
              {BRAND}
            </span>
            <nav class="sk-wl__foot-links">
              <a href="#" onClick={openSettings}>
                {t('welcome.settings')}
              </a>
              <a
                href={FEEDBACK_URL}
                target={isExternalHttp(FEEDBACK_URL) ? '_blank' : undefined}
                rel={isExternalHttp(FEEDBACK_URL) ? 'noopener' : undefined}
              >
                {t('welcome.feedback')}
              </a>
            </nav>
          </div>
          <p class="sk-wl__disclaimer">{t('welcome.disclaimer')}</p>
        </footer>
      </div>
    </div>
  );
}

/** Chrome: a window with the Skeinos icon highlighted in the top-right toolbar,
 *  a "click to open" annotation pointing up at it, and the panel on the right. */
function ChromeScene({ callout }: { callout: string }) {
  return (
    <svg viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0" y="0" width="800" height="420" fill="var(--sk-color-bg)" />
      <rect x="0" y="0" width="800" height="80" fill="var(--wl-panel)" />
      <line x1="0" y1="80" x2="800" y2="80" stroke="var(--sk-color-border)" />
      <path d="M24 80 v-26 a8 8 0 0 1 8-8 h150 a8 8 0 0 1 8 8 v26 z" fill="var(--sk-color-bg)" stroke="var(--sk-color-border)" />
      <rect x="44" y="60" width="96" height="7" rx="3.5" fill="var(--sk-color-muted)" opacity=".45" />
      <rect x="24" y="96" width="620" height="30" rx="15" fill="var(--sk-color-bg)" stroke="var(--sk-color-border)" />
      <circle cx="44" cy="111" r="5" fill="none" stroke="var(--sk-color-muted)" stroke-width="1.6" />
      <rect x="60" y="107" width="150" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".4" />
      <path
        d="M686 104h4.5a3.2 3.2 0 0 1 6.4 0H701v5.1a3.2 3.2 0 0 1 0 6.4V121h-5.1a3.2 3.2 0 0 1-6.4 0H684v-4.6a3.2 3.2 0 0 0 0-6.3V104z"
        fill="none"
        stroke="var(--sk-color-muted)"
        stroke-width="1.5"
      />
      <circle class="sk-wl__pulse" cx="740" cy="111" r="17" fill="var(--wl-tint-24)" />
      <circle cx="740" cy="111" r="17" fill="none" stroke="var(--sk-color-accent)" stroke-width="1.6" />
      <rect x="729" y="100" width="22" height="22" rx="6" fill="#1b1b21" />
      <g stroke-width="1.9" stroke-linecap="round">
        <line x1="732.5" y1="108" x2="747.5" y2="108" stroke="#f4f4f6" />
        <line x1="732.5" y1="114" x2="747.5" y2="114" stroke="#f4f4f6" />
        <line x1="744" y1="103.5" x2="744" y2="118.5" stroke="#f4f4f6" />
        <line x1="738" y1="103.5" x2="738" y2="118.5" stroke="#8b7fed" />
      </g>
      <text x="672" y="150" text-anchor="end" font-family="var(--sk-font-label)" font-size="13" letter-spacing=".04em" fill="var(--sk-color-accent)">
        {callout}
      </text>
      <path d="M678 147 C 700 145, 719 138, 730 125" fill="none" stroke="var(--sk-color-accent)" stroke-width="1.6" stroke-dasharray="3 4" />
      <path d="M730 125 l-8.5 1.2 M730 125 l1.4 8.4" fill="none" stroke="var(--sk-color-accent)" stroke-width="1.6" stroke-linecap="round" />
      <rect x="40" y="150" width="300" height="10" rx="5" fill="var(--sk-color-muted)" opacity=".28" />
      <rect x="40" y="172" width="240" height="10" rx="5" fill="var(--sk-color-muted)" opacity=".22" />
      <rect x="40" y="210" width="270" height="10" rx="5" fill="var(--sk-color-muted)" opacity=".22" />
      <rect x="40" y="232" width="180" height="10" rx="5" fill="var(--sk-color-muted)" opacity=".18" />
      <rect x="560" y="200" width="240" height="220" fill="var(--wl-panel)" />
      <line x1="560" y1="200" x2="560" y2="420" stroke="var(--sk-color-border)" />
      <circle cx="586" cy="228" r="4" fill="var(--sk-color-success)" />
      <rect x="600" y="224" width="70" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".5" />
      <rect x="584" y="258" width="52" height="6" rx="3" fill="var(--sk-color-muted)" opacity=".5" />
      <rect x="584" y="280" width="192" height="26" rx="5" fill="var(--wl-tint-16)" />
      <rect x="596" y="289" width="120" height="8" rx="4" fill="var(--sk-color-accent)" opacity=".7" />
      <rect x="584" y="312" width="192" height="26" rx="5" fill="none" stroke="var(--sk-color-border)" />
      <rect x="596" y="321" width="140" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".5" />
      <rect x="584" y="344" width="192" height="26" rx="5" fill="none" stroke="var(--sk-color-border)" />
      <rect x="596" y="353" width="96" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".5" />
    </svg>
  );
}

/** Firefox: a window with the sidebar button highlighted at the top-left, an
 *  "open the sidebar" annotation pointing up at it, and the panel on the left. */
function FirefoxScene({ callout }: { callout: string }) {
  return (
    <svg viewBox="0 0 800 420" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="0" y="0" width="800" height="420" fill="var(--sk-color-bg)" />
      <rect x="0" y="0" width="800" height="80" fill="var(--wl-panel)" />
      <line x1="0" y1="80" x2="800" y2="80" stroke="var(--sk-color-border)" />
      <path d="M60 80 v-26 a8 8 0 0 1 8-8 h150 a8 8 0 0 1 8 8 v26 z" fill="var(--sk-color-bg)" stroke="var(--sk-color-border)" />
      <rect x="80" y="60" width="96" height="7" rx="3.5" fill="var(--sk-color-muted)" opacity=".45" />
      <circle class="sk-wl__pulse" cx="30" cy="111" r="16" fill="var(--wl-tint-24)" />
      <circle cx="30" cy="111" r="15" fill="none" stroke="var(--sk-color-accent)" stroke-width="1.6" />
      <rect x="22.5" y="103.5" width="15" height="15" rx="3" fill="none" stroke="var(--sk-color-accent)" stroke-width="1.6" />
      <path d="M22.5 106.5a3 3 0 0 1 3-3H29v15h-3.5a3 3 0 0 1-3-3z" fill="var(--sk-color-accent)" opacity=".35" />
      <line x1="29" y1="103.5" x2="29" y2="118.5" stroke="var(--sk-color-accent)" stroke-width="1.6" />
      <rect x="70" y="96" width="700" height="30" rx="15" fill="var(--sk-color-bg)" stroke="var(--sk-color-border)" />
      <rect x="90" y="107" width="150" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".4" />
      <text x="56" y="152" font-family="var(--sk-font-label)" font-size="13" letter-spacing=".04em" fill="var(--sk-color-accent)">
        {callout}
      </text>
      <path d="M54 148 C 44 143, 37 137, 33 128" fill="none" stroke="var(--sk-color-accent)" stroke-width="1.6" stroke-dasharray="3 4" />
      <path d="M33 128 l8.2 1.6 M33 128 l1.8 8.2" fill="none" stroke="var(--sk-color-accent)" stroke-width="1.6" stroke-linecap="round" />
      <rect x="0" y="200" width="240" height="220" fill="var(--wl-panel)" />
      <line x1="240" y1="200" x2="240" y2="420" stroke="var(--sk-color-border)" />
      <circle cx="26" cy="228" r="4" fill="var(--sk-color-success)" />
      <rect x="40" y="224" width="70" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".5" />
      <rect x="24" y="258" width="52" height="6" rx="3" fill="var(--sk-color-muted)" opacity=".5" />
      <rect x="24" y="280" width="192" height="26" rx="5" fill="var(--wl-tint-16)" />
      <rect x="36" y="289" width="120" height="8" rx="4" fill="var(--sk-color-accent)" opacity=".7" />
      <rect x="24" y="312" width="192" height="26" rx="5" fill="none" stroke="var(--sk-color-border)" />
      <rect x="36" y="321" width="140" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".5" />
      <rect x="24" y="344" width="192" height="26" rx="5" fill="none" stroke="var(--sk-color-border)" />
      <rect x="36" y="353" width="96" height="8" rx="4" fill="var(--sk-color-muted)" opacity=".5" />
      <rect x="300" y="230" width="300" height="10" rx="5" fill="var(--sk-color-muted)" opacity=".26" />
      <rect x="300" y="252" width="240" height="10" rx="5" fill="var(--sk-color-muted)" opacity=".2" />
      <rect x="300" y="290" width="270" height="10" rx="5" fill="var(--sk-color-muted)" opacity=".2" />
    </svg>
  );
}
