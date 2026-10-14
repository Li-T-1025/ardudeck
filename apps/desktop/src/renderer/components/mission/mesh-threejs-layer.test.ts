import { describe, expect, it } from 'vitest';
import maplibregl from 'maplibre-gl';
import { meshLocalPlacement } from './mesh-threejs-layer';

describe('meshLocalPlacement', () => {
  it('maps an origin east and south of the reference into local metres, altitude up', () => {
    const ref = maplibregl.MercatorCoordinate.fromLngLat([8.47, 53.27], 0);
    const s = ref.meterInMercatorCoordinateUnits();
    const p = meshLocalPlacement({ lat: 53.2691, lng: 8.4715, altMsl: 40 }, { x: ref.x, y: ref.y, z: ref.z, s }, 90, 1);
    expect(p.x).toBeGreaterThan(90);
    expect(p.x).toBeLessThan(110);
    expect(p.z).toBeGreaterThan(90);
    expect(p.z).toBeLessThan(110);
    expect(p.y).toBeCloseTo(40, 6);
    expect(p.rotY).toBeCloseTo(-Math.PI / 2, 9);
  });
});
