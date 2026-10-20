import { describe, expect, it } from 'vitest';
import { MAV_CMD } from '../../../shared/mission-types';
import { getCommandParams } from './WaypointTablePanel';

describe('waypoint command parameter config', () => {
  it('does not impose maximum limits on waypoint target altitude fields', () => {
    const altitudeFields = [
      getCommandParams(MAV_CMD.NAV_WAYPOINT).find(param => param.key === 'altitude'),
      getCommandParams(MAV_CMD.NAV_SPLINE_WAYPOINT).find(param => param.key === 'altitude'),
      getCommandParams(MAV_CMD.NAV_TAKEOFF).find(param => param.key === 'altitude'),
      getCommandParams(MAV_CMD.NAV_VTOL_TAKEOFF).find(param => param.key === 'altitude'),
      getCommandParams(MAV_CMD.CONDITION_CHANGE_ALT).find(param => param.key === 'altitude'),
      getCommandParams(MAV_CMD.DO_CHANGE_ALTITUDE).find(param => param.key === 'param1'),
      getCommandParams(MAV_CMD.NAV_ALTITUDE_WAIT).find(param => param.key === 'altitude'),
      getCommandParams(MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT).find(param => param.key === 'altitude'),
    ];

    expect(altitudeFields).toHaveLength(8);
    for (const field of altitudeFields) {
      expect(field).toBeDefined();
      expect(field).not.toHaveProperty('max');
    }
  });

  it('keeps command-specific altitude limits for bounded non-target altitude fields', () => {
    expect(getCommandParams(MAV_CMD.NAV_LAND).find(param => param.key === 'param1')?.max).toBe(100);
    expect(getCommandParams(MAV_CMD.NAV_VTOL_LAND).find(param => param.key === 'param3')?.max).toBe(200);
    expect(getCommandParams(MAV_CMD.NAV_PAYLOAD_PLACE).find(param => param.key === 'param1')?.max).toBe(50);
  });
  it('offers each vehicle only the waypoint fields it reads', () => {
    const keys = (v?: 'plane' | 'other') => getCommandParams(MAV_CMD.NAV_WAYPOINT, v).filter((p) => p.show).map((p) => p.key);
    // Plane packs acceptance radius and pass-by where the others keep the hold time
    expect(keys('plane')).toEqual(['altitude', 'param2', 'param3']);
    expect(keys('other')).toEqual(['altitude', 'param1']);
    // planning offline: everything, each marked for its vehicle
    expect(keys()).toEqual(['altitude', 'param1', 'param2', 'param3']);
    expect(getCommandParams(MAV_CMD.NAV_WAYPOINT).find((p) => p.key === 'param3')?.max).toBe(255);
  });
});

