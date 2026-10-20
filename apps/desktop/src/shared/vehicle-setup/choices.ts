import { assistSpeed, estimateStall, Q_ASSIST_OFF } from './calc.js';
import { driveOutputs, driveParams } from './outputs.js';
import type { SetupAnswers, SetupStepId, SetupVehicle } from './types.js';

export interface ParamWrite { name: string; value: number }

/** Option ids per choice step; labels live under vehicle-setup:choice.<step>.<id>. */
export function choiceOptions(step: SetupStepId, vehicle: SetupVehicle, a: SetupAnswers = {}): string[] {
  switch (step) {
    case 'airframe': return vehicle === 'vtol' && a.vtolType === 'tail' ? ['wing', 'none'] : ['normal', 'three', 'wing', 'vtail', 'invv'];
    case 'power': return ['electric', 'twin', 'ic', 'glider'];
    case 'extras': return ['flaps', 'flaperon', 'airbrake', 'spoiler', 'steer', 'gear'];
    case 'launch': return ['hand', 'bungee', 'cat', 'runway', 'tdrag', 'belly'];
    case 'soar': return ['yes', 'no'];
    case 'airspeed': return ['none', 'i2c', 'can'];
    case 'vtype': return ['quad', 'tilt', 'tail'];
    case 'assist': return ['off', 'on'];
    case 'drive': return vehicle === 'boat' ? ['rudder', 'diff', 'vector', 'sail'] : ['steer', 'skid', 'omni', 'balance'];
    case 'motordrv': return ['esc', 'relay', 'bipolar'];
    case 'windvane': return ['nmea', 'analog', 'none'];
    case 'subframe': return ['1', '2', '3', '0', '4', '5', '6', '7'];
    case 'thrusters': return ['auto', 'manual'];
    case 'water': return ['fresh', 'salt'];
    case 'leak': return ['nav', 'aux', 'none'];
    case 'joystick': return ['pad', 'rc'];
    default: return [];
  }
}

/** The pilot's current pick for a choice step, falling back to the first option. */
export function currentChoice(step: SetupStepId, vehicle: SetupVehicle, a: SetupAnswers): string {
  const opts = choiceOptions(step, vehicle, a);
  const given = step === 'airframe' ? a.airframe : step === 'power' ? a.power : step === 'vtype' ? a.vtolType : step === 'drive' ? a.drive : a.choices?.[step];
  return given && opts.includes(given) ? given : opts[0] ?? '';
}

/** Answers after picking an option: typed fields where the plan depends on them, choices otherwise. */
export function applyChoice(step: SetupStepId, id: string, a: SetupAnswers): SetupAnswers {
  switch (step) {
    case 'airframe': return { ...a, airframe: id as SetupAnswers['airframe'] };
    case 'power': return { ...a, power: id as SetupAnswers['power'] };
    case 'vtype': return { ...a, vtolType: id as SetupAnswers['vtolType'], airframe: id === 'tail' ? 'wing' : 'normal' };
    case 'drive': return { ...a, drive: id as SetupAnswers['drive'] };
    case 'extras': {
      const now = new Set(a.extras ?? []);
      const pick = id as NonNullable<SetupAnswers['extras']>[number];
      if (now.has(pick)) now.delete(pick);
      else {
        now.add(pick);
        // flaps and flaperons do the same job: one or the other
        if (pick === 'flaps') now.delete('flaperon');
        if (pick === 'flaperon') now.delete('flaps');
      }
      return { ...a, extras: [...now] };
    }
    default: return { ...a, choices: { ...a.choices, [step]: id } };
  }
}

const LAUNCH: Record<string, ParamWrite[]> = {
  hand: [{ name: 'TKOFF_THR_MINACC', value: 15 }, { name: 'TKOFF_THR_DELAY', value: 2 }],
  bungee: [{ name: 'TKOFF_THR_MINACC', value: 15 }, { name: 'TKOFF_THR_DELAY', value: 50 }],
  cat: [{ name: 'TKOFF_THR_MINACC', value: 20 }, { name: 'TKOFF_THR_DELAY', value: 5 }],
  runway: [{ name: 'TKOFF_THR_MINACC', value: 0 }, { name: 'GROUND_STEER_ALT', value: 5 }],
  tdrag: [{ name: 'TKOFF_TDRAG_ELEV', value: 100 }, { name: 'GROUND_STEER_ALT', value: 5 }],
  belly: [{ name: 'TKOFF_THR_MINACC', value: 15 }, { name: 'TKOFF_THR_DELAY', value: 2 }],
};

/** Stall speed the airspeed and assist steps work from: the pilot's own, else the wing estimate. */
export function stallOf(a: SetupAnswers): number {
  if (a.stall && a.stall > 0) return a.stall;
  return estimateStall(a.spanMm ?? 1400, a.rootMm ?? 220, a.tipMm ?? 160, a.massG ?? 1200, a.airframe);
}

/** What a choice step writes. Params a board only grows after a restart are included; the caller sorts that out. */
export function choiceWrites(step: SetupStepId, vehicle: SetupVehicle, a: SetupAnswers): ParamWrite[] {
  const c = currentChoice(step, vehicle, a);
  switch (step) {
    case 'airframe':
      if (vehicle === 'vtol' && a.vtolType === 'tail') return [{ name: 'Q_TAILSIT_ENABLE', value: c === 'none' ? 2 : 1 }];
      return [{ name: 'RUDDER_ONLY', value: c === 'three' ? 1 : 0 }];
    case 'power': return c === 'ic' ? [{ name: 'ICE_ENABLE', value: 1 }] : [];
    case 'launch': return LAUNCH[c] ?? [];
    case 'soar': return c === 'yes' ? [{ name: 'SOAR_ENABLE', value: 1 }, { name: 'TECS_SPDWEIGHT', value: 2 }] : [];
    case 'airspeed':
      if (c === 'none') return [{ name: 'ARSPD_TYPE', value: 0 }];
      return [{ name: 'ARSPD_TYPE', value: c === 'can' ? 8 : 1 }, { name: 'ARSPD_USE', value: 1 }];
    case 'vtype': {
      const out: ParamWrite[] = [{ name: 'Q_ENABLE', value: 1 }];
      if (c === 'tilt') out.push({ name: 'Q_TILT_ENABLE', value: 1 });
      if (c === 'tail') out.push({ name: 'Q_TAILSIT_ENABLE', value: a.airframe === 'none' ? 2 : 1 }, { name: 'Q_FRAME_CLASS', value: 10 });
      return out;
    }
    case 'assist': return [{ name: 'Q_ASSIST_SPEED', value: c === 'on' ? assistSpeed(stallOf(a)) : Q_ASSIST_OFF }];
    case 'drive': {
      if (vehicle !== 'rover' && vehicle !== 'boat') return [];
      const outs = driveOutputs(vehicle, a.drive).map((o) => ({ name: `SERVO${o.output}_FUNCTION`, value: o.fn }));
      const extra = c === 'omni' ? [{ name: 'FRAME_TYPE', value: Number(a.choices?.omniType ?? 2) }] : [];
      return [...driveParams(vehicle, a.drive), ...outs, ...extra];
    }
    case 'motordrv':
      if (c === 'relay') return [{ name: 'MOT_PWM_TYPE', value: 3 }, { name: 'RELAY1_FUNCTION', value: 5 }];
      return [{ name: 'MOT_PWM_TYPE', value: c === 'bipolar' ? 4 : 0 }];
    case 'windvane': return [{ name: 'WNDVN_TYPE', value: c === 'nmea' ? 4 : c === 'analog' ? 3 : 0 }];
    case 'subframe': return [{ name: 'FRAME_CONFIG', value: Number(c) }];
    case 'water': return [{ name: 'BARO_SPEC_GRAV', value: c === 'salt' ? 1.024 : 1.0 }];
    case 'leak': return [{ name: 'LEAK1_PIN', value: c === 'nav' ? 27 : c === 'aux' ? Number(a.choices?.leakPin ?? 50) : -1 }];
    default: return [];
  }
}

/** Steps whose writes only take effect, or grow new parameters, after the board restarts. */
export function needsRestart(step: SetupStepId, writes: ParamWrite[]): boolean {
  return step === 'vtype' || step === 'subframe' || step === 'motordrv' || writes.some((w) => ['ICE_ENABLE', 'SOAR_ENABLE', 'SAIL_ENABLE', 'FRAME_CLASS', 'ARSPD_TYPE'].includes(w.name) && w.value !== 0);
}
