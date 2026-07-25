// Skeinos platform sanity check.
//
// Drives a real Chrome (persistent profile at ~/.skeinos-sanity/profile, seeded
// with logged-in sessions) against every supported platform and probes the LIVE
// DOM with the exact selectors from src/adapters/configs/*.json — the same single
// source of truth the extension ships. A platform is BROKEN when the page reads
// as signed-in but a required anchor (composer / conversationList / sidebarAnchor
// / inputBarAnchor, honoring listHiddenWhenCollapsed) fails to resolve — the
// precise condition that raises the "Skeinos is paused" banner for users.
//
// On BROKEN platforms it files/updates a GitHub issue (label `sanity-check`,
// deduped per platform) and, if SKEINOS_NTFY_TOPIC is set, pushes a notification
// to that ntfy.sh topic. A signed-out or unreachable platform can't be verified —
// that's a WARN: it notifies (the session needs re-seeding) but files no issue.
//
// ntfy topics are unauthenticated: anyone who knows the name can read and post to
// it. Keep yours out of the repo — export SKEINOS_NTFY_TOPIC with an unguessable
// value (e.g. `skeinos-$(openssl rand -hex 8)`); unset, alerts are simply skipped.
//
// Usage:  node scripts/sanity-check.mjs [--headed] [--no-alert] [--test-alert] [--setup]
//   --headed      run with a visible browser (default: headless)
//   --no-alert    print findings only; skip GitHub + ntfy
//   --test-alert  send a test ntfy message and exit (verifies the subscription;
//                 needs SKEINOS_NTFY_TOPIC)
//   --setup       interactive: opens each platform in a visible browser and waits
//                 for you to log in / clear bot challenges, persisting the session
//                 into the check profile. Run once initially and whenever a
//                 scheduled run reports `signed-out` or `challenge`.
//   --interactive SEMI-AUTOMATED (recommended): launches a NORMAL Chrome (no
//                 automation flags — Google sign-in works, Cloudflare sees a
//                 human) with a local debug port on the check profile. You log
//                 in / clear challenges, press ENTER (or `touch
//                 ~/.skeinos-sanity/continue`), and the script then attaches
//                 over CDP and validates every platform in that same browser.

import { chromium } from 'playwright';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = join(EXT_DIR, '..');
const CONFIG_DIR = join(EXT_DIR, 'src', 'adapters', 'configs');
const STATE_DIR = join(homedir(), '.skeinos-sanity');

/**
 * The browser profile to drive: the Playwright MCP "AI Playwright" Chrome profile
 * (`~/.cache/ms-playwright/mcp-chrome-*`, newest first) — the SAME profile Claude
 * Code's browser sessions use, so logins and Cloudflare clearances stay fresh
 * through normal use and never need separate maintenance. Copying that profile
 * does NOT work (ChatGPT drops copied sessions), so we drive the original; Chrome's
 * profile lock makes concurrent use fail loudly rather than corrupt. Override with
 * SKEINOS_SANITY_PROFILE; falls back to a dedicated profile if no MCP one exists.
 */
function resolveProfileDir() {
  if (process.env.SKEINOS_SANITY_PROFILE) return process.env.SKEINOS_SANITY_PROFILE;
  const mcpRoot = join(homedir(), '.cache', 'ms-playwright');
  try {
    const dirs = readdirSync(mcpRoot)
      .filter((d) => d.startsWith('mcp-chrome-'))
      .map((d) => join(mcpRoot, d))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (dirs.length > 0) return dirs[0];
  } catch {
    /* no MCP profiles — fall through */
  }
  return join(homedir(), '.skeinos-sanity', 'profile');
}
const PROFILE_DIR = resolveProfileDir();
const SHOT_DIR = join(REPO_DIR, '.playwright-screenshots', 'sanity');
// Unauthenticated by design — never hard-code a topic here (see the header note).
const NTFY_TOPIC = process.env.SKEINOS_NTFY_TOPIC ?? '';
const ISSUE_LABEL = 'sanity-check';

/** Where each platform's signed-in home lives (hostMatch is a pattern, not a URL). */
const HOME_URLS = {
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  perplexity: 'https://www.perplexity.ai/',
};

const args = new Set(process.argv.slice(2));
const HEADED = args.has('--headed');
const INTERACTIVE = args.has('--interactive');
const CDP_PORT = 9222;
const CONTINUE_FILE = join(homedir(), '.skeinos-sanity', 'continue');
const ALERT = !args.has('--no-alert');

function loadConfigs() {
  return readdirSync(CONFIG_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(CONFIG_DIR, f), 'utf8')))
    .filter((c) => HOME_URLS[c.platformId]);
}

/** Mirror of the runtime's required-anchor rule (adapters/runtime/adapter.ts). */
function requiredAnchors(config) {
  const all = ['composer', 'conversationList', 'sidebarAnchor', 'inputBarAnchor'];
  return config.behaviors?.listHiddenWhenCollapsed
    ? all.filter((k) => k !== 'conversationList')
    : all;
}

async function probePlatform(context, config) {
  const platform = config.platformId;
  const url = HOME_URLS[platform];
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Give the SPA time to hydrate; the composer is the last thing to mount.
    await page
      .waitForSelector(config.selectors.composer, { timeout: 25_000 })
      .catch(() => {});
    await page.waitForTimeout(3_000);

    const probe = await page.evaluate((selectors) => {
      const counts = {};
      for (const [key, sel] of Object.entries(selectors)) {
        if (typeof sel !== 'string') continue;
        // Attribute names / regex patterns are config values, not CSS selectors.
        if (['conversationIdAttr', 'conversationIdPattern', 'conversationTitleAttr', 'conversationUrlPattern'].includes(key)) continue;
        try {
          counts[key] = document.querySelectorAll(sel).length;
        } catch {
          counts[key] = -1; // malformed selector
        }
      }
      const challenge = !!document.querySelector(
        'iframe[src*="challenges.cloudflare.com"], script[src*="challenges.cloudflare.com"], [name="cf-turnstile-response"]',
      );
      return { counts, url: location.href, title: document.title, challenge };
    }, config.selectors);

    const missing = requiredAnchors(config).filter((k) => !probe.counts[k]);
    const signedIn = config.selectors.authedMarker ? probe.counts.authedMarker > 0 : true;
    const signedOut = config.selectors.signedOutMarker ? probe.counts.signedOutMarker > 0 : false;

    let status = 'ok';
    if (missing.length > 0) {
      // A bot challenge means WE were blocked, not that the selectors broke —
      // report it distinctly (headless is detected; run headed / under xvfb).
      if (probe.challenge) status = 'challenge';
      else status = signedIn && !signedOut ? 'broken' : 'signed-out';
    }

    if (status !== 'ok') {
      mkdirSync(SHOT_DIR, { recursive: true });
      await page.screenshot({
        path: join(SHOT_DIR, `${platform}-${new Date().toISOString().slice(0, 10)}.png`),
        fullPage: false,
      });
    }
    return { platform, url, status, missing, signedIn, counts: probe.counts, configVersion: config.configVersion };
  } catch (err) {
    return { platform, url, status: 'error', missing: [], signedIn: false, counts: {}, configVersion: config.configVersion, error: String(err).slice(0, 300) };
  } finally {
    await page.close().catch(() => {});
  }
}

function sh(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', cwd: REPO_DIR, ...opts }).trim();
}

function notify(title, body, priority = 'high') {
  if (!NTFY_TOPIC) {
    console.error('[sanity] SKEINOS_NTFY_TOPIC unset — skipping push notification.');
    return;
  }
  try {
    sh('curl', [
      '-s', '-m', '20',
      '-H', `Title: ${title}`,
      '-H', `Priority: ${priority}`,
      '-H', 'Tags: rotating_light',
      '-d', body,
      `https://ntfy.sh/${NTFY_TOPIC}`,
    ]);
  } catch (err) {
    console.error('[sanity] ntfy failed:', String(err).slice(0, 200));
  }
}

function fileIssue(broken, results) {
  const platforms = broken.map((r) => r.platform).join(', ');
  const body = [
    `Automated sanity check found broken selectors on: **${platforms}**`,
    '',
    'Run: `node extension/scripts/sanity-check.mjs --headed --no-alert` to reproduce.',
    '',
    ...broken.map((r) =>
      [
        `### ${r.platform} (config ${r.configVersion})`,
        `- URL probed: ${r.url}`,
        `- Missing required anchors: ${r.missing.map((m) => `\`${m}\``).join(', ')}`,
        '- Selector counts:',
        '```json',
        JSON.stringify(r.counts, null, 2),
        '```',
      ].join('\n'),
    ),
    '',
    '<details><summary>Full run results</summary>',
    '',
    '```json',
    JSON.stringify(results, null, 2),
    '```',
    '</details>',
  ].join('\n');

  try {
    sh('gh', ['label', 'create', ISSUE_LABEL, '--description', 'Automated platform sanity check', '--color', 'D73A4A', '--force']);
    const open = JSON.parse(
      sh('gh', ['issue', 'list', '--state', 'open', '--label', ISSUE_LABEL, '--json', 'number,title']),
    );
    const existing = open.find((i) => broken.some((r) => i.title.includes(r.platform)));
    if (existing) {
      sh('gh', ['issue', 'comment', String(existing.number), '--body', `Still broken as of ${new Date().toISOString()}.\n\n${body}`]);
      return `updated existing issue #${existing.number}`;
    }
    const out = sh('gh', ['issue', 'create',
      '--title', `Sanity check: ${platforms} selectors broken`,
      '--label', ISSUE_LABEL,
      '--body', body,
    ]);
    return `created ${out}`;
  } catch (err) {
    console.error('[sanity] gh issue failed:', String(err).slice(0, 300));
    return 'issue creation FAILED (see log)';
  }
}

function cdpAlive() {
  return new Promise((resolve) => {
    const req = httpGet({ host: '127.0.0.1', port: CDP_PORT, path: '/json/version', timeout: 1500 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/** Launch a PLAIN Chrome (no automation flags) on the check profile with a local
 *  debug port. Sign-in flows (incl. Google) and Cloudflare behave as for a human;
 *  the script only attaches AFTER the user says go. */
async function openInteractiveBrowser() {
  const child = spawn(
    'google-chrome',
    [
      `--user-data-dir=${PROFILE_DIR}`,
      `--remote-debugging-port=${CDP_PORT}`,
      '--window-size=1440,900',
      ...Object.values(HOME_URLS),
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await cdpAlive()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    'debug endpoint never came up — another Chrome window is probably using this profile; close it and retry',
  );
}

/** Block until the user presses ENTER (foreground run) or touches CONTINUE_FILE
 *  (when the script was started without a usable stdin). */
function waitForUserGo() {
  rmSync(CONTINUE_FILE, { force: true });
  console.log('\n[sanity] Browser is open. Log into all platforms / clear any challenges.');
  console.log(`[sanity] Then press ENTER here — or run: touch ${CONTINUE_FILE}\n`);
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (existsSync(CONTINUE_FILE)) done();
    }, 2000);
    const onData = () => done();
    function done() {
      clearInterval(timer);
      process.stdin.off('data', onData);
      try { process.stdin.pause(); } catch { /* no tty */ }
      rmSync(CONTINUE_FILE, { force: true });
      resolve();
    }
    try { process.stdin.on('data', onData); process.stdin.resume(); } catch { /* no tty */ }
  });
}

async function setup() {
  const configs = loadConfigs();
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'],
  });
  const page = await context.newPage();
  for (const config of configs) {
    const url = HOME_URLS[config.platformId];
    console.log(`[setup] ${config.platformId}: opening ${url} — log in / clear any challenge…`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    // Signed in and hydrated = composer AND authed marker both present.
    const ready = `${config.selectors.composer}${config.selectors.authedMarker ? `, ${config.selectors.authedMarker}` : ''}`;
    const ok = await page
      .waitForFunction(
        ([composerSel, authedSel]) =>
          document.querySelector(composerSel) && (!authedSel || document.querySelector(authedSel)),
        [config.selectors.composer, config.selectors.authedMarker ?? ''],
        { timeout: 300_000 },
      )
      .then(() => true)
      .catch(() => false);
    console.log(`[setup] ${config.platformId}: ${ok ? 'session ready' : `TIMED OUT waiting for ${ready}`}`);
  }
  await context.close();
  console.log('[setup] done — run `node scripts/sanity-check.mjs --no-alert` to verify.');
}

async function main() {
  if (args.has('--setup')) return setup();
  if (args.has('--test-alert')) {
    notify('Skeinos sanity check — test', 'Subscription works. Real alerts will look like this.', 'default');
    if (NTFY_TOPIC) console.log(`[sanity] test notification sent to ntfy.sh/${NTFY_TOPIC}`);
    return;
  }

  const configs = loadConfigs();
  console.log(`[sanity] profile: ${PROFILE_DIR}`);
  let context;
  let cdpBrowser = null;
  if (INTERACTIVE) {
    await openInteractiveBrowser();
    await waitForUserGo();
    cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    context = cdpBrowser.contexts()[0];
    console.log('[sanity] attached — validating (tabs will open and close briefly)…');
  } else try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: !HEADED,
      viewport: { width: 1440, height: 900 },
      // Drop the automation banner flag so the fingerprint matches the plain-Chrome
      // sessions where logins/clearances were established (navigator.webdriver stays
      // false, as in normal use of this profile). We monitor our own accounts, daily.
      ignoreDefaultArgs: ['--enable-automation'],
    });
  } catch (err) {
    // Most likely the profile is locked by a live Claude Code browser session —
    // skip this run rather than fight over the profile.
    console.error('[sanity] could not open profile (in use by an MCP session?):', String(err).slice(0, 200));
    if (ALERT) notify('Skeinos sanity check skipped', 'Browser profile is in use (MCP session open?). Will retry on the next scheduled run.', 'default');
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const config of configs) {
    const r = await probePlatform(context, config);
    results.push(r);
    console.log(`[sanity] ${r.platform}: ${r.status}${r.missing.length ? ` (missing: ${r.missing.join(', ')})` : ''}`);
  }
  if (cdpBrowser) {
    await cdpBrowser.close(); // connected browser: disconnects, leaves the window running
    console.log('[sanity] detached — the browser window is yours to keep or close.');
  } else {
    await context.close();
  }

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(join(STATE_DIR, 'last-run.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));

  const broken = results.filter((r) => r.status === 'broken');
  const attention = results.filter((r) => ['signed-out', 'error', 'challenge'].includes(r.status));

  if (ALERT && broken.length > 0) {
    const issueNote = fileIssue(broken, results);
    notify(
      `Skeinos BROKEN on ${broken.map((r) => r.platform).join(', ')}`,
      broken.map((r) => `${r.platform}: missing ${r.missing.join(', ')}`).join('\n') + `\nGitHub: ${issueNote}`,
    );
  }
  if (ALERT && attention.length > 0) {
    notify(
      `Skeinos sanity check needs attention`,
      attention.map((r) => `${r.platform}: ${r.status}${r.error ? ` — ${r.error}` : ''} (re-seed login? see runbook)`).join('\n'),
      'default',
    );
  }
  if (broken.length === 0 && attention.length === 0) {
    console.log('[sanity] all platforms OK');
  }
  process.exitCode = broken.length > 0 ? 2 : attention.length > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('[sanity] fatal:', err);
  if (ALERT) notify('Skeinos sanity check crashed', String(err).slice(0, 500));
  process.exitCode = 3;
});
