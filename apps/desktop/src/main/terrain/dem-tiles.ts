import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import type { TileSourceEntry } from '../../shared/tile-source-types.js';

export interface Rgba { width: number; height: number; data: Uint8Array }
const SIZE = 256;

export function decodePng(bytes: Buffer): Rgba {
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
}

export function encodePng(img: Rgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png);
}

export function transparentTile(): Rgba {
  return { width: SIZE, height: SIZE, data: new Uint8Array(SIZE * SIZE * 4) };
}

/** Pixels of `over` with alpha 0 keep `base`; everything else is replaced. */
export function compositeOver(base: Rgba | null, over: Rgba): Rgba {
  const out = base ? { width: base.width, height: base.height, data: new Uint8Array(base.data) } : transparentTile();
  const n = Math.min(out.data.length, over.data.length) / 4;
  for (let i = 0; i < n; i++) {
    if (over.data[i * 4 + 3] === 0) continue;
    out.data[i * 4] = over.data[i * 4]!;
    out.data[i * 4 + 1] = over.data[i * 4 + 1]!;
    out.data[i * 4 + 2] = over.data[i * 4 + 2]!;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

function terr(d: Uint8Array, i: number): number {
  return d[i * 4]! * 256 + d[i * 4 + 1]! + d[i * 4 + 2]! / 256 - 32768;
}

function putTerr(d: Uint8Array, i: number, h: number): void {
  const v = h + 32768;
  const f = Math.floor(v);
  d[i * 4] = Math.max(0, Math.min(255, Math.floor(v / 256)));
  d[i * 4 + 1] = f % 256;
  d[i * 4 + 2] = Math.max(0, Math.min(255, Math.floor((v - f) * 256)));
  d[i * 4 + 3] = 255;
}

/** Child quadrant (x, y within 2^dz) of a parent tile, bilinearly upsampled. Transparent stays transparent. */
export function overzoom(parent: Rgba, dz: number, x: number, y: number): Rgba {
  const out = transparentTile();
  const scale = 2 ** dz;
  const span = SIZE / scale;
  const ox = x * span, oy = y * span;
  for (let py = 0; py < SIZE; py++) {
    const sy = oy + ((py + 0.5) / SIZE) * span - 0.5;
    const y0 = Math.max(0, Math.min(SIZE - 1, Math.floor(sy))), y1 = Math.min(SIZE - 1, y0 + 1);
    const ay = Math.max(0, Math.min(1, sy - y0));
    for (let px = 0; px < SIZE; px++) {
      const sx = ox + ((px + 0.5) / SIZE) * span - 0.5;
      const x0 = Math.max(0, Math.min(SIZE - 1, Math.floor(sx))), x1 = Math.min(SIZE - 1, x0 + 1);
      const ax = Math.max(0, Math.min(1, sx - x0));
      const i00 = y0 * SIZE + x0, i10 = y0 * SIZE + x1, i01 = y1 * SIZE + x0, i11 = y1 * SIZE + x1;
      const opaque = parent.data[i00 * 4 + 3]! && parent.data[i10 * 4 + 3]! && parent.data[i01 * 4 + 3]! && parent.data[i11 * 4 + 3]!;
      const o = py * SIZE + px;
      if (!opaque) {
        const near = Math.max(0, Math.min(SIZE - 1, Math.round(sy))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.round(sx)));
        if (parent.data[near * 4 + 3] === 0) continue;
        putTerr(out.data, o, terr(parent.data, near));
        continue;
      }
      const h = (1 - ay) * ((1 - ax) * terr(parent.data, i00) + ax * terr(parent.data, i10)) + ay * ((1 - ax) * terr(parent.data, i01) + ax * terr(parent.data, i11));
      putTerr(out.data, o, h);
    }
  }
  return out;
}

/** Child quadrant of an RGBA image tile, nearest neighbour per channel so colours and alpha stay exact. */
export function overzoomRgba(parent: Rgba, dz: number, x: number, y: number): Rgba {
  const out = transparentTile();
  const span = SIZE / 2 ** dz;
  const ox = x * span, oy = y * span;
  for (let py = 0; py < SIZE; py++) {
    const sy = Math.min(SIZE - 1, Math.floor(oy + ((py + 0.5) / SIZE) * span));
    for (let px = 0; px < SIZE; px++) {
      const sx = Math.min(SIZE - 1, Math.floor(ox + ((px + 0.5) / SIZE) * span));
      const s = (sy * SIZE + sx) * 4, o = (py * SIZE + px) * 4;
      out.data[o] = parent.data[s]!;
      out.data[o + 1] = parent.data[s + 1]!;
      out.data[o + 2] = parent.data[s + 2]!;
      out.data[o + 3] = parent.data[s + 3]!;
    }
  }
  return out;
}

/** Host DEM bytes (overzoomed from a parent when dz > 0) with module tiles painted over; not cacheable when the base was unusable. */
export function composeDem(baseBytes: ArrayBuffer | Buffer | null, dz: number, cx: number, cy: number, overlays: Rgba[]): { img: Rgba; cacheable: boolean } {
  let base: Rgba | null = null;
  if (baseBytes) {
    try {
      const img = decodePng(Buffer.from(baseBytes as ArrayBuffer));
      if (img.width === SIZE && img.height === SIZE) base = dz > 0 ? overzoom(img, dz, cx, cy) : img;
    } catch {
      base = null;
    }
  }
  let out: Rgba | null = base;
  for (const tile of overlays) out = compositeOver(out, tile);
  return { img: out ?? transparentTile(), cacheable: base !== null };
}

/** The source's tile at z, overzoomed from its max zoom when needed; null below min zoom or when the file is missing. */
export async function readSourceTile(entry: TileSourceEntry, z: number, x: number, y: number): Promise<Rgba | null> {
  if (z < entry.minZoom) return null;
  const fz = Math.min(z, entry.maxZoom);
  const dz = z - fz;
  const fx = x >> dz, fy = y >> dz;
  let bytes: Buffer;
  try {
    bytes = await readFile(join(entry.tileRoot, String(fz), String(fx), `${fy}.png`));
  } catch {
    return null;
  }
  let img: Rgba;
  try {
    img = decodePng(bytes);
  } catch {
    return null;
  }
  if (img.width !== SIZE || img.height !== SIZE) return null;
  if (dz === 0) return img;
  const cx = x - (fx << dz), cy = y - (fy << dz);
  return entry.kind === 'raster' ? overzoomRgba(img, dz, cx, cy) : overzoom(img, dz, cx, cy);
}
