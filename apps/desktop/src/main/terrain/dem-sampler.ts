import { resolveTileBytes } from '../tile-cache.js';
import { decodePng } from './dem-tiles.js';
import { subscribeTileSources } from './tile-source-registry.js';

const TILE = 256;
export interface TileReader {
  (z: number, x: number, y: number): Promise<Float32Array | null>;
}

/** Smallest zoom whose pixel is at most half the grid spacing, clamped to [8, maxZoom]. */
export function zoomForSpacing(lat: number, spacingM: number, maxZoom = 19): number {
  const latR = (lat * Math.PI) / 180;
  const target = Math.max(0.01, spacingM / 2);
  let z = 8;
  while (z < maxZoom && (40075016.686 * Math.cos(latR)) / (TILE * 2 ** z) > target) z++;
  return z;
}

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/** Reads DEM tiles through the tile cache (module DEMs included) and keeps the last 64 decoded. */
export function createTileReader(resolve: (url: string) => Promise<{ status: number; body: ArrayBuffer | null }>): TileReader & { clear(): void } {
  const cache = new Map<string, Promise<Float32Array | null>>();
  const reader = async (z: number, x: number, y: number) => {
    const key = `${z}/${x}/${y}`;
    let p = cache.get(key);
    if (!p) {
      p = resolve(`tile-cache://dem/${z}/${x}/${y}.png`).then(({ body }) => {
        if (!body) return null;
        try {
          const img = decodePng(Buffer.from(body));
          if (img.width !== TILE || img.height !== TILE) return null;
          const out = new Float32Array(TILE * TILE);
          const d = img.data;
          for (let i = 0; i < TILE * TILE; i++) {
            out[i] = d[i * 4 + 3] === 0 ? NaN : d[i * 4]! * 256 + d[i * 4 + 1]! + d[i * 4 + 2]! / 256 - 32768;
          }
          return out;
        } catch {
          return null;
        }
      });
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, p);
    }
    return p;
  };
  return Object.assign(reader, { clear: () => cache.clear() });
}

function bilinear(t: Float32Array, px: number, py: number): number {
  const fx = Math.max(0, Math.min(TILE - 1, px - 0.5)), fy = Math.max(0, Math.min(TILE - 1, py - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(TILE - 1, x0 + 1), y1 = Math.min(TILE - 1, y0 + 1);
  const ax = fx - x0, ay = fy - y0;
  const a = t[y0 * TILE + x0]!, b = t[y0 * TILE + x1]!, c = t[y1 * TILE + x0]!, d = t[y1 * TILE + x1]!;
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return NaN;
  return (1 - ay) * ((1 - ax) * a + ax * b) + ay * ((1 - ax) * c + ax * d);
}

export async function sampleHeights(points: { lat: number; lon: number }[], spacingM: number, read: TileReader): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  const z = zoomForSpacing(points[0]!.lat, spacingM);
  return Promise.all(
    points.map(async (p) => {
      const tx = lonToTileX(p.lon, z), ty = latToTileY(p.lat, z);
      const x = Math.floor(tx), y = Math.floor(ty);
      const tile = await read(z, x, y);
      if (!tile) return null;
      const h = bilinear(tile, (tx - x) * TILE, (ty - y) * TILE);
      return Number.isNaN(h) ? null : h;
    }),
  );
}

const defaultReader = createTileReader(resolveTileBytes);
subscribeTileSources(() => defaultReader.clear());

export const demSampler = {
  sample: (points: { lat: number; lon: number }[], spacingM: number) => sampleHeights(points, spacingM, defaultReader),
  clear: () => defaultReader.clear(),
};
