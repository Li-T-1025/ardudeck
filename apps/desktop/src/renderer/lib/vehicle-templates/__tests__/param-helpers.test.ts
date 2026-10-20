import { describe, it, expect } from 'vitest';
import { airspeedParams } from '../param-helpers';
import type { VehicleProfile } from '../../../stores/settings-store';

const plane = (stallSpeed: number) => ({ id: 'p', name: 'p', type: 'plane', stallSpeed } as VehicleProfile);
const byName = (stall: number) => Object.fromEntries(airspeedParams(plane(stall)).map((s) => [s.name, s.value]));

describe('airspeedParams', () => {
  it('keeps the minimum at least 20% above stall and the maximum 50% above the minimum', () => {
    const v = byName(10);
    expect(v.AIRSPEED_MIN).toBeGreaterThanOrEqual(10 * 1.2);
    expect(v.AIRSPEED_MAX).toBeGreaterThanOrEqual(v.AIRSPEED_MIN! * 1.5);
    expect(v.AIRSPEED_MIN).toBeLessThan(v.AIRSPEED_CRUISE!);
    expect(v.AIRSPEED_CRUISE).toBeLessThan(v.AIRSPEED_MAX!);
  });

  it('sets the maximum to about twice cruise', () => {
    const v = byName(12);
    expect(v.AIRSPEED_MAX).toBeCloseTo(v.AIRSPEED_CRUISE! * 2, 0);
  });

  it('emits both the 4.5+ names and the pre-4.5 names with matching values', () => {
    const v = byName(10);
    expect(v.ARSPD_FBW_MIN).toBe(Math.round(v.AIRSPEED_MIN!));
    expect(v.ARSPD_FBW_MAX).toBe(Math.round(v.AIRSPEED_MAX!));
    expect(v.TRIM_ARSPD_CM).toBe(Math.round(v.AIRSPEED_CRUISE! * 100));
    expect(v.AIRSPEED_STALL).toBeGreaterThanOrEqual(10);
    expect(v.AIRSPEED_STALL).toBeLessThan(v.AIRSPEED_MIN!);
  });

  it('emits nothing without a stall speed', () => {
    expect(airspeedParams({ id: 'p', name: 'p', type: 'plane' } as VehicleProfile)).toEqual([]);
  });
});
