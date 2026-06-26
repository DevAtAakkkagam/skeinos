// Live, console-callable adapter diagnostics. The breakage banner ("Skeinos is
// paused on this page") is raised whenever `classify()` returns `breakage` — a
// signed-in page with a missing REQUIRED anchor (see `runtime/adapter.ts`). When
// that happens the only field signal is a single `console.warn` with the missing
// anchor keys. This re-probes the LIVE DOM on demand and reports, per selector,
// what actually resolves — turning "why is it paused?" into one console call:
//
//     window.__skeinos.diagnose()                 // full report object
//     console.table(window.__skeinos.diagnose().selectors)   // per-selector grid
//
// It is read-only (querySelector only — never writes the page or storage) and is
// attached in every build (no dev gate) so a real install can be inspected in the
// field. It holds only the adapter + config already in scope, so it adds no new
// permissions and no durable state.

import {
  type AdapterConfig,
  type AdapterSelectors,
  type PlatformAdapter,
  type PlatformId,
  type Readiness,
  REQUIRED_ANCHORS,
} from '../types';

type Root = Document | HTMLElement;

/** The `AdapterSelectors` keys that are CSS selectors (probeable with
 *  `querySelector`). The remaining keys are an attribute name (`conversationIdAttr`,
 *  `conversationTitleAttr`) or a regex (`conversationUrlPattern`) and are reported
 *  separately as raw values, never queried. */
const SELECTOR_KEYS = [
  'conversationList',
  'conversationItem',
  'conversationTitle',
  'messageUser',
  'messageAssistant',
  'composer',
  'sendButton',
  'sidebarAnchor',
  'inputBarAnchor',
  'authedMarker',
] as const satisfies readonly (keyof AdapterSelectors)[];

const REQUIRED = new Set<string>(REQUIRED_ANCHORS);

/** One selector's live resolution against the page. */
export interface SelectorProbe {
  /** The config key (e.g. `composer`). */
  key: string;
  /** The CSS selector string the key maps to. */
  selector: string;
  /** How many nodes the selector matched right now. */
  count: number;
  /** `count > 0`. */
  resolved: boolean;
  /** Whether a miss here can raise the banner (one of `REQUIRED_ANCHORS`). */
  required: boolean;
  /** The first matched element, for inspection (null when none). */
  sample: Element | null;
}

/** The full picture `diagnose()` returns: the readiness verdict plus the live
 *  per-selector evidence behind it. */
export interface AdapterDiagnostics {
  platform: PlatformId;
  configVersion: string;
  url: string;
  /** The classification driving the overlay (`breakage` ⇒ banner). */
  readiness: Readiness;
  selfCheckOk: boolean;
  /** REQUIRED selector keys that did not resolve — the banner's root cause. */
  missing: string[];
  /** Whether the page reads as signed in (the `authedMarker` resolves). A failing
   *  check is a `breakage` only when this is true (or no marker is configured). */
  signedIn: boolean;
  /** True when this state would raise the breakage banner. */
  bannerExpected: boolean;
  /** Every CSS selector with its live match. */
  selectors: SelectorProbe[];
  /** Non-selector config values, surfaced verbatim for context (not queried). */
  raw: {
    conversationIdAttr: string;
    conversationTitleAttr?: string;
    conversationUrlPattern?: string;
  };
}

/** Probe the live DOM and assemble the diagnostics for an adapter + its config.
 *  Pure read; safe to call any number of times. `root` defaults to the page
 *  `document` (injectable so the contract suite can run it against a fixture). */
export function buildDiagnostics(
  config: AdapterConfig,
  adapter: PlatformAdapter,
  root: Root = (globalThis as { document?: Document }).document!,
): AdapterDiagnostics {
  const { selectors } = config;
  const selectorProbes: SelectorProbe[] = SELECTOR_KEYS.filter(
    (key) => typeof selectors[key] === 'string',
  ).map((key) => {
    const selector = selectors[key] as string;
    let nodes: NodeListOf<Element> | [] = [];
    try {
      nodes = root.querySelectorAll(selector);
    } catch {
      // A malformed selector (bad remote hot-fix) throws on query — report it as a
      // zero-match rather than letting diagnose() blow up.
      nodes = [];
    }
    return {
      key,
      selector,
      count: nodes.length,
      resolved: nodes.length > 0,
      required: REQUIRED.has(key),
      sample: nodes[0] ?? null,
    };
  });

  const check = adapter.selfCheck();
  const readiness = typeof adapter.classify === 'function' ? adapter.classify() : check.ok ? 'ready' : 'breakage';
  const signedIn = selectors.authedMarker
    ? selectorProbes.find((p) => p.key === 'authedMarker')?.resolved ?? false
    : false;

  return {
    platform: config.platformId,
    configVersion: config.configVersion,
    url: (globalThis as { location?: Location }).location?.href ?? '',
    readiness,
    selfCheckOk: check.ok,
    missing: [...check.missing],
    signedIn,
    bannerExpected: readiness === 'breakage',
    selectors: selectorProbes,
    raw: {
      conversationIdAttr: selectors.conversationIdAttr,
      conversationTitleAttr: selectors.conversationTitleAttr,
      conversationUrlPattern: selectors.conversationUrlPattern,
    },
  };
}

/** The shape attached to the page global. `diagnose()` re-probes on every call so
 *  it always reflects the DOM at call time, not at install time. */
export interface SkeinosDebugApi {
  /** Build a fresh live diagnostics report. */
  diagnose(): AdapterDiagnostics;
  /** The platform driving this tab. */
  readonly platform: PlatformId;
  /** The active config version. */
  readonly configVersion: string;
}

/**
 * Attach `window.__skeinos` exposing `diagnose()` for the given adapter + config.
 * Returns a disposer that removes it (called on teardown). Idempotent per context:
 * a second call replaces the previous handle. No-op when there is no page global.
 */
export function installDebugGlobal(config: AdapterConfig, adapter: PlatformAdapter): () => void {
  const g = globalThis as { __skeinos?: SkeinosDebugApi };
  g.__skeinos = {
    diagnose: () => buildDiagnostics(config, adapter),
    platform: config.platformId,
    configVersion: config.configVersion,
  };
  return () => {
    if (g.__skeinos?.platform === config.platformId) delete g.__skeinos;
  };
}
