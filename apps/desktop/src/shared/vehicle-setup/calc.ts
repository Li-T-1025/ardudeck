import { t } from '../i18n/index.js';
import type { Airframe, Chemistry, ParamReader, SetupSuggestion } from './types.js';

type Change = SetupSuggestion['changes'][number];

/** Full and empty cell voltage per chemistry, as Mission Planner's initial parameters use them. */
export const CELL_VOLTS: Record<Chemistry, { max: number; min: number }> = {
  lipo: { max: 4.2, min: 3.3 },
  lipohv: { max: 4.35, min: 3.3 },
  liion: { max: 4.1, min: 2.8 },
};

const CHEM_ALIASES: Record<string, Chemistry> = { lipo: 'lipo', lipohv: 'lipohv', lihv: 'lipohv', liion: 'liion', lion: 'liion' };

export function toChemistry(value: unknown): Chemistry {
  return CHEM_ALIASES[String(value ?? 'lipo').toLowerCase()] ?? 'lipo';
}

const round = (v: number, digits: number) => { const f = 10 ** digits; return Math.round(v * f) / f; };

/** Mission Planner RoundTo(value, -2): half up to the nearest 100. */
const roundTo100 = (v: number) => { const x = v + 50; return Math.round(x - (x % 100)); };

/** Mission Planner ConfigInitialParams.calc_values for a prop size in inches. */
export function tuneValues(propIn: number) {
  const accelY = Math.max(8000, roundTo100(-900 * propIn + 36000));
  const accelRP = Math.max(10000, roundTo100(-2.613267 * propIn ** 3 + 343.39216 * propIn ** 2 - 15083.7121 * propIn + 235771));
  const gyro = Math.max(20, Math.round(289.22 * propIn ** -0.838));
  const rateFilter = Math.max(10, gyro / 2);
  return {
    accelY, accelRP, gyro, rateFilter,
    acroYawP: round((0.5 * accelY) / 4500, 3),
    expo: Math.min(round(0.15686 * Math.log(propIn) + 0.23693, 2), 0.8),
    hover: 0.2,
    thrMixMan: 0.1,
    accelFilter: 10,
  };
}

/** Battery thresholds from Mission Planner ConfigInitialParams. */
export function batteryValues(cells: number, chemistry: Chemistry) {
  const c = CELL_VOLTS[chemistry];
  return {
    full: round(c.max * cells, 2),
    empty: round(c.min * cells, 2),
    low: round((c.min + 0.3) * cells, 2),
    critical: round((c.min + 0.2) * cells, 2),
    arm: round((cells - 1) * 0.1 + (c.min + 0.3) * cells, 2),
  };
}

/** Collects a change only when the board has the parameter and the value differs. */
function collector(read: ParamReader) {
  const changes: Change[] = [];
  const add = (name: string, value: number, reasonKey: string, vars: Record<string, unknown> = {}) => {
    const cur = read(name);
    if (cur === undefined || Math.abs(cur - value) < 1e-4) return;
    changes.push({ name, value, reason: t(`vehicle-setup:reason.${reasonKey}`, vars) });
  };
  return { changes, add };
}

/** Copter uses ATC_ / MOT_, a QuadPlane the same controllers under Q_A_ / Q_M_. */
function tunePrefixes(read: ParamReader): { atc: string; mot: string } {
  return read('Q_ENABLE') !== undefined && read('ATC_RAT_RLL_P') === undefined ? { atc: 'Q_A', mot: 'Q_M' } : { atc: 'ATC', mot: 'MOT' };
}

export function tuneSuggestion(inputs: { propIn: number; cells: number; chemistry?: string }, read: ParamReader): SetupSuggestion {
  const v = tuneValues(inputs.propIn);
  const chem = toChemistry(inputs.chemistry);
  const b = batteryValues(inputs.cells, chem);
  const { atc, mot } = tunePrefixes(read);
  const { changes, add } = collector(read);
  const prop = { prop: inputs.propIn };
  add('ACRO_YAW_P', v.acroYawP, 'acroYaw', prop);
  if (read(`${atc}_ACCEL_P_MAX`) !== undefined) {
    add(`${atc}_ACCEL_P_MAX`, v.accelRP, 'accel', prop);
    add(`${atc}_ACCEL_R_MAX`, v.accelRP, 'accel', prop);
    add(`${atc}_ACCEL_Y_MAX`, v.accelY, 'accelYaw', prop);
  } else {
    // newer firmware names them in deg/s/s instead of centidegrees
    add(`${atc}_ACC_P_MAX`, v.accelRP / 100, 'accel', prop);
    add(`${atc}_ACC_R_MAX`, v.accelRP / 100, 'accel', prop);
    add(`${atc}_ACC_Y_MAX`, v.accelY / 100, 'accelYaw', prop);
  }
  if (read(`${atc}_RAT_RLL_FLTD`) !== undefined) {
    for (const ax of ['RLL', 'PIT'] as const) {
      add(`${atc}_RAT_${ax}_FLTD`, v.rateFilter, 'rateFilter', { hz: v.rateFilter });
      add(`${atc}_RAT_${ax}_FLTE`, 0, 'rateFilterOff');
      add(`${atc}_RAT_${ax}_FLTT`, v.rateFilter, 'rateFilter', { hz: v.rateFilter });
    }
    add(`${atc}_RAT_YAW_FLTD`, 0, 'rateFilterOff');
    add(`${atc}_RAT_YAW_FLTE`, 2, 'yawErrorFilter');
    add(`${atc}_RAT_YAW_FLTT`, v.rateFilter, 'rateFilter', { hz: v.rateFilter });
  } else {
    add(`${atc}_RAT_RLL_FILT`, v.rateFilter, 'rateFilter', { hz: v.rateFilter });
    add(`${atc}_RAT_PIT_FILT`, v.rateFilter, 'rateFilter', { hz: v.rateFilter });
    add(`${atc}_RAT_YAW_FILT`, 2, 'yawErrorFilter');
  }
  add(`${atc}_THR_MIX_MAN`, v.thrMixMan, 'thrMixMan');
  add('INS_ACCEL_FILTER', v.accelFilter, 'accelFilter');
  add('INS_GYRO_FILTER', v.gyro, 'gyroFilter', { hz: v.gyro, prop: inputs.propIn });
  add(`${mot}_THST_EXPO`, v.expo, 'thrustExpo', prop);
  add(`${mot}_THST_HOVER`, v.hover, 'hover');
  add(`${mot}_BAT_VOLT_MAX`, b.full, 'motVoltMax', { cells: inputs.cells });
  add(`${mot}_BAT_VOLT_MIN`, b.empty, 'motVoltMin', { cells: inputs.cells });
  return { kind: 'tune', inputs: { propIn: inputs.propIn, cells: inputs.cells, chemistry: chem }, changes, source: 'MissionPlanner ConfigInitialParams.cs' };
}

export function batterySuggestion(inputs: { cells: number; chemistry?: string; capacity?: number }, read: ParamReader): SetupSuggestion {
  const chem = toChemistry(inputs.chemistry);
  const b = batteryValues(inputs.cells, chem);
  const { changes, add } = collector(read);
  const vars = { cells: inputs.cells };
  add('BATT_LOW_VOLT', b.low, 'battLow', { ...vars, volts: b.low });
  add('BATT_CRT_VOLT', b.critical, 'battCritical', { ...vars, volts: b.critical });
  add('BATT_ARM_VOLT', b.arm, 'battArm', { ...vars, volts: b.arm });
  if (inputs.capacity && inputs.capacity > 0) add('BATT_CAPACITY', inputs.capacity, 'battCapacity', { capacity: inputs.capacity });
  const out: SetupSuggestion['inputs'] = { cells: inputs.cells, chemistry: chem };
  if (inputs.capacity) out.capacity = inputs.capacity;
  return { kind: 'battery', inputs: out, changes, source: 'MissionPlanner ConfigInitialParams.cs' };
}

/** Airspeed limits from the stall speed: MIN stall + 25%, CRUISE 1.5x, MAX about 2x cruise. */
export function airspeedValues(stall: number) {
  return { min: round(stall * 1.25, 1), cruise: round(stall * 1.5, 1), max: round(stall * 3, 1) };
}

export function airspeedSuggestion(inputs: { stall: number }, read: ParamReader): SetupSuggestion {
  const stall = round(inputs.stall, 1);
  const v = airspeedValues(stall);
  const { changes, add } = collector(read);
  // names changed in Plane 4.5: trust the downloaded list, not the version number
  if (read('AIRSPEED_MIN') !== undefined || read('AIRSPEED_CRUISE') !== undefined) {
    // the parameter docs ask for slightly above true stall
    const stallSet = round(stall * 1.05, 1);
    add('AIRSPEED_STALL', stallSet, 'stall', { speed: stallSet });
    add('AIRSPEED_MIN', v.min, 'airspeedMin', { speed: v.min });
    add('AIRSPEED_CRUISE', v.cruise, 'airspeedCruise', { speed: v.cruise });
    add('AIRSPEED_MAX', v.max, 'airspeedMax', { speed: v.max });
  } else {
    add('ARSPD_FBW_MIN', Math.ceil(v.min), 'airspeedMin', { speed: Math.ceil(v.min) });
    add('TRIM_ARSPD_CM', Math.round(v.cruise * 100), 'airspeedCruise', { speed: v.cruise });
    add('ARSPD_FBW_MAX', Math.round(v.max), 'airspeedMax', { speed: Math.round(v.max) });
  }
  return { kind: 'airspeed', inputs: { stall }, changes, source: 'ardupilot.org/plane/docs/airspeed.html' };
}

/** Q_ASSIST_SPEED for "assist below a speed": 25% above stall. Off is -1, never 0. */
export function assistSpeed(stall: number): number {
  return round(stall * 1.25, 1);
}

export const Q_ASSIST_OFF = -1;

/** Lift coefficient used for the stall estimate: a tailed wing vs a flying wing. */
export function liftCoefficient(airframe: Airframe | undefined): number {
  return airframe === 'wing' || airframe === 'none' ? 1.0 : 1.3;
}

/** Stall speed estimate in m/s from wing geometry (mm) and flying weight (g), sea-level air. */
export function estimateStall(spanMm: number, rootMm: number, tipMm: number, massG: number, airframe?: Airframe): number {
  const area = (spanMm / 1000) * ((rootMm + tipMm) / 2 / 1000);
  if (area <= 0 || massG <= 0) return 0;
  return round(Math.sqrt((2 * (massG / 1000) * 9.81) / (1.225 * area * liftCoefficient(airframe))), 1);
}

export function buildSuggestion(kind: SetupSuggestion['kind'], inputs: Record<string, number | string>, read: ParamReader): SetupSuggestion {
  const num = (k: string) => Number(inputs[k]);
  switch (kind) {
    case 'tune':
      return tuneSuggestion({ propIn: num('propIn'), cells: num('cells'), chemistry: String(inputs.chemistry ?? 'lipo') }, read);
    case 'airspeed':
      return airspeedSuggestion({ stall: num('stall') }, read);
    case 'battery':
      return batterySuggestion({ cells: num('cells'), chemistry: String(inputs.chemistry ?? 'lipo'), capacity: inputs.capacity === undefined ? undefined : num('capacity') }, read);
  }
}
