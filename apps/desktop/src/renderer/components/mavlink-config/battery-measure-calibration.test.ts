import { describe, it, expect } from 'vitest';
import { scaledFactor } from './BatteryMeasureCalibration';

describe('calibrating from a measurement', () => {
  it('scales the factor by measured over reported, as Mission Planner does', () => {
    // reads 12.10 V, meter says 12.60 V, multiplier 10.1
    expect(scaledFactor(10.1, 12.1, 12.6)).toBeCloseTo(10.5174, 4);
    // reads 9.5 A at 17 A/V, clamp meter says 10.2 A
    expect(scaledFactor(17, 9.5, 10.2)).toBeCloseTo(18.2526, 4);
  });

  it('gives nothing for readings that cannot make a sane factor', () => {
    expect(scaledFactor(10.1, 0, 12.6)).toBeNull();
    expect(scaledFactor(10.1, 12.1, 0)).toBeNull();
    expect(scaledFactor(0, 12.1, 12.6)).toBeNull();
  });
});
