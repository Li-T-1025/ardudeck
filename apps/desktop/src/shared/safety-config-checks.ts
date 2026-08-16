/**
 * Settings that will not stop you arming, and will not warn you in flight, but
 * decide whether a bad day ends with a landing or a lost aircraft.
 *
 * The flight controller broadcasts pre-arm failures, so those already reach the
 * pilot. Nothing broadcasts "your navigation failsafe is set to report only" or
 * "your fence will try to fly home using the compass that just failed". Those
 * are silent until the moment they matter, which is what this covers.
 *
 * Rules:
 *   - Silent when everything is set sensibly. A checklist that always shows
 *     something gets ignored, and then it is worse than nothing.
 *   - Plain words. The parameter name is shown as the fix, not the reason.
 *   - Every finding says what happens to the AIRCRAFT, not what the setting is.
 */

import type { CalibrationVerdict } from './calibration-quality';

export type SafetySeverity = 'critical' | 'warning' | 'advisory';

export interface SafetyFinding {
  id: string;
  severity: SafetySeverity;
  /** Plain sentence, no parameter names. */
  title: string;
  /** What happens to the aircraft if this is left alone. */
  consequence: string;
  /** Parameters the user would change, for the deep link. */
  params: string[];
  /** Recommended value, when there is a single obvious one. */
  recommend?: { param: string; value: number; label: string };
}

export interface SafetyConfigContext {
  /** Live parameter values, by name. Missing entries are simply not checked. */
  params: Map<string, number> | Record<string, number>;
  /** Worst recorded calibration verdict for this board, if any. */
  compassVerdict?: CalibrationVerdict;
  /** True when a stored calibration failed its post-reboot read-back. */
  calibrationLost?: boolean;
  /** Name of the calibration that was lost, for the message. */
  calibrationLostType?: string;
}

function read(params: SafetyConfigContext['params'], name: string): number | undefined {
  if (params instanceof Map) return params.get(name);
  return params[name];
}

/**
 * Evaluate the aircraft's safety configuration. Returns findings worst-first,
 * or an empty array when there is nothing worth saying.
 */
export function checkSafetyConfig(ctx: SafetyConfigContext): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  const p = ctx.params;

  const ekfAction = read(p, 'FS_EKF_ACTION');
  const fenceAction = read(p, 'FENCE_ACTION');
  const fenceEnable = read(p, 'FENCE_ENABLE');
  const ekfThresh = read(p, 'FS_EKF_THRESH');

  const compassSuspect = ctx.compassVerdict === 'marginal' || ctx.compassVerdict === 'bad';

  // A calibration that did not survive the reboot outranks everything: the
  // aircraft is flying on values nobody has seen.
  if (ctx.calibrationLost) {
    findings.push({
      id: 'calibration-lost',
      severity: 'critical',
      title: `The last ${ctx.calibrationLostType ?? 'sensor'} calibration is not on the aircraft`,
      consequence: 'It was written but did not survive the restart. The aircraft is flying on whatever was there before.',
      params: [],
    });
  }

  // Navigation failsafe doing nothing. This is the single setting that decides
  // whether a confused aircraft lands or keeps going.
  if (ekfAction === 0) {
    findings.push({
      id: 'ekf-failsafe-report-only',
      severity: compassSuspect ? 'critical' : 'warning',
      title: 'If the aircraft loses track of where it is, nothing will happen',
      consequence: compassSuspect
        ? 'Your compass calibration is already weak, and the navigation failsafe is set to report only. A confused aircraft will keep flying instead of landing.'
        : 'The navigation failsafe is set to report only. If position or heading goes bad in flight, the aircraft will keep trying to fly the mode you are in.',
      params: ['FS_EKF_ACTION'],
      recommend: { param: 'FS_EKF_ACTION', value: 1, label: 'Land when navigation fails' },
    });
  }

  // The threshold feeds both the failsafe and the arming check, so switching it
  // off removes the ground catch as well as the in-flight one.
  if (ekfThresh === 0) {
    findings.push({
      id: 'ekf-threshold-disabled',
      severity: 'critical',
      title: 'The navigation quality check is switched off',
      consequence: 'Nothing will stop you arming with a bad heading or position estimate, and the in-flight failsafe cannot trigger either.',
      params: ['FS_EKF_THRESH'],
      recommend: { param: 'FS_EKF_THRESH', value: 0.8, label: 'Restore the default threshold' },
    });
  }

  // Fence set to fly home, when flying home needs the heading that failed.
  if (fenceEnable === 1 && fenceAction === 1 && compassSuspect) {
    findings.push({
      id: 'fence-rtl-with-weak-compass',
      severity: 'warning',
      title: 'On a fence breach the aircraft will try to fly home',
      consequence: 'Flying home needs the same heading your compass calibration is weak on. Landing where it is does not.',
      params: ['FENCE_ACTION'],
      recommend: { param: 'FENCE_ACTION', value: 2, label: 'Land instead of flying home' },
    });
  }

  // Weak calibration on its own, when nothing above already said it louder.
  if (compassSuspect && ekfAction !== 0 && !ctx.calibrationLost) {
    findings.push({
      id: 'compass-weak',
      severity: 'advisory',
      title: 'The compass calibration is weaker than it should be',
      consequence: 'Position hold may wander or circle. Recalibrating away from metal and power wiring usually fixes it.',
      params: [],
    });
  }

  const rank: Record<SafetySeverity, number> = { critical: 0, warning: 1, advisory: 2 };
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
