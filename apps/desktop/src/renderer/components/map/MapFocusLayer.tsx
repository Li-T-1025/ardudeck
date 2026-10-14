import { useEffect, useMemo, useState } from 'react';
import { Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapFocusStore, FOCUS_FRESH_MS } from '../../stores/map-focus-store';

const PIN_MS = 60_000;

/** Centres this map on "show on map" requests and marks the spot for a minute. */
export function MapFocusLayer({ onFocus }: { onFocus?: () => void }) {
  const map = useMap();
  const request = useMapFocusStore((s) => s.request);
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!request || Date.now() - request.at > FOCUS_FRESH_MS) return;
    onFocus?.();
    map.setView([request.lat, request.lon], request.zoom ?? Math.max(map.getZoom(), 15), { animate: true });
    setPin({ lat: request.lat, lon: request.lon });
    const timer = setTimeout(() => setPin(null), PIN_MS);
    return () => clearTimeout(timer);
    // only a new request moves the map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.token]);

  const icon = useMemo(() => L.divIcon({
    className: '',
    html: `<div style="position:relative;width:0;height:0">
      <div style="position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:9999px;border:3px solid #f43f5e;background:rgba(244,63,94,.25);box-shadow:0 0 0 3px rgba(0,0,0,.45)"></div>
      <div style="position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:9999px;background:#f43f5e"></div>
    </div>`,
    iconSize: [0, 0],
  }), []);

  return pin ? <Marker position={[pin.lat, pin.lon]} icon={icon} interactive={false} zIndexOffset={1000} /> : null;
}
