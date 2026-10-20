import { buildPlaneScheme } from './mavlink-pid-schemes';
import { allChecksValue, detectArmingModel, isNoChecks } from './arming-checks';

export type RecommendationVehicle = 'plane' | 'copter' | 'other';

export interface Recommendation {
  id: string;
  /** Key under mavlink-config:quickSetup.recommend */
  textKey: string;
  textParams?: Record<string, string | number>;
  changes: Record<string, number>;
}

export interface RecommendationInput {
  parameters: Map<string, { value: number; defaultValue?: number }>;
  vehicle: RecommendationVehicle;
  /** Enum labels from parameter metadata, when loaded. */
  enumOf?: (name: string) => Record<number, string> | undefined;
}

const MODE_SLOTS = [1, 2, 3, 4, 5, 6];

// i18n-exempt: flight mode names
const PLANE_MODE_NAMES: Record<number, string> = {
  1: 'Circle', 5: 'FBWA', 7: 'Cruise', 10: 'Auto', 11: 'RTL', 12: 'Loiter', 15: 'Guided',
  17: 'QStabilize', 18: 'QHover', 19: 'QLoiter', 20: 'QLand', 21: 'QRTL', 22: 'QAutotune', 23: 'QAcro',
};
// i18n-exempt: flight mode names
const COPTER_MODE_NAMES: Record<number, string> = {
  2: 'AltHold', 3: 'Auto', 4: 'Guided', 5: 'Loiter', 6: 'RTL', 7: 'Circle', 16: 'PosHold', 17: 'Brake', 21: 'Smart_RTL',
};

const PLANE_FBWA = 5;
const COPTER_ALT_HOLD = 2;
// Plane Circle (1) also wants GPS but only drifts without it, so it is left alone.
const PLANE_GPS_MODES = new Set([7, 10, 11, 12, 15]);
const COPTER_GPS_MODES = new Set([3, 4, 5, 6, 7, 16, 17, 21]);
const PLANE_Q_MODES = new Set([17, 18, 19, 20, 21, 22, 23]);

/** Valid BATT_FS_*_ACT values, used when metadata is not loaded. */
const PLANE_BATT_ACTIONS = new Set([0, 1, 2, 3, 4, 5, 6]);
const COPTER_BATT_ACTIONS = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
/** Plane actions that only exist on a QuadPlane: on a plain plane these are copter numbers. */
const PLANE_Q_ACTIONS = new Set([4, 6]);

/** How hard an action brings the aircraft down: 0 nothing, 1 goes home, 2 lands now, 3 ends the flight. */
const PLANE_ACTION_SEVERITY: Record<number, number> = { 0: 0, 1: 1, 6: 1, 2: 2, 4: 2, 3: 3, 5: 3 };
const COPTER_ACTION_SEVERITY: Record<number, number> = { 0: 0, 2: 1, 3: 1, 4: 1, 6: 1, 1: 2, 7: 2, 5: 3 };

const PLANE_RTL = 1;
const PLANE_LAND = 2;
const PLANE_QLAND = 4;
const COPTER_LAND = 1;
const COPTER_RTL = 2;

function modeSlots(
  get: (n: string) => number | undefined,
  match: (mode: number) => boolean,
): Array<{ slot: number; mode: number }> {
  const out: Array<{ slot: number; mode: number }> = [];
  for (const slot of MODE_SLOTS) {
    const mode = get(`FLTMODE${slot}`);
    if (mode !== undefined && match(mode)) out.push({ slot, mode });
  }
  return out;
}

function slotRecommendation(
  id: string,
  textKey: string,
  slots: Array<{ slot: number; mode: number }>,
  names: Record<number, string>,
  safe: number,
): Recommendation {
  const changes: Record<string, number> = {};
  for (const s of slots) changes[`FLTMODE${s.slot}`] = safe;
  const modes = [...new Set(slots.map((s) => names[s.mode] ?? String(s.mode)))];
  return {
    id,
    textKey,
    textParams: {
      slots: slots.map((s) => s.slot).join(', '),
      modes: modes.join(', '),
      safe: names[safe] ?? String(safe),
    },
    changes,
  };
}

export function buildRecommendations({ parameters, vehicle, enumOf }: RecommendationInput): Recommendation[] {
  const has = (n: string) => parameters.has(n);
  const get = (n: string) => parameters.get(n)?.value;
  const out: Recommendation[] = [];
  const plane = vehicle === 'plane';
  const copter = vehicle === 'copter';
  const quadplane = plane && (get('Q_ENABLE') ?? 0) > 0;

  // the modern plane rate controller gets most of its response from FF
  if (plane && has('RLL_RATE_P')) {
    const ff = buildPlaneScheme(parameters).defaults;
    // The firmware's own default beats our scheme fallback; it differs between ArduPlane versions.
    const target = (n: string, fallback: number | undefined) => parameters.get(n)?.defaultValue ?? fallback ?? 0;
    const changes: Record<string, number> = {};
    const rollFf = target('RLL_RATE_FF', ff.roll.ff);
    const pitchFf = target('PTCH_RATE_FF', ff.pitch.ff);
    if (get('RLL_RATE_FF') === 0 && rollFf > 0) changes.RLL_RATE_FF = rollFf;
    if (get('PTCH_RATE_FF') === 0 && pitchFf > 0) changes.PTCH_RATE_FF = pitchFf;
    if (Object.keys(changes).length > 0) {
      out.push({
        id: 'plane-ff',
        textKey: quadplane ? 'ffQuadPlane' : 'ffPlane',
        textParams: { value: changes.RLL_RATE_FF ?? changes.PTCH_RATE_FF ?? 0 },
        changes,
      });
    }
  }

  const gpsParam = has('GPS1_TYPE') ? 'GPS1_TYPE' : has('GPS_TYPE') ? 'GPS_TYPE' : null;
  if (gpsParam && get(gpsParam) === 0 && (plane || copter)) {
    const slots = modeSlots(get, (m) => (plane ? PLANE_GPS_MODES : COPTER_GPS_MODES).has(m));
    if (slots.length > 0) {
      out.push(plane
        ? slotRecommendation('gps-modes', 'gpsModes', slots, PLANE_MODE_NAMES, PLANE_FBWA)
        : slotRecommendation('gps-modes', 'gpsModes', slots, COPTER_MODE_NAMES, COPTER_ALT_HOLD));
    }
  }

  if (plane && has('Q_ENABLE') && get('Q_ENABLE') === 0) {
    const slots = modeSlots(get, (m) => PLANE_Q_MODES.has(m));
    if (slots.length > 0) out.push(slotRecommendation('q-modes', 'qModes', slots, PLANE_MODE_NAMES, PLANE_FBWA));
  }

  if (plane || copter) out.push(...batteryRecommendations(get, plane, quadplane, enumOf));

  const arming = detectArmingModel(has);
  if (arming && isNoChecks(arming, get(arming.param) ?? allChecksValue(arming))) {
    out.push({ id: 'arming', textKey: 'armingChecks', changes: { [arming.param]: allChecksValue(arming) } });
  }

  return out;
}

function batteryRecommendations(
  get: (n: string) => number | undefined,
  plane: boolean,
  quadplane: boolean,
  enumOf: RecommendationInput['enumOf'],
): Recommendation[] {
  const out: Recommendation[] = [];
  const known = plane ? PLANE_BATT_ACTIONS : COPTER_BATT_ACTIONS;
  const severity = plane ? PLANE_ACTION_SEVERITY : COPTER_ACTION_SEVERITY;
  const isValid = (name: string, v: number) => {
    if (plane && !quadplane && PLANE_Q_ACTIONS.has(v)) return false;
    const values = enumOf?.(name);
    if (values && Object.keys(values).length > 0) return Object.prototype.hasOwnProperty.call(values, v);
    return known.has(v);
  };
  const lowFix = plane ? PLANE_RTL : COPTER_RTL;
  const landFix = plane ? (quadplane ? PLANE_QLAND : PLANE_LAND) : COPTER_LAND;

  let low = get('BATT_FS_LOW_ACT');
  if (low !== undefined && !isValid('BATT_FS_LOW_ACT', low)) {
    out.push({ id: 'batt-low-invalid', textKey: 'battLowInvalid', textParams: { value: low }, changes: { BATT_FS_LOW_ACT: lowFix } });
    low = lowFix;
  }

  const crt = get('BATT_FS_CRT_ACT');
  if (crt === undefined) return out;
  if (!isValid('BATT_FS_CRT_ACT', crt)) {
    out.push({ id: 'batt-crt-invalid', textKey: 'battCrtInvalid', textParams: { value: crt }, changes: { BATT_FS_CRT_ACT: landFix } });
    return out;
  }
  // Only once a critical threshold is set: with none, the critical stage never fires.
  const crtArmed = (get('BATT_CRT_VOLT') ?? 0) > 0 || (get('BATT_CRT_MAH') ?? 0) > 0;
  if (!crtArmed) return out;
  const lowSev = low !== undefined ? (severity[low] ?? 0) : 0;
  const crtSev = severity[crt] ?? 0;
  if (crt === 0 || crtSev < lowSev) {
    out.push({ id: 'batt-crt-weak', textKey: crt === 0 ? 'battCrtNone' : 'battCrtWeaker', changes: { BATT_FS_CRT_ACT: landFix } });
  }
  return out;
}
