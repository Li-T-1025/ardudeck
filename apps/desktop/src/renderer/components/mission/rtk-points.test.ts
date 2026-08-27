import { describe, it, expect } from 'vitest';
import { parseSurveyedPoints } from './rtk-points';

describe('parseSurveyedPoints', () => {
  it('parses plain decimal lat,lng lines', () => {
    const r = parseSurveyedPoints('53.397635, 8.136100\n53.397841 8.136433');
    expect(r.points).toEqual([
      { lat: 53.397635, lng: 8.1361, label: null },
      { lat: 53.397841, lng: 8.136433, label: null },
    ]);
    expect(r.skipped).toEqual([]);
  });

  it('handles semicolon CSV with labels and decimal commas', () => {
    const r = parseSurveyedPoints('P1; 53,397635; 8,136100\nP2;53,397841;8,136433');
    expect(r.points).toHaveLength(2);
    expect(r.points[0]).toEqual({ lat: 53.397635, lng: 8.1361, label: 'P1' });
    expect(r.points[1]!.label).toBe('P2');
  });

  it('takes free-form labels with digits without eating them as coordinates', () => {
    const r = parseSurveyedPoints('P1 53.397635 8.136100');
    expect(r.points).toEqual([{ lat: 53.397635, lng: 8.1361, label: 'P1' }]);
  });

  it('ignores trailing altitude/extra columns', () => {
    const r = parseSurveyedPoints('53.397635\t8.136100\t12.34\tfix');
    expect(r.points).toEqual([{ lat: 53.397635, lng: 8.1361, label: 'fix' }]);
  });

  it('swaps lng,lat when the first number cannot be a latitude', () => {
    const r = parseSurveyedPoints('136.5, 35.2');
    expect(r.points[0]!.lat).toBeCloseTo(35.2);
    expect(r.points[0]!.lng).toBeCloseTo(136.5);
  });

  it('skips comments, blanks, headers and 0,0 fixes, reporting line numbers', () => {
    const r = parseSurveyedPoints('# survey 2026\nname,lat,lng\n53.1, 8.1\n0, 0\n\n999, 999');
    expect(r.points).toHaveLength(1);
    expect(r.skipped).toEqual([2, 4, 6]);
  });
});
