import { describe, it, expect } from 'vitest';
import { px4CellVoltageAtThreshold } from '../px4-battery';

/** PX4 v1.15 defaults: BAT1_V_EMPTY 3.6, BAT1_V_CHARGED 4.05. */
const V_EMPTY = 3.6;
const V_CHARGED = 4.05;

describe('px4CellVoltageAtThreshold', () => {
  it('maps PX4 default thresholds to sane cell voltages', () => {
    // BAT_LOW_THR default 0.15, BAT_CRIT_THR default 0.07.
    expect(px4CellVoltageAtThreshold(V_EMPTY, V_CHARGED, 0.15)).toBe(3.67);
    expect(px4CellVoltageAtThreshold(V_EMPTY, V_CHARGED, 0.07)).toBe(3.63);
  });

  it('never mistakes the fraction for a voltage', () => {
    // The bug this replaces: BAT_LOW_THR used directly would set the warning
    // at 0.15 V per cell. Every result must sit inside the cell range.
    for (const t of [0.05, 0.12, 0.3, 0.5]) {
      const v = px4CellVoltageAtThreshold(V_EMPTY, V_CHARGED, t)!;
      expect(v).toBeGreaterThan(V_EMPTY);
      expect(v).toBeLessThanOrEqual(V_CHARGED);
    }
  });

  it('is monotonic: a higher remaining fraction warns earlier', () => {
    const low = px4CellVoltageAtThreshold(V_EMPTY, V_CHARGED, 0.15)!;
    const crit = px4CellVoltageAtThreshold(V_EMPTY, V_CHARGED, 0.07)!;
    expect(low).toBeGreaterThan(crit);
  });

  it('refuses inputs that cannot describe a range', () => {
    expect(px4CellVoltageAtThreshold(4.05, 3.6, 0.15)).toBeNull();  // inverted
    expect(px4CellVoltageAtThreshold(3.6, 3.6, 0.15)).toBeNull();   // zero span
    expect(px4CellVoltageAtThreshold(V_EMPTY, V_CHARGED, 0)).toBeNull();
    expect(px4CellVoltageAtThreshold(V_EMPTY, V_CHARGED, 1.5)).toBeNull();
    expect(px4CellVoltageAtThreshold(NaN, V_CHARGED, 0.15)).toBeNull();
  });
});
