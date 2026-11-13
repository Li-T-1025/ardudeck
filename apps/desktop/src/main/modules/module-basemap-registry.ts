import type { BasemapRegistration } from '@ardudeck/module-sdk';
import {
  moduleBasemapLayerKey,
  type ModuleBasemapEntry,
  type PublicModuleBasemapEntry,
} from '../../shared/module-basemap-types.js';
import { tileToQuadkey } from '../../shared/map-layers.js';

/**
 * Basemaps cargos add to the host's layer pickers. The host owns the fetching,
 * the disk cache and the overlay compositing, so a registration carries a URL
 * template (and therefore a provider key) that never leaves this process.
 */
const entries = new Map<string, ModuleBasemapEntry>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeModuleBasemaps(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function registerModuleBasemap(slug: string, reg: BasemapRegistration): ModuleBasemapEntry {
  if (!reg?.id) throw new Error(`[module:${slug}] basemap needs an id`);
  if (!reg.urlTemplate || !/\{z\}/.test(reg.urlTemplate) || !/\{x\}/.test(reg.urlTemplate) || !/\{y\}/.test(reg.urlTemplate)) {
    throw new Error(`[module:${slug}] basemap ${reg.id} needs a {z}/{x}/{y} urlTemplate`);
  }
  const layerKey = moduleBasemapLayerKey(slug, reg.id);
  const entry: ModuleBasemapEntry = { ...reg, slug, layerKey };
  entries.set(layerKey, entry);
  emit();
  return entry;
}

export function unregisterModuleBasemap(slug: string, id: string): void {
  if (entries.delete(moduleBasemapLayerKey(slug, id))) emit();
}

/** Drop everything a cargo registered, for unload or a disable toggle. */
export function unregisterModuleBasemapsFor(slug: string): void {
  let changed = false;
  for (const [key, e] of entries) {
    if (e.slug === slug) {
      entries.delete(key);
      changed = true;
    }
  }
  if (changed) emit();
}

export function moduleBasemapByLayerKey(layerKey: string): ModuleBasemapEntry | undefined {
  return entries.get(layerKey);
}

export function listModuleBasemaps(): ModuleBasemapEntry[] {
  return [...entries.values()];
}
export function publicModuleBasemaps(): PublicModuleBasemapEntry[] {
  return [...entries.values()].map((e) => ({
    layerKey: e.layerKey,
    slug: e.slug,
    id: e.id,
    name: e.name,
    attribution: e.attribution,
    minZoom: e.minZoom,
    maxZoom: e.maxZoom,
    primary: e.primary,
  }));
}

/**
 * Fill a template for one tile: `{s}` rotates over the subdomains by x+y so
 * one host is not asked for every tile, and `{quadkey}` is derived the way
 * Bing expects. Everything else is passed through untouched.
 */
export function resolveModuleBasemapUrl(template: string, entry: ModuleBasemapEntry, z: number, x: number, y: number): string {
  let url = template;
  const subs = entry.subdomains ?? [];
  if (subs.length > 0) url = url.replace('{s}', subs[(x + y) % subs.length]!);
  if (url.includes('{quadkey}')) url = url.replace('{quadkey}', tileToQuadkey(z, x, y));
  return url
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}
