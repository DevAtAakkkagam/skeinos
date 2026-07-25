# Contributing to Skeinos

Thanks for being here. This project has a small, unusually well-defined surface for
outside contributions, so it's worth saying up front where the leverage is.

**The single most useful thing you can do is fix or add a platform.** Every chat site
Skeinos supports is *one JSON file of CSS selectors* — no code. When Claude or ChatGPT
rewrites their DOM, that site's panel breaks until someone updates a few strings. If you
noticed it broke, you are already most of the way to fixing it, and you do not need to
understand the rest of the codebase to do it.

- [A site broke — how do I fix it?](#a-site-broke) ← start here
- [Add a new platform](#add-a-new-platform) (Grok, DeepSeek, Mistral, …)
- [Everything else](#everything-else)

---

## Setup

```bash
git clone https://github.com/DevAtAakkkagam/skeinos.git
cd skeinos/extension
npm install
npm run dev              # WXT dev server, Chrome; `npm run dev:firefox` for Firefox
```

All commands run from `extension/` — it's the only npm package in the repo.

```bash
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .   (lint:fix to autofix)
npm test                 # Vitest, happy-dom
npm run test:browser     # real-Chromium tests; needs a local Chrome
npm run test:all
```

Before opening a PR: `npm run typecheck && npm run lint && npm test`.

---

<a id="a-site-broke"></a>
## A site broke — how do I fix it?

When a site changes its layout, Skeinos notices, disables that one panel, and shows a
banner naming what it couldn't find. The other sites keep working. Fixing it is a
four-step loop.

### 1. Find out which selector broke

The banner names the missing anchors. If you want the detail, open the failing site with
the extension loaded and check the console for the self-check result — it lists missing
selector keys by name (`composer`, `conversationList`, …).

### 2. Find the new selector on the live site

Open the site, devtools, and find a stable hook for the thing that moved.

**Pick selectors in this order of preference:**

1. `[data-testid="…"]` or any other explicit test/automation attribute — most stable.
2. Custom element tag names (`<conversations-list>`, `<user-query>`) — stable in
   Angular/Lit apps.
3. Structural attributes that describe identity (`[data-row-key^="chat:"]`, an `href`
   prefix like `/c/`).
4. Framework-agnostic semantic hooks (`aside`, `fieldset`, `role=`).

**Never use** — these are rejected by an automated guard (`tests/adapter-selector-guard.test.ts`)
and your PR will fail CI:

- **Matching on an `aria-label` value** (`[aria-label="Send message"]`). Localized —
  it breaks the moment a user's UI is in German. This has broken the extension before.
- **Text-content pseudo-classes** (`:contains(…)`, `:has-text(…)`). Same reason.
- **Hardcoded auth/route URLs** (`[href*="/login"]`). Login-state dependent.

Also avoid generated/hashed classes (`.ng-tns-c12-3`, `.css-1a2b3c`, Tailwind soup) —
they change on every deploy of the host site.

> The `sendButton` selector is exempt from the guard, deliberately. The overlay never
> auto-submits, so it isn't a runtime path — the reasoning is written out at the top of
> `tests/adapter-selector-guard.test.ts`.

### 3. Update the config

Configs live in [`extension/src/adapters/configs/`](extension/src/adapters/configs/) —
`claude.json`, `chatgpt.json`, `gemini.json`, `perplexity.json`. Edit the one selector
that moved and bump `configVersion` (semver; a selector fix is a patch bump).

```jsonc
{
  "platformId": "claude",
  "configVersion": "2.0.1",              // ← bump this
  "hostMatch": ["*://claude.ai/*"],
  "selectors": {
    "conversationList": "aside.dframe-sidebar",
    "composer": "[data-testid=\"chat-input\"]",
    // …
  },
  "behaviors": { "insertMode": "react-set", "submitMode": "enter" }
}
```

### 4. Re-record the fixture and run the tests

Each platform is proven against a recorded DOM snapshot, so tests catch the break without
anyone being logged in.

```bash
npm test -- tests/adapter-claude.test.ts
```

If your selector change means the old snapshot no longer represents the site, re-record it:

1. On the live site (logged in), with **a conversation list showing at least two chats**
   and **one conversation open**, copy the relevant DOM subtree.
2. Save it to `extension/tests/fixtures/<platform>.html`, trimmed to the relevant subtree.
3. **Scrub it.** Remove your real conversation titles, message text, name, email, avatar
   URLs, and any account identifiers. Replace them with obvious placeholder text. Fixtures
   are public forever — treat this step as the important one.
4. Update `<platform>.expected.json` to match the placeholder content you used.

`extension/tests/fixtures/README.md` documents the fixture format and the conventions the
shared contract suite relies on (notably: the active conversation item must carry
`aria-current`, and there must be ≥2 conversation items so change-observation is exercised).

### 5. Open the PR

Include: which site, what visibly broke, the old selector and the new one, and roughly
when the site changed. A screenshot of the working panel is welcome but not required.

Selector fixes are the PRs that get merged fastest here.

---

<a id="add-a-new-platform"></a>
## Add a new platform

Grok, DeepSeek, and Mistral are wanted and unclaimed. A new platform is **a config plus a
fixture — never new code.** If you find yourself needing to write TypeScript to support a
site, that's a design conversation worth opening an issue about first.

1. **Open an issue first** so two people don't record the same fixture twice.
2. Add the platform id to `PlatformId` in `extension/src/shared/types.ts`.
3. Write `extension/src/adapters/configs/<platform>.json` and register it in
   `configs/index.ts`. Host permissions are derived automatically from your config's
   `hostMatch` — there is no second list to update, by design.
4. Record `extension/tests/fixtures/<platform>.html` + `.expected.json` (scrubbed — see
   step 4 above).
5. Add `extension/tests/adapter-<platform>.test.ts`, copying an existing one. It should
   validate the config, run the shared contract suite (`runAdapterContract`) against your
   fixture, and assert self-check fails cleanly on a broken fixture.
6. Run `npm run test:all`.

### The selector keys you need to fill in

| Key | What it points at |
| --- | --- |
| `conversationList` | The container holding the chat list (also a self-check anchor) |
| `conversationItem` | One chat row within it |
| `conversationTitle` | The title element inside a row |
| `conversationIdAttr` + `conversationIdPattern` | Attribute carrying the chat's native id, and a regex to extract it |
| `conversationUrlPattern` | Regex extracting the chat id from the page URL |
| `messageUser` / `messageAssistant` | Rendered messages, by role |
| `composer` | The input the user types into |
| `sendButton` | The send control (exempt from the i18n guard) |
| `sidebarAnchor` / `inputBarAnchor` | Where the Skeinos panel and input bar mount |
| `authedMarker` | An element present only when signed in — lets Skeinos stay quiet when signed out instead of showing a false breakage banner |
| `signedOutMarker` | Optional inverse of the above |

And `behaviors`: `insertMode` (`react-set` \| `execCommand` \| `paste` — how text is
committed into that composer) and `submitMode` (`enter` \| `click`).

---

## Everything else

Bug fixes, accessibility, i18n, and UI work are all welcome. A few rules the codebase
enforces, so you're not surprised by a failing check:

- **Privacy is a hard boundary, not a preference.** Conversation content, the search
  index, and comparisons never leave the device, on any tier. No telemetry, no analytics,
  no crash reporting — a PR adding any of these will not be merged regardless of how it's
  gated. If a change needs a new network request, open an issue first.
- **Minimum permissions.** Never `<all_urls>`, never credential-bearing permissions. A new
  host permission arrives only with the adapter that needs it.
- **The service worker is the only writer.** Content scripts and UI never touch storage
  directly; they message the worker. And assume the worker cold-starts on every event —
  register listeners synchronously at top level, keep durable state in IndexedDB, use
  `chrome.alarms` rather than `setTimeout`.
- **All UI mounts in a shadow root** and styles only from `--sk-*` tokens. No host
  classes, no hardcoded colors.
- **No hardcoded user-facing strings.** Add a key to `extension/src/locales/en.ts` and read
  it via `t()` / `useT()`. A lint rule and a catalog-completeness test enforce this. If you
  speak German, Spanish, French, or Portuguese, translating your new key in those catalogs
  is appreciated but not required.
- **Keyboard-operable and ARIA-labelled**, targeting WCAG 2.2 AA. `prefers-reduced-motion`
  is honored as a first-class path.

These rules are summarized here; the reasoning behind each one lives with the change that
introduced it, under [`openspec/`](openspec/). A capability's current contract is
`openspec/specs/<capability>/spec.md`, and `openspec/changes/archive/` keeps the proposal
and design note that argued for it. If you're unsure whether a rule applies to what you're
building, open an issue and ask — that's faster than guessing.

## Reporting bugs and security issues

Bugs and platform breakage: [open an issue](https://github.com/DevAtAakkkagam/skeinos/issues/new/choose).

Security or privacy vulnerabilities: **please don't open a public issue** — see
[SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contributions are licensed under
[GPL-3.0](LICENSE), the same as the project.
