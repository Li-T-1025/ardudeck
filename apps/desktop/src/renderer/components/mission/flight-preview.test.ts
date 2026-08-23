import { describe, it, expect } from 'vitest';
import { buildFlightTimeline, sampleTimeline } from './flight-preview';
import { MAV_CMD, MAV_FRAME, type MissionItem } from '../../../shared/mission-types';

function item(partial: Partial<MissionItem>): MissionItem {
  return {
    seq: 0, frame: MAV_FRAME.GLOBAL_RELATIVE_ALT, command: MAV_CMD.NAV_WAYPOINT,
    current: false, autocontinue: true,
    param1: 0, param2: 0, param3: 0, param4: 0,
    latitude: 0, longitude: 0, altitude: 50,
    ...partial,
  };
}

// Two waypoints ~111 m apart (0.001 deg lat), flown at 10 m/s.
const MISSION: MissionItem[] = [
  item({ latitude: 50, longitude: 8 }),
  item({ command: MAV_CMD.DO_CHANGE_SPEED, param2: 10 }),
  item({ command: MAV_CMD.CONDITION_YAW, param1: 90 }),
  item({ latitude: 50.001, longitude: 8 }),
];

describe('buildFlightTimeline', () => {
  it('times legs from DO_CHANGE_SPEED and carries CONDITION_YAW as camera heading', () => {
    const tl = buildFlightTimeline(MISSION, 5);
    expect(tl.segments).toHaveLength(1);
    const seg = tl.segments[0]!;
    expect(seg.t1 - seg.t0).toBeCloseTo(11130, -2); // ~111.3 m / 10 m/s
    expect(seg.trackHeading).toBeCloseTo(0, 0); // due north
    expect(seg.camHeading).toBe(90); // camera east, decoupled from track
  });

  it('ignores DO items without location and holds at waypoints with param1', () => {
    const tl = buildFlightTimeline(
      [item({ latitude: 50, longitude: 8 }), item({ latitude: 50.001, longitude: 8, param1: 5 })],
      10,
    );
    expect(tl.segments).toHaveLength(2);
    expect(tl.segments[1]!.hold).toBe(true);
    expect(tl.segments[1]!.t1 - tl.segments[1]!.t0).toBe(5000);
  });

  it('tracks an ROI continuously: camera heading changes smoothly along the leg', () => {
    // Fly north past an ROI to the east: heading must sweep from NE toward SE.
    const tl = buildFlightTimeline(
      [
        item({ latitude: 50, longitude: 8 }),
        item({ command: MAV_CMD.DO_SET_ROI, latitude: 50.0005, longitude: 8.001 }),
        item({ latitude: 50.001, longitude: 8 }),
      ],
      10,
    );
    const early = sampleTimeline(tl, tl.durationMs * 0.1)!;
    const late = sampleTimeline(tl, tl.durationMs * 0.9)!;
    expect(early.camHeading).toBeGreaterThan(30);
    expect(early.camHeading).toBeLessThan(90); // ahead-right
    expect(late.camHeading).toBeGreaterThan(90); // behind-right
    expect(late.camHeading).toBeLessThan(180);
    expect(late.camHeading).not.toBeCloseTo(early.camHeading, 0);
  });

  it('zero-coordinate DO_SET_ROI cancels tracking', () => {
    const tl = buildFlightTimeline(
      [
        item({ latitude: 50, longitude: 8 }),
        item({ command: MAV_CMD.DO_SET_ROI, latitude: 50.0005, longitude: 8.001 }),
        item({ latitude: 50.001, longitude: 8 }),
        item({ command: MAV_CMD.DO_SET_ROI, latitude: 0, longitude: 0 }),
        item({ latitude: 50.002, longitude: 8 }),
      ],
      10,
    );
    const lastSeg = tl.segments[tl.segments.length - 1]!;
    expect(lastSeg.roi).toBeNull();
    const end = sampleTimeline(tl, tl.durationMs * 0.99)!;
    expect(end.camHeading).toBeCloseTo(0, 0); // back to along-track (north)
  });

  it('samples position mid-leg', () => {
    const tl = buildFlightTimeline(MISSION, 5);
    const mid = sampleTimeline(tl, tl.durationMs / 2)!;
    expect(mid.lat).toBeCloseTo(50.0005, 5);
    expect(mid.camHeading).toBe(90);
    const end = sampleTimeline(tl, tl.durationMs * 2)!;
    expect(end.lat).toBeCloseTo(50.001, 6);
  });
});
