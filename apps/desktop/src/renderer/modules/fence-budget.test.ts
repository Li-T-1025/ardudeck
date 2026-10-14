import { describe, expect, it } from 'vitest';
import { fenceBytes, fenceBudgetFor, fenceCapacityBytes } from './fence-budget';

describe('fence-budget', () => {
  it('capacity by vehicle class from the ArduPilot storage layout', () => {
    expect(fenceCapacityBytes('copter')).toBe(560);
    expect(fenceCapacityBytes('plane')).toBe(672);
    expect(fenceCapacityBytes('rover')).toBe(672);
  });

  it('bytes: header, polygons, circles, return point', () => {
    expect(fenceBytes({ polygons: [], circles: [], returnPoint: null })).toBe(4);
    expect(fenceBytes({ polygons: [{ vertices: [1, 2, 3, 4] }], circles: [], returnPoint: null })).toBe(4 + 2 + 32);
    expect(fenceBytes({ polygons: [], circles: [{}], returnPoint: {} })).toBe(4 + 13 + 9);
  });

  it('budget object', () => {
    const b = fenceBudgetFor('copter', { polygons: [{ vertices: [1, 2, 3] }], circles: [], returnPoint: null });
    expect(b).toEqual({ capacityBytes: 560, usedBytes: 30, bytesPerVertex: 8, bytesPerPolygon: 2 });
  });
});
