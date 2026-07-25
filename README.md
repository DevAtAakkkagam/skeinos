<div align="center">

<img src="website/assets/icon-app.svg" width="72" alt="">

# Skeinos

**Folders, search, and a prompt library across Claude, ChatGPT, Gemini, and Perplexity.**

Your chats stay on your device. No account, no telemetry, no analytics.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-install-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/skeinos/kaajkklgkepoeoelogkdpkenjoihobdj)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-install-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/skeinos/)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

</div>

---

## The problem

You worked out a tricky migration with an assistant last week. You don't remember
which one. None of the four sites has real folders, and each one's search only
looks inside its own history.

Skeinos is a browser extension that puts one organization layer over all of them.

## What it does

- **Folders and tags** — nested folders with colors and icons, drag chats in, pin
  what matters, archive the rest. Per-site history stays untouched.
- **One search across every site** — search titles and message text across all four
  platforms at once, filter by site, folder, tag, or date, and jump straight there.
- **A prompt library** — save prompts with fill-in blanks (`{{topic}}`) and drop them
  into any site's composer with `Ctrl+/` (`⌘/`).
- **Instruction profiles** — save your go-to system instructions and switch between
  them in one tap, on any site.

It renders as a panel on the page you're already on. There is nothing new to log into.

## Privacy — the part you can check

Skeinos is local-first because it is the whole point of the project, not a feature bullet.

- **Your conversation content has no network path out of the browser.** Titles, message
  text, folders, tags, prompts, and the search index live in IndexedDB on your machine.
- **No account, no sign-in, no server-side state.** There is nothing to log into and
  nothing of yours on a server.
- **No telemetry, no analytics, no crash reporting.** Not opt-in, not off-by-default —
  none, in any build.
- **In normal use it makes no network requests at all.** There is exactly one exception,
  and it carries nothing of yours: when a chat site changes its layout and Skeinos
  detects its own selectors have stopped working, it fetches a corrected selector file —
  a plain `GET https://skeinos.aakkagam.com/adapters/<platform>.json`, no request body,
  no identifiers, no cookies, no query parameters. It's how a broken site gets fixed the
  same day instead of waiting on a store review. A healthy site never triggers it
  (`hotfixWanted` is false until a self-check fails), and the extension works fully
  offline without it by falling back to the bundled configs. See
  [`loader.ts`](extension/src/adapters/runtime/loader.ts) and
  [`resilience/health.ts`](extension/src/adapters/resilience/health.ts).
- **Minimum permissions.** `alarms`, `sidePanel`, `scripting`, `storage`, plus host
  access to exactly the four chat sites — derived automatically from the shipped
  adapter configs, so the list cannot drift. No `<all_urls>`, no `tabs`, no
  `activeTab`, no credential-bearing permissions. The reasoning for every single one is
  written out in [`extension/src/manifest.config.ts`](extension/src/manifest.config.ts).

**How to verify all of this yourself**, without taking anyone's word for it:

```bash
# 1. Every outbound request in the source. Should be the one config fetch, nothing else.
grep -rn "fetch(\|XMLHttpRequest\|sendBeacon\|WebSocket" extension/src

# 2. Then watch it run: load the extension, open devtools → Network, and use it.
```

Full detail in [`docs/PRIVACY.md`](docs/PRIVACY.md).

## Supported platforms

| Platform | Status | Config |
| --- | --- | --- |
| Claude | Supported | [`claude.json`](extension/src/adapters/configs/claude.json) |
| ChatGPT | Supported | [`chatgpt.json`](extension/src/adapters/configs/chatgpt.json) |
| Gemini | Supported | [`gemini.json`](extension/src/adapters/configs/gemini.json) |
| Perplexity | Supported | [`perplexity.json`](extension/src/adapters/configs/perplexity.json) |
| Grok, DeepSeek, Mistral | Not yet — [contributions very welcome](CONTRIBUTING.md#add-a-new-platform) | — |

Each platform is **one JSON file of CSS selectors**, not code. That means two things:

- When a site rewrites its DOM, only that site's panel is affected. It self-checks,
  fails, disables itself with a banner, and the other three keep working.
- Fixing it — or adding a whole new site — is a small, self-contained pull request that
  does not require understanding the rest of the codebase. See
  **[a site broke, how do I fix it?](CONTRIBUTING.md#a-site-broke)**

## Install

**From a store** — [Chrome](https://chromewebstore.google.com/detail/skeinos/kaajkklgkepoeoelogkdpkenjoihobdj) ·
[Firefox](https://addons.mozilla.org/en-US/firefox/addon/skeinos/)

**From source:**

```bash
cd extension
npm install
npm run build              # or: npm run build:firefox
```

Then load `extension/.output/chrome-mv3/` at `chrome://extensions` with Developer mode on.
For Firefox, `npm run build:firefox` and load the generated `manifest.json` from the
matching `extension/.output/firefox-*/` directory at `about:debugging`.

## How it works

```
Content script (per chat tab)  ──typed messages──▶  Service worker
  · platform adapter: reads/writes the                · the single writer
    host DOM from a JSON selector config               · owns IndexedDB
  · shadow-DOM Preact panel                            · search index, settings
```

Three rules that shape everything:

1. **The service worker is the only writer.** Content scripts never touch storage
   directly — they message the worker. Multi-tab state stays consistent.
2. **No memory-only state in the worker.** MV3 kills it after ~30s idle, so all durable
   state lives in IndexedDB and the worker rehydrates on wake.
3. **Platform adapters are config-driven and isolated.** One generic adapter plus a JSON
   config per site; a broken site disables only its own panel.

Built with [WXT](https://wxt.dev/), Preact, and TypeScript. The UI mounts in a shadow
root so the host page's CSS can't reach it, and styles only from `--sk-*` tokens.
Available in English, German, Spanish, French, and Portuguese.

For the full design: [`docs/LLD_Multi_LLM_Workspace.md`](docs/LLD_Multi_LLM_Workspace.md)
(implementation-level design) and [`docs/DECISIONS.md`](docs/DECISIONS.md) (the decision log).

## Development

```bash
cd extension
npm run dev            # WXT dev server (Chrome); dev:firefox for Firefox
npm run typecheck      # tsc --noEmit
npm run lint
npm test               # Vitest, happy-dom
npm run test:browser   # real-Chromium tests (needs local Chrome)
npm run test:all
```

## Contributing

Yes please — especially selector fixes and new platforms, which are the highest-value
and lowest-context contributions here. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GPL-3.0](LICENSE). If you distribute a modified version, it stays open too.
