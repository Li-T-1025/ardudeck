import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const loads: string[] = [];
const disposed: string[] = [];

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    load(url: string, onLoad: (g: { scene: THREE.Group }) => void) {
      loads.push(url);
      const group = new THREE.Group();
      const geometry = new THREE.BufferGeometry();
      geometry.dispose = () => { disposed.push(`geo:${url}`); };
      const material = new THREE.MeshBasicMaterial();
      material.dispose = () => { disposed.push(`mat:${url}`); };
      group.add(new THREE.Mesh(geometry, material));
      onLoad({ scene: group });
    }
  },
}));

import { loadGltfScene, releaseGltf } from './gltf-cache';

describe('gltf-cache', () => {
  it('loads once per url and version, and releases geometry and materials on eviction', async () => {
    await loadGltfScene('ardudeck-asset://mesh/a.glb', 1);
    await loadGltfScene('ardudeck-asset://mesh/a.glb', 1);
    expect(loads).toHaveLength(1);
    await loadGltfScene('ardudeck-asset://mesh/a.glb', 2);
    expect(loads).toHaveLength(2);
    await releaseGltf('ardudeck-asset://mesh/a.glb', 1);
    expect(disposed).toEqual(['geo:ardudeck-asset://mesh/a.glb', 'mat:ardudeck-asset://mesh/a.glb']);
    await loadGltfScene('ardudeck-asset://mesh/a.glb', 1);
    expect(loads).toHaveLength(3);
  });
});
