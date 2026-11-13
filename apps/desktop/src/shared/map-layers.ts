import { t } from './i18n/index.js';

/**
 * Centralized map layer definitions — single source of truth for all map components.
 * Used by telemetry map, mission 2D, mission 3D, and tile cache.
 */

export interface MapLayer {
  name: string;
  url: string;
  subdomains: readonly string[];
  maxZoom: number;
  /** Max zoom at which tiles actually exist on the server. Beyond this, tiles are upscaled. */
  maxNativeZoom?: number;
  /** Extra headers to send when fetching tiles (e.g. Referer for Google) */
  headers?: Record<string, string>;
  /** Credit the tile provider requires, shown in the map's attribution corner. */
  attribution?: string;
}

export const MAP_LAYERS = {
  osm: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors', // i18n-exempt
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: [],
    maxZoom: 18,
    attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community', // i18n-exempt
  },
  googleSat: {
    name: 'Google Sat', // i18n-exempt
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20,
    headers: { Referer: 'https://www.google.com/' },
    attribution: 'Imagery © Google', // i18n-exempt
  },
  googleHybrid: {
    name: 'Hybrid',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20,
    headers: { Referer: 'https://www.google.com/' },
    attribution: 'Imagery © Google', // i18n-exempt
  },
  // Bing aerial via the classic keyless quadkey endpoints (the same ones
  // Mission Planner ships). Offered because Google tiles are unreachable in
  // some regions (China notably); Esri "Satellite" is the other option there.
  // Microsoft is sunsetting Bing Maps for Enterprise (2028) so these may die
  // eventually; the {q} token is resolved to a quadkey in resolveTileUrl.
  bingSat: {
    name: 'Bing Sat', // i18n-exempt
    url: 'https://ecn.t{s}.tiles.virtualearth.net/tiles/a{q}.jpeg?g=14364&n=z',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: '© Microsoft', // i18n-exempt
  },
  bingHybrid: {
    name: 'Bing Hybrid', // i18n-exempt
    url: 'https://ecn.t{s}.tiles.virtualearth.net/tiles/h{q}.jpeg?g=14364&n=z',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: '© Microsoft', // i18n-exempt
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 17,
    attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', // i18n-exempt
  },
  // Keyless Esri Canvas by default; with a Carto key from Settings > Maps the tile cache serves Carto dark_all instead.
  dark: {
    name: 'Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    subdomains: [],
    maxZoom: 20,
    maxNativeZoom: 16,
    attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community', // i18n-exempt
  },
  dem: {
    name: 'DEM',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    subdomains: [],
    maxZoom: 15,
  },
  radar: {
    name: 'Radar',
    url: 'https://tilecache.rainviewer.com/{radarPath}/256/{z}/{x}/{y}/2/1_1.png',
    subdomains: [],
    maxZoom: 22,
    maxNativeZoom: 6,
  },
  openaip: {
    name: 'OpenAIP',
    url: 'https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png',
    subdomains: [],
    maxZoom: 22,
    maxNativeZoom: 14,
  },
} as const satisfies Record<string, MapLayer>;

export type LayerKey = keyof typeof MAP_LAYERS;

// ─── Basemaps cargos contribute ─────────────────────────────────────────────
// A cargo's basemap arrives as a registration in the main process; the renderer
// only ever sees a layer key, a label and the credit (see module-basemap-types).
// Keeping them in this table means every picker, the attribution corner and the
// tile-cache URL builder read one source, exactly as they do for the built-ins.

export interface ModuleBasemapLayerDef {
  /** `mb-<slug>.<id>`, which is also the tile-cache:// host name. */
  key: string;
  /** The registration's own label, used until the cargo's strings are loaded. */
  name: string;
  attribution?: string;
  minZoom?: number;
  maxZoom: number;
  maxNativeZoom?: number;
  /** Set by a cargo that registers several styles; narrow pickers list only these. */
  primary?: boolean;
}

const basemapLayers = new Map<string, ModuleBasemapLayerDef>();
const basemapLayerListeners = new Set<() => void>();
let basemapLayerVersion = 0;
/**
 * Translated labels, resolved when a picker draws rather than when the table
 * was built: a cargo's strings arrive with its renderer activation, which can
 * be after the first IPC list.
 */
let basemapNameFor: ((layerKey: string, fallback: string) => string) | undefined;

export function setModuleBasemapNameResolver(fn?: (layerKey: string, fallback: string) => string): void {
  basemapNameFor = fn;
  basemapLayerVersion++;
  for (const l of basemapLayerListeners) l();
}

/** Replace the cargo-contributed basemaps. Called on load, unload and language change. */
export function setModuleBasemapLayers(entries: ModuleBasemapLayerDef[]): void {
  basemapLayers.clear();
  for (const e of entries) basemapLayers.set(e.key, e);
  basemapLayerVersion++;
  for (const l of basemapLayerListeners) l();
}

export function subscribeModuleBasemapLayers(cb: () => void): () => void {
  basemapLayerListeners.add(cb);
  return () => {
    basemapLayerListeners.delete(cb);
  };
}

/** Bumped on every change, so a component can re-render its picker. */
export function moduleBasemapLayersVersion(): number {
  return basemapLayerVersion;
}

export function moduleBasemapLayerDefs(): ModuleBasemapLayerDef[] {
  return [...basemapLayers.values()];
}

/**
 * Cargo rows for a narrow picker (the flight-log overlay): the ones a cargo
 * marked `primary`, or every row when it marked none, so a provider that ships
 * a single style is never hidden.
 */
export function narrowModuleBasemapKeys(): string[] {
  const defs = moduleBasemapLayerDefs();
  const marked = defs.filter((d) => d.primary);
  return (marked.length > 0 ? marked : defs).map((d) => d.key);
}

/** True for one of the host's own layers, false for a cargo's. */
export function isBuiltinMapLayer(layerKey: string): boolean {
  return Object.prototype.hasOwnProperty.call(MAP_LAYERS, layerKey);
}

/** True for a layer a cargo registered, false for a built-in one. */
export function isModuleBasemapLayer(layerKey: string): boolean {
  return basemapLayers.has(layerKey);
}

/** The tile-cache URL MapLibre loads for a layer; a cargo basemap never fetches its provider directly. */
export function tileCacheTemplate(layerKey: string): string {
  return `tile-cache://${layerKey}/{z}/{x}/{y}.png`;
}

/** A built-in or cargo layer, as the panels need it (zoom limits, credit). */
export function mapLayerDef(layerKey: string): MapLayer | undefined {
  const mod = basemapLayers.get(layerKey);
  if (mod) {
    return {
      name: mod.name,
      // The renderer only ever loads cargo tiles through tile-cache://, so the
      // provider URL (and any key in it) never leaves the main process.
      url: tileCacheTemplate(layerKey),
      subdomains: [],
      maxZoom: mod.maxZoom,
      maxNativeZoom: mod.maxNativeZoom,
      attribution: mod.attribution,
    };
  }
  return (MAP_LAYERS as Record<string, MapLayer>)[layerKey];
}

/** Every layer a picker may offer, built-ins first in their table order. */
export function allMapLayerKeys(moduleFirst = false): string[] {
  const builtin = Object.keys(MAP_LAYERS);
  const mod = moduleBasemapLayerDefs().map((m) => m.key);
  return moduleFirst ? [...mod, ...builtin] : [...builtin, ...mod];
}

export function mapLayerName(layerKey: string): string {
  const mod = basemapLayers.get(layerKey);
  if (mod) return basemapNameFor?.(layerKey, mod.name) ?? mod.name;
  if (isBuiltinMapLayer(layerKey)) return t(`shared:mapLayers.${layerKey}`);
  return layerKey;
}

/**
 * Bing-style quadkey: one base-4 digit per zoom level, interleaving the x/y
 * bits from most-significant down. z=3, x=3, y=5 -> "213".
 */
export function tileToQuadkey(z: number, x: number, y: number): string {
  let quadkey = '';
  for (let i = z; i > 0; i--) {
    const mask = 1 << (i - 1);
    let digit = 0;
    if (x & mask) digit += 1;
    if (y & mask) digit += 2;
    quadkey += digit;
  }
  return quadkey;
}

/**
 * Resolve the real HTTP tile URL for a given layer/z/x/y.
 * Handles subdomain rotation and different URL patterns (Esri {z}/{y}/{x},
 * Bing {q} quadkeys).
 */
export function resolveTileUrl(layerKey: string, z: number, x: number, y: number): string {
  const layer = mapLayerDef(layerKey);
  // A cargo basemap has no provider URL here: its tiles are served by the host.
  if (!layer) return '';
  let url: string = layer.url;

  // Rotate subdomains deterministically based on (x + y) to spread load
  if (layer.subdomains.length > 0) {
    const idx = (x + y) % layer.subdomains.length;
    url = url.replace('{s}', layer.subdomains[idx]!);
  }

  return url
    .replace('{q}', tileToQuadkey(z, x, y))
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Get the tile URL template for MapLibre (replaces {s} with first subdomain).
 * MapLibre handles {z}/{x}/{y} substitution itself, and speaks quadkeys
 * natively via its {quadkey} token.
 */
export function getMapLibreTileUrl(layerKey: string): string {
  const layer = mapLayerDef(layerKey);
  if (!layer) return '';
  if (!isBuiltinMapLayer(layerKey)) return tileCacheTemplate(layerKey);
  let url: string = layer.url;
  if (layer.subdomains.length > 0) {
    url = url.replace('{s}', layer.subdomains[0]!);
  }
  return url.replace('{q}', '{quadkey}');
}

/** API key service name for Carto basemaps, as stored by Settings > Maps (same name on mobile). */
export const CARTO_KEY_SERVICE = 'carto';
/** Carto's documented keyed raster URL; without a valid key it serves an "API KEY REQUIRED" tile. */
export const CARTO_DARK_URL = 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key={key}';
export const CARTO_ATTRIBUTION = '© OpenStreetMap contributors © CARTO'; // i18n-exempt
/** Label overlay drawn over the keyless dark base; transparent while Carto (which has its own labels) is in use. */
export const DARK_LABELS_LAYER = 'dark-labels';
export const ESRI_DARK_LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
export const ESRI_CANVAS_MAX_NATIVE_ZOOM = 16;

/** The credit to show for a base layer; the dark style credits CARTO while a Carto key serves it. */
export function layerAttribution(key: string, cartoKey: boolean): string | undefined {
  if (key === 'dark' && cartoKey) return CARTO_ATTRIBUTION;
  // A cargo basemap carries the credit its provider requires.
  const mod = basemapLayers.get(key);
  if (mod) return mod.attribution;
  return (MAP_LAYERS as Record<string, MapLayer>)[key]?.attribution;
}
