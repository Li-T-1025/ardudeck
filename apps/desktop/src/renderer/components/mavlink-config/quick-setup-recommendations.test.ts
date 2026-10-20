import { describe, it, expect } from 'vitest';
import { buildRecommendations, type RecommendationVehicle } from './quick-setup-recommendations';

function params(values: Record<string, number>): Map<string, { value: number }> {
  return new Map(Object.entries(values).map(([k, v]) => [k, { value: v }]));
}

function recs(values: Record<string, number>, vehicle: RecommendationVehicle, enums?: Record<string, Record<number, string>>) {
  return buildRecommendations({ parameters: params(values), vehicle, enumOf: enums ? (n) => enums[n] : undefined });
}

function byId(list: ReturnType<typeof recs>, id: string) {
  return list.find((r) => r.id === id);
}

const PLANE_BASE = { RLL_RATE_P: 0.08, RLL_RATE_FF: 0.3, PTCH_RATE_P: 0.08, PTCH_RATE_FF: 0.3, Q_ENABLE: 0 };
const COPTER_BASE = { ATC_RAT_RLL_P: 0.135 };

describe('plane rate controller feed-forward', () => {
  it('falls back to the scheme default when the firmware default is unknown', () => {
    const r = byId(recs({ ...PLANE_BASE, RLL_RATE_FF: 0, PTCH_RATE_FF: 0 }, 'plane'), 'plane-ff');
    expect(r?.changes).toEqual({ RLL_RATE_FF: 0.2, PTCH_RATE_FF: 0.2 });
    expect(r?.textKey).toBe('ffPlane');
  });

  it('prefers the firmware default over the scheme fallback', () => {
    const parameters = new Map<string, { value: number; defaultValue?: number }>([
      ...params({ ...PLANE_BASE, RLL_RATE_FF: 0, PTCH_RATE_FF: 0 }),
      ['RLL_RATE_FF', { value: 0, defaultValue: 0.345 }],
      ['PTCH_RATE_FF', { value: 0, defaultValue: 0.345 }],
    ]);
    const r = byId(buildRecommendations({ parameters, vehicle: 'plane' }), 'plane-ff');
    expect(r?.changes).toEqual({ RLL_RATE_FF: 0.345, PTCH_RATE_FF: 0.345 });
  });

  it('stays quiet when the firmware default itself is 0', () => {
    const parameters = new Map<string, { value: number; defaultValue?: number }>([
      ...params({ ...PLANE_BASE, PTCH_RATE_FF: 0 }),
      ['PTCH_RATE_FF', { value: 0, defaultValue: 0 }],
    ]);
    expect(byId(buildRecommendations({ parameters, vehicle: 'plane' }), 'plane-ff')).toBeUndefined();
  });

  it('only touches the axis that is 0', () => {
    const r = byId(recs({ ...PLANE_BASE, PTCH_RATE_FF: 0 }, 'plane'), 'plane-ff');
    expect(r?.changes).toEqual({ PTCH_RATE_FF: 0.2 });
  });

  it('uses the QuadPlane wording for the fixed-wing set of a QuadPlane', () => {
    const r = byId(recs({ ...PLANE_BASE, Q_ENABLE: 1, Q_A_RAT_RLL_P: 0.25, RLL_RATE_FF: 0 }, 'plane'), 'plane-ff');
    expect(r?.textKey).toBe('ffQuadPlane');
    expect(r?.changes).toEqual({ RLL_RATE_FF: 0.2 });
  });

  it('stays quiet on the legacy plane scheme, on non-zero FF and on copters', () => {
    expect(byId(recs({ RLL2SRV_P: 0.4, Q_ENABLE: 0 }, 'plane'), 'plane-ff')).toBeUndefined();
    expect(byId(recs(PLANE_BASE, 'plane'), 'plane-ff')).toBeUndefined();
    expect(byId(recs({ ...COPTER_BASE, RLL_RATE_P: 0.1, RLL_RATE_FF: 0 }, 'copter'), 'plane-ff')).toBeUndefined();
  });
});

describe('GPS modes without a GPS', () => {
  it('moves plane GPS modes to FBWA and names the slots', () => {
    const r = byId(recs({ ...PLANE_BASE, GPS1_TYPE: 0, FLTMODE1: 5, FLTMODE2: 10, FLTMODE3: 1, FLTMODE4: 11, FLTMODE5: 12, FLTMODE6: 0 }, 'plane'), 'gps-modes');
    expect(r?.changes).toEqual({ FLTMODE2: 5, FLTMODE4: 5, FLTMODE5: 5 });
    expect(r?.textParams).toEqual({ slots: '2, 4, 5', modes: 'Auto, RTL, Loiter', safe: 'FBWA' });
  });

  it('moves copter GPS modes to AltHold, falling back to GPS_TYPE', () => {
    const r = byId(recs({ ...COPTER_BASE, GPS_TYPE: 0, FLTMODE1: 0, FLTMODE2: 2, FLTMODE3: 5, FLTMODE4: 16, FLTMODE5: 9, FLTMODE6: 21 }, 'copter'), 'gps-modes');
    expect(r?.changes).toEqual({ FLTMODE3: 2, FLTMODE4: 2, FLTMODE6: 2 });
    expect(r?.textParams?.safe).toBe('AltHold');
  });

  it('stays quiet with a GPS, without GPS params, or on another vehicle', () => {
    expect(byId(recs({ ...COPTER_BASE, GPS1_TYPE: 1, FLTMODE1: 5 }, 'copter'), 'gps-modes')).toBeUndefined();
    expect(byId(recs({ ...COPTER_BASE, FLTMODE1: 5 }, 'copter'), 'gps-modes')).toBeUndefined();
    expect(byId(recs({ GPS1_TYPE: 0, FLTMODE1: 5 }, 'other'), 'gps-modes')).toBeUndefined();
  });
});

describe('Q-modes on a plane without QuadPlane', () => {
  it('moves Q-modes to FBWA when Q_ENABLE is 0', () => {
    const r = byId(recs({ ...PLANE_BASE, FLTMODE1: 19, FLTMODE2: 5, FLTMODE6: 21 }, 'plane'), 'q-modes');
    expect(r?.changes).toEqual({ FLTMODE1: 5, FLTMODE6: 5 });
    expect(r?.textParams?.modes).toBe('QLoiter, QRTL');
  });

  it('leaves Q-modes alone on a QuadPlane', () => {
    expect(byId(recs({ ...PLANE_BASE, Q_ENABLE: 1, FLTMODE1: 19 }, 'plane'), 'q-modes')).toBeUndefined();
  });
});

describe('battery failsafe actions (issues #35, #50)', () => {
  it('flags copter-numbered actions on a plain plane', () => {
    // 4 is SmartRTL-or-Land on Copter but QLand on Plane, which needs a QuadPlane
    const list = recs({ ...PLANE_BASE, BATT_FS_LOW_ACT: 4, BATT_FS_CRT_ACT: 6 }, 'plane');
    expect(byId(list, 'batt-low-invalid')?.changes).toEqual({ BATT_FS_LOW_ACT: 1 });
    expect(byId(list, 'batt-crt-invalid')?.changes).toEqual({ BATT_FS_CRT_ACT: 2 });
  });

  it('accepts QLand on a QuadPlane and recommends it for critical', () => {
    const list = recs({ ...PLANE_BASE, Q_ENABLE: 1, BATT_FS_LOW_ACT: 4, BATT_FS_CRT_ACT: 1, BATT_CRT_VOLT: 13.2 }, 'plane');
    expect(byId(list, 'batt-low-invalid')).toBeUndefined();
    expect(byId(list, 'batt-crt-weak')?.changes).toEqual({ BATT_FS_CRT_ACT: 4 });
  });

  it('flags values outside the metadata enum', () => {
    const enums = { BATT_FS_LOW_ACT: { 0: 'None', 1: 'Land', 2: 'RTL' } };
    const list = recs({ ...COPTER_BASE, BATT_FS_LOW_ACT: 5, BATT_FS_CRT_ACT: 1 }, 'copter', enums);
    expect(byId(list, 'batt-low-invalid')?.changes).toEqual({ BATT_FS_LOW_ACT: 2 });
  });

  it('flags values a copter does not have without metadata', () => {
    const list = recs({ ...COPTER_BASE, BATT_FS_LOW_ACT: 2, BATT_FS_CRT_ACT: 9 }, 'copter');
    expect(byId(list, 'batt-crt-invalid')?.changes).toEqual({ BATT_FS_CRT_ACT: 1 });
  });

  it('wants a critical action once a critical threshold is set', () => {
    const r = byId(recs({ ...COPTER_BASE, BATT_FS_LOW_ACT: 2, BATT_FS_CRT_ACT: 0, BATT_CRT_VOLT: 14 }, 'copter'), 'batt-crt-weak');
    expect(r?.textKey).toBe('battCrtNone');
    expect(r?.changes).toEqual({ BATT_FS_CRT_ACT: 1 });
  });

  it('wants critical at least as firm as low', () => {
    // low Land, critical RTL: the battery gets emptier and the response gets softer
    const r = byId(recs({ ...COPTER_BASE, BATT_FS_LOW_ACT: 1, BATT_FS_CRT_ACT: 2, BATT_CRT_MAH: 300 }, 'copter'), 'batt-crt-weak');
    expect(r?.textKey).toBe('battCrtWeaker');
    expect(r?.changes).toEqual({ BATT_FS_CRT_ACT: 1 });
  });

  it('is happy with low RTL and critical Land, on both vehicles', () => {
    const copter = recs({ ...COPTER_BASE, BATT_FS_LOW_ACT: 2, BATT_FS_CRT_ACT: 1, BATT_CRT_VOLT: 14 }, 'copter');
    const plane = recs({ ...PLANE_BASE, BATT_FS_LOW_ACT: 1, BATT_FS_CRT_ACT: 2, BATT_CRT_VOLT: 14 }, 'plane');
    expect(copter.filter((r) => r.id.startsWith('batt-'))).toEqual([]);
    expect(plane.filter((r) => r.id.startsWith('batt-'))).toEqual([]);
  });

  it('does not judge the critical action when no critical threshold is set', () => {
    expect(byId(recs({ ...COPTER_BASE, BATT_FS_LOW_ACT: 1, BATT_FS_CRT_ACT: 0 }, 'copter'), 'batt-crt-weak')).toBeUndefined();
  });

  it('only ever stages BATT_FS_* actions, never the deprecated FS_BATT_* names', () => {
    const list = recs({ ...COPTER_BASE, BATT_FS_LOW_ACT: 9, BATT_FS_CRT_ACT: 0, BATT_CRT_VOLT: 14 }, 'copter');
    const touched = list.flatMap((r) => Object.keys(r.changes));
    expect(touched.length).toBeGreaterThan(0);
    for (const name of touched) expect(['BATT_FS_LOW_ACT', 'BATT_FS_CRT_ACT']).toContain(name);
  });
});

describe('arming checks', () => {
  it('turns ARMING_CHECK 0 back to all', () => {
    expect(byId(recs({ ARMING_CHECK: 0 }, 'copter'), 'arming')?.changes).toEqual({ ARMING_CHECK: 1 });
  });

  it('turns ARMING_SKIPCHK -1 back to skipping nothing', () => {
    expect(byId(recs({ ARMING_CHECK: 1, ARMING_SKIPCHK: -1 }, 'plane'), 'arming')?.changes).toEqual({ ARMING_SKIPCHK: 0 });
  });

  it('leaves a partial mask alone', () => {
    expect(byId(recs({ ARMING_CHECK: 0b110 }, 'copter'), 'arming')).toBeUndefined();
    expect(byId(recs({ ARMING_SKIPCHK: 0 }, 'copter'), 'arming')).toBeUndefined();
  });
});

it('recommends nothing for a sound setup', () => {
  expect(recs({ ...PLANE_BASE, GPS1_TYPE: 1, FLTMODE1: 10, BATT_FS_LOW_ACT: 1, BATT_FS_CRT_ACT: 2, ARMING_CHECK: 1 }, 'plane')).toEqual([]);
});
