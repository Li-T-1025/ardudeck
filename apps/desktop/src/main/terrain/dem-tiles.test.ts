import { describe, expect, it } from 'vitest';
import { compositeOver, decodePng, encodePng, overzoom, transparentTile, type Rgba } from './dem-tiles';

function solid(r: number, g: number, b: number, a = 255): Rgba {
  const data = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width: 256, height: 256, data };
}
const terr = (px: Uint8Array, i: number) => px[i * 4]! * 256 + px[i * 4 + 1]! + px[i * 4 + 2]! / 256 - 32768;

describe('dem-tiles', () => {
  it('png round trip keeps pixels', () => {
    const img = solid(1, 2, 3, 255);
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(256);
    expect(Array.from(back.data.subarray(0, 4))).toEqual([1, 2, 3, 255]);
  });

  it('composite keeps base where the overlay is transparent and takes the overlay elsewhere', () => {
    const base = solid(128, 0, 0);
    const over = solid(128, 100, 0);
    for (let i = 0; i < 256 * 128; i++) over.data[i * 4 + 3] = 0;
    const out = compositeOver(base, over);
    expect(terr(out.data, 10)).toBeCloseTo(0, 3);
    expect(terr(out.data, 256 * 200)).toBeCloseTo(100, 3);
    expect(out.data[10 * 4 + 3]).toBe(255);
  });

  it('composite over null base leaves overlay holes transparent', () => {
    const over = solid(128, 100, 0);
    over.data[3] = 0;
    const out = compositeOver(null, over);
    expect(out.data[3]).toBe(0);
    expect(out.data[7]).toBe(255);
  });

  it('overzoom crops the requested quadrant and upsamples', () => {
    const parent = solid(128, 0, 0);
    for (let y = 0; y < 256; y++) for (let x = 128; x < 256; x++) parent.data[(y * 256 + x) * 4 + 1] = 200;
    const childLeft = overzoom(parent, 1, 0, 0);
    const childRight = overzoom(parent, 1, 1, 0);
    expect(terr(childLeft.data, 256 * 100 + 10)).toBeCloseTo(0, 1);
    expect(terr(childRight.data, 256 * 100 + 200)).toBeCloseTo(200, 1);
    const far = overzoom(parent, 2, 3, 0);
    expect(terr(far.data, 256 * 50 + 50)).toBeCloseTo(200, 1);
  });

  it('overzoom carries transparency through', () => {
    const parent = solid(128, 0, 0, 0);
    expect(overzoom(parent, 1, 0, 0).data[3]).toBe(0);
    expect(transparentTile().data[3]).toBe(0);
  });
});

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeDem, readSourceTile } from './dem-tiles';
import type { TileSourceEntry } from '../../shared/tile-source-types';

const ring = [{ lat: 53.27, lng: 8.46 }, { lat: 53.27, lng: 8.48 }, { lat: 53.26, lng: 8.48 }];

async function tileRoot(img: Rgba, z: number, x: number, y: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ad-tiles-'));
  await mkdir(join(root, String(z), String(x)), { recursive: true });
  await writeFile(join(root, String(z), String(x), `${y}.png`), encodePng(img));
  return root;
}

describe('readSourceTile', () => {
  it('overzooms a raster source per channel, never as terrain heights', async () => {
    const img = solid(10, 200, 30, 255);
    for (let i = 0; i < 256 * 256; i++) if (i % 256 >= 128) { img.data[i * 4] = 250; img.data[i * 4 + 1] = 20; }
    const root = await tileRoot(img, 12, 5, 7);
    const entry: TileSourceEntry = { slug: 'a', key: 'a::o', id: 'o', name: 'o', kind: 'raster', footprint: ring, tileRoot: root, minZoom: 12, maxZoom: 12 };
    const child = await readSourceTile(entry, 13, 10, 14);
    expect(child).not.toBeNull();
    // The last child column sits on the parent's colour boundary; a height-style blend would mix the channels.
    const px = Array.from(child!.data.subarray((100 * 256 + 255) * 4, (100 * 256 + 255) * 4 + 4));
    expect([[10, 200, 30, 255], [250, 20, 30, 255]]).toContainEqual(px);
  });

  it('keeps a dem source as heights when overzoomed', async () => {
    const root = await tileRoot(solid(128, 100, 0), 12, 5, 7);
    const entry: TileSourceEntry = { slug: 'a', key: 'a::d', id: 'd', name: 'd', kind: 'dem', footprint: ring, tileRoot: root, minZoom: 12, maxZoom: 12 };
    const child = await readSourceTile(entry, 13, 10, 14);
    expect(terr(child!.data, 256 * 100 + 100)).toBeCloseTo(100, 2);
  });
});

describe('composeDem', () => {
  it('is cacheable only when the host base decoded', () => {
    const over = solid(128, 50, 0);
    const withBase = composeDem(encodePng(solid(128, 0, 0)), 0, 0, 0, [over]);
    expect(withBase.cacheable).toBe(true);
    expect(terr(withBase.img.data, 0)).toBeCloseTo(50, 3);
    const noBase = composeDem(null, 0, 0, 0, [over]);
    expect(noBase.cacheable).toBe(false);
    expect(terr(noBase.img.data, 0)).toBeCloseTo(50, 3);
    const badBase = composeDem(Buffer.from('not a png'), 0, 0, 0, []);
    expect(badBase.cacheable).toBe(false);
    expect(badBase.img.data[3]).toBe(0);
  });
});
