import type { BasemapRegistration } from '@ardudeck/module-sdk';

/**
 * A basemap as the main process holds it: the cargo's registration plus who
 * registered it and the layer key the pickers use.
 */
export interface ModuleBasemapEntry extends BasemapRegistration {
  slug: string;
  /** `tile-cache://` host name and the value the pickers store. */
  layerKey: string;
}

/**
 * What a renderer is allowed to see. Templates, headers and subdomains stay
 * in the main process: a provider key lives in the template, and a window that
 * received it would leak it into devtools, screenshots and crash reports.
 */
export interface PublicModuleBasemapEntry {
  layerKey: string;
  slug: string;
  id: string;
  /** The cargo's own label, already in the pilot's language when it can tell. */
  name: string;
  attribution?: string;
  minZoom?: number;
  maxZoom?: number;
  /** The row a narrow picker offers when the cargo registered several styles. */
  primary?: boolean;
}

/** Module basemaps are served at tile-cache://mb-<slug>.<id>/{z}/{x}/{y}.png. */
export const MODULE_BASEMAP_LAYER_PREFIX = 'mb-';

// The layer key becomes a URL host name, so keep it to what a host accepts:
// lower-case letters, digits, '.' and '-'. A slug is reversed-domain, so dots
// separate the cargo from its basemap id without a second delimiter.
function safeSegment(part: string): string {
  const cleaned = part.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'x';
}

export function moduleBasemapLayerKey(slug: string, id: string): string {
  return `${MODULE_BASEMAP_LAYER_PREFIX}${safeSegment(slug)}.${safeSegment(id)}`;
}

/** True for a key the host's own MAP_LAYERS table holds, false for a cargo's. */
export function isModuleBasemapLayerKey(layerKey: string): boolean {
  return layerKey.startsWith(MODULE_BASEMAP_LAYER_PREFIX);
}
