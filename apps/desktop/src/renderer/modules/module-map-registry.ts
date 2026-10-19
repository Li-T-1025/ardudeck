/**
 * Registry of map layers contributed by modules (host.map). The host owns the
 * map library, the layer control and the stacking, as it owns the panel dock.
 * Drawing only: nothing here can change what the aircraft does.
 *
 * Kept out of the module host API so MapPanel can import it alone.
 */

import type { MapFeature, MapLayerRegistration, MapView } from '@ardudeck/module-sdk';
import { TILE_SOURCE_LAYER_PREFIX } from '../../shared/tile-source-types';

export interface ModuleMapLayer {
  /** Namespaced so two modules may both register an id of "volumes". */
  key: string;
  slug: string;
  reg: MapLayerRegistration;
  /** Host-served raster tiles for `reg.tiles`, drawn under the features. */
  tileUrl?: string;
}

const registry = new Map<string, ModuleMapLayer>();
const bySlug = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
/** Unsubscribes from each layer's own change feed, so live layers redraw. */
const watchers = new Map<string, () => void>();

function emit(): void {
  for (const l of listeners) l();
}

function keyFor(slug: string, id: string): string {
  return `${slug}::${id}`;
}

/** Subscribe to registry changes, and to any live layer's own changes. */
export function subscribeModuleMapLayers(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function registerModuleMapLayer(slug: string, reg: MapLayerRegistration): void {
  if (!reg?.id) throw new Error(`[module:${slug}] map layer needs an id`);
  if (typeof reg.features !== 'function') {
    throw new Error(`[module:${slug}] map layer ${reg.id} needs a features()`);
  }
  const key = keyFor(slug, reg.id);
  // Replacing an id must drop the old watcher or it fires for a dead layer.
  watchers.get(key)?.();
  watchers.delete(key);

  const tileUrl = reg.tiles
    ? `tile-cache://${TILE_SOURCE_LAYER_PREFIX}${encodeURIComponent(`${slug}::${reg.tiles.sourceId}`)}/{z}/{x}/{y}.png`
    : undefined;
  registry.set(key, { key, slug, reg, tileUrl });
  const chosen = readChoices()[key];
  if (chosen === false || (chosen === undefined && reg.defaultVisible === false)) hidden.add(key);
  else hidden.delete(key);
  let ids = bySlug.get(slug);
  if (!ids) {
    ids = new Set();
    bySlug.set(slug, ids);
  }
  ids.add(reg.id);

  if (typeof reg.subscribe === 'function') {
    try {
      watchers.set(key, reg.subscribe(emit));
    } catch (err) {
      // Losing live updates, not the layer: static features still draw.
      console.warn(`[module:${slug}] map layer ${reg.id} subscribe failed`, err);
    }
  }
  emit();
}

export function unregisterModuleMapLayer(slug: string, id: string): void {
  if (!bySlug.get(slug)?.has(id)) return;
  const key = keyFor(slug, id);
  watchers.get(key)?.();
  watchers.delete(key);
  registry.delete(key);
  hidden.delete(key);
  bySlug.get(slug)?.delete(id);
  emit();
}

/** Drop everything a module registered, for unload. */
export function unregisterModuleMapLayersFor(slug: string): void {
  const ids = bySlug.get(slug);
  if (!ids) return;
  for (const id of [...ids]) unregisterModuleMapLayer(slug, id);
  bySlug.delete(slug);
}

/** Hidden by the pilot. Host-owned, so the control and the drawing agree. */
const hidden = new Set<string>();

// the pilot's on/off per layer, kept across restarts and cargo reloads
const CHOICES_KEY = 'ardudeck-module-map-layers';
function readChoices(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CHOICES_KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
}
function writeChoice(key: string, visible: boolean): void {
  try { localStorage.setItem(CHOICES_KEY, JSON.stringify({ ...readChoices(), [key]: visible })); } catch { /* storage unavailable */ }
}

export function isLayerVisible(key: string): boolean {
  return !hidden.has(key);
}

export function setLayerVisible(key: string, visible: boolean): void {
  if (visible) hidden.delete(key);
  else hidden.add(key);
  writeChoice(key, visible);
  emit();
}

/** Registered layers, in draw order (low first, then by key for stability). */
export function getModuleMapLayers(): ModuleMapLayer[] {
  return [...registry.values()].sort((a, b) => {
    const d = (a.reg.order ?? 0) - (b.reg.order ?? 0);
    return d !== 0 ? d : a.key.localeCompare(b.key);
  });
}

/** Features for one layer; a module that throws loses its frame, not the map. */
export function featuresOf(layer: ModuleMapLayer, view?: MapView): MapFeature[] {
  try {
    const out = layer.reg.features(view);
    return Array.isArray(out) ? out : [];
  } catch (err) {
    console.warn(`[module:${layer.slug}] map layer ${layer.reg.id} features() threw`, err);
    return [];
  }
}

// --- polygon picking -------------------------------------------------------

export type PickShape = 'polygon' | 'path' | 'point';

const MIN_POINTS: Record<PickShape, number> = { polygon: 3, path: 2, point: 1 };

export interface PolygonPick {
  prompt: string;
  shape: PickShape;
  /** Points needed before the pick can finish. */
  min: number;
  points: { lat: number; lng: number }[];
  /** Started from existing points: a point pick then waits for Done instead of the first click. */
  editing: boolean;
  resolve: (ring: { lat: number; lng: number }[] | null) => void;
}

let pick: PolygonPick | null = null;
let pickCursor: { lat: number; lng: number } | null = null;

export function getPolygonPick(): PolygonPick | null {
  return pick;
}

/** Start a pick. One at a time: a second request cancels nothing and fails. */
export function startPick(prompt: string, shape: PickShape, initial?: { lat: number; lng: number }[]): Promise<{ lat: number; lng: number }[] | null> {
  if (pick) return Promise.resolve(null);
  const points = (initial ?? []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).map((p) => ({ lat: p.lat, lng: p.lng }));
  return new Promise((resolve) => {
    const done = (ring: { lat: number; lng: number }[] | null): void => {
      pick = null;
      pickCursor = null;
      emit();
      resolve(ring);
    };
    pick = { prompt, shape, min: MIN_POINTS[shape], points: shape === 'point' ? points.slice(0, 1) : points, editing: points.length > 0, resolve: done };
    emit();
  });
}

export function startPolygonPick(prompt: string, initial?: { lat: number; lng: number }[]): Promise<{ lat: number; lng: number }[] | null> {
  return startPick(prompt, 'polygon', initial);
}

// Every change REPLACES the pick object. Mutating it in place left React
// comparing a state value against itself and skipping the render, so corners
// went in and nothing on screen moved.
function update(points: { lat: number; lng: number }[]): void {
  if (!pick) return;
  pick = { ...pick, points };
  emit();
}

export function addPickPoint(p: { lat: number; lng: number }): void {
  if (!pick) return;
  if (pick.shape === 'point') {
    update([p]);
    if (!pick.editing) finishPick();
    return;
  }
  update([...pick.points, p]);
}

/** Put a new point in at `index` (between two placed ones). */
export function insertPickPoint(index: number, p: { lat: number; lng: number }): void {
  if (!pick || pick.shape === 'point') return;
  const pts = [...pick.points];
  pts.splice(Math.max(0, Math.min(index, pts.length)), 0, p);
  update(pts);
}

/** Midpoints of the edges, where a new point can be put in; index is where it goes. */
export function pickMidpoints(p: PolygonPick): Array<{ index: number; lat: number; lng: number }> {
  if (p.shape === 'point' || p.points.length < 2) return [];
  const n = p.shape === 'polygon' && p.points.length >= 3 ? p.points.length : p.points.length - 1;
  const out: Array<{ index: number; lat: number; lng: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = p.points[i]!, b = p.points[(i + 1) % p.points.length]!;
    out.push({ index: i + 1, lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 });
  }
  return out;
}

/** Drag a placed point to a new place. */
export function movePickPoint(index: number, p: { lat: number; lng: number }): void {
  if (!pick || index < 0 || index >= pick.points.length) return;
  update(pick.points.map((q, i) => (i === index ? p : q)));
}

export function undoPickPoint(): void {
  if (!pick) return;
  update(pick.points.slice(0, -1));
}

/** Finish with the points placed. Fewer than the shape needs is not a shape, so it cancels. */
export function finishPick(): void {
  if (!pick) return;
  pick.resolve(pick.points.length >= pick.min ? pick.points : null);
}

export function cancelPick(): void {
  pick?.resolve(null);
}

const cursorListeners = new Set<() => void>();

/** Where the pointer is over the map during a pick, so the pick bar can show the ground height there. */
export function setPickCursor(p: { lat: number; lng: number } | null): void {
  if (!pick && p) return;
  pickCursor = p;
  for (const l of cursorListeners) l();
}

export function getPickCursor(): { lat: number; lng: number } | null {
  return pickCursor;
}

export function subscribePickCursor(cb: () => void): () => void {
  cursorListeners.add(cb);
  return () => {
    cursorListeners.delete(cb);
  };
}
