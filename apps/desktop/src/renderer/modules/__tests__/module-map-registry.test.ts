import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MapFeature, MapLayerRegistration } from '@ardudeck/module-sdk';
import {
  registerModuleMapLayer,
  unregisterModuleMapLayer,
  unregisterModuleMapLayersFor,
  getModuleMapLayers,
  subscribeModuleMapLayers,
  featuresOf,
  isLayerVisible,
  setLayerVisible,
  startPolygonPick,
  getPolygonPick,
  addPickPoint,
  undoPickPoint,
  finishPick,
  cancelPick,
} from '../module-map-registry';

const SLUG = 'com.example.test';
const OTHER = 'com.example.other';

const poly: MapFeature = {
  kind: 'polygon',
  points: [
    { lat: 52.5, lng: 13.4 },
    { lat: 52.5, lng: 13.41 },
    { lat: 52.51, lng: 13.41 },
  ],
  stroke: '#22C55E',
};

function layer(id: string, extra: Partial<MapLayerRegistration> = {}): MapLayerRegistration {
  return { id, name: id, features: () => [poly], ...extra };
}

beforeEach(() => {
  unregisterModuleMapLayersFor(SLUG);
  unregisterModuleMapLayersFor(OTHER);
});

describe('module map registry', () => {
  it('keeps two modules that chose the same layer id apart', () => {
    registerModuleMapLayer(SLUG, layer('volumes'));
    registerModuleMapLayer(OTHER, layer('volumes'));
    expect(getModuleMapLayers()).toHaveLength(2);

    unregisterModuleMapLayer(SLUG, 'volumes');
    const left = getModuleMapLayers();
    expect(left).toHaveLength(1);
    expect(left[0]!.slug).toBe(OTHER);
  });

  it('refuses to remove another module’s layer', () => {
    registerModuleMapLayer(OTHER, layer('volumes'));
    unregisterModuleMapLayer(SLUG, 'volumes');
    expect(getModuleMapLayers()).toHaveLength(1);
  });

  it('draws low order first', () => {
    registerModuleMapLayer(SLUG, layer('b', { order: 5 }));
    registerModuleMapLayer(SLUG, layer('a', { order: 1 }));
    expect(getModuleMapLayers().map((l) => l.reg.id)).toEqual(['a', 'b']);
  });

  it('replaces a re-registered id and stops the old watcher', () => {
    const stop = vi.fn();
    registerModuleMapLayer(SLUG, layer('volumes', { subscribe: () => stop }));
    registerModuleMapLayer(SLUG, layer('volumes'));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(getModuleMapLayers()).toHaveLength(1);
  });

  it('redraws when a live layer says it changed', () => {
    const seen = vi.fn();
    let fire = () => {};
    registerModuleMapLayer(
      SLUG,
      layer('volumes', {
        subscribe: (cb) => {
          fire = cb;
          return () => {};
        },
      }),
    );
    const off = subscribeModuleMapLayers(seen);
    fire();
    expect(seen).toHaveBeenCalled();
    off();
  });

  it('survives a module whose features() throws', () => {
    registerModuleMapLayer(
      SLUG,
      layer('bad', {
        features: () => {
          throw new Error('module bug');
        },
      }),
    );
    expect(featuresOf(getModuleMapLayers()[0]!)).toEqual([]);
  });

  it('survives a module whose subscribe() throws, keeping its static drawing', () => {
    registerModuleMapLayer(
      SLUG,
      layer('half-broken', {
        subscribe: () => {
          throw new Error('module bug');
        },
      }),
    );
    expect(getModuleMapLayers()).toHaveLength(1);
    expect(featuresOf(getModuleMapLayers()[0]!)).toHaveLength(1);
  });

  it('honours defaultVisible false, and the pilot’s choice afterwards', () => {
    registerModuleMapLayer(SLUG, layer('quiet', { defaultVisible: false }));
    const key = getModuleMapLayers()[0]!.key;
    expect(isLayerVisible(key)).toBe(false);

    setLayerVisible(key, true);
    expect(isLayerVisible(key)).toBe(true);
  });

  it('forgets visibility when the layer goes, so a reinstall starts clean', () => {
    registerModuleMapLayer(SLUG, layer('volumes'));
    const key = getModuleMapLayers()[0]!.key;
    setLayerVisible(key, false);
    unregisterModuleMapLayer(SLUG, 'volumes');

    registerModuleMapLayer(SLUG, layer('volumes'));
    expect(isLayerVisible(getModuleMapLayers()[0]!.key)).toBe(true);
  });

  it('sweeps everything a module registered on unload', () => {
    const stop = vi.fn();
    registerModuleMapLayer(SLUG, layer('a', { subscribe: () => stop }));
    registerModuleMapLayer(SLUG, layer('b'));
    registerModuleMapLayer(OTHER, layer('c'));

    unregisterModuleMapLayersFor(SLUG);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(getModuleMapLayers().map((l) => l.slug)).toEqual([OTHER]);
  });

  it('rejects a layer with no id or no features', () => {
    expect(() => registerModuleMapLayer(SLUG, { name: 'x' } as MapLayerRegistration)).toThrow();
    expect(() =>
      registerModuleMapLayer(SLUG, { id: 'x', name: 'x' } as MapLayerRegistration),
    ).toThrow();
  });
});

describe('polygon picking', () => {
  it('replaces the pick object on every change', () => {
    // React compares state by reference. Mutating the pick in place meant the
    // component compared a value against itself and skipped the render, so
    // corners went in and nothing on screen moved.
    void startPolygonPick('draw');
    const a = getPolygonPick();
    addPickPoint({ lat: 1, lng: 1 });
    const b = getPolygonPick();
    expect(b).not.toBe(a);
    expect(b!.points).toHaveLength(1);
    cancelPick();
  });

  it('tells its subscribers a corner went in', () => {
    const seen = vi.fn();
    void startPolygonPick('draw');
    const off = subscribeModuleMapLayers(seen);
    addPickPoint({ lat: 1, lng: 1 });
    expect(seen).toHaveBeenCalled();
    off();
    cancelPick();
  });

  it('undo takes the last corner back', () => {
    void startPolygonPick('draw');
    addPickPoint({ lat: 1, lng: 1 });
    addPickPoint({ lat: 2, lng: 2 });
    undoPickPoint();
    expect(getPolygonPick()!.points).toHaveLength(1);
    cancelPick();
  });

  it('two corners is not an area, so finishing cancels', async () => {
    const p = startPolygonPick('draw');
    addPickPoint({ lat: 1, lng: 1 });
    addPickPoint({ lat: 2, lng: 2 });
    finishPick();
    await expect(p).resolves.toBeNull();
  });

  it('three corners resolves with the ring', async () => {
    const p = startPolygonPick('draw');
    addPickPoint({ lat: 1, lng: 1 });
    addPickPoint({ lat: 2, lng: 2 });
    addPickPoint({ lat: 3, lng: 1 });
    finishPick();
    await expect(p).resolves.toHaveLength(3);
  });

  it('a second request does not hijack the one in progress', async () => {
    const first = startPolygonPick('first');
    const second = await startPolygonPick('second');
    expect(second).toBeNull();
    expect(getPolygonPick()!.prompt).toBe('first');
    cancelPick();
    await expect(first).resolves.toBeNull();
  });
});

describe('raster tile layers', () => {
  it('keeps the tiles reference and builds the host tile url', () => {
    registerModuleMapLayer('com.x', { id: 'ortho', name: 'Ortho', features: () => [], tiles: { sourceId: 'ortho', opacity: 0.7 } });
    const layer = getModuleMapLayers().find((l) => l.key === 'com.x::ortho');
    expect(layer?.reg.tiles?.sourceId).toBe('ortho');
    expect(layer?.tileUrl).toBe('tile-cache://ts-com.x%3A%3Aortho/{z}/{x}/{y}.png');
    unregisterModuleMapLayersFor('com.x');
  });
});

describe('the pilot choosing a cargo layer on or off', () => {
  it('is kept when the cargo reloads', async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } });
    const reg = await import('../module-map-registry');
    const layer = { id: 'grid', name: 'Grid', defaultVisible: false, features: () => [] };
    reg.registerModuleMapLayer('com.test.keep', layer);
    const key = reg.getModuleMapLayers().find((l) => l.slug === 'com.test.keep')!.key;
    expect(reg.isLayerVisible(key)).toBe(false);
    reg.setLayerVisible(key, true);
    reg.unregisterModuleMapLayersFor('com.test.keep');
    reg.registerModuleMapLayer('com.test.keep', layer);
    expect(reg.isLayerVisible(key)).toBe(true);
    reg.unregisterModuleMapLayersFor('com.test.keep');
    vi.unstubAllGlobals();
  });
});
