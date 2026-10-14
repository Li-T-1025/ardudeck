import { beforeEach, describe, expect, it } from 'vitest';
import { demSourcesForTile, footprintBounds, listTileSources, registerTileSource, tileBounds, unregisterTileSource, unregisterTileSourcesFor } from './tile-source-registry';

const ring = [{ lat: 53.27, lng: 8.46 }, { lat: 53.27, lng: 8.48 }, { lat: 53.26, lng: 8.48 }, { lat: 53.26, lng: 8.46 }];

describe('tile-source-registry', () => {
  beforeEach(() => {
    for (const e of listTileSources()) unregisterTileSourcesFor(e.slug);
  });

  it('tile bounds match the slippy map formula', () => {
    const b = tileBounds(1, 1, 0);
    expect(b.west).toBeCloseTo(0, 9);
    expect(b.east).toBeCloseTo(180, 9);
    expect(b.south).toBeCloseTo(0, 6);
    expect(b.north).toBeCloseTo(85.0511, 3);
  });

  it('registers, lists and removes by slug and id', () => {
    registerTileSource('a', { id: 'dsm', name: 'A', kind: 'dem', footprint: ring, tileRoot: '/a', minZoom: 12, maxZoom: 19 });
    registerTileSource('b', { id: 'dsm', name: 'B', kind: 'dem', footprint: ring, tileRoot: '/b', minZoom: 12, maxZoom: 19 });
    expect(listTileSources().map((e) => e.key).sort()).toEqual(['a::dsm', 'b::dsm']);
    unregisterTileSource('a', 'dsm');
    expect(listTileSources().map((e) => e.key)).toEqual(['b::dsm']);
    unregisterTileSourcesFor('b');
    expect(listTileSources()).toEqual([]);
  });

  it('re-registering an id replaces it', () => {
    registerTileSource('a', { id: 'dsm', name: 'A', kind: 'dem', footprint: ring, tileRoot: '/a', minZoom: 12, maxZoom: 19 });
    registerTileSource('a', { id: 'dsm', name: 'A2', kind: 'dem', footprint: ring, tileRoot: '/a2', minZoom: 12, maxZoom: 19 });
    expect(listTileSources()).toHaveLength(1);
    expect(listTileSources()[0]?.tileRoot).toBe('/a2');
  });

  it('rejects a source without a footprint ring or tile root', () => {
    expect(() => registerTileSource('a', { id: 'x', name: 'X', kind: 'dem', footprint: [], tileRoot: '/a', minZoom: 12, maxZoom: 19 })).toThrow();
    expect(() => registerTileSource('a', { id: 'x', name: 'X', kind: 'dem', footprint: ring, tileRoot: '', minZoom: 12, maxZoom: 19 })).toThrow();
  });

  it('finds dem sources whose footprint overlaps a tile, highest priority first', () => {
    registerTileSource('a', { id: 'lo', name: 'A', kind: 'dem', footprint: ring, tileRoot: '/a', minZoom: 12, maxZoom: 19, priority: 0 });
    registerTileSource('a', { id: 'hi', name: 'A', kind: 'dem', footprint: ring, tileRoot: '/a', minZoom: 12, maxZoom: 19, priority: 5 });
    registerTileSource('a', { id: 'ortho', name: 'A', kind: 'raster', footprint: ring, tileRoot: '/a', minZoom: 12, maxZoom: 19 });
    const b = footprintBounds(ring);
    const z = 15;
    const x = Math.floor(((b.west + 180) / 360) * 2 ** z);
    const latR = (b.north * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * 2 ** z);
    expect(demSourcesForTile(z, x, y).map((e) => e.id)).toEqual(['hi', 'lo']);
    expect(demSourcesForTile(z, 0, 0)).toEqual([]);
  });
});
