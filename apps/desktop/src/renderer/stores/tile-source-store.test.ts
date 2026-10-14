import { describe, expect, it } from 'vitest';
import { demSourceAt, pointInRing, useTileSourceStore } from './tile-source-store';

const ring = [{ lat: 53.27, lng: 8.46 }, { lat: 53.27, lng: 8.48 }, { lat: 53.26, lng: 8.48 }, { lat: 53.26, lng: 8.46 }];

describe('tile-source-store', () => {
  it('point in ring', () => {
    expect(pointInRing(53.265, 8.47, ring)).toBe(true);
    expect(pointInRing(53.28, 8.47, ring)).toBe(false);
  });

  it('picks the highest priority dem source containing the point', () => {
    useTileSourceStore.setState({
      entries: [
        { slug: 'a', key: 'a::lo', id: 'lo', name: 'lo', kind: 'dem', footprint: ring, tileRoot: '/', minZoom: 12, maxZoom: 19, priority: 0 },
        { slug: 'a', key: 'a::hi', id: 'hi', name: 'hi', kind: 'dem', footprint: ring, tileRoot: '/', minZoom: 12, maxZoom: 19, priority: 3 },
        { slug: 'a', key: 'a::ortho', id: 'ortho', name: 'o', kind: 'raster', footprint: ring, tileRoot: '/', minZoom: 12, maxZoom: 19, priority: 9 },
      ],
      version: 1,
    });
    expect(demSourceAt(53.265, 8.47)?.id).toBe('hi');
    expect(demSourceAt(53.3, 8.47)).toBeNull();
  });
});

import { demSourceMaxZoom, tileVersionSuffix } from './tile-source-store';

describe('dem zoom and version helpers', () => {
  it('raises the raster-dem max zoom only while a dem source exists', () => {
    const base = { slug: 'a', name: 'x', footprint: ring, tileRoot: '/', minZoom: 12, maxZoom: 19 };
    expect(demSourceMaxZoom([])).toBe(15);
    expect(demSourceMaxZoom([{ ...base, key: 'a::o', id: 'o', kind: 'raster' }])).toBe(15);
    expect(demSourceMaxZoom([{ ...base, key: 'a::d', id: 'd', kind: 'dem' }])).toBe(19);
  });
  it('version suffix follows the store version', () => {
    useTileSourceStore.setState({ version: 7 });
    expect(tileVersionSuffix()).toBe('?v=7');
  });
});
