// Owns hit-testing and drag because only the layer knows where waypoints sit on screen.
import * as THREE from 'three';
import maplibregl, { type CustomLayerInterface, type CustomRenderMethodInput } from 'maplibre-gl';
import type { Line3D } from './mission-3d-geometry';
import { canvasPoint, lockMapGestures } from './map-gesture-lock';
import { wheelDeltas } from '../logs/log-chart-gestures';

export interface MissionLayerWaypoint {
  seq: number;
  lat: number;
  lon: number;
  /** m MSL */
  alt: number;
  /** m MSL */
  ground: number;
  color: string;
  label: string;
  /** Survey points stay dots at every zoom; pins materialize when few are in view. */
  kind: 'pin' | 'dot';
}

export interface MissionLayerData {
  lines: Line3D[];
  waypoints: MissionLayerWaypoint[];
  selectedSeq: number | null;
  exaggeration: number;
  editable: boolean;
  /** False while something else owns map clicks (a cargo asking for points). */
  interactive: boolean;
  /** Pins materialize only while at most this many are in view. */
  maxPins: number;
}

/** The preview aircraft (m MSL, heading from north) and the ground patch its camera looks at. */
export interface PreviewPose {
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  cone?: Array<{ lat: number; lon: number; alt: number }>;
}

export interface MissionLayerCallbacks {
  onSelect(seq: number): void;
  /** Live while dragging; `null` ends the preview without a change. */
  onPreview(p: { seq: number; lat: number; lon: number; alt: number } | null): void;
  onCommit(p: { seq: number; lat: number; lon: number; alt: number; mode: 'move' | 'altitude' }): void;
  /** Label for the selected waypoint's height, e.g. "120 m REL". */
  altitudeLabel(seq: number, altMsl: number): string;
  /** Tooltip for the altitude handle. */
  handleTip: string;
}

export interface MissionThreeJsLayer {
  layer: CustomLayerInterface;
  updateData(data: MissionLayerData): void;
  setMarkerContainer(container: HTMLDivElement | null): void;
  /** Whether a canvas point is on a waypoint, so a map click there is not also a click on the ground. */
  hitAt(x: number, y: number): boolean;
  /** The flight-preview aircraft, or null to hide it. `alt` is m MSL, `heading` degrees from north. */
  setPreviewPose(pose: PreviewPose | null): void;
  dispose(): void;
}

const PATH_HALF_PX = 2.5;
const HIT_PX = 12;
const DRAG_START_PX = 3;
const DOT_PX = 7;
const PIN_DOT_PX = 11;
const PIN_PX = 26;
const WHEEL_M_PER_PX = 0.05;
/** The local origin follows the mission only once it is this far away (float precision). */
const REREF_M = 20_000;
/** Larger single steps only happen edge-on to the ground; they are dropped, not applied. */
const MAX_STEP_M = 500;
const WHEEL_COMMIT_MS = 450;

const RIBBON_VERT = `
attribute vec3 aOffset;
attribute vec3 aColor;
uniform float uHalfWidth;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * vec4(position + aOffset * uHalfWidth, 1.0);
}`;
const RIBBON_FRAG = `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 0.92); }`;

const DOT_VERT = `
attribute vec3 aColor;
attribute float aSize;
uniform float uPixelRatio;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
}`;
const DOT_FRAG = `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  vec3 col = r > 0.36 ? vec3(1.0) : vColor;
  gl_FragColor = vec4(col, 1.0);
}`;

interface Local { x: number; y: number; z: number }

export function createMissionThreeJsLayer(cb: MissionLayerCallbacks): MissionThreeJsLayer {
  let map: maplibregl.Map | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  let ref = { x: 0, y: 0, z: 0, s: 1, lat: 0 };
  let refSet = false;

  const ribbonMat = new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
    uniforms: { uHalfWidth: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const dotMat = new THREE.ShaderMaterial({
    vertexShader: DOT_VERT, fragmentShader: DOT_FRAG,
    uniforms: { uPixelRatio: { value: window.devicePixelRatio || 1 } }, transparent: false, depthTest: false,
  });
  const dropMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
  let ribbon: THREE.Mesh | null = null;
  let dots: THREE.Points | null = null;
  let drops: THREE.LineSegments | null = null;

  let data: MissionLayerData = { lines: [], waypoints: [], selectedSeq: null, exaggeration: 1, editable: false, interactive: true, maxPins: 200 };
  let local: Local[] = [];
  let screen = new Float32Array(0);
  let onScreen = new Uint8Array(0);

  let markerContainer: HTMLDivElement | null = null;
  const pins = new Map<number, HTMLDivElement>();
  let handle: HTMLDivElement | null = null;
  let previewPose: PreviewPose | null = null;
  let coneObj: THREE.Group | null = null;
  const coneFill = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const coneEdge = new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9, depthWrite: false });

  function rebuildCone() {
    if (coneObj) {
      scene.remove(coneObj);
      for (const c of coneObj.children) (c as THREE.Mesh).geometry.dispose();
      coneObj = null;
    }
    if (!previewPose?.cone || previewPose.cone.length < 2 || !refSet) return;
    const apex = toLocal(previewPose.lat, previewPose.lon, previewPose.alt);
    const base = previewPose.cone.map((p) => toLocal(p.lat, p.lon, p.alt));
    const tris: THREE.Vector3[] = [];
    const edges: THREE.Vector3[] = [];
    for (let i = 0; i < base.length; i++) {
      const a = base[i]!, b = base[(i + 1) % base.length]!;
      tris.push(new THREE.Vector3(apex.x, apex.y, apex.z), new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z));
      edges.push(new THREE.Vector3(apex.x, apex.y, apex.z), new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z));
    }
    coneObj = new THREE.Group();
    const fill = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tris), coneFill);
    const edge = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edges), coneEdge);
    fill.frustumCulled = false;
    edge.frustumCulled = false;
    coneObj.add(fill, edge);
    scene.add(coneObj);
  }
  let previewEl: HTMLDivElement | null = null;
  let altTag: HTMLDivElement | null = null;

  type Drag = { seq: number; index: number; mode: 'move' | 'altitude'; x0: number; y0: number; started: boolean; lat: number; lon: number; alt: number; pxPerM: number; pointerId: number; unlock: () => void; lastX: number; lastY: number; alt0: number; ground0: number };
  let drag: Drag | null = null;
  let dragLogs = 0;
  let wheelAlt: number | null = null;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;

  const toLocal = (lat: number, lon: number, alt: number): Local => {
    const mc = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
    return { x: (mc.x - ref.x) / ref.s, y: alt * data.exaggeration, z: (mc.y - ref.y) / ref.s };
  };

  function disposeObj(o: THREE.Mesh | THREE.Points | THREE.LineSegments | null) {
    if (!o) return;
    scene.remove(o);
    o.geometry.dispose();
  }

  function rebuild() {
    disposeObj(ribbon); disposeObj(dots); disposeObj(drops);
    ribbon = dots = drops = null;
    const first = data.waypoints[0] ?? data.lines[0]?.points[0];
    if (!first) { local = []; return; }
    {
      const lat = 'lat' in first ? first.lat : 0;
      const lon = 'lon' in first ? first.lon : 0;
      const mc = maplibregl.MercatorCoordinate.fromLngLat([lon, lat], 0);
      // the origin stays put while a drag runs, and otherwise until the mission is far away:
      // moving it under a drag makes the drag chase itself
      const far = !refSet || Math.hypot(mc.x - ref.x, mc.y - ref.y) / ref.s > REREF_M;
      if (!drag && far) {
        ref = { x: mc.x, y: mc.y, z: mc.z, s: mc.meterInMercatorCoordinateUnits(), lat };
        refSet = true;
      }
    }

    // legs: per segment a flat and an upright quad, so the path reads from above and from the side
    const pos: number[] = [];
    const off: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const line of data.lines) {
      c.set(line.color);
      const pts = line.points.map((p) => toLocal(p.lat, p.lon, p.alt));
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!, b = pts[i + 1]!;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const px = -dz / len, pz = dx / len;
        const quad = (o: [number, number, number]) => {
          const v: Array<[Local, number]> = [[a, -1], [a, 1], [b, 1], [a, -1], [b, 1], [b, -1]];
          for (const [p, sgn] of v) {
            pos.push(p.x, p.y, p.z);
            off.push(o[0] * sgn, o[1] * sgn, o[2] * sgn);
            col.push(c.r, c.g, c.b);
          }
        };
        quad([px, 0, pz]);
        quad([0, 1, 0]);
      }
    }
    if (pos.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aOffset', new THREE.Float32BufferAttribute(off, 3));
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
      ribbon = new THREE.Mesh(g, ribbonMat);
      ribbon.frustumCulled = false;
      scene.add(ribbon);
    }

    local = data.waypoints.map((w) => toLocal(w.lat, w.lon, w.alt));
    const dPos: number[] = [];
    const dCol: number[] = [];
    const dSize: number[] = [];
    const lPos: number[] = [];
    const lCol: number[] = [];
    data.waypoints.forEach((w, i) => {
      const p = local[i]!;
      c.set(w.color);
      const selected = w.seq === data.selectedSeq;
      dPos.push(p.x, p.y, p.z);
      dCol.push(c.r, c.g, c.b);
      dSize.push(w.kind === 'dot' ? (selected ? PIN_DOT_PX : DOT_PX) : PIN_DOT_PX);
      if (w.kind === 'pin' || selected) {
        const g = toLocal(w.lat, w.lon, w.ground);
        const shade = selected ? 1 : 0.65;
        lPos.push(p.x, p.y, p.z, g.x, g.y, g.z);
        lCol.push(shade, shade, shade, shade, shade, shade);
      }
    });
    if (dPos.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(dCol, 3));
      g.setAttribute('aSize', new THREE.Float32BufferAttribute(dSize, 1));
      dots = new THREE.Points(g, dotMat);
      dots.frustumCulled = false;
      dots.renderOrder = 2;
      scene.add(dots);
    }
    if (lPos.length > 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lPos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(lCol, 3));
      drops = new THREE.LineSegments(g, dropMat);
      drops.frustumCulled = false;
      scene.add(drops);
    }
    screen = new Float32Array(local.length * 2);
    onScreen = new Uint8Array(local.length);
    for (const el of pins.values()) el.remove();
    pins.clear();
  }

  function pinElement(w: MissionLayerWaypoint): HTMLDivElement {
    const el = document.createElement('div');
    const selected = w.seq === data.selectedSeq;
    const size = selected ? PIN_PX + 4 : PIN_PX;
    el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform;';
    el.innerHTML = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${w.color};border:${selected ? 3 : 2}px solid ${selected ? '#fff' : 'rgba(255,255,255,0.85)'};box-shadow:0 2px 6px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;font:600 ${selected ? 13 : 12}px Inter,system-ui,sans-serif;color:#fff;user-select:none;"></div>`;
    (el.firstChild as HTMLDivElement).textContent = w.label;
    return el;
  }

  function ensureHandle(): void {
    if (!markerContainer || handle) return;
    handle = document.createElement('div');
    handle.style.cssText = 'position:absolute;left:0;top:0;pointer-events:auto;cursor:ns-resize;will-change:transform;display:none;';
    handle.innerHTML = '<div style="width:22px;height:30px;border-radius:11px;background:rgba(15,23,42,0.85);border:1.5px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 2px 6px rgba(0,0,0,0.45)"><svg width="12" height="8" viewBox="0 0 12 8"><path d="M1 7l5-5 5 5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg><svg width="12" height="8" viewBox="0 0 12 8"><path d="M1 1l5 5 5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div>';
    handle.title = cb.handleTip;
    const h = handle;
    h.style.touchAction = 'none';
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || data.selectedSeq === null || !map) return;
      const index = data.waypoints.findIndex((w) => w.seq === data.selectedSeq);
      if (index < 0) return;
      e.preventDefault();
      e.stopPropagation();
      h.setPointerCapture(e.pointerId);
      const p = canvasPoint(map, e);
      beginDrag(index, 'altitude', p.x, p.y, e.pointerId);
      drag!.started = true;
    });
    h.addEventListener('pointermove', (e) => {
      if (drag && drag.pointerId === e.pointerId && map) {
        const p = canvasPoint(map, e);
        dragTo(p.x, p.y);
      }
    });
    const release = (commit: boolean) => (e: PointerEvent) => {
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (h.hasPointerCapture(e.pointerId)) h.releasePointerCapture(e.pointerId);
      endDrag(false, commit);
    };
    h.addEventListener('pointerup', release(true));
    h.addEventListener('pointercancel', release(false));
    // two-finger scroll on the handle nudges the height, the natural gesture on a trackpad
    h.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!data.editable || data.selectedSeq === null) return;
      const index = data.waypoints.findIndex((w) => w.seq === data.selectedSeq);
      if (index < 0) return;
      const w = data.waypoints[index]!;
      wheelAlt = Math.max(w.ground + 1, (wheelAlt ?? w.alt) - wheelDeltas(e).dominant * WHEEL_M_PER_PX);
      cb.onPreview({ seq: w.seq, lat: w.lat, lon: w.lon, alt: wheelAlt });
      if (wheelTimer) clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        if (wheelAlt !== null) cb.onCommit({ seq: w.seq, lat: w.lat, lon: w.lon, alt: wheelAlt, mode: 'altitude' });
        wheelAlt = null;
        wheelTimer = null;
        cb.onPreview(null);
      }, WHEEL_COMMIT_MS);
    }, { passive: false });
    markerContainer.appendChild(handle);
    altTag = document.createElement('div');
    altTag.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform;display:none;padding:2px 6px;border-radius:6px;background:rgba(15,23,42,0.85);color:#fff;font:600 11px Inter,system-ui,sans-serif;white-space:nowrap;font-variant-numeric:tabular-nums;';
    markerContainer.appendChild(altTag);
  }

  /** Project every waypoint, then materialize pins the 2D way. */
  function project(proj: THREE.Matrix4) {
    if (!map) return;
    const cw = map.getCanvas().clientWidth;
    const ch = map.getCanvas().clientHeight;
    const v = new THREE.Vector4();
    let pinsInView = 0;
    for (let i = 0; i < local.length; i++) {
      const p = local[i]!;
      v.set(p.x, p.y, p.z, 1).applyMatrix4(proj);
      if (v.w <= 0) { onScreen[i] = 0; continue; }
      const sx = (v.x / v.w * 0.5 + 0.5) * cw;
      const sy = (1 - (v.y / v.w * 0.5 + 0.5)) * ch;
      screen[i * 2] = sx;
      screen[i * 2 + 1] = sy;
      const vis = sx > -40 && sx < cw + 40 && sy > -40 && sy < ch + 40;
      onScreen[i] = vis ? 1 : 0;
      if (vis && data.waypoints[i]!.kind === 'pin') pinsInView++;
    }
    if (!markerContainer) return;
    const showPins = pinsInView <= data.maxPins;
    const wanted = new Set<number>();
    data.waypoints.forEach((w, i) => {
      if (!onScreen[i]) return;
      if ((showPins && w.kind === 'pin') || w.seq === data.selectedSeq) wanted.add(i);
    });
    for (const [i, el] of pins) if (!wanted.has(i)) { el.remove(); pins.delete(i); }
    for (const i of wanted) {
      let el = pins.get(i);
      if (!el) { el = pinElement(data.waypoints[i]!); markerContainer.appendChild(el); pins.set(i, el); }
      el.style.transform = `translate(${screen[i * 2]}px,${screen[i * 2 + 1]}px) translate(-50%,-50%)`;
    }
    if (previewPose && markerContainer) {
      if (!previewEl) {
        previewEl = document.createElement('div');
        previewEl.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;will-change:transform;z-index:20000;';
        previewEl.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.6))"><path d="M12 2 L19 20 L12 16 L5 20 Z" fill="#22d3ee" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        markerContainer.appendChild(previewEl);
      }
      const at = toScreen(toLocal(previewPose.lat, previewPose.lon, previewPose.alt));
      previewEl.style.display = at ? '' : 'none';
      if (at) previewEl.style.transform = `translate(${at.x}px,${at.y}px) translate(-50%,-50%) rotate(${previewPose.heading - map.getBearing()}deg)`;
    } else if (previewEl) {
      previewEl.remove();
      previewEl = null;
    }
    ensureHandle();
    const sel = data.selectedSeq === null ? -1 : data.waypoints.findIndex((w) => w.seq === data.selectedSeq);
    const showSel = sel >= 0 && onScreen[sel] === 1;
    if (handle) {
      handle.style.display = showSel && data.editable ? '' : 'none';
      if (showSel) handle.style.transform = `translate(${screen[sel * 2]! + 22}px,${screen[sel * 2 + 1]}px) translate(-50%,-50%)`;
    }
    if (altTag) {
      altTag.style.display = showSel ? '' : 'none';
      if (showSel) {
        altTag.textContent = cb.altitudeLabel(data.waypoints[sel]!.seq, data.waypoints[sel]!.alt);
        altTag.style.transform = `translate(${screen[sel * 2]! + 38}px,${screen[sel * 2 + 1]}px) translate(0,-50%)`;
      }
    }
  }

  function hit(x: number, y: number): number {
    let best = -1;
    let bestD = HIT_PX * HIT_PX;
    for (let i = 0; i < local.length; i++) {
      if (!onScreen[i]) continue;
      const dx = screen[i * 2]! - x, dy = screen[i * 2 + 1]! - y;
      const d = dx * dx + dy * dy;
      // the selected one wins ties, so it can always be grabbed
      if (d < bestD || (d <= bestD + 1 && data.waypoints[i]!.seq === data.selectedSeq)) { bestD = d; best = i; }
    }
    return best;
  }

  /** Screen pixels per metre of height at a waypoint, from the live projection. */
  function pxPerMetre(index: number): number {
    const p = local[index]!;
    const a = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(camera.projectionMatrix);
    const b = new THREE.Vector4(p.x, p.y + 10 * data.exaggeration, p.z, 1).applyMatrix4(camera.projectionMatrix);
    const ch = map!.getCanvas().clientHeight;
    const dy = ((b.y / b.w) - (a.y / a.w)) * 0.5 * ch;
    // seen from above a height change barely moves on screen; never let one pixel be more than two of ground
    const groundPxPerM = (512 * 2 ** map!.getZoom()) / (40_075_016.686 * Math.cos((ref.lat * Math.PI) / 180));
    return Math.max(Math.abs(dy) / 10, groundPxPerM * 0.5);
  }

  function toScreen(p: Local): { x: number; y: number } | null {
    if (!map) return null;
    const v = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(camera.projectionMatrix);
    if (v.w <= 0) return null;
    return { x: (v.x / v.w * 0.5 + 0.5) * map.getCanvas().clientWidth, y: (1 - (v.y / v.w * 0.5 + 0.5)) * map.getCanvas().clientHeight };
  }

  /** A cursor move in pixels as metres east and north at a point and height, from the projection that draws it. */
  function pixelsToMetres(lat: number, lon: number, alt: number, dx: number, dy: number): { east: number; north: number } | null {
    const dLat = 1 / 111_320;
    const dLon = 1 / (111_320 * Math.cos((lat * Math.PI) / 180));
    const o = toScreen(toLocal(lat, lon, alt));
    const e = toScreen(toLocal(lat, lon + dLon, alt));
    const n = toScreen(toLocal(lat + dLat, lon, alt));
    if (!o || !e || !n) return null;
    const ex = e.x - o.x, ey = e.y - o.y, nx = n.x - o.x, ny = n.y - o.y;
    const det = ex * ny - ey * nx;
    // edge-on to the ground plane the move has no defined place: skip it
    if (Math.abs(det) < 1e-4) return null;
    return { east: (dx * ny - dy * nx) / det, north: (ex * dy - ey * dx) / det };
  }

  function beginDrag(index: number, mode: 'move' | 'altitude', x: number, y: number, pointerId: number) {
    const w = data.waypoints[index]!;
    dragLogs = 0;
    drag = {
      seq: w.seq, index, mode, x0: x, y0: y, started: false, lat: w.lat, lon: w.lon, alt: w.alt,
      pxPerM: pxPerMetre(index), pointerId, unlock: lockMapGestures(map!),
      lastX: x, lastY: y, alt0: w.alt, ground0: w.ground,
    };
  }

  function dragTo(x: number, y: number) {
    if (!drag || !map) return;
    if (!drag.started) {
      if (Math.hypot(x - drag.x0, y - drag.y0) < DRAG_START_PX) return;
      drag.started = true;
      map.getCanvas().style.cursor = drag.mode === 'altitude' ? 'ns-resize' : 'grabbing';
    }
    if (drag.mode === 'altitude') {
      // from the height at the press, not the live preview, or each step adds onto the last
      drag.alt = Math.max(drag.ground0 + 1, drag.alt0 + (drag.y0 - y) / drag.pxPerM);
      if (import.meta.env.DEV && dragLogs++ < 6) console.debug('[3d-drag]', { y, y0: drag.y0, pxPerM: drag.pxPerM, alt0: drag.alt0, alt: drag.alt }); // i18n-exempt: dev log
    } else {
      // each cursor step becomes metres at the waypoint's own height, so it moves 1:1 with the cursor
      const m = pixelsToMetres(drag.lat, drag.lon, drag.alt, x - drag.lastX, y - drag.lastY);
      drag.lastX = x;
      drag.lastY = y;
      if (!m || !Number.isFinite(m.east) || !Number.isFinite(m.north) || Math.hypot(m.east, m.north) > MAX_STEP_M) return;
      drag.lat += m.north / 111_320;
      drag.lon += m.east / (111_320 * Math.cos((drag.lat * Math.PI) / 180));
      if (import.meta.env.DEV && dragLogs++ < 6) console.debug('[3d-drag]', { x, y, east: m.east, north: m.north, lat: drag.lat, lon: drag.lon }); // i18n-exempt: dev log
    }
    cb.onPreview({ seq: drag.seq, lat: drag.lat, lon: drag.lon, alt: drag.alt });
  }

  function endDrag(click: boolean, commit = true) {
    if (!drag || !map) return;
    const d = drag;
    drag = null;
    d.unlock();
    map.getCanvas().style.cursor = '';
    if (d.started && commit && data.editable) cb.onCommit({ seq: d.seq, lat: d.lat, lon: d.lon, alt: d.alt, mode: d.mode });
    else if (!d.started && click) cb.onSelect(d.seq);
    cb.onPreview(null);
  }

  // Pointer events with capture, not MapLibre's mouse events: a trackpad drag that crosses a
  // marker or leaves the canvas still ends here, and preventDefault keeps MapLibre from panning.
  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !data.interactive || !map || drag) return;
    const p = canvasPoint(map, e);
    const i = hit(p.x, p.y);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    map.getCanvasContainer().setPointerCapture(e.pointerId);
    const altMode = data.editable && e.shiftKey && data.waypoints[i]!.seq === data.selectedSeq;
    beginDrag(i, altMode ? 'altitude' : 'move', p.x, p.y, e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!map) return;
    const p = canvasPoint(map, e);
    if (drag) {
      if (drag.pointerId === e.pointerId && data.editable) dragTo(p.x, p.y);
      return;
    }
    if (!data.interactive || e.buttons !== 0) return;
    map.getCanvas().style.cursor = hit(p.x, p.y) >= 0 ? 'pointer' : '';
  };
  const onPointerEnd = (commit: boolean) => (e: PointerEvent) => {
    if (!drag || drag.pointerId !== e.pointerId || !map) return;
    const el = map.getCanvasContainer();
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    endDrag(commit, commit);
  };
  const onPointerUp = onPointerEnd(true);
  const onPointerCancel = onPointerEnd(false);

  const layer: CustomLayerInterface = {
    id: 'mission-threejs',
    type: 'custom',
    renderingMode: '3d',
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      const el = m.getCanvasContainer();
      el.addEventListener('pointerdown', onPointerDown, { capture: true });
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerCancel);
    },
    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer || !map || !refSet) return;
      const l = new THREE.Matrix4().makeTranslation(ref.x, ref.y, ref.z).scale(new THREE.Vector3(ref.s, -ref.s, ref.s)).multiply(rotationX);
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as number[]).multiply(l);
      // constant on-screen width: metres per pixel at the reference latitude and current zoom
      const mPerPx = (40_075_016.686 * Math.cos((ref.lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
      ribbonMat.uniforms['uHalfWidth']!.value = PATH_HALF_PX * mPerPx;
      project(camera.projectionMatrix);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      const el = map?.getCanvasContainer();
      el?.removeEventListener('pointerdown', onPointerDown, { capture: true });
      el?.removeEventListener('pointermove', onPointerMove);
      el?.removeEventListener('pointerup', onPointerUp);
      el?.removeEventListener('pointercancel', onPointerCancel);
    },
  };

  return {
    layer,
    updateData(next) {
      data = next;
      rebuild();
      map?.triggerRepaint();
    },
    setMarkerContainer(container) {
      markerContainer = container;
    },
    hitAt(x, y) {
      return hit(x, y) >= 0;
    },
    setPreviewPose(pose) {
      previewPose = pose;
      rebuildCone();
      map?.triggerRepaint();
    },
    dispose() {
      if (map?.getLayer('mission-threejs')) map.removeLayer('mission-threejs');
      if (drag) endDrag(false, false);
      if (wheelTimer) clearTimeout(wheelTimer);
      disposeObj(ribbon); disposeObj(dots); disposeObj(drops);
      ribbonMat.dispose(); dotMat.dispose(); dropMat.dispose(); coneFill.dispose(); coneEdge.dispose();
      for (const el of pins.values()) el.remove();
      pins.clear();
      handle?.remove(); altTag?.remove(); previewEl?.remove();
      previewEl = null;
      handle = altTag = null;
      renderer?.dispose();
      renderer = null;
      map = null;
    },
  };
}
