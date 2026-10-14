/** Choose an area by framing it on the map: what sits inside the frame is the area. Search and "vehicle" jump there. */
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Loader2, Square, X, Check, Navigation } from 'lucide-react';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { MAP_LAYERS, type LayerKey, type MapLayer } from '../../../shared/map-layers';
import { SmoothWheelZoom } from './SmoothWheelZoom';
import { searchLocations, type GeocodeResult } from '../../utils/weather-api';

export interface AreaBounds { north: number; south: number; east: number; west: number }

/** Inset of the frame from the map edge, px: room to see what is just outside. */
const FRAME_INSET = 28;
const FALLBACK: [number, number] = [51.505, -0.09];

interface FlyTarget { lat: number; lng: number; zoom: number; token: number }

function sizeKm(b: AreaBounds): { w: number; h: number } {
  const midLat = ((b.north + b.south) / 2) * (Math.PI / 180);
  return { w: Math.abs(b.east - b.west) * 111.32 * Math.cos(midLat), h: Math.abs(b.north - b.south) * 111.32 };
}

/** "12.4 x 8.1 km" for an area. */
export function formatAreaSize(b: AreaBounds): string {
  const { w, h } = sizeKm(b);
  const f = (v: number) => (v < 10 ? v.toFixed(1) : Math.round(v).toString());
  return `${f(w)} × ${f(h)} km`;
}

function FrameController({ onBounds, flyTo, initial }: { onBounds: (b: AreaBounds) => void; flyTo: FlyTarget | null; initial: AreaBounds | null }) {
  const map = useMap();
  const read = () => {
    const size = map.getSize();
    const nw = map.containerPointToLatLng([FRAME_INSET, FRAME_INSET]);
    const se = map.containerPointToLatLng([size.x - FRAME_INSET, size.y - FRAME_INSET]);
    onBounds({ north: nw.lat, west: nw.lng, south: se.lat, east: se.lng });
  };
  useMapEvents({ moveend: read, zoomend: read, resize: read });
  useEffect(() => {
    // a map born in a fresh modal renders grey until it is told its size
    const nudge = () => { try { map.invalidateSize(); read(); } catch { /* torn down */ } };
    const t1 = setTimeout(() => {
      nudge();
      if (initial) map.fitBounds([[initial.south, initial.west], [initial.north, initial.east]], { padding: [FRAME_INSET, FRAME_INSET], animate: false });
    }, 60);
    const ro = new ResizeObserver(nudge);
    ro.observe(map.getContainer());
    return () => { clearTimeout(t1); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useEffect(() => {
    if (flyTo) map.setView([flyTo.lat, flyTo.lng], flyTo.zoom, { animate: true });
  }, [flyTo, map]);
  return null;
}

export function MapAreaPickerDialog({ title, initial, onConfirm, onClose }: {
  title: string;
  initial: AreaBounds | null;
  onConfirm: (bounds: AreaBounds) => void;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const mapLayerKey = useEditModeStore((s) => s.mapLayer);
  const layerKey: LayerKey = (mapLayerKey in MAP_LAYERS ? mapLayerKey : 'googleSat') as LayerKey;
  const layer = MAP_LAYERS[layerKey];
  const vehicle = useTelemetryStore((s) => (s.position.lat !== 0 || s.position.lon !== 0 ? { lat: s.position.lat, lng: s.position.lon } : null));

  const [bounds, setBounds] = useState<AreaBounds | null>(initial);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const flyToken = useRef(0);

  const startView = useMemo<{ center: [number, number]; zoom: number }>(() => {
    if (initial) return { center: [(initial.north + initial.south) / 2, (initial.east + initial.west) / 2], zoom: 12 };
    if (vehicle) return { center: [vehicle.lat, vehicle.lng], zoom: 12 };
    return { center: FALLBACK, zoom: 4 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init only: MapContainer ignores later changes
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchLocations(q);
      if (!cancelled) { setResults(found); setSearching(false); }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const go = (lat: number, lng: number, zoom = 12) => setFlyTo({ lat, lng, zoom, token: ++flyToken.current });

  return createPortal(
    <div className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[min(92vw,880px)] max-h-[90vh] flex flex-col rounded-2xl border border-default bg-surface-solid shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Square className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-content">{title}</h3>
            <p className="text-[11px] text-content-tertiary">{t('map:mapAreaPicker.subtitle')}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors" data-tip={t('common:close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            {searching && <Loader2 className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-content-tertiary animate-spin" />}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('map:mapPointPicker.searchPlaceholder')}
              autoFocus
              className="w-full pl-9 pr-9 py-2 bg-surface-input border border-border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
            />
            {results.length > 0 && (
              <div className="absolute z-[1200] left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-lg border border-default bg-surface-solid shadow-xl divide-y divide-subtle">
                {results.map((r) => (
                  <button key={r.id} onClick={() => { go(r.lat, r.lon); setQuery(''); setResults([]); }} className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors">
                    <div className="text-xs text-content truncate">{r.name}</div>
                    <div className="text-[10px] text-content-tertiary truncate">{[r.admin1, r.country].filter(Boolean).join(', ')}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {vehicle && (
            <button onClick={() => go(vehicle.lat, vehicle.lng)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-surface-raised text-content hover:brightness-125 transition-colors shrink-0">
              <Navigation className="w-3.5 h-3.5" />{t('map:mapAreaPicker.vehicle')}
            </button>
          )}
        </div>

        <div className="px-4 pt-3">
          <div className="relative h-[50vh] min-h-[340px] rounded-lg overflow-hidden border border-default">
            <MapContainer center={startView.center} zoom={startView.zoom} zoomSnap={0} className="h-full w-full" zoomControl attributionControl={false}>
              <SmoothWheelZoom />
              <TileLayer key={layerKey} url={`tile-cache://${layerKey}/{z}/{x}/{y}.png`} maxZoom={layer.maxZoom} maxNativeZoom={(layer as MapLayer).maxNativeZoom ?? layer.maxZoom} />
              <FrameController onBounds={setBounds} flyTo={flyTo} initial={initial} />
            </MapContainer>
            {/* the frame: everything inside it is the area; outside is dimmed */}
            <div
              className="pointer-events-none absolute z-[500] rounded-sm border-2 border-emerald-400"
              style={{ inset: FRAME_INSET, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}
            />
            {bounds && (
              <div className="pointer-events-none absolute z-[600] top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md bg-surface-solid border border-subtle text-[11px] text-content shadow tabular-nums">
                {formatAreaSize(bounds)}
              </div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-content-tertiary">{t('map:mapAreaPicker.hint')}</p>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface-raised transition-colors">
            {t('common:cancel')}
          </button>
          <button
            onClick={() => { if (bounds) { onConfirm(bounds); onClose(); } }}
            disabled={!bounds}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />{t('map:mapAreaPicker.useThisArea')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
