import { describe, it, expect } from 'vitest';
import {
  appendExclusions,
  summariseFence,
  replaceInclusion,
  type FenceGeometry,
  type FenceWriter,
} from '../module-fence-write';

function poly(id: string, type: 'inclusion' | 'exclusion', n: number) {
  return { id, type, vertices: new Array(n).fill({ lat: 0, lon: 0 }) };
}

function recorder(): FenceWriter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    removePolygon: (id) => calls.push(`-poly:${id}`),
    removeCircle: (id) => calls.push(`-circle:${id}`),
    addPolygon: (type, v) => calls.push(`+${type}:${v.length}`),
  };
}

const held: FenceGeometry = {
  polygons: [poly('polygon-1', 'inclusion', 6), poly('polygon-2', 'exclusion', 4)],
  circles: [
    { id: 'circle-1', type: 'inclusion' },
    { id: 'circle-2', type: 'exclusion' },
  ],
  returnPoint: { lat: 52.5, lon: 13.4 },
};

describe('summariseFence', () => {
  it('counts inclusion shapes and points, and what is kept', () => {
    expect(summariseFence(held)).toEqual({
      inclusionShapes: 2,
      inclusionPoints: 6,
      exclusionShapes: 2,
      hasReturnPoint: true,
    });
  });

  it('reports nothing held on an empty fence', () => {
    expect(summariseFence({ polygons: [], circles: [], returnPoint: null })).toEqual({
      inclusionShapes: 0,
      inclusionPoints: 0,
      exclusionShapes: 0,
      hasReturnPoint: false,
    });
  });

  it('does not count an exclusion-only fence as something to replace', () => {
    const s = summariseFence({
      polygons: [poly('polygon-9', 'exclusion', 5)],
      circles: [],
      returnPoint: null,
    });
    expect(s.inclusionShapes).toBe(0);
    expect(s.exclusionShapes).toBe(1);
  });
});

describe('replaceInclusion', () => {
  const proposed = [
    { lat: 52.5, lng: 13.4 },
    { lat: 52.5, lng: 13.41 },
    { lat: 52.51, lng: 13.41 },
  ];

  it('drops every inclusion shape before adding the proposed one', () => {
    const w = recorder();
    replaceInclusion(held, w, proposed);
    expect(w.calls).toEqual(['-poly:polygon-1', '-circle:circle-1', '+inclusion:3']);
  });

  it('never touches exclusion zones or the return point', () => {
    const w = recorder();
    replaceInclusion(held, w, proposed);
    expect(w.calls.some((c) => c.includes('polygon-2') || c.includes('circle-2'))).toBe(false);
  });

  it('adds the proposal when nothing was held', () => {
    const w = recorder();
    replaceInclusion({ polygons: [], circles: [], returnPoint: null }, w, proposed);
    expect(w.calls).toEqual(['+inclusion:3']);
  });

  it('converts the module lng to the store lon', () => {
    let got: { lat: number; lon: number }[] = [];
    replaceInclusion(
      { polygons: [], circles: [], returnPoint: null },
      { removePolygon: () => {}, removeCircle: () => {}, addPolygon: (_t, v) => { got = v; } },
      proposed,
    );
    expect(got).toEqual([
      { lat: 52.5, lon: 13.4 },
      { lat: 52.5, lon: 13.41 },
      { lat: 52.51, lon: 13.41 },
    ]);
    expect(got.every((p) => Number.isFinite(p.lon))).toBe(true);
  });
});

describe('appendExclusions', () => {
  it('adds each polygon as exclusion and leaves inclusion alone', () => {
    const added: Array<{ type: string; n: number }> = [];
    const removed: string[] = [];
    const write: FenceWriter = {
      removePolygon: (id) => { removed.push(id); },
      removeCircle: () => {},
      addPolygon: (type, v) => { added.push({ type, n: v.length }); },
    };
    const n = appendExclusions(write, [
      { name: 'a', points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] },
      { name: 'b', points: [{ lat: 2, lng: 2 }, { lat: 2, lng: 3 }, { lat: 3, lng: 3 }] },
    ]);
    expect(n).toBe(2);
    expect(added).toEqual([{ type: 'exclusion', n: 3 }, { type: 'exclusion', n: 3 }]);
    expect(removed).toEqual([]);
  });

  it('skips rings with fewer than 3 points', () => {
    const added: unknown[] = [];
    const write: FenceWriter = { removePolygon: () => {}, removeCircle: () => {}, addPolygon: (_t, v) => { added.push(v); } };
    expect(appendExclusions(write, [{ name: 'x', points: [{ lat: 0, lng: 0 }] }])).toBe(0);
    expect(added).toEqual([]);
  });
});
