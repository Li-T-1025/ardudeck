/** Module map layers (host.map), drawn under the host's own map drawing. */

import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Polyline, Polygon, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useMapPicking } from '../../hooks/useMapPicking';
import L from 'leaflet';
import { useTileSourceStore } from '../../stores/tile-source-store';
import type { MapFeature, MapPoint, MapView, MapVolumeFeature } from '@ardudeck/module-sdk';
import {
  featuresOf,
  getModuleMapLayers,
  addPickPoint,
  cancelPick,
  finishPick,
  getPolygonPick,
  isLayerVisible,
  setLayerVisible,
  undoPickPoint,
  subscribeModuleMapLayers,
  movePickPoint,
  insertPickPoint,
  pickMidpoints,
  setPickCursor,
  getPickCursor,
  subscribePickCursor,
  type ModuleMapLayer,
} from '../../modules/module-map-registry';
import { getElevations } from '../../utils/elevation-api';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';

const GLYPH: Record<string, string> = {
  dot: '●',
  takeoff: '▲',
  land: '▼',
  home: '⌂',
  warning: '⚠',
  flag: '⚑',
};

function latlngs(points: MapPoint[]): [number, number][] {
  return points.map((p) => [p.lat, p.lng]);
}

// labels and colours come from cargo: never as raw HTML
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const cssColor = (c: string) => (/^[#a-z0-9(),.%\s]+$/i.test(c) ? c : '#fff');

const TEXT_SHIFT: Record<string, string> = {
  center: 'translate(-50%,-50%)', left: 'translate(0,-50%)', right: 'translate(-100%,-50%)', top: 'translate(-50%,0)', bottom: 'translate(-50%,-100%)',
};

// dark text gets a light outline, light text a dark one, so either reads on imagery
function haloFor(color: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return '#000';
  const n = parseInt(m[1]!, 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum < 110 ? '#fff' : '#000';
}

/** HTML for a cargo text label; shared with the 3D map. */
export function moduleTextHtml(text: string, color: string, size = 11, anchor = 'center', chip = false): string {
  const px = Math.max(9, Math.min(20, size));
  if (chip) {
    return `<div style="position:absolute;transform:${TEXT_SHIFT[anchor] ?? TEXT_SHIFT.center};white-space:nowrap;padding:2px 6px;border-radius:4px;background:rgba(15,23,42,0.9);box-shadow:0 1px 3px rgba(0,0,0,0.45);font:600 ${px}px/1.2 Inter,system-ui,sans-serif;font-variant-numeric:tabular-nums;color:${cssColor(color)};pointer-events:none">${esc(text)}</div>`;
  }
  const halo = haloFor(color);
  return `<div style="position:absolute;transform:${TEXT_SHIFT[anchor] ?? TEXT_SHIFT.center};white-space:nowrap;font:700 ${px}px/1.1 ui-monospace,monospace;color:${cssColor(color)};text-shadow:0 0 3px ${halo},0 0 2px ${halo},0 0 1px ${halo};pointer-events:none">${esc(text)}</div>`;
}

/** HTML for a cargo marker glyph with its label, 74 by 32 px, glyph centre at (37, 9); shared with the 3D map. */
export function moduleMarkerHtml(icon: string, color: string, label?: string): string {
  const glyph = GLYPH[icon] ?? GLYPH.dot;
  color = cssColor(color);
  const text = label
    ? `<div style="font:600 9px/1.2 system-ui;color:${color};text-align:center;
         max-width:74px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</div>`
    : '';
  return `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:18px;height:18px;border-radius:50%;background:${color};
          border:1.5px solid #fff;color:#fff;font:11px/18px system-ui;text-align:center">${glyph}</div>
        ${text}
      </div>`;
}

function textIcon(text: string, color: string, size = 11, anchor = 'center', chip = false): L.DivIcon {
  return L.divIcon({ className: '', html: moduleTextHtml(text, color, size, anchor, chip), iconSize: [0, 0] });
}

const VOLUME_UPSAMPLE = 3;

/** The cells on their grid, as heights above the base (NaN where there is no cell). */
function volumeGrid(f: MapVolumeFeature) {
  const lat0 = f.cells[0]!.lat;
  const dLat = f.cellM / 110_540;
  const dLng = f.cellM / (111_320 * Math.cos((lat0 * Math.PI) / 180));
  const lats = f.cells.map((c) => c.lat), lngs = f.cells.map((c) => c.lng);
  const south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lngs), east = Math.max(...lngs);
  const w = Math.round((east - west) / dLng) + 1, h = Math.round((north - south) / dLat) + 1;
  const d = new Float32Array(w * h).fill(NaN);
  let dmin = 0, dmax = 0;
  for (const c of f.cells) {
    const x = Math.round((c.lng - west) / dLng), y = h - 1 - Math.round((c.lat - south) / dLat);
    d[y * w + x] = c.d;
    dmin = Math.min(dmin, c.d);
    dmax = Math.max(dmax, c.d);
  }
  const raw = Math.max(0.05, (dmax - dmin) / 8);
  const p10 = 10 ** Math.floor(Math.log10(raw));
  const mant = raw / p10;
  const interval = (mant < 1.5 ? 1 : mant < 3.5 ? 2 : mant < 7.5 ? 5 : 10) * p10;
  return { w, h, d, dmin, dmax, interval, bounds: L.latLngBounds([south - dLat / 2, west - dLng / 2], [north + dLat / 2, east + dLng / 2]) };
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** The 3D volume shader's look on a 2D canvas: tint, contour lines, and the band sweeping up every 4 s. */
function paintVolume(ctx: CanvasRenderingContext2D, g: ReturnType<typeof volumeGrid>, pile: number[], pit: number[], timeS: number, animate: boolean) {
  const k = VOLUME_UPSAMPLE;
  const W = g.w * k, H = g.h * k;
  const img = ctx.createImageData(W, H);
  const reach = Math.max(0.5, Math.max(g.dmax, -g.dmin));
  const sweep = g.dmin + (g.dmax - g.dmin) * ((timeS / 4) % 1);
  const at = (x: number, y: number) => g.d[Math.min(g.h - 1, Math.max(0, y)) * g.w + Math.min(g.w - 1, Math.max(0, x))]!;
  for (let py = 0; py < H; py++) {
    const gy = (py + 0.5) / k - 0.5, y0 = Math.floor(gy), ty = gy - y0;
    for (let px = 0; px < W; px++) {
      const gx = (px + 0.5) / k - 0.5, x0 = Math.floor(gx), tx = gx - x0;
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), e = at(x0 + 1, y0 + 1);
      const own = at(Math.round(gx), Math.round(gy));
      if (Number.isNaN(own)) continue;
      // bilinear where all four cells exist, else the cell itself, so edges stay clean
      const d = Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(e)
        ? own : (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
      const col = d >= 0 ? pile : pit;
      const alpha = 0.16 + 0.3 * Math.min(1, Math.abs(d) / reach);
      const f = d / g.interval;
      const fr = f - Math.floor(f);
      const line = 1 - smooth(0, 0.07, Math.min(fr, 1 - fr));
      const band = animate ? 1 - smooth(0, g.interval * 0.5, Math.abs(d - sweep)) : 0;
      const mixW = line * 0.45 + band * 0.5;
      const o = (py * W + px) * 4;
      img.data[o] = col[0]! + (255 - col[0]!) * mixW;
      img.data[o + 1] = col[1]! + (255 - col[1]!) * mixW;
      img.data[o + 2] = col[2]! + (255 - col[2]!) * mixW;
      img.data[o + 3] = 255 * Math.min(0.92, alpha + line * 0.45 + band * 0.35);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function VolumeFeature({ f }: { f: MapVolumeFeature }): JSX.Element | null {
  const map = useMap();
  // cargo features are rebuilt on every pan; only a change of the volume itself rebuilds the canvas
  const signature = `${f.cellM}|${f.cells.length}|${f.cells.reduce((s, c) => s + c.d, 0).toFixed(3)}|${f.outline.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`).join(';')}`;
  const fRef = useRef(f);
  fRef.current = f;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature stands for the feature's content
  const grid = useMemo(() => (fRef.current.cells.length > 0 ? volumeGrid(fRef.current) : null), [signature]);
  useEffect(() => {
    if (!grid || grid.w * grid.h > 250_000) return;
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const pile = rgb(f.stockpileColor ?? '#f59e0b'), pit = rgb(f.pitColor ?? '#38bdf8');
    const animate = (f.animate ?? true) && !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated') as HTMLCanvasElement;
    canvas.width = grid.w * VOLUME_UPSAMPLE;
    canvas.height = grid.h * VOLUME_UPSAMPLE;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    map.getPanes().overlayPane.appendChild(canvas);
    const place = () => {
      const nw = map.latLngToLayerPoint(grid.bounds.getNorthWest());
      const se = map.latLngToLayerPoint(grid.bounds.getSouthEast());
      L.DomUtil.setPosition(canvas, nw);
      canvas.style.width = `${se.x - nw.x}px`;
      canvas.style.height = `${se.y - nw.y}px`;
    };
    const zoomAnim = (e: L.ZoomAnimEvent) => {
      const scale = map.getZoomScale(e.zoom);
      const offset = (map as unknown as { _latLngBoundsToNewLayerBounds(b: L.LatLngBounds, z: number, c: L.LatLng): L.Bounds })
        ._latLngBoundsToNewLayerBounds(grid.bounds, e.zoom, e.center).min!;
      L.DomUtil.setTransform(canvas, offset, scale);
    };
    place();
    map.on('zoomend viewreset moveend', place);
    map.on('zoomanim', zoomAnim);
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      // about 30 frames a second is smooth for a 4 s sweep and half the work
      if (now - last > 33) { last = now; paintVolume(ctx, grid, pile, pit, now / 1000, animate); }
      if (animate) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      map.off('zoomend viewreset moveend', place);
      map.off('zoomanim', zoomAnim);
      canvas.remove();
    };
  }, [grid, map, f.stockpileColor, f.pitColor, f.animate]);
  return <Polygon positions={latlngs(f.outline)} pathOptions={{ color: f.stockpileColor ?? '#f59e0b', weight: 2, fill: false }} />;
}

function markerIcon(icon: string, color: string, label?: string): L.DivIcon {
  return L.divIcon({ className: '', html: moduleMarkerHtml(icon, color, label), iconSize: [74, 32], iconAnchor: [37, 9] });
}

function Feature({ f, k }: { f: MapFeature; k: string }): JSX.Element | null {
  if (f.kind === 'polygon') {
    return (
      <Polygon
        key={k}
        positions={
          f.holes?.length
            ? [latlngs(f.points), ...f.holes.map(latlngs)]
            : latlngs(f.points)
        }
        pathOptions={{
          color: f.stroke,
          weight: f.strokeWidth ?? 2,
          dashArray: f.dash?.join(' '),
          fill: f.fill != null,
          fillColor: f.fill,
          fillOpacity: f.fillOpacity ?? 0.1,
        }}
      />
    );
  }
  if (f.kind === 'polyline') {
    return (
      <Polyline
        key={k}
        positions={latlngs(f.points)}
        pathOptions={{
          color: f.stroke,
          weight: f.strokeWidth ?? 2,
          dashArray: f.dash?.join(' '),
        }}
      />
    );
  }
  if (f.kind === 'text') {
    return <Marker key={k} position={[f.at.lat, f.at.lng]} icon={textIcon(f.text, f.color, f.size, f.anchor, f.chip)} interactive={false} keyboard={false} />;
  }
  if (f.kind === 'volume') return <VolumeFeature key={k} f={f} />;
  if (f.kind === 'marker') {
    return (
      <Marker
        key={k}
        position={[f.at.lat, f.at.lng]}
        icon={markerIcon(f.icon, f.color, f.label)}
        interactive={false}
      />
    );
  }
  return null;
}

function viewOf(map: L.Map): MapView {
  const b = map.getBounds();
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest(), zoom: map.getZoom() };
}

export function ModuleMapLayers(): JSX.Element | null {
  const [layers, setLayers] = useState<ModuleMapLayer[]>(() => getModuleMapLayers());
  const map = useMap();
  const [view, setView] = useState<MapView | undefined>(() => { try { return viewOf(map); } catch { return undefined; } });
  useMapEvents({ moveend: () => setView(viewOf(map)), zoomend: () => setView(viewOf(map)) });
  // The registry bumps this; the features live inside the module, where React
  // cannot see them change.
  const [, setTick] = useState(0);

  useEffect(
    () =>
      subscribeModuleMapLayers(() => {
        setLayers(getModuleMapLayers());
        setTick((n) => n + 1);
      }),
    [],
  );

  const tileVersion = useTileSourceStore((s) => s.version);
  if (layers.length === 0) return null;

  return (
    <>
      {layers
        .filter((l) => isLayerVisible(l.key) && l.tileUrl)
        .map((l) => (
          // Above the base map, which otherwise lands on top whenever it is switched or remounted later
          // than this layer: Leaflet stacks tile layers of equal z-index in DOM order.
          <TileLayer key={`${l.key}:tiles:${tileVersion}`} url={`${l.tileUrl!}?v=${tileVersion}`} opacity={l.reg.tiles?.opacity ?? 1} zIndex={10} maxNativeZoom={22} maxZoom={22} />
        ))}
      {layers
        .filter((l) => isLayerVisible(l.key))
        .map((l) =>
          featuresOf(l, view).map((f, i) => <Feature key={`${l.key}:${i}`} k={`${l.key}:${i}`} f={f} />),
        )}
    </>
  );
}

/** Layer names and visibility, for the map's own layer control. */
export function useModuleMapLayerToggles(): {
  layers: ModuleMapLayer[];
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
} {
  const [layers, setLayers] = useState<ModuleMapLayer[]>(() => getModuleMapLayers());
  const [, setTick] = useState(0);
  useEffect(
    () =>
      subscribeModuleMapLayers(() => {
        setLayers(getModuleMapLayers());
        setTick((n) => n + 1);
      }),
    [],
  );
  return {
    layers,
    isVisible: isLayerVisible,
    toggle: (key) => setLayerVisible(key, !isLayerVisible(key)),
  };
}


/**
 * The pilot drawing an area a module asked for. Clicks place corners, a
 * double click closes the ring, Escape cancels, and backspace takes one back.
 */
export function ModulePolygonPick(): JSX.Element | null {
  const [pick, setPick] = useState(getPolygonPick);
  useEffect(() => subscribeModuleMapLayers(() => setPick(getPolygonPick())), []);
  useMapPicking(pick !== null);

  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancelPick();
      else if (e.key === 'Enter') finishPick();
      else if (e.key === 'Backspace') undoPickPoint();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);

  // Same gestures as the survey draw tool, because a pilot should not have to
  // learn a second way to draw a polygon: click adds, double click closes,
  // right click cancels, Escape cancels, Enter closes.
  useMapEvents({
    click: (e) => {
      // the second click of a double click would drop the last point a second time
      if (getPolygonPick() && e.originalEvent.detail <= 1) addPickPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    dblclick: (e) => {
      const p = getPolygonPick();
      if (!p) return;
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      // The double click's own two clicks already added their corners.
      if (p.points.length >= p.min) finishPick();
    },
    contextmenu: (e) => {
      if (!getPolygonPick()) return;
      e.originalEvent.preventDefault();
      cancelPick();
    },
    mousemove: (e) => {
      if (getPolygonPick()) setPickCursor({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    mouseout: () => setPickCursor(null),
  });

  if (!pick) return null;
  const pts = pick.points;
  const ring: [number, number][] = pts.map((p) => [p.lat, p.lng]);
  const area = pick.shape === 'polygon';

  return (
    <>
      {/* Closed once it is an area, so the shape being made is the shape. */}
      {area && pts.length >= 3 && (
        <Polygon
          positions={ring}
          pathOptions={{
            color: '#22c55e',
            weight: 2,
            dashArray: '6 4',
            fill: true,
            fillColor: '#22c55e',
            fillOpacity: 0.1,
          }}
        />
      )}
      {(area ? pts.length === 2 : pts.length >= 2) && (
        <Polyline positions={ring} pathOptions={{ color: '#22c55e', weight: 2, dashArray: '6 4' }} />
      )}
      {pickMidpoints(pick).map((m) => (
        <Marker
          key={`pick-mid-${m.index}-${pts.length}`}
          position={[m.lat, m.lng]}
          bubblingMouseEvents={false}
          eventHandlers={{ click: () => insertPickPoint(m.index, { lat: m.lat, lng: m.lng }) }}
          icon={L.divIcon({
            className: '',
            html: '<div style="width:14px;height:14px;border-radius:50%;background:rgba(15,23,42,0.75);border:1.5px solid #22c55e;color:#22c55e;font:700 11px/11px system-ui;text-align:center;box-sizing:border-box;cursor:copy">+</div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })}
        />
      ))}
      {pts.map((p, i) => (
        <Marker
          key={`pick-${i}`}
          position={[p.lat, p.lng]}
          draggable
          bubblingMouseEvents={false}
          eventHandlers={{
            drag: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              movePickPoint(i, { lat: ll.lat, lng: ll.lng });
            },
          }}
          icon={L.divIcon({
            className: '',
            html:
              `<div style="width:14px;height:14px;border-radius:50%;background:${
                i === 0 ? '#fff' : '#22c55e'
              };border:2px solid ${i === 0 ? '#22c55e' : '#fff'};box-sizing:border-box;cursor:move;box-shadow:0 1px 3px rgba(0,0,0,0.45)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })}
        />
      ))}
    </>
  );
}

/** The instruction bar, outside the map so it is not clipped by it. */
export function ModulePolygonPickBar(): JSX.Element | null {
  const { t } = useTranslation();
  const [pick, setPick] = useState(getPolygonPick);
  useEffect(() => subscribeModuleMapLayers(() => setPick(getPolygonPick())), []);

  // Clicking corners on a map drags a text selection across everything behind
  // it, so selection is off for as long as the pilot is drawing.
  useEffect(() => {
    if (!pick) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [pick]);

  if (!pick) return null;
  const n = pick.points.length;
  const ready = n >= pick.min;
  const progress =
    pick.shape === 'point'
      ? pick.editing ? t('panels:modulePolygonPick.pointEditHint') : t('panels:modulePolygonPick.pointHint')
      : pick.shape === 'path'
        ? ready
          ? t('panels:modulePolygonPick.pointsPlaced', { n })
          : t('panels:modulePolygonPick.pointsProgress', { n, min: pick.min })
        : ready
          ? t('panels:modulePolygonPick.cornersPlaced', { n })
          : t('panels:modulePolygonPick.cornersProgress', { n });

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[1200] flex justify-center select-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-subtle bg-surface-solid px-3 py-2 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 20l6-16 4 9 3-4 3 11z" />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="text-xs font-medium text-content">{pick.prompt}</div>
            <div className="text-[11px] text-content-tertiary tabular-nums">
              {progress}
              {n > 1 && pick.shape !== 'point' && <span> {t('panels:modulePolygonPick.dragHint')}</span>}
            </div>
          </div>
        </div>

        <PickCursorHeight />

        <div className="h-7 w-px bg-subtle" />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-content-secondary hover:bg-surface-hover hover:text-content disabled:opacity-40"
            disabled={n === 0}
            onClick={undoPickPoint}
            data-tip={t('panels:modulePolygonPick.undoTip')}
          >
            {t('common:undo')}
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-content-secondary hover:bg-surface-hover hover:text-content"
            onClick={cancelPick}
            data-tip={t('panels:modulePolygonPick.cancelTip')}
          >
            {t('common:cancel')}
          </button>
          <button
            type="button"
            className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!ready}
            onClick={finishPick}
            data-tip={t('panels:modulePolygonPick.doneTip')}
          >
            {t('common:done')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ground height under the pointer while a cargo asks for points: what a click there would measure. */
function PickCursorHeight(): JSX.Element | null {
  const { t } = useTranslation();
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let seq = 0;
    const off = subscribePickCursor(() => {
      if (timer) clearTimeout(timer);
      const p = getPickCursor();
      if (!p) { setHeight(null); return; }
      const mine = ++seq;
      timer = setTimeout(() => {
        void getElevations([{ lat: p.lat, lon: p.lng }]).then(([h]) => {
          if (mine === seq) setHeight(h ?? null);
        });
      }, 80);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (height === null) return null;
  return (
    <>
      <div className="h-7 w-px bg-subtle" />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wide text-content-tertiary">{t('panels:modulePolygonPick.groundHere')}</div>
        <div className="font-mono text-sm font-semibold tabular-nums text-content">{formatAltitudeFromMeters(height, altitudeUnit)}</div>
      </div>
    </>
  );
}
