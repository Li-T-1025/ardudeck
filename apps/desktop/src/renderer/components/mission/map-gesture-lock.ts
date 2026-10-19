import type maplibregl from 'maplibre-gl';

/**
 * Hold the map still while something on it is dragged: no pan, zoom or rotate,
 * and trackpad scroll is swallowed instead of zooming underneath the drag.
 */
export function lockMapGestures(map: maplibregl.Map): () => void {
  const was = {
    dragPan: map.dragPan.isEnabled(),
    scrollZoom: map.scrollZoom.isEnabled(),
    dragRotate: map.dragRotate.isEnabled(),
    touchZoomRotate: map.touchZoomRotate.isEnabled(),
    doubleClickZoom: map.doubleClickZoom.isEnabled(),
  };
  map.dragPan.disable();
  map.scrollZoom.disable();
  map.dragRotate.disable();
  map.touchZoomRotate.disable();
  map.doubleClickZoom.disable();
  const swallow = (e: WheelEvent) => e.preventDefault();
  const el = map.getCanvasContainer();
  el.addEventListener('wheel', swallow, { passive: false, capture: true });
  return () => {
    el.removeEventListener('wheel', swallow, { capture: true });
    if (was.dragPan) map.dragPan.enable();
    if (was.scrollZoom) map.scrollZoom.enable();
    if (was.dragRotate) map.dragRotate.enable();
    if (was.touchZoomRotate) map.touchZoomRotate.enable();
    if (was.doubleClickZoom) map.doubleClickZoom.enable();
  };
}

/** Pointer position in the map canvas's own pixels. */
export function canvasPoint(map: maplibregl.Map, e: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = map.getCanvas().getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
