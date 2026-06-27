// Minimal ambient `chrome` namespace.
//
// WXT already provides the typed, promise-based `browser` global, and the rest of
// the codebase deliberately reaches the WebExtension API through `extApi()`
// (browser ?? chrome) to stay test-friendly and Firefox-safe. The ONE exception is
// `background/injectOpenTabs.ts`, which additionally references `chrome.scripting`
// directly: the Chrome Web Store's automated permission-usage review scans the
// built bundle for a literal `chrome.scripting` namespace access, and the `extApi`
// indirection hides the (genuine) usage — causing `scripting` to be wrongly flagged
// "requested but not used". This declaration types just that single access.
declare const chrome: { scripting?: unknown } | undefined;
