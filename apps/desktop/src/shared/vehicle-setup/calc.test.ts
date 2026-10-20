import { describe, expect, it } from 'vitest';
import {
  airspeedSuggestion, assistSpeed, batterySuggestion, batteryValues, buildSuggestion, estimateStall, toChemistry, tuneSuggestion, tuneValues,
} from './calc';
import type { ParamReader } from './types';

const reader = (params: Record<string, number>): ParamReader => (n) => params[n];
const byName = (changes: { name: string; value: number }[]) => Object.fromEntries(changes.map((c) => [c.name, c.value]));

describe('tuneValues (Mission Planner ConfigInitialParams)', () => {
  it('10 in props', () => {
    const v = tuneValues(10);
    expect(v.accelY).toBe(27000);
    expect(v.accelRP).toBe(116700);
    expect(v.gyro).toBe(42);
    expect(v.rateFilter).toBe(21);
    expect(v.expo).toBe(0.6);
    expect(v.acroYawP).toBe(3);
  });

  it('clamps for big props', () => {
    const v = tuneValues(30);
    expect(v.accelY).toBe(9000);
    expect(v.accelRP).toBeGreaterThanOrEqual(10000);
    expect(v.gyro).toBe(Math.max(20, Math.round(289.22 * 30 ** -0.838)));
    expect(v.expo).toBeLessThanOrEqual(0.8);
  });

  it('accel limits never drop below the floors', () => {
    expect(tuneValues(40).accelY).toBe(8000);
    expect(tuneValues(40).accelRP).toBe(14600);
    expect(tuneValues(60).accelRP).toBe(10000);
  });
});

describe('batteryValues', () => {
  it('6S LiPo', () => {
    expect(batteryValues(6, 'lipo')).toEqual({ full: 25.2, empty: 19.8, low: 21.6, critical: 21, arm: 22.1 });
  });
  it('4S Li-ion uses 2.8 V empty', () => {
    expect(batteryValues(4, 'liion').empty).toBe(11.2);
  });
  it('accepts the desktop chemistry spellings', () => {
    expect(toChemistry('lihv')).toBe('lipohv');
    expect(toChemistry('lion')).toBe('liion');
    expect(toChemistry('weird')).toBe('lipo');
  });
});

describe('tuneSuggestion', () => {
  const copter = reader({
    ACRO_YAW_P: 4.5, ATC_ACCEL_P_MAX: 110000, ATC_ACCEL_R_MAX: 110000, ATC_ACCEL_Y_MAX: 27000,
    ATC_RAT_RLL_FLTD: 20, ATC_RAT_RLL_FLTE: 0, ATC_RAT_RLL_FLTT: 20, ATC_RAT_PIT_FLTD: 20, ATC_RAT_PIT_FLTE: 0, ATC_RAT_PIT_FLTT: 20,
    ATC_RAT_YAW_FLTD: 0, ATC_RAT_YAW_FLTE: 2.5, ATC_RAT_YAW_FLTT: 20, ATC_THR_MIX_MAN: 0.1, INS_ACCEL_FILTER: 20, INS_GYRO_FILTER: 20,
    MOT_THST_EXPO: 0.65, MOT_THST_HOVER: 0.35, MOT_BAT_VOLT_MAX: 0, MOT_BAT_VOLT_MIN: 0,
  });

  it('only lists params that change', () => {
    const s = tuneSuggestion({ propIn: 10, cells: 6, chemistry: 'lipo' }, copter);
    const c = byName(s.changes);
    expect(c.ATC_ACCEL_Y_MAX).toBeUndefined();
    expect(c.ATC_THR_MIX_MAN).toBeUndefined();
    expect(c.ATC_RAT_RLL_FLTE).toBeUndefined();
    expect(c.ATC_ACCEL_P_MAX).toBe(116700);
    expect(c.INS_GYRO_FILTER).toBe(42);
    expect(c.ATC_RAT_PIT_FLTD).toBe(21);
    expect(c.ATC_RAT_YAW_FLTE).toBe(2);
    expect(c.MOT_THST_EXPO).toBe(0.6);
    expect(c.MOT_THST_HOVER).toBe(0.2);
    expect(c.MOT_BAT_VOLT_MAX).toBe(25.2);
    expect(c.MOT_BAT_VOLT_MIN).toBe(19.8);
    expect(c.ACRO_YAW_P).toBe(3);
    expect(s.kind).toBe('tune');
    expect(s.source).toMatch(/ConfigInitialParams/);
    for (const ch of s.changes) expect(ch.reason.length).toBeGreaterThan(0);
  });

  it('uses Q_A_ / Q_M_ on a QuadPlane', () => {
    const s = tuneSuggestion({ propIn: 10, cells: 4 }, reader({ Q_ENABLE: 1, Q_A_ACCEL_P_MAX: 1, Q_M_THST_EXPO: 0.65, INS_GYRO_FILTER: 20 }));
    const c = byName(s.changes);
    expect(c.Q_A_ACCEL_P_MAX).toBe(116700);
    expect(c.Q_M_THST_EXPO).toBe(0.6);
    expect(c.ATC_ACCEL_P_MAX).toBeUndefined();
  });

  it('falls back to the deg/s/s ACC names', () => {
    const c = byName(tuneSuggestion({ propIn: 10, cells: 4 }, reader({ ATC_ACC_P_MAX: 1, ATC_ACC_Y_MAX: 1 })).changes);
    expect(c.ATC_ACC_P_MAX).toBe(1167);
    expect(c.ATC_ACC_Y_MAX).toBe(270);
  });

  it('falls back to the 3.x FILT names', () => {
    const c = byName(tuneSuggestion({ propIn: 10, cells: 4 }, reader({ ATC_RAT_RLL_FILT: 1, ATC_RAT_YAW_FILT: 1 })).changes);
    expect(c.ATC_RAT_RLL_FILT).toBe(21);
    expect(c.ATC_RAT_YAW_FILT).toBe(2);
  });

  it('writes nothing the board does not have', () => {
    expect(tuneSuggestion({ propIn: 10, cells: 4 }, reader({})).changes).toEqual([]);
  });
});

describe('batterySuggestion', () => {
  it('voltages and capacity', () => {
    const s = batterySuggestion({ cells: 6, chemistry: 'lipo', capacity: 5000 }, reader({ BATT_LOW_VOLT: 0, BATT_CRT_VOLT: 0, BATT_ARM_VOLT: 0, BATT_CAPACITY: 3300 }));
    expect(byName(s.changes)).toEqual({ BATT_LOW_VOLT: 21.6, BATT_CRT_VOLT: 21, BATT_ARM_VOLT: 22.1, BATT_CAPACITY: 5000 });
    expect(s.inputs).toEqual({ cells: 6, chemistry: 'lipo', capacity: 5000 });
  });
});

describe('airspeedSuggestion', () => {
  it('4.5+ names, stall + 25%, max about 2x cruise', () => {
    const s = airspeedSuggestion({ stall: 10 }, reader({ AIRSPEED_MIN: 9, AIRSPEED_CRUISE: 15, AIRSPEED_MAX: 22, AIRSPEED_STALL: 0 }));
    expect(byName(s.changes)).toEqual({ AIRSPEED_STALL: 10.5, AIRSPEED_MIN: 12.5, AIRSPEED_MAX: 30 });
  });

  it('pre-4.5 names picked from the downloaded list', () => {
    const s = airspeedSuggestion({ stall: 10 }, reader({ ARSPD_FBW_MIN: 9, ARSPD_FBW_MAX: 22, TRIM_ARSPD_CM: 1200 }));
    expect(byName(s.changes)).toEqual({ ARSPD_FBW_MIN: 13, TRIM_ARSPD_CM: 1500, ARSPD_FBW_MAX: 30 });
  });

  it('no AIRSPEED_STALL before 4.6 is simply skipped', () => {
    const c = byName(airspeedSuggestion({ stall: 10 }, reader({ AIRSPEED_MIN: 9 })).changes);
    expect(c.AIRSPEED_STALL).toBeUndefined();
    expect(c.AIRSPEED_MIN).toBe(12.5);
  });
});

describe('stall and assist', () => {
  it('estimates stall from the wing', () => {
    expect(estimateStall(1400, 220, 160, 1200, 'normal')).toBe(7.5);
    expect(estimateStall(1400, 220, 160, 1200, 'wing')).toBeGreaterThan(7.5);
    expect(estimateStall(0, 220, 160, 1200)).toBe(0);
  });
  it('Q_ASSIST_SPEED 25% above stall', () => {
    expect(assistSpeed(12)).toBe(15);
  });
});

describe('buildSuggestion', () => {
  it('routes by kind with string inputs', () => {
    const r = reader({ AIRSPEED_MIN: 1 });
    expect(buildSuggestion('airspeed', { stall: '10' }, r).changes).toEqual(airspeedSuggestion({ stall: 10 }, r).changes);
    expect(buildSuggestion('battery', { cells: 4 }, reader({ BATT_LOW_VOLT: 0 })).kind).toBe('battery');
    expect(buildSuggestion('tune', { propIn: 5, cells: 4, chemistry: 'lipo' }, reader({ INS_GYRO_FILTER: 20 })).changes[0]!.name).toBe('INS_GYRO_FILTER');
  });
});
