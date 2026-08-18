import { describe, it, expect } from 'vitest';
import { tileToQuadkey, resolveTileUrl, getMapLibreTileUrl } from '../map-layers';

describe('Bing quadkey tiles', () => {
  it('computes quadkeys per the Bing tile system reference', () => {
    // Worked example from Microsoft's Bing Tile System docs
    expect(tileToQuadkey(3, 3, 5)).toBe('213');
    expect(tileToQuadkey(1, 0, 0)).toBe('0');
    expect(tileToQuadkey(1, 1, 1)).toBe('3');
    expect(tileToQuadkey(2, 3, 0)).toBe('11');
  });

  it('resolves bingSat URLs with quadkey and rotated subdomain', () => {
    const url = resolveTileUrl('bingSat', 3, 3, 5);
    expect(url).toBe('https://ecn.t0.tiles.virtualearth.net/tiles/a213.jpeg?g=14364&n=z');
  });

  it('leaves z/x/y layers untouched by the quadkey path', () => {
    expect(resolveTileUrl('googleSat', 3, 3, 5)).toBe('https://mt0.google.com/vt/lyrs=s&x=3&y=5&z=3');
  });

  it('emits the MapLibre-native {quadkey} token for MapLibre consumers', () => {
    expect(getMapLibreTileUrl('bingSat')).toBe('https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=14364&n=z');
  });
});
