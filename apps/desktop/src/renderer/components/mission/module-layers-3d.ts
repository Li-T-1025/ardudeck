import maplibregl from 'maplibre-gl';
import type { MapFeature, MapView, MapVolumeFeature } from '@ardudeck/module-sdk';
import { createVolumeLayer } from './module-volume-layer';
import {
  addPickPoint,
  cancelPick,
  featuresOf,
  finishPick,
  getModuleMapLayers,
  getPolygonPick,
  isLayerVisible,
  movePickPoint,
  insertPickPoint,
  pickMidpoints,
  setPickCursor,
  subscribeModuleMapLayers,
  undoPickPoint,
} from '../../modules/module-map-registry';
import { tileVersionSuffix, subscribeTerrainChanged } from '../../stores/tile-source-store';
import { moduleMarkerHtml, moduleTextHtml } from '../panels/ModuleMapLayers';
import { canvasPoint, lockMapGestures } from './map-gesture-lock';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const RASTER_PREFIX = 'module-raster:';
const PICK_COLOR = '#22c55e';

function ring(points: { lat: number; lng: number }[]): number[][] {
  const r = points.map((p) => [p.lng, p.lat]);
  if (r.length > 0) r.push(r[0]!);
  return r;
}

function setData(map: maplibregl.Map, id: string, fc: GeoJSON.FeatureCollection) {
  (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(fc);
}

/** `beforeId` is the first mission layer, so cargo layers stay under the route. */
export function attachModuleLayers3D(map: maplibregl.Map, beforeId: string, getExaggeration: () => number = () => 1): () => void {
  const volumeLayer = createVolumeLayer(getExaggeration);
  map.addLayer(volumeLayer.layer);
  map.addSource('module-fill', { type: 'geojson', data: EMPTY });
  map.addSource('module-line', { type: 'geojson', data: EMPTY });
  map.addSource('module-line-dash', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'module-fill', type: 'fill', source: 'module-fill', paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': ['get', 'opacity'] } }, beforeId);
  map.addLayer({ id: 'module-line', type: 'line', source: 'module-line', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'stroke'], 'line-width': ['get', 'width'] } }, beforeId);
  map.addLayer({ id: 'module-line-dash', type: 'line', source: 'module-line-dash', layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'stroke'], 'line-width': ['get', 'width'], 'line-dasharray': [3, 2] } }, beforeId);

  let markers: maplibregl.Marker[] = [];
  const rasters = new Set<string>();

  const view = (): MapView => {
    const b = map.getBounds();
    // cargo zoom rules are written for the 2D map's 256 px tiles
    return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest(), zoom: map.getZoom() + 1 };
  };

  const sync = () => {
    if (!map.getSource('module-fill')) return;
    const layers = getModuleMapLayers().filter((l) => isLayerVisible(l.key));
    const fills: GeoJSON.Feature[] = [];
    const lines: GeoJSON.Feature[] = [];
    const dashed: GeoJSON.Feature[] = [];
    const volumes: MapVolumeFeature[] = [];
    for (const m of markers) m.remove();
    markers = [];

    const wantedRasters = new Set<string>();
    for (const l of layers) {
      if (l.tileUrl) {
        const id = `${RASTER_PREFIX}${l.key}${tileVersionSuffix()}`;
        wantedRasters.add(id);
        if (!map.getSource(id)) {
          map.addSource(id, { type: 'raster', tiles: [`${l.tileUrl}${tileVersionSuffix()}`], tileSize: 256, maxzoom: 22 });
          map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': l.reg.tiles?.opacity ?? 1 } }, 'module-fill');
          rasters.add(id);
        }
      }
      for (const f of featuresOf(l, view()) as MapFeature[]) {
        if (f.kind === 'polygon') {
          if (f.points.length < 3) continue;
          const coords = [ring(f.points), ...(f.holes ?? []).filter((h) => h.length >= 3).map(ring)];
          if (f.fill) fills.push({ type: 'Feature', properties: { fill: f.fill, opacity: f.fillOpacity ?? 0.1 }, geometry: { type: 'Polygon', coordinates: coords } });
          (f.dash?.length ? dashed : lines).push({ type: 'Feature', properties: { stroke: f.stroke, width: f.strokeWidth ?? 2 }, geometry: { type: 'MultiLineString', coordinates: coords } });
        } else if (f.kind === 'volume') {
          volumes.push(f);
          if (f.outline.length >= 3) lines.push({ type: 'Feature', properties: { stroke: f.stockpileColor ?? '#f59e0b', width: 2 }, geometry: { type: 'LineString', coordinates: ring(f.outline) } });
        } else if (f.kind === 'polyline') {
          if (f.points.length < 2) continue;
          (f.dash?.length ? dashed : lines).push({ type: 'Feature', properties: { stroke: f.stroke, width: f.strokeWidth ?? 2 }, geometry: { type: 'LineString', coordinates: f.points.map((p) => [p.lng, p.lat]) } });
        } else {
          const el = document.createElement('div');
          if (f.kind === 'text') {
            el.style.cssText = 'width:0;height:0;pointer-events:none';
            el.innerHTML = moduleTextHtml(f.text, f.color, f.size, f.anchor, f.chip);
            markers.push(new maplibregl.Marker({ element: el, anchor: 'top-left' }).setLngLat([f.at.lng, f.at.lat]).addTo(map));
          } else {
            el.style.cssText = 'width:74px;height:32px;pointer-events:none';
            el.innerHTML = moduleMarkerHtml(f.icon, f.color, f.label);
            markers.push(new maplibregl.Marker({ element: el, anchor: 'top-left', offset: [-37, -9] }).setLngLat([f.at.lng, f.at.lat]).addTo(map));
          }
        }
      }
    }
    for (const id of [...rasters]) {
      if (wantedRasters.has(id)) continue;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      rasters.delete(id);
    }
    setData(map, 'module-fill', { type: 'FeatureCollection', features: fills });
    setData(map, 'module-line', { type: 'FeatureCollection', features: lines });
    setData(map, 'module-line-dash', { type: 'FeatureCollection', features: dashed });
    volumeLayer.setVolumes(volumes);
  };

  sync();
  const offRegistry = subscribeModuleMapLayers(sync);
  const offTiles = subscribeTerrainChanged(sync);
  map.on('moveend', sync);
  return () => {
    offRegistry();
    offTiles();
    map.off('moveend', sync);
    for (const m of markers) m.remove();
    if (map.getLayer(volumeLayer.layer.id)) map.removeLayer(volumeLayer.layer.id);
  };
}

/** A cargo asking for points, on the 3D map: click adds, drag moves, double click finishes. */
export function attachPick3D(map: maplibregl.Map, beforeId: string): () => void {
  map.addSource('module-pick', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'module-pick-fill', type: 'fill', source: 'module-pick', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': PICK_COLOR, 'fill-opacity': 0.12 } }, beforeId);
  map.addLayer({ id: 'module-pick-line', type: 'line', source: 'module-pick', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': PICK_COLOR, 'line-width': 2.5, 'line-dasharray': [3, 2] } }, beforeId);
  map.addSource('module-pick-mid', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'module-pick-mid', type: 'circle', source: 'module-pick-mid', paint: { 'circle-radius': 6, 'circle-color': 'rgba(15,23,42,0.75)', 'circle-stroke-width': 1.5, 'circle-stroke-color': PICK_COLOR } });
  map.addLayer({ id: 'module-pick-points', type: 'circle', source: 'module-pick', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': ['case', ['get', 'first'], '#ffffff', PICK_COLOR], 'circle-stroke-width': 2, 'circle-stroke-color': ['case', ['get', 'first'], PICK_COLOR, '#ffffff'] } });

  let dragging: { index: number; pointerId: number; unlock: () => void } | null = null;
  let dragged = false;

  const draw = () => {
    const p = getPolygonPick();
    const features: GeoJSON.Feature[] = [];
    if (p) {
      const pts = p.points.map((q) => [q.lng, q.lat]);
      if (p.shape === 'polygon' && pts.length >= 3) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!]] } });
      if (pts.length >= 2) features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.shape === 'polygon' && pts.length >= 3 ? [...pts, pts[0]!] : pts } });
      pts.forEach((c, i) => features.push({ type: 'Feature', properties: { first: i === 0 }, geometry: { type: 'Point', coordinates: c } }));
    }
    setData(map, 'module-pick', { type: 'FeatureCollection', features });
    setData(map, 'module-pick-mid', { type: 'FeatureCollection', features: p ? pickMidpoints(p).map((m) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [m.lng, m.lat] } })) : [] });
    if (p) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    map.getCanvas().style.cursor = p ? 'crosshair' : '';
  };

  const nearest = (x: number, y: number): number => {
    const p = getPolygonPick();
    if (!p) return -1;
    let best = -1;
    let bestD = 12 * 12;
    p.points.forEach((q, i) => {
      const s = map.project([q.lng, q.lat]);
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  // pointer capture, as for waypoints: a trackpad drag must not lose its release or pan the map
  const onDown = (e: PointerEvent) => {
    if (!getPolygonPick() || e.button !== 0 || dragging) return;
    const pt = canvasPoint(map, e);
    const i = nearest(pt.x, pt.y);
    if (i < 0) return;
    e.preventDefault();
    e.stopPropagation();
    map.getCanvasContainer().setPointerCapture(e.pointerId);
    dragging = { index: i, pointerId: e.pointerId, unlock: lockMapGestures(map) };
    dragged = false;
  };
  const onMove = (e: PointerEvent) => {
    if (!getPolygonPick()) return;
    const pt = canvasPoint(map, e);
    const ll = map.unproject([pt.x, pt.y]);
    setPickCursor({ lat: ll.lat, lng: ll.lng });
    if (dragging && dragging.pointerId === e.pointerId) {
      dragged = true;
      movePickPoint(dragging.index, { lat: ll.lat, lng: ll.lng });
    } else if (!dragging && e.buttons === 0) {
      map.getCanvas().style.cursor = nearest(pt.x, pt.y) >= 0 ? 'move' : 'crosshair';
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging || dragging.pointerId !== e.pointerId) return;
    const el = map.getCanvasContainer();
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    dragging.unlock();
    dragging = null;
  };
  const midAt = (x: number, y: number) => {
    const p = getPolygonPick();
    if (!p) return null;
    return pickMidpoints(p).find((m) => {
      const s = map.project([m.lng, m.lat]);
      return (s.x - x) ** 2 + (s.y - y) ** 2 < 10 * 10;
    }) ?? null;
  };
  const onClick = (e: maplibregl.MapMouseEvent) => {
    if (!getPolygonPick() || e.originalEvent.detail > 1) return;
    if (dragged) { dragged = false; return; }
    const mid = midAt(e.point.x, e.point.y);
    if (mid) { insertPickPoint(mid.index, { lat: mid.lat, lng: mid.lng }); return; }
    if (nearest(e.point.x, e.point.y) >= 0) return;
    addPickPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  };
  const onDbl = (e: maplibregl.MapMouseEvent) => {
    const p = getPolygonPick();
    if (!p) return;
    e.preventDefault();
    if (p.points.length >= p.min) finishPick();
  };
  const onContext = (e: maplibregl.MapMouseEvent) => {
    if (!getPolygonPick()) return;
    e.preventDefault();
    cancelPick();
  };
  const onOut = () => setPickCursor(null);
  const onKey = (e: KeyboardEvent) => {
    if (!getPolygonPick()) return;
    if (e.key === 'Escape') cancelPick();
    else if (e.key === 'Enter') finishPick();
    else if (e.key === 'Backspace') undoPickPoint();
    else return;
    e.preventDefault();
  };

  draw();
  const off = subscribeModuleMapLayers(draw);
  const el = map.getCanvasContainer();
  el.addEventListener('pointerdown', onDown, { capture: true });
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  map.on('click', onClick);
  map.on('dblclick', onDbl);
  map.on('contextmenu', onContext);
  map.on('mouseout', onOut);
  window.addEventListener('keydown', onKey);
  return () => {
    off();
    el.removeEventListener('pointerdown', onDown, { capture: true });
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    dragging?.unlock();
    map.off('click', onClick);
    map.off('dblclick', onDbl);
    map.off('contextmenu', onContext);
    map.off('mouseout', onOut);
    window.removeEventListener('keydown', onKey);
  };
}
