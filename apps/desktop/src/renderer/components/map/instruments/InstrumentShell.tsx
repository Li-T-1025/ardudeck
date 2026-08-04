/**
 * Shared visual language for the floating map instruments: one compact
 * glass card with a tiny uppercase label (plus an optional warn/danger dot),
 * a large mono value line with a small baseline-aligned unit suffix, and
 * optional sub rows (bars, secondary readouts).
 *
 * bg-surface-overlay carries baked-in alpha for both themes; NEVER swap it
 * for a /NN alpha modifier on a surface token, those classes generate no CSS
 * because the tokens are plain var() strings.
 *
 * The drag ref/style/onPointerDown from useDraggableOverlay live on the
 * wrapper the parent renders, not here, so the shell stays layout-agnostic.
 */
import type { ReactNode } from 'react';

interface InstrumentShellProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** Status colour class for the value text; neutral when omitted. */
  valueClassName?: string;
  /** Warn/danger dot colour class (e.g. bg-amber-500); hidden when nominal. */
  statusDotClassName?: string;
  children?: ReactNode;
}

export function InstrumentShell({ label, value, unit, valueClassName, statusDotClassName, children }: InstrumentShellProps): JSX.Element {
  return (
    <div className="rounded-lg border border-subtle bg-surface-overlay backdrop-blur-md shadow-lg px-3 py-2 min-w-[116px] select-none">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold tracking-widest uppercase text-content-tertiary">{label}</span>
        {statusDotClassName && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClassName}`} />}
      </div>
      <div className={`mt-1 text-xl font-mono font-semibold leading-none whitespace-nowrap ${valueClassName ?? 'text-content'}`}>
        {value}
        {unit && <span className="text-[10px] font-normal text-content-tertiary ml-1 align-baseline">{unit}</span>}
      </div>
      {children && <div className="mt-1.5 space-y-0.5">{children}</div>}
    </div>
  );
}
