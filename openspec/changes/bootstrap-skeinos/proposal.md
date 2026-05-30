## Why

Skeinos has three thorough planning docs (PRD, TDD, LLD) but no code. Nothing in M1–M8 can begin until the foundation exists: an installable MV3 extension that loads on a host LLM page and can render its own UI without colliding with that page. This change builds that trunk — the build pipeline and the shadow-DOM mount harness — that every later milestone branches off (per LLD §14 critical path: M0 → M1 → M2).

This is the `bootstrap` slice of M0 (LLD tasks **T0.1 + T0.2**). The store (T0.3), messaging (T0.4), and settings (T0.5) are deliberately scoped as separate, independent follow-up changes (decision D8 in `docs/DECISIONS.md`).

## What Changes

- Stand up the repository build with **WXT** (decision D2): TypeScript, MV3, cross-browser packaging targeting Chromium now and Firefox-ready for M6.
- Generate a minimal, least-privilege **MV3 manifest** (service-worker background entry, narrowly scoped host permissions for the P0 platforms, no credential access, no broad permissions).
- Add a **content-script entry** that loads on a host LLM page and logs, proving injection works.
- Build the **shadow-DOM mount harness** (T0.2): a Preact (decision D3) panel mounted inside a shadow root so no host-page CSS bleeds in or out.
- Establish **theme tokens** (light/dark, system-aware) as shadow-DOM-scoped CSS custom properties, plus a small set of **base UI components** that consume them.
- Wire **CI** to build the extension and produce a loadable zip artifact.

Non-goals for this change: any IndexedDB store, the messaging hub, the settings/options page, platform adapters, or any user-facing feature. Those are separate changes.

## Capabilities

### New Capabilities
- `extension-shell`: The installable MV3 extension scaffold — build pipeline (WXT), generated manifest with minimum permissions, background service-worker entry, content-script injection on host pages, and the CI packaging that produces a loadable build.
- `ui-shell`: The in-page presentation foundation — shadow-DOM mount harness providing host-CSS isolation, the light/dark theme-token system, and the base component primitives that all later `ui/*` features build on.

### Modified Capabilities
<!-- None — greenfield; no existing specs in openspec/specs/. -->

## Impact

- **New repo structure** under `extension/` per LLD §3 (`src/background/`, `src/content/`, `src/ui/{components,theme}/`, `manifest`/WXT config).
- **New dependencies**: `wxt`, `preact`, `typescript`, and WXT's build toolchain. No runtime/network dependencies introduced.
- **New CI**: a build job producing a packaged zip.
- **Permissions surface**: the manifest's host-permission list is established here and is security-sensitive — it gates Chrome Web Store review and the privacy-first positioning (PRD §8.3, §8.4). Kept minimal.
- **Downstream**: unblocks the sibling M0 changes (store, messaging, settings) and the M1 adapter framework, all of which mount into or message through this shell.
