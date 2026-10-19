import { describe, it, expect } from 'vitest';
import { computeCameraTriggerPoints } from './camera-triggers';
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../../shared/mission-types';

let seq = 0;
const it_ = (command: number, lat = 0, lng = 0, p1 = 0, p3 = 0): MissionItem => ({
  seq: seq++, command, frame: MAV_FRAME.GLOBAL_RELATIVE_ALT, current: false, autocontinue: true,
  param1: p1, param2: 0, param3: p3, param4: 0, latitude: lat, longitude: lng, altitude: 50,
});
const wp = (lng: number) => it_(MAV_CMD.NAV_WAYPOINT, 0.001, lng);
const cam = (dist: number) => it_(MAV_CMD.DO_SET_CAM_TRIGG_DIST, 0, 0, dist);
const M = (180 / Math.PI / 6_371_000) * 1.000001; // one metre of longitude at the equator, as distanceM measures it

describe('camera trigger points', () => {
  it('fires every set distance while the camera is on, and not after it is switched off', () => {
    const items = [wp(0), cam(10), wp(100 * M), cam(0), wp(200 * M)];
    expect(computeCameraTriggerPoints(items)).toHaveLength(10);
  });

  it('carries the distance across a corner, as ArduPilot does', () => {
    const items = [wp(0), cam(10), wp(15 * M), wp(30 * M)];
    expect(computeCameraTriggerPoints(items)).toHaveLength(3);
  });

  it('spreads a capped set over the whole mission', () => {
    const items = [wp(0), cam(1), wp(10_000 * M)];
    const pts = computeCameraTriggerPoints(items, 500);
    expect(pts.length).toBeLessThanOrEqual(500);
    expect(pts.length).toBeGreaterThan(400);
    expect(pts[pts.length - 1]!.lng).toBeGreaterThan(9_000 * M);
  });

  it('nothing when the mission never turns the camera on', () => {
    expect(computeCameraTriggerPoints([wp(0), wp(100 * M)])).toHaveLength(0);
  });
});
