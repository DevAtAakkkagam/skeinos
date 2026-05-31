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
