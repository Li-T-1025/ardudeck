import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const cache = new Map<string, Promise<THREE.Group>>();
const loader = new GLTFLoader();

/** Loads a GLB once per url and version; every call gets its own clone to place. */
export function loadGltfScene(url: string, version: number): Promise<THREE.Group> {
  const key = `${url}@${version}`;
  let p = cache.get(key);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => loader.load(url, (g) => resolve(g.scene), undefined, reject));
    cache.set(key, p);
  }
  return p.then((g) => g.clone(true));
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
      m?.dispose();
    }
  });
}

/** Drops one cached version and frees its GPU resources. Clones placed in scenes share them, so remove those first. */
export async function releaseGltf(url: string, version: number): Promise<void> {
  const key = `${url}@${version}`;
  const p = cache.get(key);
  cache.delete(key);
  if (!p) return;
  try {
    disposeGroup(await p);
  } catch {
    // a load that failed has nothing to free
  }
}
