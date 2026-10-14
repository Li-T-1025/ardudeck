import { describe, expect, it } from 'vitest';
import { sampleTile, sourceElevation, terrainTileUrl } from './source-elevation';
import type { TileSourceEntry } from '../../shared/tile-source-types';
import { useTileSourceStore } from '../stores/tile-source-store';

const ring = [{ lat: 53.27, lng: 8.46 }, { lat: 53.27, lng: 8.48 }, { lat: 53.26, lng: 8.48 }, { lat: 53.26, lng: 8.46 }];
const entry: TileSourceEntry = { slug: 'a', key: 'a::dsm', id: 'dsm', name: 'd', kind: 'dem', footprint: ring, tileRoot: '/', minZoom: 12, maxZoom: 18 };

describe('source-elevation', () => {
  it('bilinear sample inside a tile, NaN next to a hole', () => {
    const t = new Float32Array(256 * 256).fill(10);
    t[0] = NaN;
    expect(sampleTile(t, 100.5, 100.5)).toBeCloseTo(10, 6);
    expect(Number.isNaN(sampleTile(t, 0.2, 0.2))).toBe(true);
  });

  it('url shape', () => {
    useTileSourceStore.setState({ version: 3 });
    expect(terrainTileUrl(18, 5, 7)).toBe('tile-cache://dem/18/5/7.png?v=3');
  });

  it('samples at the source max zoom through the injected loader and returns null on a hole', async () => {
    const calls: number[] = [];
    const loader = async (z: number) => {
      calls.push(z);
      return new Float32Array(256 * 256).fill(41.25);
    };
    expect(await sourceElevation(entry, 53.265, 8.47, loader)).toBeCloseTo(41.25, 6);
    expect(calls).toEqual([18]);
    const holes = async () => new Float32Array(256 * 256).fill(NaN);
    expect(await sourceElevation(entry, 53.265, 8.47, holes)).toBeNull();
    expect(await sourceElevation(entry, 53.265, 8.47, async () => null)).toBeNull();
  });
});
