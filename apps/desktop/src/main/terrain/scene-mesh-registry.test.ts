import { beforeEach, describe, expect, it } from 'vitest';
import { listSceneMeshes, registerSceneMesh, sceneMeshByKey, unregisterSceneMesh, unregisterSceneMeshesFor } from './scene-mesh-registry';

describe('scene-mesh-registry', () => {
  beforeEach(() => {
    for (const e of listSceneMeshes()) unregisterSceneMeshesFor(e.slug);
  });

  it('registers with a url the renderer can load and removes by id or slug', () => {
    const e = registerSceneMesh('com.x', { id: 'site', name: 'Site', glb: '/p/model.glb', origin: { lat: 1, lng: 2, altMsl: 40 } });
    expect(e.key).toBe('com.x::site');
    expect(e.url).toBe('ardudeck-asset://mesh/com.x%3A%3Asite.glb');
    expect(sceneMeshByKey('com.x::site')?.glb).toBe('/p/model.glb');
    unregisterSceneMesh('com.x', 'site');
    expect(listSceneMeshes()).toEqual([]);
    registerSceneMesh('com.x', { id: 'a', name: 'A', glb: '/a.glb', origin: { lat: 0, lng: 0, altMsl: 0 } });
    registerSceneMesh('com.y', { id: 'a', name: 'A', glb: '/b.glb', origin: { lat: 0, lng: 0, altMsl: 0 } });
    unregisterSceneMeshesFor('com.x');
    expect(listSceneMeshes().map((m) => m.slug)).toEqual(['com.y']);
  });

  it('rejects a mesh without a glb path', () => {
    expect(() => registerSceneMesh('com.x', { id: 'bad', name: 'Bad', glb: '', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
  });
});
