// Bundled platform configs — always present so the extension works offline and
// has a last-known-good baseline the loader can fall back to (design D-A3). A new
// platform ships by adding its JSON here plus a fixture against the contract suite.

import type { PlatformId } from '../../shared/types';
import type { AdapterConfig } from '../types';
import claudeConfig from './claude.json';
import geminiConfig from './gemini.json';

/** Bundled configs by platform. Only platforms whose adapter has shipped appear. */
export const BUNDLED_CONFIGS: Partial<Record<PlatformId, AdapterConfig>> = {
  // Trusted (our own bundled file); the loader still re-validates remote configs.
  claude: claudeConfig as unknown as AdapterConfig,
  gemini: geminiConfig as unknown as AdapterConfig,
};

/** The bundled config for a platform, or `undefined` if none has shipped yet. */
export function getBundledConfig(platformId: PlatformId): AdapterConfig | undefined {
  return BUNDLED_CONFIGS[platformId];
}
