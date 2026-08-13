import { describe, expect, it } from 'vitest';
import { computeGeomagneticField } from './wmm';

/**
 * Official NOAA NCEI WMM2025 test values (WMM2025_TestValues.txt, shipped inside
 * WMM2025COF.zip). Each row: decimal year, altitude (km), lat, lon, expected
 * declination, inclination, horizontal intensity, total intensity. A spread of
 * dates across the model validity window and both hemispheres including high
 * latitude. Published D/I are given to 2 decimals, so declination/inclination
 * are checked to 0.02 deg and intensities to 1 nT.
 */
interface TestPoint {
  year: number;
  altKm: number;
  lat: number;
  lon: number;
  decl: number;
  incl: number;
  h: number;
  f: number;
}

const TEST_POINTS: TestPoint[] = [
  { year: 2025.0, altKm: 28, lat: 89, lon: -121, decl: -99.77, incl: 88.47, h: 1504.298146, f: 56214.419888 },
  { year: 2025.0, altKm: 65, lat: 43, lon: 93, decl: 0.5, incl: 64.1, h: 24300.764692, f: 55626.621348 },
  { year: 2025.0, altKm: 51, lat: -33, lon: 109, decl: -5.49, incl: -67.5, h: 21838.046477, f: 57054.752538 },
  { year: 2026.0, altKm: 74, lat: -57, lon: 3, decl: -22.51, incl: -58.65, h: 14362.206593, f: 27606.226129 },
  { year: 2026.0, altKm: 69, lat: 23, lon: 63, decl: 1.17, incl: 35.92, h: 34565.858527, f: 42684.54936 },
  { year: 2027.0, altKm: 44, lat: 22, lon: 174, decl: 6.46, incl: 31.89, h: 28867.487799, f: 33999.066253 },
  { year: 2027.5, altKm: 8, lat: 62, lon: 53, decl: 19.39, incl: 76.67, h: 12997.751893, f: 56368.814385 },
  { year: 2028.0, altKm: 49, lat: 20, lon: 167, decl: 5.1, incl: 26.82, h: 30251.262453, f: 33898.298187 },
  { year: 2029.0, altKm: 58, lat: 32, lon: 19, decl: 4.11, incl: 46.03, h: 29434.989012, f: 42393.219362 },
  { year: 2029.5, altKm: 33, lat: 17, lon: 5, decl: 0.89, incl: 13.77, h: 34026.126581, f: 35033.582023 },
];

// Invert toDecimalYear so we can drive the API (which takes a Date) with the
// exact decimal years the official table uses.
function dateFromDecimalYear(dy: number): Date {
  const yearInt = Math.floor(dy);
  const base = Date.UTC(yearInt, 0, 1);
  return new Date(base + (dy - yearInt) * 1000 * 3600 * 24 * 365);
}

describe('WMM2025 field synthesis', () => {
  for (const p of TEST_POINTS) {
    it(`matches NOAA test value at ${p.lat},${p.lon} (${p.year})`, () => {
      const field = computeGeomagneticField(p.lat, p.lon, dateFromDecimalYear(p.year), p.altKm);
      expect(field.declinationDeg).toBeCloseTo(p.decl, 1);
      expect(field.inclinationDeg).toBeCloseTo(p.incl, 1);
      expect(Math.abs(field.horizontalIntensityNt - p.h)).toBeLessThan(1);
      expect(Math.abs(field.totalIntensityNt - p.f)).toBeLessThan(1);
    });
  }
});
