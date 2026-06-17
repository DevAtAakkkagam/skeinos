# Adapter contract fixtures

Each platform is proven against the **shared adapter contract suite**
(`tests/adapter-contract.ts`) using a recorded DOM fixture. A fixture is two files:

- `<platform>.html` — a captured HTML snapshot of the host page containing a
  conversation list **and** an open conversation, with the elements the platform's
  config selectors target.
- `<platform>.expected.json` — what the suite asserts the adapter reads from that
  snapshot (see `ContractExpectations` in `tests/adapter-contract.ts`):

  ```jsonc
  {
    "activeUrl": "https://…/chat/<id>",      // URL the active conversation resolves against
    "active": { "nativeId": "…", "title": "…" },
    "conversationCount": 2,                    // must be >= 2 so observe() can be exercised
    "messages": [                              // ordered, role-tagged
      { "role": "user", "text": "…" },
      { "role": "assistant", "text": "…" }
    ],
    "inserted": "…"                            // text inserted into the composer
  }
  ```

## Conventions the suite relies on

- The **active** conversation list item carries `aria-current` (the accessible
  convention chat apps use); `observe()` is exercised by moving that marker. The
  fixture therefore needs at least two conversation items.
- Each conversation item exposes its id via the config's `conversationIdAttr`, its
  title via `conversationTitle`, and (optionally) an `href`.
- The composer matches `selectors.composer`; the send button matches
  `selectors.sendButton`; the mount anchors (`sidebarAnchor`, `inputBarAnchor`) and
  `conversationList` resolve so `selfCheck()` passes.

## Re-capturing a fixture

Fixtures are recorded from the live host (logged in), then trimmed to the relevant
subtree and any account-identifying content scrubbed. When a platform's DOM drifts,
the production **canary** (change `adapter-resilience`) flags it; re-capture the
snapshot, update selectors in the config if needed, and re-run the suite.

> The Claude fixture here is a **representative** snapshot modelling Claude's
> structure (sidebar list + ProseMirror composer). Re-capture from the live site
> before relying on the exact selectors in production.

## Gemini — collapsed-sidebar open question

The `gemini.html` fixture models the **expanded** sidebar: `<conversations-list>`
populated with `/app/<id>` anchors (each wrapping a `.title-text`), the open
conversation's anchor carrying `aria-current="page"`, ordered
`user-query`/`model-response` messages, the Quill `.ql-editor` composer, the
`button[aria-label="Send message"]`, and the `bard-sidenav` / `input-area-v2` mount
anchors. Only framework-stable hooks are used (custom-element tags, `aria-label`s,
`href` prefixes) — never the volatile Angular `ng-tns-*`/`mat-mdc-*` classes.

**Open question (design D / Open Questions):** does `<conversations-list>` (and its
anchors) stay in the DOM while the sidebar is **collapsed**? This was **not**
re-confirmed against the live logged-in site during this change. `conversationList`
is a required selfCheck anchor, so if the list is removed (not just hidden) when the
sidebar collapses, `selfCheck()` reports `conversationList` missing until the user
expands it.

**selfCheck implication / mitigation:** this is the expected degraded path, not a
crash — `waitForSelfCheck` re-probes on DOM mutations within a bounded timeout, and a
genuine miss raises the isolated resilience banner with Retry (no effect on other
tabs). If a live re-capture shows the list is torn down when collapsed, re-anchor
`conversationList` to an always-present ancestor (e.g. `bard-sidenav`) and re-capture
this fixture.
