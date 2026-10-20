import { describe, it, expect } from 'vitest';
import { checkKind, wiringStepFor, wiringStepsFor } from './wiring-checks';

const read = (map: Record<string, number>) => (name: string) => map[name];

describe('wiringStepFor', () => {
  it('ignores ordinary parameters', () => {
    expect(wiringStepFor('RLL_RATE_P', 0.1, 0.2, 'plane', read({}))).toBeNull();
    expect(wiringStepFor('SERVO2_TRIM', 1500, 1520, 'plane', read({}))).toBeNull();
  });

  it('sends plane outputs to the surface check', () => {
    expect(wiringStepFor('SERVO2_FUNCTION', 0, 4, 'plane', read({}))).toBe('surfaces');
    expect(wiringStepFor('SERVO3_REVERSED', 0, 1, 'plane', read({ SERVO3_FUNCTION: 4 }))).toBe('surfaces');
  });

  it('sends plane throttle to the throttle check and tailsitter motors to the frame step', () => {
    expect(wiringStepFor('SERVO1_FUNCTION', 0, 70, 'plane', read({}))).toBe('thrcheck');
    expect(wiringStepFor('SERVO1_REVERSED', 0, 1, 'plane', read({ SERVO1_FUNCTION: 70 }))).toBe('thrcheck');
    expect(wiringStepFor('SERVO1_FUNCTION', 0, 73, 'vtol', read({}))).toBe('vframe');
  });

  it('sends VTOL lift motors to the motor test, also when one is unassigned', () => {
    expect(wiringStepFor('SERVO5_FUNCTION', 0, 33, 'vtol', read({}))).toBe('motors');
    expect(wiringStepFor('SERVO5_FUNCTION', 33, 0, 'vtol', read({}))).toBe('motors');
    expect(wiringStepFor('SERVO5_REVERSED', 0, 1, 'vtol', read({ SERVO5_FUNCTION: 34 }))).toBe('motors');
    expect(wiringStepFor('Q_ENABLE', 0, 1, 'vtol', read({}))).toBe('motors');
  });

  it('uses the vehicle check for rover, sub and board orientation', () => {
    expect(wiringStepFor('SERVO1_FUNCTION', 0, 26, 'rover', read({}))).toBe('drivetest');
    expect(wiringStepFor('SERVO1_FUNCTION', 0, 33, 'sub', read({}))).toBe('thrusters');
    expect(wiringStepFor('AHRS_ORIENTATION', 0, 4, 'copter', read({}))).toBe('orient');
  });
});

describe('wiringStepsFor', () => {
  it('dedupes and puts orientation first, surfaces last', () => {
    const steps = wiringStepsFor(
      [
        { name: 'SERVO2_FUNCTION', current: 0, next: 4 },
        { name: 'SERVO3_FUNCTION', current: 0, next: 4 },
        { name: 'AHRS_ORIENTATION', current: 0, next: 2 },
        { name: 'SERVO5_FUNCTION', current: 0, next: 33 },
      ],
      'vtol',
      read({}),
    );
    expect(steps).toEqual(['orient', 'motors', 'surfaces']);
  });

  it('labels every motor-type step as the motor test', () => {
    expect(checkKind('drivetest')).toBe('motors');
    expect(checkKind('thrusters')).toBe('motors');
    expect(checkKind('surfaces')).toBe('surfaces');
  });
});
