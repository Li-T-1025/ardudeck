/**
 * InstrumentStrip: shared horizontal card wrapper for the non-round floating
 * map instruments (flight mode, link, mission, annunciator). Colors come from
 * GAUGE_COLORS, which resolve to the --gauge-* theme vars, so strips follow
 * the same dark/light instrument palette as the round gauges and the ball.
 *
 * Single-row strips share one fixed content height and one default width so
 * they line up when parked side by side; `tall` opts multi-row content
 * (annunciator grid) out of the fixed row. `bar` renders flush along the
 * bottom edge (mission progress) without changing the strip's height.
 */
import type { ReactNode } from 'react';
import { GAUGE_COLORS } from './RoundGauge';
import { PANEL_WIDTH } from './stripMetrics';

interface InstrumentStripProps {
  label: string;
  children: ReactNode;
  bar?: ReactNode;
  tall?: boolean;
}

export function InstrumentStrip({ label, children, bar, tall = false }: InstrumentStripProps): JSX.Element {
  return (
    <div
      // Fixed PANEL_WIDTH (not a min) so every card panel is the exact same
      // width and a stacked column lines up; content clips rather than widen.
      className="relative overflow-hidden rounded-lg shadow-xl select-none font-mono px-3 pt-2 pb-2.5"
      style={{
        background: GAUGE_COLORS.face,
        border: `1.5px solid ${GAUGE_COLORS.bezelEdge}`,
        width: PANEL_WIDTH,
      }}
    >
      <div
        className="text-[9px] font-semibold tracking-widest uppercase leading-none"
        style={{ color: GAUGE_COLORS.textDim }}
      >
        {label}
      </div>
      <div className={tall ? 'mt-1.5' : 'mt-1.5 h-[18px] flex items-center'}>{children}</div>
      {bar && <div className="absolute inset-x-0 bottom-0">{bar}</div>}
    </div>
  );
}
