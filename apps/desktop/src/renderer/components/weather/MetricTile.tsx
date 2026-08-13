/**
 * MetricTile: one stat in the briefing grid. A small icon + small-caps label,
 * a large tabular value with a small unit, and an optional ThresholdTrack
 * showing how close the value sits to its limit. Gating metrics pass a graded
 * track; context metrics (temperature, pressure, cloud) render muted with no
 * red zone so they read as clearly non-gating.
 *
 * Uses the same surface + small-caps caption language as the compact weather
 * card in settings, so the two panels read as one family.
 */
import type { ReactNode } from 'react';
import { ThresholdTrack, type TrackZone } from './ThresholdTrack';

export interface TrackConfig {
  min: number;
  max: number;
  value: number;
  zones: TrackZone[];
  markerColor: string;
  tip?: string;
}

interface MetricTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  valueColor?: string;
  track?: TrackConfig;
  animate: boolean;
}

export function MetricTile({ icon, label, value, unit, valueColor, track, animate }: MetricTileProps): JSX.Element {
  return (
    <div className="bg-surface-solid rounded-xl border border-default px-3 py-2.5 flex flex-col shadow-sm">
      <div className="flex items-center gap-1.5 text-content-secondary">
        <span className="flex items-center">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1 whitespace-nowrap">
        <span
          className="text-2xl font-bold leading-none tabular-nums"
          style={{ color: valueColor ?? 'var(--text-primary)' }}
        >
          {value}
        </span>
        {unit && <span className="text-xs font-medium text-content-tertiary">{unit}</span>}
      </div>
      {track ? (
        <ThresholdTrack
          min={track.min}
          max={track.max}
          value={track.value}
          zones={track.zones}
          markerColor={track.markerColor}
          animate={animate}
          tip={track.tip}
        />
      ) : (
        <div className="mt-2 h-1.5" />
      )}
    </div>
  );
}
