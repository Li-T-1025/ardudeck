/**
 * Live compass coverage for a running calibration, one entry per compass.
 *
 * Separate from the calibration store because it is fed by its own MAVLink
 * event and is read by two places that must not disagree: the spheres and the
 * progress ring.
 *
 * The ring used to read ArduPilot's `completion_pct`, which sits at 0 for most
 * of a run because it reflects the sphere FIT, not how much you have turned.
 * That put "0%" under a solid that was visibly 70% covered. Coverage is the
 * honest answer to "how far through the rotation am I", so both now come from
 * the same numbers.
 */

import { create } from 'zustand';
import { coveredCount, SECTION_COUNT } from '../../shared/geodesic-grid';

export interface CompassCoverage {
  mask: number[];
  direction: [number, number, number] | null;
  /** ArduPilot's own completion_pct, kept because it leads late in the run. */
  completionPct: number;
}

interface CompassCoverageState {
  byCompass: Map<number, CompassCoverage>;
  update: (compassId: number, coverage: CompassCoverage) => void;
  reset: () => void;
}

export const useCompassCoverageStore = create<CompassCoverageState>()((set) => ({
  byCompass: new Map(),
  update: (compassId, coverage) => set((state) => {
    const byCompass = new Map(state.byCompass);
    byCompass.set(compassId, coverage);
    return { byCompass };
  }),
  reset: () => set({ byCompass: new Map() }),
}));

let unsubscribe: (() => void) | null = null;

/** Start listening once, at app start. Safe to call twice. */
export function startCompassCoverageListener(): void {
  if (unsubscribe) return;
  unsubscribe = window.electronAPI?.onCalibrationMagCoverage?.((msg) => {
    useCompassCoverageStore.getState().update(msg.compassId, {
      mask: msg.mask,
      direction: msg.direction,
      completionPct: msg.completionPct,
    });
  }) ?? null;
}

/** Percentage of the 80 directions sampled, for one compass. */
export function coveragePct(coverage: CompassCoverage): number {
  return Math.round((coveredCount(coverage.mask) / SECTION_COUNT) * 100);
}

/**
 * Progress for the run as a whole: the compass that has the least, because a
 * calibration is finished when the WORST compass is finished.
 *
 * Takes the higher of coverage and the firmware's own percentage per compass,
 * so the ring never sits at zero while the solid is filling, and never goes
 * backwards once the firmware's number overtakes coverage during the fit.
 */
export function slowestCompassProgress(byCompass: Map<number, CompassCoverage>): number | null {
  if (byCompass.size === 0) return null;
  let worst = 100;
  for (const coverage of byCompass.values()) {
    worst = Math.min(worst, Math.max(coveragePct(coverage), coverage.completionPct));
  }
  return worst;
}
