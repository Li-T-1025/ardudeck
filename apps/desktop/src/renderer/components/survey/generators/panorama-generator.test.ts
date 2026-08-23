import { describe, it, expect } from 'vitest';
import { generatePanorama } from './panorama-generator';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig } from '../survey-types';
import { distanceLatLng } from '../geo-math';

// Straight west-to-east subject line at the equator-ish latitude; flying on the
// 'right' side (drawing direction = east) means SOUTH of the line.
const subject = [
  { lat: 50, lng: 8 },
  { lat: 50, lng: 8.001 },
  { lat: 50, lng: 8.002 },
];

function makeConfig(overrides: Partial<SurveyConfig> = {}): SurveyConfig {
  return {
    ...DEFAULT_SURVEY_CONFIG,
    polygon: subject,
    pattern: 'panorama',
    altitude: 40,
    panoramaSide: 'right',
    panoramaStandoff: 30,
    ...overrides,
  };
}

describe('generatePanorama', () => {
  it('derives the flight path on the chosen side at the standoff distance', () => {
    const result = generatePanorama(makeConfig());
    expect(result.waypoints.length).toBeGreaterThanOrEqual(2);
    for (const wp of result.waypoints) {
      expect(wp.lat).toBeLessThan(50); // right of eastward travel = south
      const d = distanceLatLng(wp, { lat: 50, lng: wp.lng });
      expect(d).toBeGreaterThan(25);
      expect(d).toBeLessThan(35);
    }
    const left = generatePanorama(makeConfig({ panoramaSide: 'left' }));
    for (const wp of left.waypoints) expect(wp.lat).toBeGreaterThan(50);
  });

  it('yaws every waypoint at the subject line', () => {
    const result = generatePanorama(makeConfig());
    expect(result.waypointYaws).toHaveLength(result.waypoints.length);
    // Flying south of a west-east line, the camera must face north (~0/360).
    for (const yaw of result.waypointYaws!) {
      const northError = Math.min(yaw, 360 - yaw);
      expect(northError).toBeLessThan(10);
    }
  });

  it('spaces photos from the slant-range footprint and front overlap', () => {
    const config = makeConfig();
    const result = generatePanorama(config);
    const slant = Math.hypot(30, 40);
    const footprintW = (config.camera.sensorWidth / config.camera.focalLength) * slant;
    const expected = footprintW * (1 - config.frontOverlap / 100);
    expect(result.stats.photoSpacing).toBeCloseTo(expected, 3);
    expect(result.photoPositions.length).toBeGreaterThan(0);
    expect(result.stats.lineCount).toBe(1);
    // Capture band drawn around the subject, not the flight path.
    expect(result.footprints.length).toBe(1);
  });

  it('returns empty for a degenerate line', () => {
    const result = generatePanorama(makeConfig({ polygon: [{ lat: 50, lng: 8 }] }));
    expect(result.waypoints).toHaveLength(0);
  });
});
