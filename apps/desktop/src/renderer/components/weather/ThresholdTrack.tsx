/**
 * ThresholdTrack: a slim rail showing the green / amber / red zones for a gated
 * metric with a marker at the current value, so a tile reads like a mini
 * instrument sitting some distance from its limit. Zones are supplied by the
 * caller (built from WEATHER_THRESHOLDS); this file draws, it does not grade.
 *
 * The marker eases from the rail start to its value on mount and transitions
 * on refresh; reduced-motion callers pass `animate={false}` for an instant set.
 */
import { useEffect, useState } from 'react';

export interface TrackZone {
  from: number;
  to: number;
  color: string;
}

interface ThresholdTrackProps {
  min: number;
  max: number;
  value: number;
  zones: TrackZone[];
  markerColor: string;
  animate: boolean;
  tip?: string;
}

function pct(v: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

export function ThresholdTrack({ min, max, value, zones, markerColor, animate, tip }: ThresholdTrackProps): JSX.Element {
  const target = pct(value, min, max);
  const [pos, setPos] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate) {
      setPos(target);
      return;
    }
    const id = requestAnimationFrame(() => setPos(target));
    return () => cancelAnimationFrame(id);
  }, [target, animate]);

  return (
    <div
      className="relative mt-2 h-1.5 rounded-full overflow-visible"
      style={{ background: 'color-mix(in srgb, var(--gauge-text-dim) 22%, transparent)' }}
      data-tip={tip}
    >
      {zones.map((z) => {
        const left = pct(z.from, min, max);
        const width = pct(z.to, min, max) - left;
        return (
          <div
            key={`${z.from}-${z.to}`}
            className="absolute inset-y-0 first:rounded-l-full last:rounded-r-full"
            style={{
              left: `${left}%`,
              width: `${width}%`,
              background: `color-mix(in srgb, ${z.color} 42%, transparent)`,
            }}
          />
        );
      })}
      {/* Marker: a bright capsule with a dark hairline so it stays legible on
          any zone colour and in either theme. */}
      <div
        className="absolute top-1/2 h-3 w-[3px] rounded-full -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${pos}%`,
          background: markerColor,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.4)',
          transition: animate ? 'left 0.7s cubic-bezier(0.22,1,0.36,1)' : 'none',
        }}
      />
    </div>
  );
}
