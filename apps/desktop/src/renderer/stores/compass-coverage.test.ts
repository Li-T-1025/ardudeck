import { describe, it, expect } from 'vitest';
import { coveragePct, slowestCompassProgress, type CompassCoverage } from './compass-coverage-store';

function coverage(sections: number, completionPct = 0): CompassCoverage {
  // Fill the first `sections` bits of the 10-byte mask.
  const mask = new Array(10).fill(0);
  for (let i = 0; i < sections; i++) mask[Math.floor(i / 8)] |= 1 << (i % 8);
  return { mask, direction: null, completionPct };
}

describe('coveragePct', () => {
  it('reports coverage out of the 80 sections', () => {
    expect(coveragePct(coverage(0))).toBe(0);
    expect(coveragePct(coverage(40))).toBe(50);
    expect(coveragePct(coverage(80))).toBe(100);
  });
});

describe('slowestCompassProgress', () => {
  it('is null before any frame arrives', () => {
    expect(slowestCompassProgress(new Map())).toBeNull();
  });

  it('does not sit at zero while the sphere is filling', () => {
    // The reported bug: ArduPilot's completion_pct tracks the sphere FIT, not
    // the rotation, so it stays 0 for most of a run. Reading it alone put "0%"
    // under a solid that was visibly 70% covered.
    expect(slowestCompassProgress(new Map([[1, coverage(56, 0)]]))).toBe(70);
  });

  it('follows the firmware once its number overtakes coverage', () => {
    // Late in the run the fit percentage leads. Taking the higher of the two
    // stops the ring going backwards.
    expect(slowestCompassProgress(new Map([[1, coverage(56, 90)]]))).toBe(90);
  });

  it('reports the worst compass, because the run ends when the worst ends', () => {
    const byCompass = new Map([
      [0, coverage(80, 100)],
      [1, coverage(24, 0)],
    ]);
    expect(slowestCompassProgress(byCompass)).toBe(30);
  });

  it('is not dragged to zero by a compass that has reported nothing yet', () => {
    // A compass present in the map with an empty mask is still legitimately
    // at zero, and the run genuinely is not finished. This pins the intent.
    const byCompass = new Map([
      [0, coverage(80, 100)],
      [1, coverage(0, 0)],
    ]);
    expect(slowestCompassProgress(byCompass)).toBe(0);
  });
});
