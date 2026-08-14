import { describe, it, expect } from 'vitest';
import { getVehicleClass, isVtolClass, ARDUPILOT_COMMON_MODES, getPx4ModeName, encodePx4CustomMode, PX4_FLIGHT_MODES } from './telemetry-types';

/**
 * Regression guard for the "3D Sim World shows the wrong type + modes for a
 * quadplane" bug. Root cause: a quadplane heartbeats as MAV_TYPE=1 (FIXED_WING)
 * until it reboots and re-evaluates its type, so it is ONLY the Q_ENABLE / SITL
 * frame hints that upgrade it to `vtol`. The detached Sim World window never
 * hydrated those hints, so class detection fell back to `plane`. These tests
 * lock in the hint contract the fix relies on.
 */
describe('getVehicleClass — quadplane reporting FIXED_WING', () => {
  const MAV_TYPE_FIXED_WING = 1;

  it('misdetects as plane when NO hint is present (the pre-fix detached-window state)', () => {
    expect(getVehicleClass(MAV_TYPE_FIXED_WING, {})).toBe('plane');
  });

  it('upgrades to vtol when Q_ENABLE > 0 (the hint the fix restores in detached windows)', () => {
    expect(getVehicleClass(MAV_TYPE_FIXED_WING, { qEnable: 1 })).toBe('vtol');
  });

  it('stays plane when Q_ENABLE is 0 (genuine fixed-wing)', () => {
    expect(getVehicleClass(MAV_TYPE_FIXED_WING, { qEnable: 0 })).toBe('plane');
  });

  it('upgrades to vtol from a known VTOL SITL frame even with Q_ENABLE absent', () => {
    expect(getVehicleClass(MAV_TYPE_FIXED_WING, { sitlFrame: 'quadplane' })).toBe('vtol');
  });

  it('a properly-booted VTOL (MAV_TYPE in the VTOL family) needs no hint', () => {
    expect(getVehicleClass(20, {})).toBe('vtol'); // MAV_TYPE_VTOL_QUADROTOR
  });

  it('the vtol class exposes Q-modes, not the fixed-wing mode set', () => {
    expect(isVtolClass(getVehicleClass(MAV_TYPE_FIXED_WING, { qEnable: 1 }))).toBe(true);
    const vtolModes = ARDUPILOT_COMMON_MODES.vtol.map((m) => m.name);
    // QLOITER/QHOVER-style Q-modes are the hover set a VTOL operator needs and
    // that the plane list lacks.
    expect(vtolModes.some((n) => n.startsWith('Q'))).toBe(true);
    expect(vtolModes).not.toEqual(ARDUPILOT_COMMON_MODES.plane.map((m) => m.name));
  });
});

// Build a PX4 custom_mode from main/sub mode, matching the wire encoding:
//   main_mode = (customMode >> 16) & 0xFF, sub_mode = (customMode >> 24) & 0xFF
const cm = (mainMode: number, subMode = 0): number => (mainMode << 16) | (subMode << 24);

describe('getPx4ModeName', () => {
  it('decodes simple main modes', () => {
    expect(getPx4ModeName(cm(1))).toBe('Manual');
    expect(getPx4ModeName(cm(2))).toBe('Altitude');
    expect(getPx4ModeName(cm(5))).toBe('Acro');
    expect(getPx4ModeName(cm(6))).toBe('Offboard');
    expect(getPx4ModeName(cm(7))).toBe('Stabilized');
  });

  it('decodes POSCTL sub modes', () => {
    expect(getPx4ModeName(cm(3, 0))).toBe('Position');
    expect(getPx4ModeName(cm(3, 1))).toBe('Orbit');
  });

  it('decodes AUTO sub modes', () => {
    expect(getPx4ModeName(cm(4, 1))).toBe('Ready');
    expect(getPx4ModeName(cm(4, 2))).toBe('Takeoff');
    expect(getPx4ModeName(cm(4, 3))).toBe('Hold');
    expect(getPx4ModeName(cm(4, 4))).toBe('Mission');
    expect(getPx4ModeName(cm(4, 5))).toBe('Return');
    expect(getPx4ModeName(cm(4, 6))).toBe('Land');
    expect(getPx4ModeName(cm(4, 8))).toBe('Follow Me');
    expect(getPx4ModeName(cm(4, 9))).toBe('Precision Land');
  });

  it('falls back gracefully for unknown values', () => {
    expect(getPx4ModeName(cm(99))).toBe('Mode ' + cm(99));
    expect(getPx4ModeName(cm(4, 99))).toBe('Auto 99');
  });
});

describe('encodePx4CustomMode', () => {
  it('packs main/sub modes into the custom_mode bitfield', () => {
    expect(encodePx4CustomMode(1, 0)).toBe(1 << 16);                 // Manual
    expect(encodePx4CustomMode(4, 3)).toBe(((4) << 16) | ((3) << 24)); // Hold (AUTO_LOITER)
    expect(encodePx4CustomMode(4, 5)).toBe(((4) << 16) | ((5) << 24)); // Return (AUTO_RTL)
  });

  it('returns an unsigned 32-bit value when the top bit is set', () => {
    const encoded = encodePx4CustomMode(4, 200); // top byte > 127
    expect(encoded).toBeGreaterThan(0);
    expect(Number.isInteger(encoded)).toBe(true);
  });

  it('round-trips with getPx4ModeName for the commandable modes', () => {
    expect(getPx4ModeName(encodePx4CustomMode(1, 0))).toBe('Manual');
    expect(getPx4ModeName(encodePx4CustomMode(4, 3))).toBe('Hold');
    expect(getPx4ModeName(encodePx4CustomMode(4, 5))).toBe('Return');
    for (const m of PX4_FLIGHT_MODES) {
      expect(getPx4ModeName(encodePx4CustomMode(m.mainMode, m.subMode))).not.toBe('');
    }
  });
});
