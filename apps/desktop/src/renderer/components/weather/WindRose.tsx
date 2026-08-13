/**
 * WindRose: the signature wind instrument for the briefing, a scaled-up sibling
 * of the map heading gauge. A fixed north-up cardinal rose with a bold wind
 * vane whose head points INTO the wind, at the bearing the wind blows FROM, so
 * it matches the "wind from" label like a weather vane. The vane is coloured by
 * the sustained-wind grade. A gust sector on the rim and a gust readout in the
 * centre carry the gust severity separately.
 *
 * The vane is a high-contrast arrow (grade fill + dark outline) so it reads on
 * both the dark and the light-theme white face; its centre passes BEHIND the
 * opaque readout well, so both the head (FROM rim) and the tail stay clear of
 * the digits. The vane eases to the bearing and sways as ambient motion; the
 * central speed and gust count up. All motion is gated on the caller's `animate`
 * flag (reduced-motion aware).
 */
import {
  windSpeedValueFromMetersPerSecond, UNIT_LABELS, type WindSpeedUnit,
} from '../../../shared/user-units.js';
import { GRADE_COLOR, type Grade } from './weather-visuals';
import { useCountUp } from './weather-motion';

const C = 100;
const FACE_R = 84;
const WELL_R = 30;
const OUTLINE = 'rgba(0,0,0,0.55)';

function point(r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

// Clockwise arc path, 0deg = up.
function arcPath(r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = point(r, fromDeg);
  const [x2, y2] = point(r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

const CARDINALS: Array<{ label: string; deg: number }> = [
  { label: 'N', deg: 0 }, { label: 'E', deg: 90 }, { label: 'S', deg: 180 }, { label: 'W', deg: 270 },
];

interface WindRoseProps {
  dirDeg: number;
  speedMs: number;
  gustMs: number;
  speedGrade: Grade;
  gustGrade: Grade;
  unit: WindSpeedUnit;
  animate: boolean;
  size?: number;
}

export function WindRose({ dirDeg, speedMs, gustMs, speedGrade, gustGrade, unit, animate, size = 216 }: WindRoseProps): JSX.Element {
  const speedColor = GRADE_COLOR[speedGrade];
  const gustColor = GRADE_COLOR[gustGrade];

  const speedTarget = windSpeedValueFromMetersPerSecond(speedMs, unit);
  const gustTarget = windSpeedValueFromMetersPerSecond(gustMs, unit);
  const speed = useCountUp(speedTarget);
  const gust = useCountUp(gustTarget);

  return (
    <div className="relative shrink-0 select-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 200 200">
        <defs>
          <linearGradient id="windrose-bezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--gauge-bezel)" />
            <stop offset="1" stopColor="var(--gauge-bezel-2)" />
          </linearGradient>
          <radialGradient id="windrose-sheen" cx="0.5" cy="0.32" r="0.72">
            <stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>

        <circle cx={C} cy={C} r={98} fill="url(#windrose-bezel)" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
        <circle cx={C} cy={C} r={FACE_R + 2} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="3" />
        <circle cx={C} cy={C} r={FACE_R} fill="var(--gauge-face)" />

        {/* Degree ticks every 30, cardinals emphasised. */}
        {Array.from({ length: 12 }, (_, i) => {
          const d = i * 30;
          const cardinal = d % 90 === 0;
          const [x1, y1] = point(FACE_R - 2, d);
          const [x2, y2] = point(cardinal ? FACE_R - 12 : FACE_R - 7, d);
          return (
            <line
              key={d}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={d === 0 ? '#ef4444' : cardinal ? 'var(--gauge-tick-major)' : 'var(--gauge-tick-minor)'}
              strokeWidth={cardinal ? 2 : 1.2}
            />
          );
        })}
        {CARDINALS.map(({ label, deg }) => {
          const [x, y] = point(FACE_R - 22, deg);
          return (
            <text
              key={label}
              x={x} y={y}
              textAnchor="middle"
              // Centred on the point, not nudged by a fixed baseline offset:
              // +3.5 centres a horizontal label but pushes N and S off their
              // own ticks in opposite directions, so the rose read crooked.
              dominantBaseline="central"
              fontSize="12"
              fontWeight="700"
              fill={deg === 0 ? '#ef4444' : 'var(--gauge-tick-major)'}
            >
              {label}
            </text>
          );
        })}

        {/* Bearing group: rotates to the wind FROM direction, easing on change. */}
        <g
          style={{
            transform: `rotate(${dirDeg}deg)`,
            transformBox: 'view-box',
            transformOrigin: '100px 100px',
            transition: animate ? 'transform 0.85s cubic-bezier(0.22,1,0.36,1)' : 'none',
          }}
        >
          {/* Gust sector on the rim, coloured by gust grade. */}
          <path d={arcPath(90, -17, 17)} fill="none" stroke={gustColor} strokeWidth="5" strokeLinecap="round" opacity={0.85} />

          {/* Wind vane: a weather-vane arrow whose HEAD points into the wind, at
              the bearing the wind blows FROM, so it lines up with the "wind from"
              label and the rose bearing (a pilot reads it like a weather vane).
              The head sits at the top (FROM rim), the small tail at the bottom.
              Dark outline under the graded core so it reads on either face; the
              shaft centre passes behind the readout well below. */}
          <g className={animate ? 'wx-vane-sway' : undefined}>
            <line x1={C} y1={44} x2={C} y2={158} stroke={OUTLINE} strokeWidth="8.5" strokeLinecap="round" />
            <line x1={C} y1={44} x2={C} y2={158} stroke={speedColor} strokeWidth="5" strokeLinecap="round" />
            <polygon points="100,26 85,56 115,56" fill={speedColor} stroke={OUTLINE} strokeWidth="1.5" strokeLinejoin="round" />
            <polygon points="100,172 92,152 108,152" fill={speedColor} stroke={OUTLINE} strokeWidth="1.2" strokeLinejoin="round" />
          </g>
        </g>

        {/* Opaque readout well, seated above the vane centre so the digits never
            collide with the shaft. */}
        <circle cx={C} cy={C} r={WELL_R} fill="var(--gauge-face)" />
        <circle cx={C} cy={C} r={WELL_R} fill="url(#windrose-sheen)" />
        <circle cx={C} cy={C} r={WELL_R} fill="none" stroke="var(--gauge-bezel-edge)" strokeWidth="1.5" />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-[22px] font-bold leading-none tabular-nums" style={{ color: speedColor }}>
          {Math.round(speed)}
        </span>
        <span className="text-[9px] font-medium leading-none mt-0.5" style={{ color: 'var(--gauge-text-dim)' }}>
          {UNIT_LABELS.windSpeed[unit]}
        </span>
        <span className="mt-1 text-[10px] font-semibold leading-none tabular-nums" style={{ color: gustColor }}>
          G {Math.round(gust)}
        </span>
      </div>
    </div>
  );
}
