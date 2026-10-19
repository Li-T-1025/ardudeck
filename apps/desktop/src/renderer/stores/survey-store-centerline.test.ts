import { describe, it, expect, beforeEach } from 'vitest';
import { dedupeConsecutive, minSurveyPoints, useSurveyStore } from './survey-store';

beforeEach(() => {
  useSurveyStore.setState({ drawingVertices: [], polygon: null });
});

describe('corridor centreline', () => {
  it('needs 2 points as a line, an area still needs 3', () => {
    expect(minSurveyPoints('corridor')).toBe(2);
    expect(minSurveyPoints('panorama')).toBe(2);
    expect(minSurveyPoints('grid')).toBe(3);
  });

  it('drops a point repeated by a double click', () => {
    const a = { lat: 50, lng: 8 }, b = { lat: 50.001, lng: 8 };
    expect(dedupeConsecutive([a, b, b, { ...b }])).toEqual([a, b]);
  });

  it('finishes a 2-point corridor, refuses a 2-point area', () => {
    const s = useSurveyStore.getState();
    const a = { lat: 50, lng: 8 }, b = { lat: 50.001, lng: 8 };
    useSurveyStore.setState({ config: { ...s.config, pattern: 'corridor' }, drawingVertices: [a, b, b] });
    useSurveyStore.getState().completePolygon();
    expect(useSurveyStore.getState().polygon).toEqual([a, b]);

    useSurveyStore.setState({ polygon: null, config: { ...s.config, pattern: 'grid' }, drawingVertices: [a, b] });
    useSurveyStore.getState().completePolygon();
    expect(useSurveyStore.getState().polygon).toBeNull();
  });
});
