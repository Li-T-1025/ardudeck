import { describe, expect, it } from 'vitest';
import type { FenceBudget, FenceProposal, MainHostApi, MapLayerRegistration, SceneMeshRegistration, TileSourceRegistration } from '../host-types';

describe('host-types additions', () => {
  it('accept tile sources, scene meshes, raster layers and exclusion fences', () => {
    const tiles: TileSourceRegistration = { id: 'dsm', name: 'Site DSM', kind: 'dem', footprint: [{ lat: 1, lng: 2 }], tileRoot: '/t', minZoom: 12, maxZoom: 19 };
    const mesh: SceneMeshRegistration = { id: 'm', name: 'Model', glb: '/m.glb', origin: { lat: 1, lng: 2, altMsl: 40 } };
    const layer: MapLayerRegistration = { id: 'ortho', name: 'Ortho', features: () => [], tiles: { sourceId: 'ortho', opacity: 0.8 } };
    const fence: FenceProposal = { name: 'Obstacles', exclusions: [{ name: 'Barn', points: [{ lat: 1, lng: 2 }] }], reason: 'test' };
    const budget: FenceBudget = { capacityBytes: 560, usedBytes: 4, bytesPerVertex: 8, bytesPerPolygon: 2 };
    const api = {} as MainHostApi;
    const tilesApi: MainHostApi['tiles'] | undefined = api.tiles;
    expect(tiles.kind).toBe('dem');
    expect(mesh.origin.altMsl).toBe(40);
    expect(layer.tiles?.sourceId).toBe('ortho');
    expect(fence.inclusion).toBeUndefined();
    expect(budget.bytesPerVertex).toBe(8);
    expect(tilesApi).toBeUndefined();
  });
});
