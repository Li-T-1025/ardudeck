import type { TileSourceRegistration } from '@ardudeck/module-sdk';
import type { TileSourceEntry } from '../../shared/tile-source-types.js';

export interface LonLatBounds { west: number; south: number; east: number; north: number }

const entries = new Map<string, TileSourceEntry>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeTileSources(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function tileBounds(z: number, x: number, y: number): LonLatBounds {
  const n = 2 ** z;
  const lon = (i: number) => (i / n) * 360 - 180;
  const lat = (j: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * j) / n))) * 180) / Math.PI;
  return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) };
}

export function footprintBounds(ring: { lat: number; lng: number }[]): LonLatBounds {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const p of ring) {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  }
  return { west, south, east, north };
}

function overlaps(a: LonLatBounds, b: LonLatBounds): boolean {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}

export function registerTileSource(slug: string, reg: TileSourceRegistration): TileSourceEntry {
  if (!reg?.id) throw new Error(`[module:${slug}] tile source needs an id`);
  if (!reg.tileRoot) throw new Error(`[module:${slug}] tile source ${reg.id} needs a tileRoot`);
  if (!Array.isArray(reg.footprint) || reg.footprint.length < 3) {
    throw new Error(`[module:${slug}] tile source ${reg.id} needs a footprint of 3 or more points`);
  }
  const key = `${slug}::${reg.id}`;
  const entry: TileSourceEntry = { ...reg, slug, key };
  entries.set(key, entry);
  emit();
  return entry;
}

export function unregisterTileSource(slug: string, id: string): void {
  if (entries.delete(`${slug}::${id}`)) emit();
}

export function unregisterTileSourcesFor(slug: string): void {
  let changed = false;
  for (const [key, e] of entries) {
    if (e.slug === slug) {
      entries.delete(key);
      changed = true;
    }
  }
  if (changed) emit();
}

export function listTileSources(): TileSourceEntry[] {
  return [...entries.values()];
}

export function rasterSourceByKey(key: string): TileSourceEntry | undefined {
  const e = entries.get(key);
  return e?.kind === 'raster' ? e : undefined;
}

/** DEM sources whose footprint box overlaps the tile, highest priority first. */
export function demSourcesForTile(z: number, x: number, y: number): TileSourceEntry[] {
  const tb = tileBounds(z, x, y);
  return [...entries.values()]
    .filter((e) => e.kind === 'dem' && overlaps(tb, footprintBounds(e.footprint)))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
