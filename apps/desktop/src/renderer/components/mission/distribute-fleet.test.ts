import { describe, it, expect } from 'vitest';
import { splitMissionForFleet } from './distribute-fleet';
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../../shared/mission-types';

let seq = 0;
function item(command: number, lat = 0, lng = 0, overrides: Partial<MissionItem> = {}): MissionItem {
  return {
    seq: seq++,
    command,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    latitude: lat,
    longitude: lng,
    altitude: 30,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    autocontinue: 1,
    current: 0,
    ...overrides,
  } as MissionItem;
}

/** Takeoff, WP1 + speed + camtrig, WPs 2..n, cam-off, RTL - the survey shape. */
function surveyMission(wpCount: number): MissionItem[] {
  seq = 0;
  const items: MissionItem[] = [item(MAV_CMD.NAV_TAKEOFF)];
  for (let i = 0; i < wpCount; i++) {
    items.push(item(MAV_CMD.NAV_WAYPOINT, 53 + i * 0.001, 8));
    if (i === 0) {
      items.push(item(MAV_CMD.DO_CHANGE_SPEED, 0, 0, { param2: 7 }));
      items.push(item(MAV_CMD.DO_SET_CAM_TRIGG_DIST, 0, 0, { param1: 9 }));
    }
  }
  items.push(item(MAV_CMD.DO_SET_CAM_TRIGG_DIST)); // cam off
  items.push(item(MAV_CMD.NAV_RETURN_TO_LAUNCH));
  return items;
}

describe('splitMissionForFleet', () => {
  it('every chunk is a complete flyable mission: takeoff, config, waypoints, cam-off, RTL', () => {
    const chunks = splitMissionForFleet(surveyMission(12), 3);
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) {
      expect(chunk[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
      expect(chunk[chunk.length - 1]!.command).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
      expect(chunk[chunk.length - 2]!.command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
      expect(chunk.some((it) => it.command === MAV_CMD.DO_CHANGE_SPEED)).toBe(true);
      expect(chunk.filter((it) => it.command === MAV_CMD.NAV_WAYPOINT).length).toBeGreaterThan(0);
    }
  });

  it('covers all waypoints exactly once, in order', () => {
    const src = surveyMission(10);
    const chunks = splitMissionForFleet(src, 3);
    const lats = chunks.flat().filter((it) => it.command === MAV_CMD.NAV_WAYPOINT).map((it) => it.latitude);
    const srcLats = src.filter((it) => it.command === MAV_CMD.NAV_WAYPOINT).map((it) => it.latitude);
    expect(lats).toEqual(srcLats);
  });

  it('does not replicate waypoint-specific children (CONDITION_YAW) into other chunks', () => {
    seq = 0;
    const items = [
      item(MAV_CMD.NAV_TAKEOFF),
      item(MAV_CMD.NAV_WAYPOINT, 53.0, 8),
      item(MAV_CMD.CONDITION_YAW, 0, 0, { param1: 120 }),
      item(MAV_CMD.NAV_WAYPOINT, 53.001, 8),
      item(MAV_CMD.NAV_WAYPOINT, 53.002, 8),
      item(MAV_CMD.NAV_WAYPOINT, 53.003, 8),
      item(MAV_CMD.NAV_RETURN_TO_LAUNCH),
    ];
    const chunks = splitMissionForFleet(items, 2);
    const yaws = chunks.flat().filter((it) => it.command === MAV_CMD.CONDITION_YAW);
    expect(yaws).toHaveLength(1);
  });

  it('returns the whole mission unsplit when there are fewer waypoints than vehicles', () => {
    const src = surveyMission(2);
    const chunks = splitMissionForFleet(src, 4);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(src.length);
  });

  it('balances chunks by path length, not item count', () => {
    // 3 long legs then 9 short ones: equal-count split would be lopsided.
    seq = 0;
    const items: MissionItem[] = [];
    let lat = 53;
    for (let i = 0; i < 12; i++) {
      lat += i < 3 ? 0.01 : 0.001;
      items.push(item(MAV_CMD.NAV_WAYPOINT, lat, 8));
    }
    const chunks = splitMissionForFleet(items, 2);
    const count0 = chunks[0]!.length;
    const count1 = chunks[1]!.length;
    // The long-leg half should hold far fewer waypoints.
    expect(count0).toBeLessThan(count1);
  });
});
