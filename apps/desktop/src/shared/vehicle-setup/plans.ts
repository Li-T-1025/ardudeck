import { FRAME_CLASS, isMotorFunction } from './outputs.js';
import type {
  CopterClass, ParamReader, SetupAnswers, SetupStatus, SetupStepId, SetupStepState, SetupStepStatus, SetupVehicle, TailsitterKind, VtolType,
} from './types.js';

/** Step order per vehicle, from the approved wizard mockup. */
export const PLANS: Record<SetupVehicle, readonly SetupStepId[]> = {
  copter: ['size', 'frame', 'orient', 'radio', 'compass', 'modes', 'motors', 'battery', 'ready'],
  heli: ['frame', 'orient', 'radio', 'compass', 'modes', 'battery', 'ready'],
  plane: ['airframe', 'power', 'extras', 'psize', 'outputs', 'launch', 'orient', 'radio', 'compass', 'surfaces', 'modes', 'thrcheck', 'airspeed', 'soar', 'battery', 'ready'],
  vtol: ['vtype', 'airframe', 'extras', 'psize', 'vframe', 'outputs', 'orient', 'radio', 'compass', 'surfaces', 'motors', 'assist', 'airspeed', 'modes', 'battery', 'ready'],
  rover: ['drive', 'motordrv', 'orient', 'radio', 'compass', 'drivetest', 'modes', 'battery', 'ready'],
  boat: ['drive', 'motordrv', 'windvane', 'orient', 'radio', 'compass', 'drivetest', 'modes', 'battery', 'ready'],
  sub: ['subframe', 'orient', 'joystick', 'compass', 'thrusters', 'water', 'leak', 'modes', 'battery', 'ready'],
};

const MAV_TYPE_HELICOPTER = 4;
const MAV_TYPE_GROUND_ROVER = 10;
const MAV_TYPE_SURFACE_BOAT = 11;
const MAV_TYPE_SUBMARINE = 12;

/** The firmware decides the vehicle; nothing here is asked. VTOL is Plane firmware with Q_ENABLE. */
export function detectSetupVehicle(mavType: number | undefined, read: ParamReader): SetupVehicle | null {
  if (mavType === undefined) return null;
  if ((read('Q_ENABLE') ?? 0) > 0 || (mavType >= 19 && mavType <= 25)) return 'vtol';
  if (mavType === 1) return 'plane';
  if (mavType === MAV_TYPE_SUBMARINE) return 'sub';
  if (mavType === MAV_TYPE_SURFACE_BOAT || (mavType === MAV_TYPE_GROUND_ROVER && read('FRAME_CLASS') === 2)) return 'boat';
  if (mavType === MAV_TYPE_GROUND_ROVER) return 'rover';
  // heli firmware ships with FRAME_CLASS 6 and H_ parameters
  if (mavType === MAV_TYPE_HELICOPTER || read('FRAME_CLASS') === 6 || read('H_SW_TYPE') !== undefined) return 'heli';
  return 'copter';
}

const CLASS_BY_NUMBER = Object.fromEntries(Object.entries(FRAME_CLASS).map(([k, v]) => [v, k])) as Record<number, CopterClass>;

/** Fill in what the board already reports, so the pilot is never asked it. Pilot answers win. */
export function answersFromBoard(vehicle: SetupVehicle, read: ParamReader, given: SetupAnswers = {}): SetupAnswers {
  const a: SetupAnswers = { ...given };
  if (vehicle === 'copter' && !a.copterClass) {
    const c = CLASS_BY_NUMBER[read('FRAME_CLASS') ?? -1];
    if (c) {
      a.copterClass = c;
      if (a.frameType === undefined && read('FRAME_TYPE') !== undefined) a.frameType = read('FRAME_TYPE');
    }
  }
  if (vehicle === 'vtol') {
    if (!a.vtolType) {
      a.vtolType = ((read('Q_TAILSIT_ENABLE') ?? 0) > 0 ? 'tail' : (read('Q_TILT_ENABLE') ?? 0) > 0 ? 'tilt' : 'quad') as VtolType;
    }
    if (!a.copterClass) {
      const c = CLASS_BY_NUMBER[read('Q_FRAME_CLASS') ?? -1];
      if (c) {
        a.copterClass = c;
        if (a.frameType === undefined && read('Q_FRAME_TYPE') !== undefined) a.frameType = read('Q_FRAME_TYPE');
      }
    }
    if (a.vtolType === 'tail' && !a.tailsitter) {
      // Q_FRAME_CLASS 10 is the single / dual motor tailsitter, anything else is copter-style
      const qc = read('Q_FRAME_CLASS');
      a.tailsitter = (qc === undefined || qc === 10 ? 'dual' : 'copter') as TailsitterKind;
    }
    if (a.vtolType === 'tail' && !a.airframe && (read('Q_TAILSIT_ENABLE') ?? 0) === 2) a.airframe = 'none';
  }
  if (vehicle === 'boat' && !a.drive && (read('SAIL_ENABLE') ?? 0) > 0) a.drive = 'sail';
  return a;
}

/** The step list for this vehicle and what the pilot has told the wizard so far. */
export function planSteps(vehicle: SetupVehicle, answers: SetupAnswers = {}, read: ParamReader = () => undefined): SetupStepId[] {
  const a = answersFromBoard(vehicle, read, answers);
  return PLANS[vehicle].filter((id) => {
    if (id === 'motors' && vehicle === 'copter') return !['single', 'coax', 'bi'].includes(a.copterClass ?? 'quad');
    if (id === 'motors' && vehicle === 'vtol') return !(a.vtolType === 'tail' && (a.tailsitter ?? 'dual') !== 'copter');
    if ((id === 'thrcheck' || id === 'launch') && a.power === 'glider') return false;
    if (id === 'soar') return a.power === 'glider';
    if (id === 'surfaces' && vehicle === 'vtol') return !(a.vtolType === 'tail' && a.airframe === 'none');
    if (id === 'windvane') return a.drive === 'sail';
    return true;
  });
}

/** i18n key of a step's name; a few steps read differently per vehicle. */
export function stepTitleKey(id: SetupStepId, vehicle: SetupVehicle): string {
  if (id === 'frame' && vehicle === 'heli') return 'vehicle-setup:steps.frameHeli.name';
  if (id === 'airframe' && vehicle === 'vtol') return 'vehicle-setup:steps.wingTail.name';
  return `vehicle-setup:steps.${id}.name`;
}

/** Where a pre-arm message is fixed. Order matters: the first match wins. */
const PREARM_STEPS: { re: RegExp; step: SetupStepId | ((v: SetupVehicle) => SetupStepId) }[] = [
  { re: /Q_ASSIST/i, step: 'assist' },
  { re: /frame|FRAME_CLASS|FRAME_CONFIG/i, step: (v) => (v === 'vtol' ? 'vframe' : v === 'sub' ? 'subframe' : v === 'rover' || v === 'boat' ? 'drive' : 'frame') },
  { re: /SERVO\d+_FUNCTION|steering|throttle output/i, step: (v) => (v === 'rover' || v === 'boat' ? 'drive' : 'outputs') },
  { re: /\bRC\b|radio|throttle below failsafe|RC not|throttle too high/i, step: (v) => (v === 'sub' ? 'joystick' : 'radio') },
  { re: /compass|mag field|COMPASS_/i, step: 'compass' },
  { re: /airspeed|ARSPD/i, step: 'airspeed' },
  { re: /batt|battery/i, step: 'battery' },
  { re: /leak/i, step: 'leak' },
  { re: /board orientation|AHRS_ORIENT/i, step: 'orient' },
];

export function prearmStep(text: string, vehicle: SetupVehicle, plan: readonly SetupStepId[]): SetupStepId | null {
  for (const p of PREARM_STEPS) {
    if (!p.re.test(text)) continue;
    const step = typeof p.step === 'function' ? p.step(vehicle) : p.step;
    return plan.includes(step) ? step : null;
  }
  return null;
}

/** Steps the pilot must do with their hands (spin, wiggle, dunk): the board cannot answer them. */
const PILOT_CHECKS = new Set<SetupStepId>(['motors', 'surfaces', 'thrcheck', 'drivetest', 'thrusters', 'water']);

const has = (read: ParamReader, name: string) => read(name) !== undefined;
const pos = (read: ParamReader, name: string) => (read(name) ?? 0) > 0;
const fnIn = (read: ParamReader, out: number, fns: number[]) => fns.includes(read(`SERVO${out}_FUNCTION`) ?? -1);

/** True when the board's parameters already answer the step's question. */
export function boardAnswers(id: SetupStepId, vehicle: SetupVehicle, read: ParamReader): boolean {
  switch (id) {
    case 'frame': return vehicle === 'heli' || pos(read, 'FRAME_CLASS');
    case 'vtype': return pos(read, 'Q_ENABLE');
    case 'vframe': return pos(read, 'Q_ENABLE') && pos(read, 'Q_FRAME_CLASS');
    case 'orient': return has(read, 'AHRS_ORIENTATION');
    case 'modes': return has(read, 'FLTMODE_CH') || has(read, 'MODE_CH') || has(read, 'FLTMODE1') || has(read, 'MODE1');
    case 'battery': return pos(read, 'BATT_MONITOR') && pos(read, 'BATT_LOW_VOLT');
    case 'assist': return has(read, 'Q_ASSIST_SPEED') && read('Q_ASSIST_SPEED') !== 0;
    case 'airspeed': return pos(read, 'ARSPD_TYPE');
    case 'airframe': return fnIn(read, 1, [4, 24, 77, 79]) || (vehicle === 'vtol' && read('Q_TAILSIT_ENABLE') === 2);
    case 'outputs': return [1, 2, 3, 4].every((o) => pos(read, `SERVO${o}_FUNCTION`));
    case 'power': return fnIn(read, 3, [70, 73]) || pos(read, 'ICE_ENABLE');
    case 'launch': return pos(read, 'TKOFF_THR_MINACC') || pos(read, 'TKOFF_THR_DELAY');
    case 'soar': return pos(read, 'SOAR_ENABLE');
    case 'drive': return fnIn(read, 1, [26, 73, 33]) || pos(read, 'SAIL_ENABLE');
    case 'motordrv': return pos(read, 'MOT_PWM_TYPE');
    case 'windvane': return pos(read, 'WNDVN_TYPE');
    case 'subframe': return has(read, 'FRAME_CONFIG');
    case 'leak': return (read('LEAK1_PIN') ?? -1) >= 0;
    case 'joystick': return true;
    default: return false;
  }
}

export interface SetupStatusInput {
  mavType: number | undefined;
  firmware: string;
  read: ParamReader;
  /** Current pre-arm STATUSTEXTs, newest state from the flight controller. */
  prearm: string[];
  answers?: SetupAnswers;
  done?: Partial<Record<SetupStepId, boolean>>;
  /** RC channels arriving from a receiver right now; the board cannot report this as a parameter. */
  rcReceiving?: boolean;
}

/** Every step's state for the connected vehicle; null when it is not ArduPilot or not identified yet. */
export function computeSetupStatus(input: SetupStatusInput): SetupStatus | null {
  if (/px4|inav|betaflight/i.test(input.firmware)) return null;
  const vehicle = detectSetupVehicle(input.mavType, input.read);
  if (!vehicle) return null;
  const plan = planSteps(vehicle, input.answers, input.read);
  const prearm = input.prearm.map((text) => ({ text, stepId: prearmStep(text, vehicle, plan) as string | null }));
  const steps: SetupStepStatus[] = plan.map((id) => {
    const blockers = id === 'ready' ? prearm.map((p) => p.text) : prearm.filter((p) => p.stepId === id).map((p) => p.text);
    let state: SetupStepState;
    if (id === 'ready') state = prearm.length === 0 ? 'done' : 'todo';
    else if (blockers.length) state = 'todo';
    else if (input.done?.[id]) state = 'done';
    else if (PILOT_CHECKS.has(id) || (id === 'compass' && !compassCalibrated(input.read))) state = 'needs-pilot';
    else if (id === 'radio') state = input.rcReceiving ? 'found' : 'todo';
    else state = boardAnswers(id, vehicle, input.read) ? 'found' : 'todo';
    return { id, state, titleKey: stepTitleKey(id, vehicle), blockers };
  });
  return { vehicle, firmware: input.firmware, steps, prearm };
}

/** A compass with all-zero offsets has never been calibrated. */
export function compassCalibrated(read: ParamReader): boolean {
  if (!has(read, 'COMPASS_OFS_X')) return true;
  return ['X', 'Y', 'Z'].some((ax) => (read(`COMPASS_OFS_${ax}`) ?? 0) !== 0);
}

export type WizardEntry = 'start' | 'arm' | 'flip' | 'motors' | 'wobble';

/** Which step an entry point opens on for this vehicle's plan. */
export function entryStep(entry: WizardEntry, plan: readonly SetupStepId[], vehicle: SetupVehicle): SetupStepId {
  const first = plan[0] ?? 'ready';
  const pick = (...ids: SetupStepId[]) => ids.find((id) => plan.includes(id)) ?? first;
  switch (entry) {
    case 'arm': return pick('ready');
    case 'flip': return vehicle === 'copter' ? pick('frame', 'orient') : pick('orient');
    case 'motors': return pick('motors', 'thrcheck', 'drivetest', 'thrusters');
    case 'wobble': return vehicle === 'copter' ? pick('size') : first;
    default: return first;
  }
}

/** The check to re-run after a topology parameter is applied; for SERVOn_* pass that output's function as value. */
export function checkStepForParam(name: string, vehicle: SetupVehicle, value?: number): SetupStepId | null {
  if (name === 'AHRS_ORIENTATION') return 'orient';
  if (/^Q_(ENABLE|FRAME_CLASS|FRAME_TYPE|TILT_|TAILSIT_)/.test(name)) return 'motors';
  if (/^(FRAME_CLASS|FRAME_TYPE)$/.test(name)) {
    if (vehicle === 'copter') return 'motors';
    if (vehicle === 'rover' || vehicle === 'boat') return 'drivetest';
    return null;
  }
  if (name === 'FRAME_CONFIG' || /^MOT_\d+_DIRECTION$/.test(name)) return 'thrusters';
  const servo = /^SERVO(\d+)_(FUNCTION|REVERSED)$/.exec(name);
  if (servo) {
    if (vehicle === 'plane' || vehicle === 'vtol') {
      // value is the output's function, for _REVERSED too
      if (value !== undefined && isMotorFunction(value)) return vehicle === 'vtol' ? 'motors' : 'surfaces';
      if (value === 73 || value === 74) return vehicle === 'vtol' ? 'vframe' : 'thrcheck';
      if (value === 70) return vehicle === 'plane' ? 'thrcheck' : null;
      return 'surfaces';
    }
    if (vehicle === 'rover' || vehicle === 'boat') return 'drivetest';
    if (vehicle === 'sub') return 'thrusters';
    return 'motors';
  }
  return null;
}
