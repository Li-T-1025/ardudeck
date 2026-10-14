import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildFleetSurvey, splitPolygonIntoBands } from './survey-fleet-split';
import { registerSurveyGenerator, unregisterSurveyGenerator } from './generator-registry';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type SurveyResult } from './survey-types';
// Registers the built-in patterns the band fallback dispatches to.
import './generators';

const SQUARE = [
  { lat: 53.0, lng: 8.0 },
  { lat: 53.0, lng: 8.01 },
  { lat: 53.01, lng: 8.01 },
  { lat: 53.01, lng: 8.0 },
];

const ENGINE = 'test.fleet-engine';
const STATS: SurveyResult['stats'] = {
  gsd: 1, flightDistance: 100, flightTime: 60, photoCount: 0, lineCount: 1,
  areaCovered: 1000, footprintWidth: 1, footprintHeight: 1, lineSpacing: 1, photoSpacing: 1,
};

function registerEngine(generate: (c: SurveyConfig) => SurveyResult): void {
  registerSurveyGenerator({
    id: ENGINE,
    version: '1',
    displayName: 'Fleet engine',
    description: '',
    capabilities: { supportsHoles: true, supportsWorkspace: true, requiresCamera: false, isAsync: true, isRemote: true, supportsFleet: true },
    generate,
  });
}

const baseConfig = (): Omit<SurveyConfig, 'polygon'> => ({ ...DEFAULT_SURVEY_CONFIG, generatorId: ENGINE });

describe('buildFleetSurvey with a fleet-capable engine', () => {
  let received: SurveyConfig | null = null;
  beforeEach(() => { received = null; });
  afterEach(() => unregisterSurveyGenerator(ENGINE));

  it('hands the fleet to the engine and takes one mission per vehicle back', async () => {
    registerEngine((c) => {
      received = c;
      return {
        waypoints: [],
        photoPositions: [],
        footprints: [],
        stats: STATS,
        fleetMissions: (c.fleet ?? []).map((v, i) => ({
          vehicleKey: v.key,
          waypoints: [
            { lat: 53.001 + i * 0.002, lng: 8.001 },
            { lat: 53.001 + i * 0.002, lng: 8.009 },
          ],
          stats: { flightTime: 120 * (i + 1), areaCovered: 500 },
          warnings: i === 1 ? ['too long'] : [],
        })),
      };
    });
    const fleet = [
      { key: 'a', start: { lat: 53.0005, lng: 8.0005 }, enduranceMinutes: 9 },
      { key: 'b' },
    ];
    const out = await buildFleetSurvey(SQUARE, baseConfig(), ['a', 'b'], { fleet, altitudeStepM: 10 });
    expect(received?.fleet).toEqual([fleet[0], { key: 'b' }]);
    expect(received?.polygon).toEqual(SQUARE);
    expect(out.map((a) => a.vehicleKey)).toEqual(['a', 'b']);
    expect(out.every((a) => a.source === 'engine')).toBe(true);
    expect(out[0]!.flightTime).toBe(120);
    expect(out[1]!.flightTime).toBe(240);
    expect(out[1]!.warnings).toEqual(['too long']);
    expect(out[1]!.altitude).toBe(out[0]!.altitude + 10);
    expect(out[0]!.waypointCount).toBe(2);
    expect(out[0]!.missionItems.length).toBeGreaterThan(0);
  });

  it('falls back to the band split when the engine cannot serve every vehicle', async () => {
    registerEngine((c) => ({
      waypoints: [{ lat: 53.001, lng: 8.001 }, { lat: 53.009, lng: 8.009 }],
      photoPositions: [],
      footprints: [],
      stats: STATS,
      // One mission only, as a single-drone endpoint would give.
      fleetMissions: [{ vehicleKey: c.fleet?.[0]?.key ?? 'a', waypoints: [{ lat: 53.001, lng: 8.001 }, { lat: 53.009, lng: 8.009 }] }],
    }));
    const out = await buildFleetSurvey(SQUARE, baseConfig(), ['a', 'b'], { fleet: [{ key: 'a' }, { key: 'b' }] });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((a) => a.source === 'bands')).toBe(true);
  });

  it('still cuts bands for a plain generator', () => {
    expect(splitPolygonIntoBands(SQUARE, 2)).toHaveLength(2);
  });
});
