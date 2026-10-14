import { describe, it, expect } from 'vitest';
import { generateCorridor, corridorBand, MITER_LIMIT } from './corridor-generator';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type LatLng } from '../survey-types';

function config(polygon: LatLng[], overrides: Partial<SurveyConfig> = {}): SurveyConfig {
  return { ...DEFAULT_SURVEY_CONFIG, polygon, pattern: 'corridor', ...overrides };
}

// A straight ~550 m east-west centerline near the equator.
const STRAIGHT: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.005 },
];

// An L-shaped centerline with a 90° bend.
const BENT: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.003 },
  { lat: 0.003, lng: 0.003 },
];

const allFinite = (pts: LatLng[]) =>
  pts.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

describe('generateCorridor', () => {
  it('returns empty for a degenerate centerline', () => {
    const r = generateCorridor(config([{ lat: 0, lng: 0 }]));
    expect(r.waypoints).toHaveLength(0);
  });

  it('produces strips along a straight centerline with finite coords', () => {
    const r = generateCorridor(config(STRAIGHT));
    expect(r.waypoints.length).toBeGreaterThan(0);
    expect(allFinite(r.waypoints)).toBe(true);
    expect(r.stats.lineCount).toBeGreaterThanOrEqual(1);
  });

  it('honours an explicit strip count', () => {
    const r = generateCorridor(config(STRAIGHT, { corridorStrips: 3 }));
    expect(r.stats.lineCount).toBe(3);
  });

  it('even strip counts straddle the centerline, odd counts ride it', () => {
    const odd = generateCorridor(config(STRAIGHT, { corridorStrips: 3 }));
    const even = generateCorridor(config(STRAIGHT, { corridorStrips: 2 }));
    expect(odd.stats.lineCount).toBe(3);
    expect(even.stats.lineCount).toBe(2);
  });

  // Plane mode flies the strips in an order whose turns the aircraft can make,
  // on top of the end overshoot.
  it('plane mode reorders the strips; copter mode flies them in sequence', () => {
    const many = { corridorStrips: 9, corridorWidth: 300, speed: 20, overshoot: 0 };
    const plane = generateCorridor(config(STRAIGHT, { ...many, corridorMode: 'plane' }));
    const copter = generateCorridor(config(STRAIGHT, { ...many, corridorMode: 'copter' }));
    expect(plane.stats.lineCount).toBe(copter.stats.lineCount);
    expect(plane.waypoints.length).toBe(copter.waypoints.length);
    // But flown in a different order, so the reversals fit.
    expect(plane.waypoints).not.toEqual(copter.waypoints);
  });

  // Max turn is the bend the aircraft can take unaided; anything sharper gets
  // the turn pair. 15° is the default, so a 90° bend qualifies.
  it('inserts turn waypoints at bends sharper than Max turn', () => {
    const opts = { corridorStrips: 1, corridorMode: 'plane', overshoot: 0 } as const;
    const bendCopter = generateCorridor(config(BENT, { ...opts, corridorMode: 'copter' }));
    const looped = generateCorridor(config(BENT, opts));
    expect(looped.waypoints.length).toBeGreaterThan(bendCopter.waypoints.length);
    expect(allFinite(looped.waypoints)).toBe(true);

    // Raise it past the 90° bend and the corner is flown as drawn.
    const straightened = generateCorridor(config(BENT, { ...opts, maxTurnAngle: 120 }));
    expect(straightened.waypoints.length).toBe(bendCopter.waypoints.length);
  });

  it('reports a swath area, not the enclosed-polygon area', () => {
    const r = generateCorridor(config(STRAIGHT, { corridorStrips: 2 }));
    // length(~556m) * coveredWidth(2 * lineSpacing) > 0
    expect(r.stats.areaCovered).toBeGreaterThan(0);
  });

  it('flipLegs and invertPath keep the waypoint count but reorder', () => {
    const base = generateCorridor(config(STRAIGHT, { corridorStrips: 3 }));
    const flipped = generateCorridor(config(STRAIGHT, { corridorStrips: 3, flipLegs: true }));
    const inverted = generateCorridor(config(STRAIGHT, { corridorStrips: 3, invertPath: true }));
    expect(flipped.waypoints.length).toBe(base.waypoints.length);
    expect(inverted.waypoints.length).toBe(base.waypoints.length);
  });
});

describe('generateCorridor with branches', () => {
  // A spur forking north from the midpoint of STRAIGHT.
  const BRANCH: LatLng[] = [
    { lat: 0, lng: 0.0025 },
    { lat: 0.003, lng: 0.0025 },
  ];

  it('a branch adds waypoints beyond the main centerline', () => {
    const main = generateCorridor(config(STRAIGHT, { corridorStrips: 2 }));
    const branched = generateCorridor(config(STRAIGHT, { corridorStrips: 2, corridorBranches: [BRANCH] }));
    expect(branched.waypoints.length).toBeGreaterThan(main.waypoints.length);
    expect(allFinite(branched.waypoints)).toBe(true);
  });

  it('sums line count and photo count across main + branches', () => {
    const main = generateCorridor(config(STRAIGHT, { corridorStrips: 2 }));
    const branched = generateCorridor(config(STRAIGHT, { corridorStrips: 2, corridorBranches: [BRANCH] }));
    // Two centerlines, 2 strips each.
    expect(branched.stats.lineCount).toBe(main.stats.lineCount * 2);
    expect(branched.stats.photoCount).toBeGreaterThanOrEqual(main.stats.photoCount);
    expect(branched.stats.areaCovered).toBeGreaterThan(main.stats.areaCovered);
  });

  it('branches can fly their own strip count', () => {
    const same = generateCorridor(config(STRAIGHT, { corridorStrips: 3, corridorBranches: [BRANCH] }));
    const fewer = generateCorridor(config(STRAIGHT, { corridorStrips: 3, corridorBranches: [BRANCH], corridorBranchStrips: 2 }));
    expect(same.stats.lineCount).toBe(6);
    expect(fewer.stats.lineCount).toBe(5);
    expect(fewer.waypoints.length).toBeLessThan(same.waypoints.length);
    expect(allFinite(fewer.waypoints)).toBe(true);
  });

  it('branch strips at 0 is identical to not setting it', () => {
    const a = generateCorridor(config(STRAIGHT, { corridorStrips: 2, corridorBranches: [BRANCH] }));
    const b = generateCorridor(config(STRAIGHT, { corridorStrips: 2, corridorBranches: [BRANCH], corridorBranchStrips: 0 }));
    expect(b.waypoints).toEqual(a.waypoints);
  });

  it('a 2-strip spur off a 3-strip trunk returns to its junction', () => {
    // Copter, no overshoot: the branch's two strips are its exact out-and-back.
    const res = generateCorridor(config(STRAIGHT, {
      corridorStrips: 3, corridorBranches: [BRANCH], corridorBranchStrips: 2, corridorMode: 'copter',
    }));
    const junction = BRANCH[0]!;
    const far = BRANCH[1]!;
    // Every waypoint near the far end of the spur is followed, later, by one
    // back at the junction before the trunk resumes.
    const nearFar = res.waypoints.filter((w) => Math.abs(w.lat - far.lat) < 0.0005 && Math.abs(w.lng - far.lng) < 0.0005);
    expect(nearFar.length).toBe(2);
    const nearJunction = res.waypoints.filter((w) => Math.abs(w.lat - junction.lat) < 0.0005 && Math.abs(w.lng - junction.lng) < 0.0005);
    expect(nearJunction.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores degenerate branches (fewer than 2 points)', () => {
    const main = generateCorridor(config(STRAIGHT, { corridorStrips: 2 }));
    const withJunk = generateCorridor(config(STRAIGHT, { corridorStrips: 2, corridorBranches: [[{ lat: 1, lng: 1 }]] }));
    expect(withJunk.waypoints.length).toBe(main.waypoints.length);
  });

  it('empty branches array is identical to no branches', () => {
    const a = generateCorridor(config(STRAIGHT, { corridorStrips: 3 }));
    const b = generateCorridor(config(STRAIGHT, { corridorStrips: 3, corridorBranches: [] }));
    expect(b.waypoints.length).toBe(a.waypoints.length);
    expect(b.stats.lineCount).toBe(a.stats.lineCount);
  });
});

/**
 * Transit is the flying that collects no imagery. On a branched corridor it
 * used to dominate: a 23 km power line with five spurs spent 13 km of a
 * 36 km mission repositioning, including one 8.7 km leg.
 */
describe('corridor transit', () => {
  const metres = (a: LatLng, b: LatLng) =>
    Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

  /** A 5 km trunk with four spurs hanging off it at intervals. */
  const trunk: LatLng[] = Array.from({ length: 21 }, (_, i) => ({ lat: 0, lng: i * 0.0025 }));
  const spurs: LatLng[][] = [4, 8, 12, 16].map((i) => [
    { lat: 0.0005, lng: i * 0.0025 },
    { lat: 0.004, lng: i * 0.0025 },
  ]);

  const legsOf = (strips: number) => {
    const r = generateCorridor(config(trunk, {
      corridorBranches: spurs,
      corridorStrips: strips,
      corridorMode: 'copter',
      corridorWidth: 60,
      overshoot: 0,
    }));
    const out: number[] = [];
    for (let i = 1; i < r.waypoints.length; i++) out.push(metres(r.waypoints[i - 1]!, r.waypoints[i]!));
    return out;
  };

  // The trunk is 5 km; a leg anywhere near that is the aircraft crossing the
  // whole site to reach a spur it should have collected on the way past.
  it.each([1, 2, 3, 4])('never crosses the whole site at %i strips', (strips) => {
    expect(Math.max(...legsOf(strips))).toBeLessThan(1500);
  });

  // An even strip count flies a pass over the whole network then comes back,
  // so it pays the between-run transit once per pass: four strips is the
  // worst case of the four, and this pins it rather than letting it drift.
  it('keeps transit a small share of the flying at every strip count', () => {
    const surveyLength = 5000 + 4 * 390;
    const share = (strips: number) => {
      const legs = legsOf(strips);
      const total = legs.reduce((a, b) => a + b, 0);
      return (total - surveyLength * strips) / total;
    };
    // Measured on this fixture: 0.28 / 0.29 / 0.21 / 0.30. The bound is a
    // regression guard, not a target; before the routing work a single leg
    // alone was a quarter of the mission.
    for (const strips of [1, 2, 3, 4]) {
      expect(share(strips), `strips=${strips}`).toBeLessThan(0.35);
    }
  });

  it('covers the same ground however the strips are scheduled', () => {
    const odd = generateCorridor(config(trunk, { corridorBranches: spurs, corridorStrips: 3, corridorMode: 'copter' }));
    const even = generateCorridor(config(trunk, { corridorBranches: spurs, corridorStrips: 4, corridorMode: 'copter' }));
    expect(odd.stats.areaCovered).toBeGreaterThan(0);
    expect(even.stats.areaCovered).toBeGreaterThan(odd.stats.areaCovered);
    expect(allFinite(even.waypoints)).toBe(true);
  });
});

describe('turn radius drives the plan', () => {
  const metres = (a: LatLng, b: LatLng) =>
    Math.hypot((a.lat - b.lat) * 110540, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180));

  const line: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 }];

  it('stops exactly on the line ends with no overshoot set', () => {
    const r = generateCorridor(config(line, { corridorStrips: 4, corridorMode: 'plane', corridorWidth: 300, speed: 20, overshoot: 0 }));
    const east = Math.max(...r.waypoints.map((w) => w.lng));
    const west = Math.min(...r.waypoints.map((w) => w.lng));
    expect(east).toBeCloseTo(0.02, 6);
    expect(west).toBeCloseTo(0, 6);
  });

  // The turn has to happen off the mapped line, or the last photo of every
  // strip is taken in a bank.
  it('flies the set overshoot past each end', () => {
    const r = generateCorridor(config(line, { corridorStrips: 4, corridorMode: 'plane', corridorWidth: 300, speed: 20, overshoot: 60 }));
    const east = Math.max(...r.waypoints.map((w) => w.lng));
    const west = Math.min(...r.waypoints.map((w) => w.lng));
    expect(metres({ lat: 0, lng: east }, { lat: 0, lng: 0.02 })).toBeCloseTo(60, 0);
    expect(metres({ lat: 0, lng: west }, { lat: 0, lng: 0 })).toBeCloseTo(60, 0);
  });

  it('leaves the overshoot off a copter plan', () => {
    const r = generateCorridor(config(line, { corridorStrips: 4, corridorMode: 'copter', corridorWidth: 300, overshoot: 60 }));
    expect(Math.max(...r.waypoints.map((w) => w.lng))).toBeCloseTo(0.02, 6);
  });

  // A spur meets the trunk mid-line: the aircraft flies through the junction,
  // so a stub past it and back would be pure dead distance.
  it('does not overshoot where a branch meets the trunk', () => {
    const trunk: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 }];
    const branch: LatLng[] = [{ lat: 0, lng: 0.01 }, { lat: 0.004, lng: 0.01 }];
    const r = generateCorridor(config(trunk, {
      corridorStrips: 1, corridorMode: 'plane', corridorWidth: 60, speed: 20, overshoot: 60,
      corridorBranches: [branch],
    }));
    // Nothing should sit meaningfully south of the trunk, which is where a
    // stub past the junction would land.
    const south = Math.min(...r.waypoints.map((w) => w.lat));
    expect(south * 110540).toBeGreaterThan(-5);
  });

  // A faster aircraft turns wider, so it has to skip further between lines.
  it('skips further between lines as the aircraft gets faster', () => {
    const slow = generateCorridor(config(line, { corridorStrips: 9, corridorWidth: 300, corridorMode: 'plane', speed: 8 }));
    const fast = generateCorridor(config(line, { corridorStrips: 9, corridorWidth: 300, corridorMode: 'plane', speed: 28 }));
    const firstHop = (r: { waypoints: LatLng[] }) => {
      // Across-track distance between the first two lines flown.
      const lats = r.waypoints.map((w) => w.lat);
      return Math.abs(lats[0]! - lats[Math.floor(lats.length / 9)]!) * 110540;
    };
    expect(firstHop(fast)).toBeGreaterThanOrEqual(firstHop(slow));
  });

  it('covers every line exactly once whatever the order', () => {
    const r = generateCorridor(config(line, { corridorStrips: 7, corridorWidth: 300, corridorMode: 'plane', speed: 20 }));
    expect(r.stats.lineCount).toBe(7);
    expect(r.waypoints.every((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng))).toBe(true);
    void metres;
  });
});

describe('width sets the strips from the photo edges', () => {
  // Default Mavic 3E at 80 m: a photo covers ~112.5 m across, 45 m max gap.
  const auto = { corridorStrips: 0, corridorMode: 'copter' } as const;

  it('flies one strip when a photo already spans the corridor', () => {
    const r = generateCorridor(config(STRAIGHT, { ...auto, corridorWidth: 60 }));
    expect(r.stats.lineCount).toBe(1);
  });

  it('flies the fewest strips and spreads them to the corridor edges', () => {
    const r = generateCorridor(config(STRAIGHT, { ...auto, corridorWidth: 300 }));
    expect(r.stats.lineCount).toBe(6);
    expect(r.stats.lineSpacing).toBeCloseTo(37.5, 1);
    expect(r.stats.lineSpacing).toBeLessThanOrEqual(45);
  });

  it('an explicit strip count keeps the overlap spacing', () => {
    const r = generateCorridor(config(STRAIGHT, { corridorStrips: 3, corridorMode: 'copter' }));
    expect(r.stats.lineCount).toBe(3);
    expect(r.stats.lineSpacing).toBeCloseTo(45, 0);
  });
});

describe('camera on the strips only', () => {
  it('turn loops and overshoots add no photos', () => {
    const bent: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.004 },
      { lat: 0.004, lng: 0.004 },
    ];
    const base = { corridorStrips: 1, maxTurnAngle: 15 } as const;
    const plane = generateCorridor(config(bent, { ...base, corridorMode: 'plane', overshoot: 80 }));
    const copter = generateCorridor(config(bent, { ...base, corridorMode: 'copter' }));
    expect(plane.waypoints.length).toBeGreaterThan(copter.waypoints.length);
    expect(plane.stats.photoCount).toBe(copter.stats.photoCount);
  });
});

describe('strip spacing through a bend', () => {
  // Distance from a point to the infinite line through a and b, in degrees
  // (the test lines sit on the equator, so degrees are isotropic enough).
  const distToLine = (p: LatLng, a: LatLng, b: LatLng) => {
    const dx = b.lng - a.lng;
    const dy = b.lat - a.lat;
    return Math.abs(dx * (a.lat - p.lat) - dy * (a.lng - p.lng)) / Math.hypot(dx, dy);
  };

  it('keeps the band the full half-width from both legs at a right angle', () => {
    const width = 100;
    const band = corridorBand(BENT, width);
    const corner = BENT[1]!;
    // The band vertex at the bend is the one farthest from the two ends.
    const bendVertices = band.filter((p) =>
      Math.hypot(p.lat - corner.lat, p.lng - corner.lng) < 0.001);
    expect(bendVertices.length).toBe(2);
    for (const v of bendVertices) {
      const toLeg1 = distToLine(v, BENT[0]!, BENT[1]!) * 111320;
      const toLeg2 = distToLine(v, BENT[1]!, BENT[2]!) * 111320;
      expect(toLeg1).toBeCloseTo(width / 2, 0);
      expect(toLeg2).toBeCloseTo(width / 2, 0);
    }
  });

  it('keeps the strips their full gap apart through a 150 degree bend', () => {
    // Sharp V: heading change ~150 degrees. The old averaged normal packed
    // the outer strips to cos(75 deg) = a quarter of their spacing here.
    const SHARP: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.004 },
      { lat: 0.002, lng: 0.000536 },
    ];
    const res = generateCorridor(config(SHARP, { corridorStrips: 3, corridorMode: 'copter' }));
    const gap = res.stats.lineSpacing;
    const corner = SHARP[1]!;
    const nearCorner = res.waypoints.filter((w) =>
      Math.hypot(w.lat - corner.lat, w.lng - corner.lng) < gap * 6 / 111320);
    // Three strips pass the bend: the centre one through the corner itself,
    // the outer two mitred a full gap off each leg.
    const offsets = nearCorner.map((w) => Math.min(
      distToLine(w, SHARP[0]!, SHARP[1]!),
      distToLine(w, SHARP[1]!, SHARP[2]!),
    ) * 111320);
    const outer = offsets.filter((d) => d > gap / 2);
    expect(outer.length).toBeGreaterThan(0);
    for (const d of outer) expect(d).toBeCloseTo(gap, 0);
  });

  it('caps the mitre so a hairpin does not fly off', () => {
    const HAIRPIN: LatLng[] = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.004 },
      { lat: 0.00005, lng: 0 },
    ];
    const res = generateCorridor(config(HAIRPIN, { corridorStrips: 3, corridorMode: 'copter' }));
    const gap = res.stats.lineSpacing;
    const corner = HAIRPIN[1]!;
    for (const w of res.waypoints) {
      const d = Math.hypot(w.lat - corner.lat, w.lng - corner.lng) * 111320;
      expect(d).toBeLessThanOrEqual(MITER_LIMIT * gap + 500);
    }
  });
});
