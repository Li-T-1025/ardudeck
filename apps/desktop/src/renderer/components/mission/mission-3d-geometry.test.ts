import { describe, it, expect } from 'vitest';
import { buildMission3D, itemAltMsl, altitudeForMsl, homeAltitudeMsl } from './mission-3d-geometry';
import { buildPathLegs } from './mission-path';
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../../shared/mission-types';

const item = (seq: number, lat: number, lon: number, alt: number, frame: number = MAV_FRAME.GLOBAL_RELATIVE_ALT, command: number = MAV_CMD.NAV_WAYPOINT): MissionItem =>
  ({ seq, command, frame, latitude: lat, longitude: lon, altitude: alt, param1: 0, param2: 0, param3: 0, param4: 0, current: false, autocontinue: true } as MissionItem);

// ground rises 1 m per 0.0001 deg east of 10.0
const ground = (_lat: number, lon: number) => 100 + (lon - 10) * 10_000;
const home = { lat: 50, lon: 10, alt: 0 };

describe('3D mission heights', () => {
  it('puts each frame at its real height', () => {
    expect(itemAltMsl(item(1, 50, 10.001, 50), 50, 10.001, ground, 100)).toBe(150);
    expect(itemAltMsl(item(1, 50, 10.001, 50, MAV_FRAME.GLOBAL_TERRAIN_ALT), 50, 10.001, ground, 100)).toBeCloseTo(160, 6);
    expect(itemAltMsl(item(1, 50, 10.001, 500, MAV_FRAME.GLOBAL), 50, 10.001, ground, 100)).toBe(500);
  });

  it('uses the ground at home when home has no altitude', () => {
    expect(homeAltitudeMsl(home, ground)).toBe(100);
    expect(homeAltitudeMsl({ ...home, alt: 432 }, ground)).toBe(432);
  });

  it('bends a terrain-following leg with the ground, keeps a relative leg straight', () => {
    const terrain = [item(0, 50, 10, 30, MAV_FRAME.GLOBAL_TERRAIN_ALT), item(1, 50, 10.01, 30, MAV_FRAME.GLOBAL_TERRAIN_ALT)];
    const g = buildMission3D(terrain, buildPathLegs(terrain), home, ground);
    const pts = g.lines[0]!.points;
    expect(pts.length).toBeGreaterThan(2);
    for (const p of pts) expect(p.alt - ground(p.lat, p.lon)).toBeCloseTo(30, 6);

    const rel = [item(0, 50, 10, 30), item(1, 50, 10.01, 30)];
    const r = buildMission3D(rel, buildPathLegs(rel), home, ground);
    expect(r.lines[0]!.points).toHaveLength(2);
    expect(r.lines[0]!.points.every((p) => p.alt === 130)).toBe(true);
  });

  it('draws no leg across a return, like the 2D map', () => {
    const items = [item(0, 50, 10, 30), item(1, 50, 10.001, 30), item(2, 0, 0, 0, MAV_FRAME.GLOBAL_RELATIVE_ALT, MAV_CMD.NAV_RETURN_TO_LAUNCH), item(3, 50, 10.002, 30)];
    const g = buildMission3D(items, buildPathLegs(items), home, ground);
    expect(g.lines).toHaveLength(1);
  });

  it('shows a takeoff without a position at home, at its climb height', () => {
    const items = [item(0, 0, 0, 25, MAV_FRAME.GLOBAL_RELATIVE_ALT, MAV_CMD.NAV_TAKEOFF), item(1, 50, 10.001, 30)];
    const g = buildMission3D(items, buildPathLegs(items), home, ground);
    const t = g.waypoints.find((w) => w.seq === 0)!;
    expect(t.atHome).toBe(true);
    expect([t.lat, t.lon, t.alt]).toEqual([50, 10, 125]);
  });

  it('draws a loiter circle at the loiter height', () => {
    const loiter = { ...item(0, 50, 10.001, 40), command: MAV_CMD.NAV_LOITER_UNLIM, param3: 60 };
    const g = buildMission3D([loiter], [], home, ground);
    expect(g.lines).toHaveLength(1);
    expect(g.lines[0]!.points.every((p) => p.alt === 140)).toBe(true);
  });

  it('turns a dragged height back into the item frame', () => {
    expect(altitudeForMsl(item(0, 0, 0, 0), 180, 120, 100)).toBe(80);
    expect(altitudeForMsl(item(0, 0, 0, 0, MAV_FRAME.GLOBAL_TERRAIN_ALT), 180, 120, 100)).toBe(60);
    expect(altitudeForMsl(item(0, 0, 0, 0, MAV_FRAME.GLOBAL), 180, 120, 100)).toBe(180);
  });
});
