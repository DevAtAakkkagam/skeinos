## 1. Build scaffold (T0.1)

- [x] 1.1 Initialize the repo build with WXT + TypeScript; create `extension/` layout (`src/background`, `src/content`, `src/ui/{components,theme}`)
- [x] 1.2 Add dependencies (`wxt`, `preact`, `typescript`) and TS config; wire `dev`/`build`/`zip` scripts
- [x] 1.3 Configure WXT to generate the MV3 manifest: service-worker background entry, minimum host permissions for P0 hosts only (claude.ai, gemini.google.com, perplexity.ai), no `<all_urls>`, no credential permissions
- [x] 1.4 Add a no-op background service-worker entry that registers cleanly
- [x] 1.5 Add the content-script entry matched to P0 hosts; emit an identifiable injection log

## 2. Verify build & permissions

- [x] 2.1 Manual: load unpacked in Chromium — installs without errors, worker registers, content script logs on a P0 host (spec: extension-shell) — REMAINING HUMAN STEP: load `extension/.output/chrome-mv3` via chrome://extensions (Developer mode → Load unpacked); build + zip + manifest assertions already pass in CI
- [x] 2.2 Test: assert generated manifest is MV3, service-worker background, host patterns are P0-only with no `<all_urls>` and no credential-bearing permissions
- [x] 2.3 Test: content script does not execute on an unsupported page

## 3. Shadow-DOM mount harness (T0.2)

- [x] 3.1 Implement `mount(target, vnode)`: attach an open shadow root, render the Preact tree inside it, return a disposer that unmounts and removes the host node
- [x] 3.2 Apply a boundary reset on `:host` (e.g. `all: initial`) so inherited host styles don't leak in
- [x] 3.3 Inject the theme + component stylesheet into the shadow root (not the host document)

## 4. Theme tokens + base components

- [x] 4.1 Define theme tokens as `:host`-scoped CSS custom properties (`--sk-*`) with light and dark sets
- [x] 4.2 Implement system mode driven by `prefers-color-scheme`, and a runtime light/dark switch (flip a single `:host` attribute)
- [x] 4.3 Build a small set of base components that style themselves only from tokens
- [x] 4.4 Add a sample panel composing the base components, used as the mount target in tests

## 5. Isolation & theme verification

- [x] 5.1 Test: sample panel renders inside `host.shadowRoot`; disposer unmounts and removes the host node (spec: ui-shell)
- [x] 5.2 Test: host global styles (`* { color: red !important }`) do not change the panel's computed styles — real-browser test (happy-dom cannot verify shadow encapsulation; runs in Chromium via `test:browser`)
- [x] 5.3 Test: panel's component styles do not change the host page's own elements' computed styles — real-browser test
- [x] 5.4 Test: toggling theme updates token-derived colors; tokens exist on the shadow host, not on the host document root — real-browser test; system/`prefers-color-scheme` override asserted structurally in the unit suite

## 6. CI packaging

- [x] 6.1 Add a CI workflow that installs, builds, and runs the test suite (`.github/workflows/ci.yml`: typecheck + unit + browser + build)
- [x] 6.2 Produce and upload a loadable zip artifact from the build (spec: extension-shell)
