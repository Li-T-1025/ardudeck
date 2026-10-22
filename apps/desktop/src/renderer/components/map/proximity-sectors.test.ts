import { describe, it, expect } from 'vitest';
import type { DistanceSensorData } from '../../../shared/telemetry-types';
import {
  SENSOR_STALE_MS,
  closestProximitySector,
  destinationLatLng,
  proximityAnyLive,
  proximityTone,
  resolveProximitySectors,
  sectorArcLatLngs,
} from './proximity-sectors';

const NOW = 100_000;

function reading(orientation: number, distance: number, ageMs = 0, max = 10): DistanceSensorData {
  return { distance, min: 0.2, max, orientation, quality: null, receivedAt: NOW - ageMs };
}

describe('resolveProximitySectors', () => {
  it('places a live obstacle at its fraction of the sensor range', () => {
    const sectors = resolveProximitySectors({ 0: reading(0, 2.5) }, NOW, true);
    expect(sectors).toHaveLength(8);
    expect(sectors[0]).toEqual({ index: 0, distance: 2.5, max: 10, fraction: 0.25 });
    expect(sectors[1]).toEqual({ index: 1, distance: null, max: null, fraction: null });
  });

  it('treats a reading at the sensor range as a clear sector that still has a range', () => {
    const nose = resolveProximitySectors({ 0: reading(0, 10) }, NOW, true)[0]!;
    expect(nose.distance).toBeNull();
    expect(nose.max).toBe(10);
  });

  it('drops a reading older than the stale timeout, and everything without a link', () => {
    expect(resolveProximitySectors({ 3: reading(3, 1, SENSOR_STALE_MS + 1) }, NOW, true)[3]!.distance).toBeNull();
    expect(resolveProximitySectors({ 3: reading(3, 1) }, NOW, false)[3]!.distance).toBeNull();
  });
});

describe('proximityAnyLive and closest', () => {
  it('counts a fresh clear sector as live, a stale one not', () => {
    expect(proximityAnyLive({ 0: reading(0, 10) }, NOW, true)).toBe(true);
    expect(proximityAnyLive({ 0: reading(0, 10, SENSOR_STALE_MS) }, NOW, true)).toBe(false);
  });

  it('picks the nearest obstacle', () => {
    const sectors = resolveProximitySectors({ 0: reading(0, 4), 5: reading(5, 1.5), 6: reading(6, 10) }, NOW, true);
    expect(closestProximitySector(sectors)?.index).toBe(5);
    expect(closestProximitySector(resolveProximitySectors({}, NOW, true))).toBeNull();
  });
});

describe('proximityTone', () => {
  it('mirrors the instrument thresholds: red to 2 m, amber to 5 m', () => {
    expect(proximityTone(2)).toBe('red');
    expect(proximityTone(2.01)).toBe('amber');
    expect(proximityTone(5)).toBe('amber');
    expect(proximityTone(5.01)).toBe('green');
  });
});

describe('sector geometry', () => {
  it('moves 100 m north by about 0.0009 degrees of latitude', () => {
    const [lat, lon] = destinationLatLng(47, 9, 0, 100);
    expect(lat - 47).toBeCloseTo(0.000899, 5);
    expect(lon).toBeCloseTo(9, 6);
  });

  it('spans an arc centred on the bearing', () => {
    const arc = sectorArcLatLngs(47, 9, 90, 50, 20, 4);
    expect(arc).toHaveLength(5);
    const [midLat, midLon] = arc[2]!;
    expect(midLat).toBeCloseTo(47, 5);
    expect(midLon).toBeGreaterThan(9);
    expect(arc[0]![0]).toBeGreaterThan(arc[4]![0]);
  });
});
