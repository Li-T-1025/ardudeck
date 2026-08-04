import { describe, it, expect } from 'vitest';
import { tierFromDistance } from './marker-tier';

describe('marker tier from nearest-neighbor distance', () => {
  it('maps plain thresholds with no previous tier', () => {
    expect(tierFromDistance(200)).toBe('full');
    expect(tierFromDistance(71)).toBe('full');
    expect(tierFromDistance(70)).toBe('medium');
    expect(tierFromDistance(28)).toBe('medium');
    expect(tierFromDistance(27)).toBe('dot');
    expect(tierFromDistance(0)).toBe('dot');
    expect(tierFromDistance(Infinity)).toBe('full');
  });

  it('holds the current tier inside the 6px hysteresis band', () => {
    // Just below the full boundary: a full marker stays full, but a fresh marker is medium.
    expect(tierFromDistance(66, 'full')).toBe('full');
    expect(tierFromDistance(66, 'medium')).toBe('medium');
    // Just above the dot boundary: a dot stays a dot until it clears the band.
    expect(tierFromDistance(32, 'dot')).toBe('dot');
    expect(tierFromDistance(32, 'medium')).toBe('medium');
  });

  it('switches once the band is crossed', () => {
    expect(tierFromDistance(77, 'medium')).toBe('full');
    expect(tierFromDistance(63, 'full')).toBe('medium');
    expect(tierFromDistance(35, 'dot')).toBe('medium');
    expect(tierFromDistance(21, 'medium')).toBe('dot');
  });

  it('can jump straight between full and dot', () => {
    expect(tierFromDistance(10, 'full')).toBe('dot');
    expect(tierFromDistance(90, 'dot')).toBe('full');
  });
});
