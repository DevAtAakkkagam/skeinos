// adapters — one generic, config-driven adapter + per-platform configs.
// `PlatformAdapter` is the ONLY platform contract the rest of the system imports;
// everything else here is the runtime that builds and feeds it. Nothing in
// `core/` imports this module — dependencies point inward.

export type {
  AdapterBehaviors,
  AdapterConfig,
  AdapterEvent,
  AdapterSelectors,
  ConversationRef,
  HistoryExpansion,
  HistoryExpansionMode,
  HistoryExpansionOptions,
  HistoryExpansionSummary,
  InsertMode,
  Message,
  PlatformAdapter,
  PlatformId,
  Readiness,
  SelfCheckResult,
  SubmitMode,
} from './types';
export { REQUIRED_ANCHORS, COMPOSE_ANCHORS, WORKSPACE_ANCHORS } from './types';

export { createAdapter, type AdapterContext } from './runtime/adapter';
export {
  waitForSelfCheck,
  SELF_CHECK_TIMEOUT_MS,
  type WaitForSelfCheckOptions,
} from './runtime/ready';
export { loadConfig, type ConfigCache, type LoaderOptions } from './runtime/loader';
export {
  buildDiagnostics,
  installDebugGlobal,
  type AdapterDiagnostics,
  type SelectorProbe,
  type SkeinosDebugApi,
} from './runtime/diagnose';
export {
  validateAdapterConfig,
  isValidationErrors,
  type ValidationError,
} from './runtime/validate';
export { matchPlatform, matchesHostPattern } from './runtime/host-match';
export { reportDegraded, registerAdapterHandlers } from './runtime/degraded';
export { getBundledConfig, BUNDLED_CONFIGS } from './configs';

// adapter-resilience: durable health, the health-report seam, the canary
// watchdog, and the breakage-notice banner.
export {
  getHealth,
  getPlatformHealth,
  getDegraded,
  setHealth,
  clearHealth,
  type PlatformHealth,
} from './resilience/health';
export { reportHealth, queryHealth, registerResilienceHandlers } from './resilience/report';
export {
  registerCanary,
  runCanaryTick,
  CANARY_ALARM,
  CANARY_PERIOD_MINUTES,
} from './resilience/canary';
export { Banner, mountBanner, BANNER_LABELS } from './resilience/Banner';
