import { useEffect, useState } from 'react';
import { Polyline } from 'react-leaflet';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useLinkUp } from './instruments/useLinkUp';
import {
  PROXIMITY_SECTOR_DEG,
  proximityAnyLive,
  proximityTone,
  resolveProximitySectors,
  sectorArcLatLngs,
  type ProximityTone,
} from './proximity-sectors';

const HALF_WIDTH_DEG = PROXIMITY_SECTOR_DEG / 2 - 2;

type RingColours = Record<ProximityTone | 'rim', string>;

// Leaflet writes stroke as an SVG attribute, so the theme vars must be resolved here.
function readRingColours(): RingColours {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    red: v('--gauge-red', '#f87171'),
    amber: v('--gauge-amber', '#f59e0b'),
    green: v('--gauge-green', '#34d399'),
    rim: v('--gauge-bezel-edge', '#374151'),
  };
}

function useRingColours(): RingColours {
  const [colours, setColours] = useState<RingColours>(readRingColours);
  useEffect(() => {
    const observer = new MutationObserver(() => setColours(readRingColours()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return colours;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Obstacle ring around the vehicle in real metres: a rim arc at each sector's sensor range, a coloured arc at the obstacle. */
export function ProximityRingOverlay({ position, heading }: { position: [number, number]; heading: number }): JSX.Element | null {
  const linkUp = useLinkUp();
  const now = useNow(500);
  const proximity = useTelemetryStore((s) => s.proximity);
  const colours = useRingColours();
  if (!proximityAnyLive(proximity, now, linkUp)) return null;
  const [lat, lon] = position;
  const sectors = resolveProximitySectors(proximity, now, linkUp);
  return (
    <>
      {sectors.map((s) => {
        if (s.max === null) return null;
        const bearing = heading + s.index * PROXIMITY_SECTOR_DEG;
        return (
          <Polyline
            key={`rim-${s.index}`}
            positions={sectorArcLatLngs(lat, lon, bearing, s.max, HALF_WIDTH_DEG)}
            pathOptions={{ color: colours.rim, weight: 1.5, opacity: 0.7, dashArray: '3 4', interactive: false }}
          />
        );
      })}
      {sectors.map((s) => {
        if (s.distance === null) return null;
        const bearing = heading + s.index * PROXIMITY_SECTOR_DEG;
        return (
          <Polyline
            key={`obstacle-${s.index}`}
            positions={sectorArcLatLngs(lat, lon, bearing, s.distance, HALF_WIDTH_DEG)}
            pathOptions={{ color: colours[proximityTone(s.distance)], weight: 6, opacity: 0.9, lineCap: 'round', interactive: false }}
          />
        );
      })}
    </>
  );
}
