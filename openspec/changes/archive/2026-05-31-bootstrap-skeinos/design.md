## Context

Skeinos is a greenfield browser extension that overlays an organization/search/prompt layer onto LLM chat sites (PRD §1). This change implements the `bootstrap` slice of M0 — LLD tasks T0.1 (build) and T0.2 (shadow-DOM mount harness) — which is the trunk of the LLD critical path (M0 → M1 → M2). The hard constraints come straight from the planning docs and the locked decisions in `docs/DECISIONS.md`:

- **Manifest V3, minimum permissions** (PRD §10, §8.3–8.4; TDD §1.1). Host permissions are security-sensitive and gate store review.
- **Host-CSS isolation** — the injected UI must not bleed styles in or out of the host page (TDD §3.3).
- **200ms UI render budget** and **<5% added page-load** (PRD §8.1) — favours a tiny runtime and lazy mounting.
- **Sustainable for one part-time maintainer** (PRD §10) — boring, proven tooling; cross-platform work done once.

Locked decisions this design implements: **WXT** (D2), **Preact + TS** (D3), shadow-DOM overlay (D3). Store/messaging/settings are out of scope (D8).

## Goals / Non-Goals

**Goals:**
- An installable MV3 extension that loads in Chrome, with a content script that injects on a P0 host page and logs.
- A reusable shadow-DOM mount harness that renders a Preact panel with zero host-CSS bleed (verified both directions).
- Light/dark theme tokens scoped to the shadow root, system-aware, with a small set of base components consuming them.
- CI that builds the extension and emits a loadable zip.
- A repo layout (LLD §3) and WXT config that the sibling M0 changes and M1 adapters slot into cleanly.

**Non-Goals:**
- IndexedDB store / `Repo<T>` (T0.3 — separate change).
- Messaging hub (T0.4 — separate change).
- Settings store / options page (T0.5 — separate change).
- Any platform adapter, sidebar feature, search, or prompt logic (M1+).
- Firefox build verification — the toolchain is chosen to make it near-free at M6, but it is not exercised here.

## Decisions

### D-1: WXT as the build/packaging framework
Generates per-browser MV3 manifests, gives near-free Firefox parity (M6), and provides content-script HMR — the most leverage for a solo maintainer.
- *Alternatives:* Vite+CRXJS (thinner, but manual Firefox MV3 quirks); plain Vite + hand-rolled manifest (most boilerplate). Rejected for higher ongoing maintenance.

### D-2: Preact + TypeScript for the in-page UI
~4KB runtime, React-compatible API — comfortably fits the 200ms budget for an injected overlay.
- *Alternatives:* Svelte (tiny output, but contradicts the TDD and adds a compiler convention); React (larger runtime, overkill here). See D3 in DECISIONS.md.

### D-3: One reusable mount harness, not per-feature mounting
A single `mount(target, vnode)` helper attaches a shadow root (`mode: 'open'`), injects the theme stylesheet + component CSS into that root, and renders the Preact tree inside it. Every later `ui/*` feature (sidebar, search overlay, input bar) reuses this one harness rather than each re-solving isolation.
- *Rationale:* keeps CSS isolation correct in exactly one place; matches TDD §3.3 "rendered in a Shadow DOM root."

### D-4: `mode: 'open'` shadow root
Open mode lets tests (and our own code) reach in via `host.shadowRoot` to assert isolation and drive E2E. The isolation guarantee comes from the shadow boundary itself, not from hiding the root; closed mode would only impede testing.

### D-5: Theme tokens as shadow-scoped CSS custom properties
Tokens (`--sk-color-*`, spacing, radius) are declared on the shadow root's `:host`, with light/dark sets and a `system` mode driven by `prefers-color-scheme`. Components reference only tokens, never raw values.
- *Rationale:* scoping to `:host` (not `:root`) keeps tokens out of the host page; sets up T0.5's theme toggle to flip a single attribute later.

### D-6: Minimum host permissions, P0 hosts only
The manifest requests host permissions for the P0 launch platforms only (claude.ai, gemini.google.com, perplexity.ai per PRD §5) — no `<all_urls>`, no `tabs` beyond what injection needs, no credential-bearing permissions. P1/P2 hosts are added in their own milestones.
- *Rationale:* PRD §8.3–8.4 privacy-first + store review; smaller surface is easier to justify.

### D-7: Repo layout per LLD §3, scaffolded but not over-built
Create `extension/src/{background,content,ui/{components,theme}}` now; leave `core/`, `adapters/`, and feature `ui/*` folders to the changes that fill them. Background entry exists but does nothing beyond proving the worker registers.

## Risks / Trade-offs

- **Shadow DOM doesn't isolate everything** (fonts via `@font-face`, some inherited properties, `z-index` stacking against host) → Mount with an explicit reset on `:host`, set `all: initial` at the boundary, and verify both bleed directions in the T0.2 test rather than assuming.
- **WXT framework lock-in / convention cost** → Accepted; the Firefox-parity and manifest-generation savings outweigh it for a part-time maintainer, and WXT sits on Vite so escape hatches exist.
- **MV3 service-worker lifecycle** (worker killed after ~30s idle) is the project's central constraint, but this change holds no durable state, so it's a non-issue here — flagged so the store/messaging changes design for rehydration from day one.
- **Host pages are SPAs that re-render and can remove our mount node** → Out of scope for bootstrap (the adapter `observe()` in M1 handles re-mounting); the harness only needs to mount/unmount cleanly and expose a disposer.
- **Manifest permission creep** as platforms are added → Establish the minimal P0 list here as the baseline; each new host is an explicit, reviewable manifest addition in its own change.

## Migration Plan

Greenfield — no migration. Rollback is trivial (revert the change; nothing is persisted or deployed to users yet). The deliverable is a locally loadable unpacked extension + CI zip, not a store release.

## Open Questions

- Exact WXT config shape for dual Chromium/Firefox targets — settle during implementation; does not affect the spec'd behavior.
- Whether base components are hand-rolled or pull from a primitives library — default to hand-rolled minimal set now to keep the bundle small; revisit if the component surface grows.
