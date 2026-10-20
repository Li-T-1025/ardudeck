import { describe, expect, it } from 'vitest';
import { cellsFromVoltage, failsafeRows, splitWrites, stepWrites } from './writes';
import type { ParamReader } from './types';

const reader = (params: Record<string, number>): ParamReader => (n) => params[n];
const w = (list: { name: string; value: number }[]) => Object.fromEntries(list.map((x) => [x.name, x.value]));

describe('stepWrites', () => {
  it('copter frame writes class and type; coax only the class', () => {
    expect(w(stepWrites('frame', 'copter', { copterClass: 'hexa', frameType: 1 }, reader({})))).toEqual({ FRAME_CLASS: 2, FRAME_TYPE: 1 });
    expect(w(stepWrites('frame', 'copter', { copterClass: 'coax', frameType: 1 }, reader({})))).toEqual({ FRAME_CLASS: 9 });
    expect(stepWrites('frame', 'heli', {}, reader({}))).toEqual([]);
    expect(w(stepWrites('frame', 'copter', {}, reader({})))).toEqual({ FRAME_CLASS: 1, FRAME_TYPE: 1 });
    expect(w(stepWrites('frame', 'copter', { copterClass: 'y6' }, reader({})))).toEqual({ FRAME_CLASS: 5, FRAME_TYPE: 1 });
  });

  it('VTOL lift layout and tailsitters', () => {
    expect(w(stepWrites('vframe', 'vtol', { vtolType: 'quad', copterClass: 'octa', frameType: 1 }, reader({})))).toEqual({ Q_FRAME_CLASS: 3, Q_FRAME_TYPE: 1 });
    expect(w(stepWrites('vframe', 'vtol', { vtolType: 'tail', tailsitter: 'dual' }, reader({})))).toEqual({ Q_FRAME_CLASS: 10, Q_TAILSIT_MOTMX: 0 });
    expect(w(stepWrites('vframe', 'vtol', { vtolType: 'tilt', choices: { tiltMask: '3' } }, reader({}))).Q_TILT_MASK).toBe(3);
  });

  it('size: the shown 10 in default is what gets written', () => {
    expect(w(stepWrites('size', 'copter', {}, reader({ INS_GYRO_FILTER: 20 })))).toEqual({ INS_GYRO_FILTER: 42 });
    expect(w(stepWrites('size', 'copter', { propIn: 10, cells: 6 }, reader({ INS_GYRO_FILTER: 20 })))).toEqual({ INS_GYRO_FILTER: 42 });
  });

  it('battery: voltages, monitor and failsafe picks', () => {
    const r = reader({ BATT_LOW_VOLT: 0, BATT_CRT_VOLT: 0, BATT_ARM_VOLT: 0, BATT_MONITOR: 0 });
    const out = w(stepWrites('battery', 'plane', { cells: 4, choices: { monitor: '4', fs_low: '1', fs_radio: '1' } }, r));
    expect(out).toMatchObject({ BATT_LOW_VOLT: 14.4, BATT_MONITOR: 4, BATT_FS_LOW_ACT: 1, FS_LONG_ACTN: 1, THR_FAILSAFE: 1 });
  });

  it('outputs only lists outputs that differ', () => {
    expect(w(stepWrites('outputs', 'plane', { airframe: 'wing' }, reader({ SERVO1_FUNCTION: 4, SERVO2_FUNCTION: 19, SERVO3_FUNCTION: 70 })))).toEqual({ SERVO1_FUNCTION: 77, SERVO2_FUNCTION: 78 });
  });
});

describe('failsafeRows', () => {
  it('per vehicle', () => {
    expect(failsafeRows('copter').map((r) => r.param)).toEqual(['BATT_FS_LOW_ACT', 'BATT_FS_CRT_ACT', 'FS_THR_ENABLE']);
    expect(failsafeRows('rover')[2]!.param).toBe('FS_ACTION');
    expect(failsafeRows('sub').map((r) => r.param)).toEqual(['BATT_FS_LOW_ACT', 'FS_GCS_ENABLE', 'FS_LEAK_ENABLE']);
  });
});

describe('splitWrites', () => {
  it('now, later, unchanged and duplicates', () => {
    const s = splitWrites([{ name: 'A', value: 1 }, { name: 'B', value: 2 }, { name: 'C', value: 3 }, { name: 'A', value: 9 }], reader({ A: 0, B: 2 }));
    expect(s).toEqual({ now: [{ name: 'A', value: 1 }], later: ['C'] });
  });
});

describe('cellsFromVoltage', () => {
  it('starting point from the pack voltage', () => {
    expect(cellsFromVoltage(24.8)).toBe(6);
    expect(cellsFromVoltage(16.4)).toBe(4);
    expect(cellsFromVoltage(0)).toBeNull();
  });
});
