/**
 * ArduPilot's geodesic grid: the 80 sphere sections that `completion_mask` in
 * MAG_CAL_PROGRESS is a bitfield over.
 *
 * This is not a decorative tessellation. `AP_GeodesicGrid::section_for_vector`
 * decides which of these 80 triangles a magnetometer sample fell in, and sets
 * that bit. Drawing the same 80 triangles is therefore drawing the fit's actual
 * coverage: an unlit triangle is a direction the solver has no data for.
 * Getting the ordering wrong would put lit patches in the wrong place, which is
 * worse than not drawing it, so the construction below follows
 * `libraries/AP_Math/AP_GeodesicGrid.h` exactly.
 *
 * From that header:
 *   - an icosahedron's 20 triangles, T_0..T_9 listed explicitly and
 *     T_(i+10) = -T_i;
 *   - each split into four by bisecting its edges, with
 *     m_a = (a+b)/2, m_b = (b+c)/2, m_c = (c+a)/2 and
 *     W_0 = (m_a, m_b, m_c), W_1 = (a, m_a, m_c),
 *     W_2 = (m_a, b, m_b), W_3 = (m_c, m_b, c);
 *   - section index s = 4 * i + j.
 *
 * Ported from the mobile app's geodesic_grid.dart so both apps draw the same
 * solid from the same source.
 */

export type Vec3 = readonly [number, number, number];

const G = 1.618033988749895; // golden ratio

/** T_0..T_9 verbatim from the header. The rest are their opposites. */
const BASE_TRIANGLES: ReadonlyArray<readonly [Vec3, Vec3, Vec3]> = [
  [[-G, 1, 0], [-1, 0, -G], [-G, -1, 0]],
  [[-1, 0, -G], [-G, -1, 0], [0, -G, -1]],
  [[-G, -1, 0], [0, -G, -1], [0, -G, 1]],
  [[-1, 0, -G], [0, -G, -1], [1, 0, -G]],
  [[0, -G, -1], [0, -G, 1], [G, -1, 0]],
  [[0, -G, -1], [1, 0, -G], [G, -1, 0]],
  [[G, -1, 0], [1, 0, -G], [G, 1, 0]],
  [[1, 0, -G], [G, 1, 0], [0, G, -1]],
  [[1, 0, -G], [0, G, -1], [-1, 0, -G]],
  [[0, G, -1], [-G, 1, 0], [-1, 0, -G]],
];

const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Onto the unit sphere. The icosahedron's own vertices are not unit length,
 * and neither are the midpoints; projecting them is what makes the solid
 * geodesic rather than a faceted lump.
 */
export function normalise(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len === 0) return v;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export type Section = readonly [Vec3, Vec3, Vec3];

function build(): Section[] {
  const triangles = [
    ...BASE_TRIANGLES,
    ...BASE_TRIANGLES.map((t) => [neg(t[0]), neg(t[1]), neg(t[2])] as const),
  ];

  const sections: Section[] = [];
  for (const t of triangles) {
    const [a, b, c] = t;
    const ma = mid(a, b);
    const mb = mid(b, c);
    const mc = mid(c, a);
    // Order matters: these are j = 0..3 within the triangle.
    for (const w of [
      [ma, mb, mc],
      [a, ma, mc],
      [ma, b, mb],
      [mc, mb, c],
    ] as const) {
      sections.push([normalise(w[0]), normalise(w[1]), normalise(w[2])]);
    }
  }
  return sections;
}

/**
 * The 80 sections, indexed exactly as the firmware indexes them, each as three
 * unit vectors.
 */
export const GEODESIC_SECTIONS: readonly Section[] = build();

/** Centre of a section, on the sphere. Used for depth sorting and for facing. */
export function sectionCentre(tri: Section): Vec3 {
  return normalise([
    (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
    (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
    (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
  ]);
}

/** Whether bit `index` of a MAG_CAL_PROGRESS completion mask is set. */
export function sectionCovered(mask: ArrayLike<number>, index: number): boolean {
  const byte = Math.floor(index / 8);
  if (byte >= mask.length) return false;
  return ((mask[byte] ?? 0) & (1 << (index % 8))) !== 0;
}

/** How many of the 80 sections the mask has. */
export function coveredCount(mask: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < 80; i++) if (sectionCovered(mask, i)) n++;
  return n;
}

export const SECTION_COUNT = 80;

/**
 * The direction most in need of sampling, or null once everything is covered.
 *
 * Uncovered sections rarely sit alone: they come in patches, because a patch is
 * a way the aircraft has not been held. Averaging their centres aims at the
 * middle of the biggest patch, which is where turning next gains the most. Once
 * one patch is filled the average moves to the next on its own, so the guidance
 * walks the pilot around the sphere without needing to know anything about
 * clusters.
 *
 * Returns null when the remaining gaps cancel each other out, which happens
 * when they are scattered evenly and no single direction is worth aiming at.
 */
export function gapDirection(mask: ArrayLike<number>): Vec3 | null {
  let x = 0; let y = 0; let z = 0; let n = 0;
  for (let i = 0; i < SECTION_COUNT; i++) {
    if (sectionCovered(mask, i)) continue;
    const c = sectionCentre(GEODESIC_SECTIONS[i]!);
    x += c[0]; y += c[1]; z += c[2];
    n++;
  }
  if (n === 0) return null;
  const len = Math.hypot(x, y, z);
  // Antipodal leftovers sum to nothing. Aiming at a zero vector would point
  // the camera somewhere arbitrary and look like a bug.
  if (len < 1e-3) return null;
  return [x / len, y / len, z / len];
}
