/**
 * Small bar primitives for the compact map readouts, ported from the mobile
 * app's CompactReadout painters. Div/flex based, theme-aware: every color is a
 * gauge-palette value (GAUGE_COLORS / the --gauge-* vars), never a fixed hex or
 * text-white, so they follow the same dark/light instrument palette as the
 * round gauges. Tints use color-mix over the gauge tokens, not opacity on a
 * semantic token.
 *
 * - SegmentBar   12 discrete rounded segments lit proportional to a fraction.
 * - SignalBars   4 rising bars, the signal glyph, used for the GPS sat count.
 * - FillBehind   a rounded trough with a proportional fill drawn behind a value.
 */
import type { CSSProperties, ReactNode } from 'react';
import { GAUGE_COLORS } from './RoundGauge';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** color-mix tint of a gauge token, kept off the /NN semantic-token opacity path. */
export function gaugeTint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export function SegmentBar({
  fraction,
  color,
  segments = 12,
  width = 74,
  height = 9,
}: {
  fraction: number;
  color: string;
  segments?: number;
  width?: number;
  height?: number;
}): JSX.Element {
  const lit = Math.max(0, Math.min(segments, Math.round(clamp01(fraction) * segments)));
  return (
    <div style={{ display: 'flex', gap: 2, width, height }}>
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: '100%',
            borderRadius: 1.5,
            background: i < lit ? color : GAUGE_COLORS.bezelEdge,
          }}
        />
      ))}
    </div>
  );
}

export function SignalBars({
  fraction,
  color,
  width = 20,
  height = 12,
}: {
  fraction: number;
  color: string;
  width?: number;
  height?: number;
}): JSX.Element {
  const lit = Math.max(0, Math.min(4, Math.ceil(clamp01(fraction) * 4)));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, width, height }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(0.34 + 0.22 * i) * 100}%`,
            borderRadius: 1,
            background: i < lit ? color : GAUGE_COLORS.bezelEdge,
          }}
        />
      ))}
    </div>
  );
}

export function FillBehind({
  fraction,
  fill,
  trough,
  edge,
  style,
  children,
}: {
  /** null draws the trough alone: a chip, not a lying gauge. */
  fraction: number | null;
  fill: string;
  trough: string;
  edge: string;
  style?: CSSProperties;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 9999,
        background: trough,
        border: `1px solid ${edge}`,
        ...style,
      }}
    >
      {fraction !== null && fraction > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${clamp01(fraction) * 100}%`,
            background: fill,
          }}
        />
      )}
      {children !== undefined && <div style={{ position: 'relative' }}>{children}</div>}
    </div>
  );
}
