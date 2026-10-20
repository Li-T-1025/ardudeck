import { airspeedSuggestion, batterySuggestion, tuneSuggestion } from './calc.js';
import { choiceWrites, stallOf, type ParamWrite } from './choices.js';
import { defaultFrameType, FRAME_CLASS, outputChanges, planeOutputs } from './outputs.js';
import type { ParamReader, SetupAnswers, SetupStepId, SetupVehicle } from './types.js';

export interface FailsafeRow {
  /** i18n key suffix under vehicle-setup:failsafe */
  key: 'low' | 'crit' | 'radio' | 'tether' | 'leak';
  param: string;
}

/** The failsafe action parameters per vehicle; their options come from the firmware's own metadata. */
export function failsafeRows(vehicle: SetupVehicle): FailsafeRow[] {
  if (vehicle === 'sub') return [{ key: 'low', param: 'BATT_FS_LOW_ACT' }, { key: 'tether', param: 'FS_GCS_ENABLE' }, { key: 'leak', param: 'FS_LEAK_ENABLE' }];
  const radio = vehicle === 'plane' || vehicle === 'vtol' ? 'FS_LONG_ACTN' : vehicle === 'rover' || vehicle === 'boat' ? 'FS_ACTION' : 'FS_THR_ENABLE';
  return [{ key: 'low', param: 'BATT_FS_LOW_ACT' }, { key: 'crit', param: 'BATT_FS_CRT_ACT' }, { key: 'radio', param: radio }];
}

/** Everything a step wants written, before checking what the board has. */
export function stepWrites(step: SetupStepId, vehicle: SetupVehicle, a: SetupAnswers, read: ParamReader): ParamWrite[] {
  const cells = a.cells ?? 4;
  switch (step) {
    case 'size':
      return tuneSuggestion({ propIn: a.propIn ?? 10, cells, chemistry: a.chemistry }, read).changes;
    case 'psize':
      return airspeedSuggestion({ stall: stallOf(a) }, read).changes;
    case 'frame': {
      if (vehicle !== 'copter') return [];
      const cls = a.copterClass ?? 'quad';
      const out: ParamWrite[] = [{ name: 'FRAME_CLASS', value: FRAME_CLASS[cls] }];
      if (!['single', 'coax', 'bi'].includes(cls)) out.push({ name: 'FRAME_TYPE', value: a.frameType ?? defaultFrameType(FRAME_CLASS[cls]) });
      return out;
    }
    case 'vframe': {
      if (a.vtolType === 'tail' && a.tailsitter !== 'copter') return [{ name: 'Q_FRAME_CLASS', value: 10 }, { name: 'Q_TAILSIT_MOTMX', value: 0 }];
      const qc = FRAME_CLASS[a.copterClass ?? 'quad'];
      const out: ParamWrite[] = [{ name: 'Q_FRAME_CLASS', value: qc }, { name: 'Q_FRAME_TYPE', value: a.frameType ?? defaultFrameType(qc) }];
      if (a.vtolType === 'tilt' && a.choices?.tiltMask) out.push({ name: 'Q_TILT_MASK', value: Number(a.choices.tiltMask) });
      return out;
    }
    case 'outputs':
      return vehicle === 'plane' || vehicle === 'vtol' ? outputChanges(planeOutputs(vehicle, a), read) : [];
    case 'battery': {
      const out: ParamWrite[] = batterySuggestion({ cells, chemistry: a.chemistry, capacity: a.capacity }, read).changes;
      if (a.choices?.monitor) out.push({ name: 'BATT_MONITOR', value: Number(a.choices.monitor) });
      for (const row of failsafeRows(vehicle)) {
        const pick = a.choices?.[`fs_${row.key}`];
        if (pick !== undefined) out.push({ name: row.param, value: Number(pick) });
      }
      // the long-failsafe action only fires once the throttle failsafe itself is on
      if (a.choices?.fs_radio !== undefined && (vehicle === 'plane' || vehicle === 'vtol')) out.push({ name: 'THR_FAILSAFE', value: 1 });
      if (a.choices?.fs_radio !== undefined && (vehicle === 'rover' || vehicle === 'boat')) out.push({ name: 'FS_THR_ENABLE', value: 1 });
      return out;
    }
    default:
      return choiceWrites(step, vehicle, a);
  }
}

/** Splits writes into what can be proposed now and what the board only has after a restart. */
export function splitWrites(writes: ParamWrite[], read: ParamReader): { now: ParamWrite[]; later: string[] } {
  const now: ParamWrite[] = [];
  const later: string[] = [];
  const seen = new Set<string>();
  for (const w of writes) {
    if (seen.has(w.name)) continue;
    seen.add(w.name);
    const cur = read(w.name);
    if (cur === undefined) later.push(w.name);
    else if (Math.abs(cur - w.value) > 1e-4) now.push(w);
  }
  return { now, later };
}

/** Cell count from a resting pack voltage; only a starting point, the pilot confirms it. */
export function cellsFromVoltage(volts: number): number | null {
  if (!(volts > 2.5)) return null;
  return Math.max(1, Math.round(volts / 3.95));
}
