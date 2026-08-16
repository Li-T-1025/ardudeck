/**
 * The six-point position target, with live feedback on whether the operator is
 * actually holding it.
 *
 * Wraps the 3D scene with the numbers that make it honest: how far off the
 * vehicle is, which way to correct, and whether attitude telemetry is even
 * arriving. When there is no attitude to trust it falls back to the static
 * diagram rather than showing a confident aircraft sitting level.
 */

import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useTelemetryFresh } from '../../map/instruments/useTelemetryFresh';
import {
  matchOrientation,
  orientationHint,
  targetForPosition,
  ORIENTATION_TOLERANCE_DEG,
} from '../../../../shared/calibration-orientation';
import type { AccelPosition } from '../../../../shared/calibration-types';
import { OrientationScene } from './OrientationScene';
import { PositionDiagram } from './PositionDiagram';

interface LiveOrientationGuideProps {
  position: AccelPosition;
  size?: number;
}

export function LiveOrientationGuide({ position, size = 220 }: LiveOrientationGuideProps) {
  const roll = useTelemetryStore((s) => s.attitude.roll);
  const pitch = useTelemetryStore((s) => s.attitude.pitch);
  // Same freshness rule the instruments use: a stale stream must not be drawn
  // as a live aircraft, least of all while someone is holding the thing.
  const live = useTelemetryFresh('attitude');

  const target = targetForPosition(position);
  const match = matchOrientation({ roll, pitch }, target, ORIENTATION_TOLERANCE_DEG);
  const hint = live ? orientationHint({ roll, pitch }, target, ORIENTATION_TOLERANCE_DEG) : null;

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {live ? (
        <OrientationScene position={position} roll={roll} pitch={pitch} live={live} size={size} />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <PositionDiagram position={position} isActive compact />
          <span className="text-[11px] text-amber-400">
            No attitude telemetry: position cannot be checked
          </span>
        </div>
      )}

      <p className="text-center text-sm text-content">{target.instruction}</p>

      {live && (
        <div
          className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
            match.matched
              ? 'text-green-400 bg-green-500/15 border-green-500/30'
              : 'text-amber-400 bg-amber-500/15 border-amber-500/30'
          }`}
        >
          {match.matched
            ? `Held, ${match.errorDeg.toFixed(0)}° off`
            : hint ?? `${match.errorDeg.toFixed(0)}° off`}
        </div>
      )}
    </div>
  );
}
