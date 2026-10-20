import { describe, expect, it } from 'vitest';
import { driveOutputs, findLayout, isMotorFunction, motorFunction, liftMotors, outputChanges, planeOutputs, vtolLiftOutputs } from './outputs';

const map = (list: { output: number; fn: number }[]) => Object.fromEntries(list.map((o) => [o.output, o.fn]));

describe('planeOutputs', () => {
  it('firmware defaults 4/19/70/21 (throttle on 3)', () => {
    expect(map(planeOutputs('plane', {}))).toEqual({ 1: 4, 2: 19, 3: 70, 4: 21 });
  });

  it('flying wing: elevons on 1 and 2, no rudder', () => {
    expect(map(planeOutputs('plane', { airframe: 'wing' }))).toEqual({ 1: 77, 2: 78, 3: 70 });
  });

  it('V-tail and inverted V share outputs', () => {
    const v = map(planeOutputs('plane', { airframe: 'vtail' }));
    expect(v).toEqual({ 1: 4, 2: 79, 3: 70, 4: 80 });
    expect(map(planeOutputs('plane', { airframe: 'invv' }))).toEqual(v);
  });

  it('3-channel: no ailerons', () => {
    expect(map(planeOutputs('plane', { airframe: 'three' }))).toEqual({ 2: 19, 3: 70, 4: 21 });
  });

  it('extras go on the next free outputs, second aileron first', () => {
    const o = map(planeOutputs('plane', { aileronY: false, extras: ['flaps', 'steer'] }));
    expect(o).toEqual({ 1: 4, 2: 19, 3: 70, 4: 21, 5: 4, 6: 2, 7: 26 });
  });

  it('flaperons replace the aileron output', () => {
    expect(map(planeOutputs('plane', { extras: ['flaperon'] }))).toEqual({ 1: 24, 2: 19, 3: 70, 4: 21, 5: 25 });
  });

  it('twin and gas engines', () => {
    expect(map(planeOutputs('plane', { power: 'twin' }))).toEqual({ 1: 4, 2: 19, 3: 73, 4: 21, 5: 74 });
    expect(map(planeOutputs('plane', { power: 'ic' }))).toEqual({ 1: 4, 2: 19, 3: 70, 4: 21, 5: 67, 6: 69 });
  });

  it('glider has no throttle', () => {
    expect(map(planeOutputs('plane', { power: 'glider' }))[3]).toBeUndefined();
  });
});

describe('VTOL', () => {
  it('quad X lift motors on 5..8, set by the firmware', () => {
    const lift = vtolLiftOutputs({ vtolType: 'quad', copterClass: 'quad', frameType: 1 });
    expect(map(lift)).toEqual({ 5: 33, 6: 34, 7: 35, 8: 36 });
    expect(lift.every((o) => o.auto)).toBe(true);
  });

  it('extras skip the lift motors', () => {
    const o = map(planeOutputs('vtol', { vtolType: 'quad', copterClass: 'quad', frameType: 1, extras: ['flaps'] }));
    expect(o[9]).toBe(2);
  });

  it('tri: lift motors 5, 6, 8 and the yaw servo on 11', () => {
    const lift = vtolLiftOutputs({ vtolType: 'quad', copterClass: 'tri', frameType: 0 });
    expect(map(lift)).toEqual({ 5: 33, 6: 34, 8: 36, 11: 39 });
    const o = map(planeOutputs('vtol', { vtolType: 'quad', copterClass: 'tri', frameType: 0, aileronY: false, extras: ['flaps'] }));
    expect(o[7]).toBe(4);
    expect(o[9]).toBe(2);
  });

  it('octa: lift on 5..12, extras from 13', () => {
    const o = map(planeOutputs('vtol', { vtolType: 'quad', copterClass: 'octa', frameType: 1, extras: ['gear'] }));
    expect(o[12]).toBe(40);
    expect(o[13]).toBe(29);
  });

  it('dual tailsitter: motors 7/8, elevons, no throttle on 3, 5/6 kept for tilt servos', () => {
    const o = map(planeOutputs('vtol', { vtolType: 'tail', tailsitter: 'dual', extras: ['gear'] }));
    expect(o).toEqual({ 1: 77, 2: 78, 7: 73, 8: 74, 9: 29 });
  });

  it('single motor tailsitter: motor on 3', () => {
    expect(map(planeOutputs('vtol', { vtolType: 'tail', tailsitter: 'single' }))).toEqual({ 1: 77, 2: 78, 3: 70 });
  });

  it('tailsitter without surfaces', () => {
    expect(map(planeOutputs('vtol', { vtolType: 'tail', tailsitter: 'dual', airframe: 'none' }))).toEqual({ 7: 73, 8: 74 });
  });

  it('tilt-rotor has no separate forward throttle', () => {
    expect(map(planeOutputs('vtol', { vtolType: 'tilt', copterClass: 'quad', frameType: 1 }))[3]).toBeUndefined();
  });
});

describe('motor functions', () => {
  it('Motor9..12 are 82..85', () => {
    expect(motorFunction(1)).toBe(33);
    expect(motorFunction(8)).toBe(40);
    expect(motorFunction(9)).toBe(82);
    expect(motorFunction(12)).toBe(85);
    expect(isMotorFunction(41)).toBe(false);
    expect(isMotorFunction(84)).toBe(true);
  });
});

describe('layouts', () => {
  it('the tri yaw servo is not a lift motor', () => {
    expect(liftMotors(findLayout(7, 0)!).map((m) => m.Number)).toEqual([1, 2, 4]);
  });
});

describe('driveOutputs', () => {
  it('rover steering and skid', () => {
    expect(map(driveOutputs('rover', 'steer'))).toEqual({ 1: 26, 3: 70 });
    expect(map(driveOutputs('rover', 'skid'))).toEqual({ 1: 73, 3: 74 });
    expect(map(driveOutputs('rover', 'omni'))).toEqual({ 1: 33, 2: 34, 3: 35, 4: 36 });
  });
  it('boat defaults to rudder + motor', () => {
    expect(map(driveOutputs('boat', undefined))).toEqual({ 1: 26, 3: 70 });
    expect(map(driveOutputs('boat', 'diff'))).toEqual({ 1: 73, 3: 74 });
  });
});

describe('outputChanges', () => {
  it('skips firmware-set lift motors, unchanged and missing outputs', () => {
    const plan = planeOutputs('vtol', { vtolType: 'quad', copterClass: 'quad', frameType: 1 });
    const read = (n: string) => ({ SERVO1_FUNCTION: 4, SERVO2_FUNCTION: 0, SERVO3_FUNCTION: 70, SERVO5_FUNCTION: 0 } as Record<string, number>)[n];
    expect(outputChanges(plan, read)).toEqual([{ name: 'SERVO2_FUNCTION', value: 19 }]);
  });
});
