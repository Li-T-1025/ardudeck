/**
 * Smooth cursor-anchored wheel/trackpad zoom for Leaflet maps.
 *
 * Leaflet's stock scrollWheelZoom accumulates deltas for 40ms and then jumps
 * whole integer zoom levels. A Mac trackpad emits hundreds of px of delta per
 * gesture, so one scroll lurches several levels with no continuity. This
 * handler replaces it: deltas move a fractional zoom target and an rAF loop
 * eases the actual zoom toward it, anchored under the cursor, so both
 * two-finger scroll and pinch (ctrlKey wheel events) track the fingers.
 *
 * The host MapContainer MUST set zoomSnap={0}, otherwise Leaflet rounds every
 * fractional step back to integers and the motion turns into stairs again.
 */
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { useEffect } from 'react';

// Wheel px per zoom level. Stock Leaflet is 60, which is why a single trackpad
// gesture flew across the whole zoom range. Pinch deltas are much smaller per
// gesture, so a lower divisor keeps pinch feeling 1:1 with the fingers.
const SCROLL_PX_PER_ZOOM = 140;
const PINCH_PX_PER_ZOOM = 60;
// Legacy line-mode wheel events (some external mice): px equivalent per line.
const LINE_HEIGHT_PX = 40;
// Fraction of the remaining zoom distance applied per frame.
const EASE = 0.3;
const SNAP_EPS = 0.003;

// Leaflet's move transaction, private but stable across 1.x. Going through
// setZoomAround per frame would run the full view-reset pipeline 60x per
// gesture: zoomstart/zoomend/moveend each frame, meaning tile loads, bounds
// trackers, viewport persistence and every React map subscriber re-running
// mid-zoom. _move only applies the pane transform and fires the lightweight
// 'zoom'/'move' events; the expensive end events fire once, from _moveEnd.
interface MapMoveInternals {
  _moveStart(zoomChanged: boolean, noMoveStart: boolean): unknown;
  _move(center: L.LatLng, zoom: number): unknown;
  _moveEnd(zoomChanged: boolean): unknown;
}

export function SmoothWheelZoom() {
  const map = useMap();

  useEffect(() => {
    map.scrollWheelZoom.disable();
    const container = map.getContainer();
    const internals = map as unknown as L.Map & MapMoveInternals;

    let target = map.getZoom();
    let anchor: L.Point | null = null;
    let raf = 0;
    let inTransaction = false;

    const finish = () => {
      raf = 0;
      if (inTransaction) {
        inTransaction = false;
        internals._moveEnd(true);
      }
    };

    const step = () => {
      if (!anchor) { finish(); return; }
      const current = map.getZoom();
      const diff = target - current;
      const next = Math.abs(diff) < SNAP_EPS ? target : current + diff * EASE;
      if (!inTransaction) {
        inTransaction = true;
        internals._moveStart(true, false);
      }
      // Anchor-preserving center, same math as Leaflet's setZoomAround.
      const scale = map.getZoomScale(next, current);
      const viewHalf = map.getSize().divideBy(2);
      const centerOffset = anchor.subtract(viewHalf).multiplyBy(1 - 1 / scale);
      const newCenter = map.containerPointToLatLng(viewHalf.add(centerOffset));
      internals._move(newCenter, next);
      if (next === target) { finish(); return; }
      raf = requestAnimationFrame(step);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * LINE_HEIGHT_PX : e.deltaY;
      const perZoom = e.ctrlKey ? PINCH_PX_PER_ZOOM : SCROLL_PX_PER_ZOOM;
      // Resync after idle so zoom buttons / fitBounds between gestures don't
      // make the next gesture snap back to a stale target.
      if (raf === 0 && !inTransaction) target = map.getZoom();
      target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), target - px / perZoom));
      anchor = L.DomEvent.getMousePosition(e, container);
      if (!raf) raf = requestAnimationFrame(step);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onWheel);
      if (raf) cancelAnimationFrame(raf);
      // Unmount mid-gesture: the map is being torn down, closing the
      // transaction would fire events into disposed subscribers. Skip it.
      map.scrollWheelZoom.enable();
    };
  }, [map]);

  return null;
}
