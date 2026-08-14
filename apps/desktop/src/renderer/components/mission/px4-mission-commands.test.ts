import { describe, it, expect } from 'vitest';
import { PX4_SUPPORTED_COMMANDS } from './WaypointTablePanel';
import { MAV_CMD } from '../../../shared/mission-types';

/**
 * The PX4 palette is curated from PX4FirmwarePlugin::supportedMissionCommands()
 * in the QGC source vendored under qgroundcontrol/. These tests pin the two
 * directions that matter: PX4 must offer what it implements, and must NOT offer
 * ArduPilot-only commands, which build a plan that only fails at upload.
 */
describe('PX4 mission command palette', () => {
  it('offers the PX4 navigation set', () => {
    for (const cmd of [
      MAV_CMD.NAV_WAYPOINT,
      MAV_CMD.NAV_TAKEOFF,
      MAV_CMD.NAV_LAND,
      MAV_CMD.NAV_LOITER_UNLIM,
      MAV_CMD.NAV_LOITER_TIME,
      MAV_CMD.NAV_LOITER_TO_ALT,
      MAV_CMD.NAV_RETURN_TO_LAUNCH,
      MAV_CMD.NAV_DELAY,
      MAV_CMD.DO_LAND_START,
    ]) {
      expect(PX4_SUPPORTED_COMMANDS.has(cmd)).toBe(true);
    }
  });

  it('offers the VTOL commands PX4 implements', () => {
    expect(PX4_SUPPORTED_COMMANDS.has(MAV_CMD.NAV_VTOL_TAKEOFF)).toBe(true);
    expect(PX4_SUPPORTED_COMMANDS.has(MAV_CMD.NAV_VTOL_LAND)).toBe(true);
    expect(PX4_SUPPORTED_COMMANDS.has(MAV_CMD.DO_VTOL_TRANSITION)).toBe(true);
  });

  it('excludes ArduPilot-only commands', () => {
    for (const cmd of [
      MAV_CMD.NAV_SPLINE_WAYPOINT,
      MAV_CMD.NAV_ARC_WAYPOINT,
      MAV_CMD.NAV_LOITER_TURNS,
      MAV_CMD.NAV_ALTITUDE_WAIT,
      MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT,
      MAV_CMD.DO_REPEAT_RELAY,
      MAV_CMD.DO_PARACHUTE,
      MAV_CMD.DO_AUX_FUNCTION,
    ]) {
      expect(PX4_SUPPORTED_COMMANDS.has(cmd)).toBe(false);
    }
  });

  it('uses the split ROI commands, not the legacy DO_SET_ROI', () => {
    expect(PX4_SUPPORTED_COMMANDS.has(MAV_CMD.DO_SET_ROI_LOCATION)).toBe(true);
    expect(PX4_SUPPORTED_COMMANDS.has(MAV_CMD.DO_SET_ROI_NONE)).toBe(true);
    expect(PX4_SUPPORTED_COMMANDS.has(MAV_CMD.DO_SET_ROI)).toBe(false);
  });

  it('keeps DO_GRIPPER, which PX4 does implement', () => {
    // Checked against QGC rather than assumed: it reads like an ArduPilot-only
    // command but is in PX4's supported list.
    expect(PX4_SUPPORTED_COMMANDS.has(MAV_CMD.DO_GRIPPER)).toBe(true);
  });
});
