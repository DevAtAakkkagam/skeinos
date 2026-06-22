// The promise-based WebExtension namespace, reached via `globalThis` so it stays
// test-friendly (a fake `chrome` global keeps working; no ambient extension
// imports). Firefox exposes BOTH `browser` (promise-based) and `chrome`
// (callback-based, Chrome-compat) — awaiting a `chrome.*` call there yields
// `undefined`, which then blows up the moment it is destructured or iterated. So
// we MUST prefer `browser` when present. Chrome exposes only `chrome`, whose MV3
// APIs already return promises, so the fallback is correct there too.
export function extApi<T = unknown>(): T | undefined {
  const g = globalThis as { browser?: unknown; chrome?: unknown };
  return (g.browser ?? g.chrome) as T | undefined;
}
