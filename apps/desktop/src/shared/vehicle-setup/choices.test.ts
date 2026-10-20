import { describe, expect, it } from 'vitest';
import { applyChoice, choiceOptions, choiceWrites, currentChoice, needsRestart, stallOf } from './choices';

const w = (list: { name: string; value: number }[]) => Object.fromEntries(list.map((x) => [x.name, x.value]));

describe('choices', () => {
  it('defaults to the first option', () => {
    expect(currentChoice('launch', 'plane', {})).toBe('hand');
    expect(currentChoice('drive', 'boat', {})).toBe('rudder');
    expect(currentChoice('drive', 'rover', {})).toBe('steer');
  });

  it('tailsitter airframe offers elevons or nothing', () => {
    expect(choiceOptions('airframe', 'vtol', { vtolType: 'tail' })).toEqual(['wing', 'none']);
    expect(w(choiceWrites('airframe', 'vtol', { vtolType: 'tail', airframe: 'none' }))).toEqual({ Q_TAILSIT_ENABLE: 2 });
  });

  it('3-channel writes RUDDER_ONLY', () => {
    expect(w(choiceWrites('airframe', 'plane', { airframe: 'three' }))).toEqual({ RUDDER_ONLY: 1 });
    expect(w(choiceWrites('airframe', 'plane', { airframe: 'normal' }))).toEqual({ RUDDER_ONLY: 0 });
  });

  it('launch delays are in tenths of a second', () => {
    expect(w(choiceWrites('launch', 'plane', applyChoice('launch', 'bungee', {})))).toEqual({ TKOFF_THR_MINACC: 15, TKOFF_THR_DELAY: 50 });
    expect(w(choiceWrites('launch', 'plane', applyChoice('launch', 'tdrag', {})))).toEqual({ TKOFF_TDRAG_ELEV: 100, GROUND_STEER_ALT: 5 });
  });

  it('Q_ASSIST_SPEED: off is -1, never 0', () => {
    expect(w(choiceWrites('assist', 'vtol', {}))).toEqual({ Q_ASSIST_SPEED: -1 });
    expect(w(choiceWrites('assist', 'vtol', applyChoice('assist', 'on', { stall: 12 })))).toEqual({ Q_ASSIST_SPEED: 15 });
  });

  it('VTOL type enables QuadPlane and asks for a restart', () => {
    const tail = choiceWrites('vtype', 'vtol', applyChoice('vtype', 'tail', {}));
    expect(w(tail)).toEqual({ Q_ENABLE: 1, Q_TAILSIT_ENABLE: 1, Q_FRAME_CLASS: 10 });
    expect(needsRestart('vtype', tail)).toBe(true);
  });

  it('rover drive writes frame class and outputs', () => {
    expect(w(choiceWrites('drive', 'rover', applyChoice('drive', 'skid', {})))).toEqual({ FRAME_CLASS: 1, SERVO1_FUNCTION: 73, SERVO3_FUNCTION: 74 });
    expect(w(choiceWrites('drive', 'rover', applyChoice('drive', 'balance', {})))).toEqual({ FRAME_CLASS: 3, MOT_SLEWRATE: 0, FS_CRASH_CHECK: 1, SERVO1_FUNCTION: 73, SERVO3_FUNCTION: 74 });
    expect(w(choiceWrites('drive', 'rover', applyChoice('drive', 'omni', {}))).FRAME_TYPE).toBe(2);
    expect(w(choiceWrites('drive', 'boat', {}))).toEqual({ FRAME_CLASS: 2, SERVO1_FUNCTION: 26, SERVO3_FUNCTION: 70 });
  });

  it('sub frame, water and leak', () => {
    expect(w(choiceWrites('subframe', 'sub', applyChoice('subframe', '2', {})))).toEqual({ FRAME_CONFIG: 2 });
    expect(w(choiceWrites('water', 'sub', applyChoice('water', 'salt', {})))).toEqual({ BARO_SPEC_GRAV: 1.024 });
    expect(w(choiceWrites('leak', 'sub', {}))).toEqual({ LEAK1_PIN: 27 });
    expect(w(choiceWrites('leak', 'sub', { choices: { leak: 'aux', leakPin: '53' } }))).toEqual({ LEAK1_PIN: 53 });
  });

  it('flaps and flaperons exclude each other', () => {
    const a = applyChoice('extras', 'flaperon', applyChoice('extras', 'flaps', {}));
    expect(a.extras).toEqual(['flaperon']);
    expect(applyChoice('extras', 'flaperon', a).extras).toEqual([]);
  });

  it('stall: pilot value wins over the estimate', () => {
    expect(stallOf({ stall: 9 })).toBe(9);
    expect(stallOf({ spanMm: 1400, rootMm: 220, tipMm: 160, massG: 1200 })).toBe(7.5);
  });
});

import en from '../i18n/locales/en/vehicle-setup.json';
import de from '../i18n/locales/de/vehicle-setup.json';
import { PLANS } from './plans';
import type { SetupStepId, SetupVehicle } from './types';

describe('locale', () => {
  it.each([['en', en], ['de', de]] as const)('every option of every plan has a label (%s)', (_lang, file) => {
    const labels = file.choice as Record<string, Record<string, { label?: string }>>;
    const missing: string[] = [];
    for (const [veh, steps] of Object.entries(PLANS) as [SetupVehicle, readonly SetupStepId[]][]) {
      for (const step of steps) {
        for (const variant of [{}, { vtolType: 'tail' as const }]) {
          const ns = step === 'drive' ? `drive${veh === 'boat' ? 'Boat' : 'Rover'}` : step === 'airframe' && veh === 'vtol' && variant.vtolType === 'tail' ? 'airframeTail' : step;
          for (const id of choiceOptions(step, veh, variant)) if (!labels[ns]?.[id]?.label) missing.push(`${ns}.${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
