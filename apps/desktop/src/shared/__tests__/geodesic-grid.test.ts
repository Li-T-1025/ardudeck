import { describe, it, expect } from 'vitest';
import {
  GEODESIC_SECTIONS,
  coveredCount,
  gapDirection,
  sectionCentre,
  sectionCovered,
  type Vec3,
} from '../geodesic-grid';

/**
 * The compass sphere is only honest if its 80 triangles are the SAME 80
 * triangles ArduPilot sets bits for. If the construction drifts, lit patches
 * appear in the wrong place and the display quietly lies about which directions
 * still need covering, which is worse than drawing nothing.
 *
 * Ported alongside the grid itself from the mobile app, so both stay pinned to
 * the same geometry.
 */
describe('geodesic grid', () => {
  it('has exactly 80 sections', () => {
    // 20 icosahedron faces, each split into 4. That is why the mask is 10
    // bytes and not some rounder number.
    expect(GEODESIC_SECTIONS).toHaveLength(80);
  });

  it('puts every vertex on the unit sphere', () => {
    for (const tri of GEODESIC_SECTIONS) {
      for (const v of tri) {
        expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 9);
      }
    }
  });

  it('tiles the whole sphere', () => {
    // Spherical excess: a triangle on the unit sphere has area equal to the
    // sum of its angles minus pi. Eighty of them must add up to 4*pi, which
    // only happens if they cover the sphere once with no gaps or overlaps.
    let total = 0;
    for (const tri of GEODESIC_SECTIONS) total += sphericalArea(tri[0], tri[1], tri[2]);
    expect(total).toBeCloseTo(4 * Math.PI, 6);
  });

  it('keeps opposite icosahedron faces antipodal', () => {
    // The header defines T_(i+10) = -T_i, and the section index is 4*i + j,
    // so section 4*i+j must mirror section 4*(i+10)+j.
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 4; j++) {
        const a = sectionCentre(GEODESIC_SECTIONS[4 * i + j]!);
        const b = sectionCentre(GEODESIC_SECTIONS[4 * (i + 10) + j]!);
        expect(a[0]).toBeCloseTo(-b[0], 9);
        expect(a[1]).toBeCloseTo(-b[1], 9);
        expect(a[2]).toBeCloseTo(-b[2], 9);
      }
    }
  });

  it('never repeats a section centre', () => {
    // A duplicated face would mean a hole somewhere else that never lights up.
    const seen = new Set<string>();
    for (const tri of GEODESIC_SECTIONS) {
      const c = sectionCentre(tri);
      const key = c.map((n) => n.toFixed(6)).join(',');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('completion mask', () => {
  it('reads bits little-endian within each byte', () => {
    // Byte 0 bit 0 is section 0. Getting this backwards mirrors the display.
    expect(sectionCovered([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0)).toBe(true);
    expect(sectionCovered([2, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1)).toBe(true);
    expect(sectionCovered([0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 8)).toBe(true);
    expect(sectionCovered([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1)).toBe(false);
  });

  it('counts a full mask as all 80', () => {
    expect(coveredCount(new Array(10).fill(0xff))).toBe(80);
  });

  it('survives a short mask', () => {
    // MAVLink v2 truncation drops trailing zero bytes; those sections are
    // simply uncovered, which is the truth.
    expect(sectionCovered([0xff], 70)).toBe(false);
    expect(coveredCount([0xff])).toBe(8);
  });

  it('treats an empty mask as nothing covered', () => {
    expect(coveredCount([])).toBe(0);
  });
});

/** Area of a spherical triangle by its excess, via the vertex angles. */
function sphericalArea(a: Vec3, b: Vec3, c: Vec3): number {
  const angle = (p: Vec3, q: Vec3, r: Vec3): number => {
    const u = reject(q, p);
    const v = reject(r, p);
    const d = dot(u, v) / (len(u) * len(v));
    return Math.acos(Math.min(1, Math.max(-1, d)));
  };
  return angle(a, b, c) + angle(b, c, a) + angle(c, a, b) - Math.PI;
}

/** Component of v perpendicular to n. */
function reject(v: Vec3, n: Vec3): Vec3 {
  const d = dot(v, n);
  return [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d];
}
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

describe('gapDirection', () => {
  const full = () => new Array(10).fill(0xff);
  const cover = (mask: number[], index: number) => { mask[Math.floor(index / 8)]! |= 1 << (index % 8); };
  const uncover = (mask: number[], index: number) => { mask[Math.floor(index / 8)]! &= ~(1 << (index % 8)); };

  it('is null when every direction has samples', () => {
    expect(gapDirection(full())).toBeNull();
  });

  it('points at the one remaining hole', () => {
    const mask = full();
    const hole = 37;
    uncover(mask, hole);
    const dir = gapDirection(mask)!;
    const centre = sectionCentre(GEODESIC_SECTIONS[hole]!);
    expect(dir[0]).toBeCloseTo(centre[0], 9);
    expect(dir[1]).toBeCloseTo(centre[1], 9);
    expect(dir[2]).toBeCloseTo(centre[2], 9);
  });

  it('aims between the members of a patch', () => {
    // Two neighbours in the same icosahedron face: the aim point should sit
    // between them, not on either one.
    const mask = full();
    uncover(mask, 4);
    uncover(mask, 5);
    const dir = gapDirection(mask)!;
    const a = sectionCentre(GEODESIC_SECTIONS[4]!);
    const b = sectionCentre(GEODESIC_SECTIONS[5]!);
    const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    expect(dot(dir, a)).toBeGreaterThan(0.9);
    expect(dot(dir, b)).toBeGreaterThan(0.9);
    expect(dot(dir, a)).toBeCloseTo(dot(dir, b), 6);
  });

  it('returns a unit vector', () => {
    const mask = new Array(10).fill(0);
    cover(mask, 0);
    const dir = gapDirection(mask)!;
    expect(Math.hypot(dir[0], dir[1], dir[2])).toBeCloseTo(1, 9);
  });

  it('is null when the gaps cancel out', () => {
    // Nothing covered at all: the 80 centres are symmetric about the origin,
    // so their sum is zero and no single direction is worth aiming at.
    expect(gapDirection(new Array(10).fill(0))).toBeNull();
  });

  it('is null for an exactly antipodal pair', () => {
    // Section 4*i+j and 4*(i+10)+j are opposite, so they sum to nothing.
    const mask = full();
    uncover(mask, 4 * 2 + 1);
    uncover(mask, 4 * 12 + 1);
    expect(gapDirection(mask)).toBeNull();
  });
});
