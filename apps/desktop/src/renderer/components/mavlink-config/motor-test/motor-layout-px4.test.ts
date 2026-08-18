import { describe, it, expect } from 'vitest';
import { buildPx4Layout, layoutToSvgPositions } from './motor-layout-utils';

// Standard PX4 quad X geometry (generic quadcopter airframe):
// rotor 0 front-right CCW, rotor 1 back-left CCW, rotor 2 front-left CW, rotor 3 back-right CW.
// Body frame: X forward, Y right. KM sign: positive = CCW, negative = CW
// (verbatim from control_allocator module.yaml).
const QUAD_X: Record<string, number> = {
  CA_ROTOR_COUNT: 4,
  CA_ROTOR0_PX: 0.15, CA_ROTOR0_PY: 0.15, CA_ROTOR0_KM: 0.05,
  CA_ROTOR1_PX: -0.15, CA_ROTOR1_PY: -0.15, CA_ROTOR1_KM: 0.05,
  CA_ROTOR2_PX: 0.15, CA_ROTOR2_PY: -0.15, CA_ROTOR2_KM: -0.05,
  CA_ROTOR3_PX: -0.15, CA_ROTOR3_PY: 0.15, CA_ROTOR3_KM: -0.05,
};

const get = (params: Record<string, number>) => (key: string) => params[key];

describe('buildPx4Layout', () => {
  it('returns null without CA_ROTOR_COUNT (not a multirotor airframe)', () => {
    expect(buildPx4Layout(get({}))).toBeNull();
    expect(buildPx4Layout(get({ CA_ROTOR_COUNT: 0 }))).toBeNull();
  });

  it('maps KM sign to spin direction: positive = CCW, negative = CW', () => {
    const layout = buildPx4Layout(get(QUAD_X))!;
    expect(layout.motors.map((m) => m.Rotation)).toEqual(['CCW', 'CCW', 'CW', 'CW']);
  });

  it('marks direction unknown when KM is unset or zero, never guesses', () => {
    const layout = buildPx4Layout(get({ CA_ROTOR_COUNT: 2, CA_ROTOR0_PX: 0.1, CA_ROTOR1_PX: -0.1, CA_ROTOR1_KM: 0 }))!;
    expect(layout.motors[0]!.Rotation).toBe('?');
    expect(layout.motors[1]!.Rotation).toBe('?');
  });

  it('renders front-right rotor top-right in SVG (PX=forward=up, PY=right=+x)', () => {
    const layout = buildPx4Layout(get(QUAD_X))!;
    const positions = layoutToSvgPositions(layout, 200);
    const frontRight = positions.find((p) => p.number === 1)!; // rotor 0
    const backLeft = positions.find((p) => p.number === 2)!; // rotor 1
    expect(frontRight.cx).toBeGreaterThan(100); // right half
    expect(frontRight.cy).toBeLessThan(100); // top half
    expect(backLeft.cx).toBeLessThan(100);
    expect(backLeft.cy).toBeGreaterThan(100);
  });

  it('test order equals motor number (ACTUATOR_TEST MOTOR{i} functions)', () => {
    const layout = buildPx4Layout(get(QUAD_X))!;
    expect(layout.motors.map((m) => [m.Number, m.TestOrder])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
  });

  it('falls back to an evenly spaced circle when geometry params are unset', () => {
    const layout = buildPx4Layout(get({ CA_ROTOR_COUNT: 6 }))!;
    expect(layout.motors).toHaveLength(6);
    expect(layout.motors.every((m) => m.Rotation === '?')).toBe(true);
    expect(layout.motors.some((m) => m.Roll !== 0 || m.Pitch !== 0)).toBe(true);
  });
});
