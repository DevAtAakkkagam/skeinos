// Content-script logic home. For bootstrap it only signals successful injection
// on a supported host page; mounting UI and talking to the worker come later.
export function runContent(): void {
  console.log('[Skeinos] content script injected on', location.host);
}
