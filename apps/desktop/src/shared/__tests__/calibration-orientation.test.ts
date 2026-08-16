import { describe, it, expect } from 'vitest';
import {
  matchOrientation,
  orientationHint,
  targetForPosition,
  SIX_POINT_TARGETS,
} from '../calibration-orientation';

const D = Math.PI / 180;

describe('SIX_POINT_TARGETS', () => {
  it('covers all six sides in the order the UI uses', () => {
    expect(SIX_POINT_TARGETS).toHaveLength(6);
    expect(SIX_POINT_TARGETS.map((t) => t.position)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('puts the aircraft on its left side for position 1, not its right', () => {
    // Getting this backwards teaches the operator the wrong move and produces
    // a calibration the FC accepts from the wrong six faces.
    expect(targetForPosition(1).roll).toBeCloseTo(-90 * D);
    expect(targetForPosition(2).roll).toBeCloseTo(90 * D);
  });

  it('uses pitch, not roll, for nose up and nose down', () => {
    expect(targetForPosition(3).pitch).toBeCloseTo(-90 * D);
    expect(targetForPosition(4).pitch).toBeCloseTo(90 * D);
    expect(targetForPosition(3).roll).toBe(0);
  });
});

describe('matchOrientation', () => {
  it('matches when held exactly', () => {
    const result = matchOrientation({ roll: 0, pitch: 0 }, targetForPosition(0));
    expect(result.matched).toBe(true);
    expect(result.errorDeg).toBeCloseTo(0);
    expect(result.closeness).toBeCloseTo(1);
  });

  it('matches a hand-held position within tolerance', () => {
    const result = matchOrientation({ roll: 6 * D, pitch: -4 * D }, targetForPosition(0));
    expect(result.matched).toBe(true);
    expect(result.closeness).toBeGreaterThan(0);
    expect(result.closeness).toBeLessThan(1);
  });

  it('combines roll and pitch error instead of checking them separately', () => {
    // 10 degrees out on BOTH axes is further away than 10 on one, and a
    // per-axis check would wrongly pass it.
    const oneAxis = matchOrientation({ roll: 10 * D, pitch: 0 }, targetForPosition(0));
    const twoAxes = matchOrientation({ roll: 10 * D, pitch: 10 * D }, targetForPosition(0));
    expect(oneAxis.matched).toBe(true);
    expect(twoAxes.errorDeg).toBeGreaterThan(oneAxis.errorDeg);
    expect(twoAxes.errorDeg).toBeCloseTo(Math.hypot(10, 10), 5);
  });

  it('rejects a position that is clearly wrong', () => {
    expect(matchOrientation({ roll: 0, pitch: 0 }, targetForPosition(5)).matched).toBe(false);
  });

  it('handles the inverted target across the angle wrap', () => {
    // -179 and +180 degrees are 1 degree apart, not 359.
    const result = matchOrientation({ roll: -179 * D, pitch: 0 }, targetForPosition(5));
    expect(result.matched).toBe(true);
    expect(result.errorDeg).toBeCloseTo(1, 3);
  });

  it('never matches on missing telemetry', () => {
    expect(matchOrientation({ roll: Number.NaN, pitch: 0 }, targetForPosition(0)).matched).toBe(false);
  });

  it('respects a tighter tolerance', () => {
    expect(matchOrientation({ roll: 10 * D, pitch: 0 }, targetForPosition(0), 5).matched).toBe(false);
  });
});

describe('orientationHint', () => {
  it('goes quiet once the position is held', () => {
    expect(orientationHint({ roll: 0, pitch: 0 }, targetForPosition(0))).toBeNull();
  });

  it('names the single biggest correction', () => {
    const hint = orientationHint({ roll: 40 * D, pitch: 3 * D }, targetForPosition(0));
    expect(hint).toContain('Roll');
    expect(hint).toContain('left');
  });

  it('tells you which way to pitch', () => {
    expect(orientationHint({ roll: 0, pitch: 40 * D }, targetForPosition(0))).toContain('down');
    expect(orientationHint({ roll: 0, pitch: -40 * D }, targetForPosition(0))).toContain('up');
  });

  it('guides toward a side-down target rather than level', () => {
    // Sitting level while asked for left-side-down: roll it left.
    const hint = orientationHint({ roll: 0, pitch: 0 }, targetForPosition(1));
    expect(hint).toContain('Roll');
    expect(hint).toContain('90');
  });
});
