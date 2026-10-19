import * as THREE from 'three';
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import type { MapVolumeFeature } from '@ardudeck/module-sdk';

const STOCKPILE = '#f59e0b';
const PIT = '#38bdf8';

// Ported from the Locus app's CloudViewer volumeMaterial, so a volume looks the same in both.
function volumeMaterial(dmin: number, dmax: number, pile: string, pit: string, animate: boolean): THREE.ShaderMaterial {
  const raw = Math.max(0.05, (dmax - dmin) / 8);
  const p10 = 10 ** Math.floor(Math.log10(raw));
  const mant = raw / p10;
  const interval = (mant < 1.5 ? 1 : mant < 3.5 ? 2 : mant < 7.5 ? 5 : 10) * p10;
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uInterval: { value: interval },
      uMin: { value: dmin },
      uMax: { value: dmax },
      uAnim: { value: animate ? 1 : 0 },
      uCut: { value: new THREE.Color(pile) },
      uFill: { value: new THREE.Color(pit) },
    },
    vertexShader: `
      attribute float diff;
      varying float vDiff;
      void main() {
        vDiff = diff;
        gl_Position = projectionMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime, uInterval, uMin, uMax, uAnim;
      uniform vec3 uCut, uFill;
      varying float vDiff;
      void main() {
        vec3 col = vDiff >= 0.0 ? uCut : uFill;
        float reach = max(0.5, max(uMax, -uMin));
        float alpha = 0.16 + 0.3 * clamp(abs(vDiff) / reach, 0.0, 1.0);
        float f = vDiff / uInterval;
        float w = fwidth(f) * 1.5;
        float line = 1.0 - smoothstep(0.0, w, min(fract(f), 1.0 - fract(f)));
        float sweep = mix(uMin, uMax, fract(uTime / 4.0));
        float band = uAnim * (1.0 - smoothstep(0.0, uInterval * 0.5, abs(vDiff - sweep)));
        vec3 c = mix(col, vec3(1.0), line * 0.45 + band * 0.5);
        gl_FragColor = vec4(c, clamp(alpha + line * 0.45 + band * 0.35, 0.0, 0.92));
      }`,
  });
}

export interface VolumeLayer {
  layer: CustomLayerInterface;
  setVolumes(volumes: MapVolumeFeature[]): void;
}

/** Cargo volumes on the 3D map, drawn as the Locus app draws them. */
export function createVolumeLayer(getExaggeration: () => number): VolumeLayer {
  let map: maplibregl.Map | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  let ref = { x: 0, y: 0, s: 1 };
  const mats: THREE.ShaderMaterial[] = [];
  let animated = false;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const clear = () => {
    for (const o of [...scene.children]) {
      scene.remove(o);
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !mats.includes(mat as THREE.ShaderMaterial)) mat.dispose();
    }
    for (const m of mats) m.dispose();
    mats.length = 0;
  };

  const local = (lat: number, lng: number, h: number) => {
    const mc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
    return new THREE.Vector3((mc.x - ref.x) / ref.s, h * getExaggeration(), (mc.y - ref.y) / ref.s);
  };

  function build(v: MapVolumeFeature) {
    if (v.cells.length === 0 || v.outline.length < 3) return;
    let dmin = 0, dmax = 0;
    for (const c of v.cells) { dmin = Math.min(dmin, c.d); dmax = Math.max(dmax, c.d); }
    const animate = (v.animate ?? true) && !still;
    animated ||= animate;
    const mat = volumeMaterial(dmin, dmax, v.stockpileColor ?? STOCKPILE, v.pitColor ?? PIT, animate);
    mats.push(mat);

    // the sampled cells meshed into a surface over the ground, as the app does for a bare cloud
    const lat0 = v.cells[0]!.lat;
    const dLat = v.cellM / 110_540;
    const dLng = v.cellM / (111_320 * Math.cos((lat0 * Math.PI) / 180));
    const minLat = Math.min(...v.cells.map((c) => c.lat));
    const minLng = Math.min(...v.cells.map((c) => c.lng));
    const key = new Map<string, number>();
    const ix: number[] = [], iz: number[] = [];
    const pos = new Float32Array(v.cells.length * 3);
    const diff = new Float32Array(v.cells.length);
    v.cells.forEach((c, i) => {
      const p = local(c.lat, c.lng, c.h + 0.15);
      pos.set([p.x, p.y, p.z], i * 3);
      diff[i] = c.d;
      ix[i] = Math.round((c.lng - minLng) / dLng);
      iz[i] = Math.round((c.lat - minLat) / dLat);
      key.set(`${ix[i]},${iz[i]}`, i);
    });
    const index: number[] = [];
    for (let i = 0; i < v.cells.length; i++) {
      const r = key.get(`${ix[i]! + 1},${iz[i]}`), d = key.get(`${ix[i]},${iz[i]! + 1}`), rd = key.get(`${ix[i]! + 1},${iz[i]! + 1}`);
      if (r !== undefined && d !== undefined && rd !== undefined) index.push(i, d, r, r, d, rd);
    }
    if (index.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('diff', new THREE.BufferAttribute(diff, 1));
      g.setIndex(index);
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
    }

    // the base: a translucent floor and walls down from the outline
    const top = v.outline.map((p, i) => local(p.lat, p.lng, v.top[i] ?? 0));
    const floor = v.outline.map((p, i) => local(p.lat, p.lng, v.floor[i] ?? 0));
    const tri = THREE.ShapeUtils.triangulateShape(floor.map((p) => new THREE.Vector2(p.x, p.z)), []);
    const floorGeo = new THREE.BufferGeometry().setFromPoints(floor);
    floorGeo.setIndex(tri.flat());
    const tint = 0x94a3b8;
    const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    const wallPts: THREE.Vector3[] = [];
    for (let i = 0; i < top.length; i++) {
      const j = (i + 1) % top.length;
      wallPts.push(top[i]!, top[j]!, floor[j]!, top[i]!, floor[j]!, floor[i]!);
    }
    const walls = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(wallPts), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(floor), new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0.8, depthTest: false }));
    for (const o of [floorMesh, walls, edge]) { o.frustumCulled = false; scene.add(o); }
  }

  const layer: CustomLayerInterface = {
    id: 'module-volumes',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
    },
    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer || !map || scene.children.length === 0) return;
      const l = new THREE.Matrix4().makeTranslation(ref.x, ref.y, 0).scale(new THREE.Vector3(ref.s, -ref.s, ref.s)).multiply(rotationX);
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as number[]).multiply(l);
      const now = performance.now() / 1000;
      for (const m of mats) m.uniforms['uTime']!.value = now;
      renderer.resetState();
      renderer.render(scene, camera);
      // the sweep moves, so keep drawing while one is on the map
      if (animated) map.triggerRepaint();
    },
    onRemove() {
      clear();
      renderer?.dispose();
      renderer = null;
    },
  };

  return {
    layer,
    setVolumes(volumes) {
      clear();
      animated = false;
      const first = volumes.find((v) => v.cells.length > 0)?.cells[0];
      if (first) {
        const mc = maplibregl.MercatorCoordinate.fromLngLat([first.lng, first.lat], 0);
        ref = { x: mc.x, y: mc.y, s: mc.meterInMercatorCoordinateUnits() };
      }
      for (const v of volumes) build(v);
      map?.triggerRepaint();
    },
  };
}
