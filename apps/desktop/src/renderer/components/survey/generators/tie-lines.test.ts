import { describe, it, expect } from 'vitest';
import { generateGrid } from './grid-generator';
import { generateCrosshatch } from './crosshatch-generator';
import { surveyToMissionItems } from '../mission-builder';
import { MAGNETOMETER_SENSOR } from '../camera-presets';
import { BUILTIN_SURVEY_PRESETS } from '../survey-presets';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type LatLng } from '../survey-types';
import { latLngToLocal, polygonCentroid } from '../geo-math';
import { MAV_CMD } from '../../../../shared/mission-types';

// ~300 m square near 47N.
const SQUARE: LatLng[] = [
  { lat: 47.0000, lng: 8.0000 },
  { lat: 47.0000, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0000 },
];

function mag(over: Partial<SurveyConfig> = {}): SurveyConfig {
  return { ...DEFAULT_SURVEY_CONFIG, polygon: SQUARE, pattern: 'grid', camera: { ...MAGNETOMETER_SENSOR, lineSpacing: 25 }, gridAngle: 0, overshoot: 20, leadIn: 0, ...over };
}

const local = (p: LatLng) => latLngToLocal(polygonCentroid(SQUARE), p);
function dir(wps: LatLng[], start: number): { x: number; y: number } {
  const a = local(wps[start]!), b = local(wps[start + 1]!);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

describe('grid tie lines', () => {
  it('adds no tie lines when off', () => {
    const r = generateGrid(mag({ tieLineEvery: 0 }));
    expect(r.tieLineStarts).toBeUndefined();
  });

  it('adds perpendicular tie lines after the survey lines at N x line spacing', () => {
    const base = generateGrid(mag({ tieLineEvery: 0 }));
    const r = generateGrid(mag({ tieLineEvery: 4 }));
    const ties = r.tieLineStarts!;
    // ~300 m across at 100 m tie spacing: 3 or 4 tie lines.
    expect(ties.length).toBeGreaterThanOrEqual(3);
    expect(ties.length).toBeLessThanOrEqual(4);
    expect(r.stats.lineCount).toBe(base.stats.lineCount + ties.length);
    // The survey lines come first, unchanged.
    expect(r.waypoints.slice(0, base.waypoints.length)).toEqual(base.waypoints);
    expect(Math.min(...ties)).toBeGreaterThanOrEqual(base.waypoints.length);

    const survey = dir(r.waypoints, r.legStarts![0]!);
    for (const s of ties) {
      const tie = dir(r.waypoints, s);
      expect(Math.abs(survey.x * tie.x + survey.y * tie.y)).toBeLessThan(0.02);
    }
    // Neighbouring tie lines sit one tie spacing apart, measured across them.
    const t0 = dir(r.waypoints, ties[0]!);
    const across = (i: number) => {
      const p = local(r.waypoints[i]!);
      return -t0.y * p.x + t0.x * p.y;
    };
    const offsets = ties.map(across).sort((a, b) => a - b);
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]! - offsets[i - 1]!).toBeCloseTo(100, 0);
  });

  it('enters the tie lines from the end nearest the last survey line', () => {
    const base = generateGrid(mag({ tieLineEvery: 0 }));
    const r = generateGrid(mag({ tieLineEvery: 4 }));
    const last = local(base.waypoints[base.waypoints.length - 1]!);
    const first = local(r.waypoints[r.tieLineStarts![0]!]!);
    const far = local(r.waypoints[r.waypoints.length - 1]!);
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeLessThan(Math.hypot(far.x - last.x, far.y - last.y));
  });

  it('leaves crosshatch alone', () => {
    const r = generateCrosshatch(mag({ pattern: 'crosshatch', tieLineEvery: 4 }));
    expect(r.tieLineStarts).toBeUndefined();
  });
});

describe('magnetometer sensor', () => {
  it('takes no photos and spaces lines by the set distance', () => {
    const r = generateGrid(mag());
    expect(r.photoPositions).toHaveLength(0);
    expect(r.stats.lineSpacing).toBe(25);
  });

  it('builds an aircraft mission with takeoff and no camera trigger', () => {
    const config = mag({ tieLineEvery: 10 });
    const items = surveyToMissionItems(generateGrid(config), config);
    expect(items.some((it) => it.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST)).toBe(false);
    expect(items[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
  });

  it('ships as a built-in preset: grid, terrain follow, tie lines every 10', () => {
    const p = BUILTIN_SURVEY_PRESETS.find((x) => x.id === 'magnetometer')!;
    expect(p.camera?.lineSpacing).toBe(25);
    expect(p.config).toMatchObject({ pattern: 'grid', altitude: 30, speed: 6, terrainFollow: true, tieLineEvery: 10 });
  });
});
