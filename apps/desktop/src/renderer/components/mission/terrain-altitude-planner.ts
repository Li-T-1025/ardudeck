/**
 * Terrain-aware altitude planner.
 *
 * Given a list of waypoints and a terrain lookup, compute:
 *   1) altitude adjustments for existing waypoints (raise above terrain+buffer)
 *   2) intermediate waypoints to insert where the straight-line flight path
 *      between two "safe" waypoints still clips terrain (ridge between peaks)
 *
 * Pure, no React. Tested in terrain-altitude-planner.test.ts.
 */

/**
 * Altitude reference frame for a waypoint's `altitude` value:
 *   - 'asl'      absolute height above mean sea level
 *   - 'relative' height above the home/launch point
 *   - 'terrain'  height above the ground directly below
 * Defaults to 'asl' when omitted (legacy callers).
 */
export type AltFrame = 'asl' | 'relative' | 'terrain';

export interface PlannerWaypoint {
  seq: number;
  latitude: number;
  longitude: number;
  altitude: number;
  /** Reference frame of `altitude`. Defaults to 'asl'. */
  frame?: AltFrame;
}

/** Convert a frame-relative altitude to absolute (ASL) metres. */
function toAsl(altitude: number, frame: AltFrame, ground: number, homeElev: number): number {
  switch (frame) {
    case 'relative': return homeElev + altitude;
    case 'terrain': return ground + altitude;
    default: return altitude;
  }
}

/** Convert an absolute (ASL) altitude back into the given frame. */
function fromAsl(asl: number, frame: AltFrame, ground: number, homeElev: number): number {
  switch (frame) {
    case 'relative': return asl - homeElev;
    case 'terrain': return asl - ground;
    default: return asl;
  }
}

export interface TerrainLookup {
  /** Returns terrain elevation (meters) at the given lat/lon, or null if unknown. */
  elevationAt: (lat: number, lon: number) => number | null;
}

export interface PlanOptions {
  /** Minimum clearance above terrain (meters). */
  safeBuffer: number;
  /** If true, raise existing waypoints that sit below terrain+clearance. */
  raiseEndpoints: boolean;
  /** If true, insert intermediate waypoints where segments clip terrain. */
  insertIntermediates: boolean;
  /** Sampling step along each segment (meters). Default 25. */
  sampleStepMeters?: number;
  /** Minimum spacing between inserted waypoints along a segment (meters). Default 50. */
  minSpacingMeters?: number;
  /** Guard against pathological recursion. Default 8. */
  maxInsertsPerSegment?: number;
  /**
   * Ground elevation (ASL metres) at the home/launch point. Required to keep
   * 'relative'-frame waypoints in their own frame; defaults to 0.
   */
  homeElevationMeters?: number;
}

export interface IntermediateInsert {
  /** Insert after this original (input-indexed) sequence. */
  afterSeq: number;
  latitude: number;
  longitude: number;
  altitude: number;
  /** Reference frame of `altitude` (inherited from the segment's waypoints). */
  frame: AltFrame;
  /** Distance along the original segment where insertion happens (meters). */
  distanceAlong: number;
}

export interface PlanResult {
  /** seq -> new altitude. Only populated when raiseEndpoints && change needed. */
  raisedAltitudes: Map<number, number>;
  /** New waypoints to be inserted, in order. */
  inserts: IntermediateInsert[];
}

const EARTH_R = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in meters. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Linear interpolation of lat/lon (flat-earth; fine for short segments). */
function interp(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  t: number,
): { lat: number; lon: number } {
  return {
    lat: lat1 + (lat2 - lat1) * t,
    lon: lon1 + (lon2 - lon1) * t,
  };
}

/**
 * Compute raised altitudes for each waypoint based on its own ground elevation.
 *
 * All clearance math is done in ASL: the waypoint's current ASL altitude is
 * derived from its frame, compared against `ground + clearance`, and any raise
 * is converted back into the waypoint's *own* frame. This keeps a relative- or
 * terrain-referenced waypoint in its own frame instead of forcing it to ASL.
 *
 * Clearance policy is unchanged from the original single-point auto-adjust:
 * clearance = max(safeBuffer, plannedHeight), so a waypoint that already clears
 * terrain by more than the buffer keeps its height and nothing is ever lowered.
 * `plannedHeight` is the height the user set where that value is already a height
 * above a ground datum (relative/terrain frames); for absolute (asl) waypoints
 * it is the current height above terrain.
 */
function computeRaisedAltitudes(
  waypoints: PlannerWaypoint[],
  terrain: TerrainLookup,
  safeBuffer: number,
  homeElev: number,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const wp of waypoints) {
    const ground = terrain.elevationAt(wp.latitude, wp.longitude);
    if (ground === null) continue;
    const frame = wp.frame ?? 'asl';
    const currentAsl = toAsl(wp.altitude, frame, ground, homeElev);
    const plannedHeight = frame === 'asl' ? currentAsl - ground : wp.altitude;
    const clearance = Math.max(safeBuffer, plannedHeight);
    const targetAsl = ground + clearance;
    if (currentAsl < targetAsl) {
      out.set(wp.seq, Math.ceil(fromAsl(targetAsl, frame, ground, homeElev)));
    }
  }
  return out;
}

interface WorstPoint {
  t: number;
  dist: number;
  terrain: number;
  flight: number;
  deficit: number;
}

/**
 * Sample a segment at `stepMeters` and return the point with the deepest
 * terrain intrusion (flightAlt - (terrain + buffer) most negative), or null
 * if nothing clips.
 */
function findWorstCollision(
  a: PlannerWaypoint,
  b: PlannerWaypoint,
  altA: number,
  altB: number,
  terrain: TerrainLookup,
  safeBuffer: number,
  stepMeters: number,
): WorstPoint | null {
  const segDist = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
  if (segDist < 1) return null;

  const samples = Math.max(3, Math.ceil(segDist / stepMeters));
  let worst: WorstPoint | null = null;

  // Skip t=0 and t=1 (endpoints are already handled by raise step).
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const { lat, lon } = interp(a.latitude, a.longitude, b.latitude, b.longitude, t);
    const ground = terrain.elevationAt(lat, lon);
    if (ground === null) continue;
    const flightAlt = altA + (altB - altA) * t;
    const required = ground + safeBuffer;
    const deficit = flightAlt - required;
    if (deficit < 0 && (worst === null || deficit < worst.deficit)) {
      worst = {
        t,
        dist: segDist * t,
        terrain: ground,
        flight: flightAlt,
        deficit,
      };
    }
  }

  return worst;
}

/**
 * Recursively find insertion points for one segment between a and b,
 * where a and b already have their final (possibly raised) altitudes.
 * Returns inserts sorted by distanceAlong.
 */
function planSegmentInserts(
  a: PlannerWaypoint,
  b: PlannerWaypoint,
  altA: number,
  altB: number,
  terrain: TerrainLookup,
  opts: Required<
    Pick<PlanOptions, 'safeBuffer' | 'sampleStepMeters' | 'minSpacingMeters' | 'maxInsertsPerSegment'>
  >,
  segFrame: AltFrame,
  homeElev: number,
): IntermediateInsert[] {
  const segDist = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
  if (segDist < opts.minSpacingMeters * 2) return [];

  const worst = findWorstCollision(a, b, altA, altB, terrain, opts.safeBuffer, opts.sampleStepMeters);
  if (!worst) return [];

  // New waypoint at the worst point, altitude = terrain + max(safeBuffer, interpolated flight alt)
  const insertPos = interp(a.latitude, a.longitude, b.latitude, b.longitude, worst.t);
  const interpolatedFlight = altA + (altB - altA) * worst.t;
  const clearance = Math.max(opts.safeBuffer, interpolatedFlight - worst.terrain);
  const newAlt = Math.ceil(worst.terrain + clearance);

  const newWp: PlannerWaypoint = {
    seq: -1, // placeholder
    latitude: insertPos.lat,
    longitude: insertPos.lon,
    altitude: newAlt,
  };

  // Recurse into the two halves. Depth-limited via maxInsertsPerSegment
  // by counting total inserts we accumulate.
  const budgetLeft = opts.maxInsertsPerSegment - 1;
  const leftOpts = { ...opts, maxInsertsPerSegment: budgetLeft };
  const rightOpts = { ...opts, maxInsertsPerSegment: budgetLeft };

  const leftInserts = budgetLeft > 0 ? planSegmentInserts(a, newWp, altA, newAlt, terrain, leftOpts, segFrame, homeElev) : [];
  const rightInserts = budgetLeft > 0 ? planSegmentInserts(newWp, b, newAlt, altB, terrain, rightOpts, segFrame, homeElev) : [];

  // Filter out inserts that are too close to the center insert (minSpacing)
  const centerDist = worst.dist;
  const filtered: IntermediateInsert[] = [];
  for (const ins of leftInserts) {
    if (centerDist - ins.distanceAlong >= opts.minSpacingMeters) filtered.push(ins);
  }
  filtered.push({
    afterSeq: a.seq,
    latitude: insertPos.lat,
    longitude: insertPos.lon,
    // Internal collision math runs in ASL (newAlt); emit in the segment's frame
    // so the inserted waypoint isn't forced to absolute altitude.
    altitude: Math.ceil(fromAsl(newAlt, segFrame, worst.terrain, homeElev)),
    frame: segFrame,
    distanceAlong: centerDist,
  });
  for (const ins of rightInserts) {
    // rightInserts distances are relative to (newWp, b), add centerDist
    const absDist = centerDist + ins.distanceAlong;
    if (absDist - centerDist >= opts.minSpacingMeters) {
      filtered.push({ ...ins, afterSeq: a.seq, distanceAlong: absDist });
    }
  }

  return filtered;
}

/**
 * Plan altitude adjustments + intermediate waypoint insertions.
 *
 * The returned inserts carry `afterSeq` referring to the *input* waypoint
 * sequence. Callers insert them in order; sequence renumbering is the
 * caller's responsibility (e.g. mission-store `insertWaypoint` handles it).
 */
export function planTerrainSafeAltitudes(
  waypoints: PlannerWaypoint[],
  terrain: TerrainLookup,
  options: PlanOptions,
): PlanResult {
  const opts = {
    safeBuffer: options.safeBuffer,
    raiseEndpoints: options.raiseEndpoints,
    insertIntermediates: options.insertIntermediates,
    sampleStepMeters: options.sampleStepMeters ?? 25,
    minSpacingMeters: options.minSpacingMeters ?? 50,
    maxInsertsPerSegment: options.maxInsertsPerSegment ?? 8,
  };
  const homeElev = options.homeElevationMeters ?? 0;

  const raised = opts.raiseEndpoints
    ? computeRaisedAltitudes(waypoints, terrain, opts.safeBuffer, homeElev)
    : new Map<number, number>();

  // Collision detection runs in ASL. Resolve each endpoint's ASL altitude from
  // its (possibly raised) value and frame so inter-frame segments are compared
  // on a common reference.
  const aslAltOf = (wp: PlannerWaypoint): number => {
    const ground = terrain.elevationAt(wp.latitude, wp.longitude) ?? 0;
    const frame = wp.frame ?? 'asl';
    const value = raised.get(wp.seq) ?? wp.altitude;
    return toAsl(value, frame, ground, homeElev);
  };

  const inserts: IntermediateInsert[] = [];
  if (opts.insertIntermediates && waypoints.length >= 2) {
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]!;
      const b = waypoints[i + 1]!;
      const segInserts = planSegmentInserts(a, b, aslAltOf(a), aslAltOf(b), terrain, opts, a.frame ?? 'asl', homeElev);
      inserts.push(...segInserts);
    }
  }

  return {
    raisedAltitudes: raised,
    inserts,
  };
}

export interface FollowOptions {
  /** Height to hold above the ground (m). */
  heightAgl: number;
  /** Steepest climb or descent the route may have (degrees). */
  maxClimbDeg: number;
  /** Ground sample spacing along each leg (m). */
  sampleStepMeters: number;
  /** How far the flown line may sag below the smoothed profile between inserts (m). */
  toleranceMeters: number;
  homeElevationMeters?: number;
  /** Cap per leg, against a pathological surface. Default 200. */
  maxInsertsPerSegment?: number;
}

interface ProfilePoint { lat: number; lon: number; d: number; ground: number }

/**
 * Terrain following: hold `heightAgl` over the ground along the whole route, never steeper than
 * `maxClimbDeg`. The profile is the lowest one that stays at or above ground + height everywhere
 * with that slope limit, so it climbs early before a rise instead of hugging every bump. It is
 * then reduced to as few inserted waypoints as `toleranceMeters` allows, and every leg is checked
 * again so the flown straight lines never come below ground + height.
 */
export function planTerrainFollow(
  waypoints: PlannerWaypoint[],
  terrain: TerrainLookup,
  options: FollowOptions,
): PlanResult {
  const homeElev = options.homeElevationMeters ?? 0;
  const step = Math.max(1, options.sampleStepMeters);
  const slope = Math.tan((Math.max(1, Math.min(60, options.maxClimbDeg)) * Math.PI) / 180);
  const maxInserts = options.maxInsertsPerSegment ?? 200;
  const out: PlanResult = { raisedAltitudes: new Map(), inserts: [] };
  if (waypoints.length === 0) return out;

  // one profile over the whole route; wpIndex[i] is where waypoint i sits in it
  const profile: ProfilePoint[] = [];
  const wpIndex: number[] = [];
  let last = 0;
  let total = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const w = waypoints[i]!;
    if (i > 0) {
      const p = waypoints[i - 1]!;
      const len = haversine(p.latitude, p.longitude, w.latitude, w.longitude);
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 1; k < n; k++) {
        const pt = interp(p.latitude, p.longitude, w.latitude, w.longitude, k / n);
        const g = terrain.elevationAt(pt.lat, pt.lon);
        if (g !== null) last = g;
        profile.push({ lat: pt.lat, lon: pt.lon, d: total + (len * k) / n, ground: g ?? last });
      }
      total += len;
    }
    const g = terrain.elevationAt(w.latitude, w.longitude);
    if (g !== null) last = g;
    wpIndex.push(profile.length);
    profile.push({ lat: w.latitude, lon: w.longitude, d: total, ground: g ?? last });
  }
  if (profile.every((p) => p.ground === 0)) return out;

  // lowest slope-limited envelope over ground + height: forward then backward pass
  const alt = profile.map((p) => p.ground + options.heightAgl);
  for (let i = 1; i < alt.length; i++) alt[i] = Math.max(alt[i]!, alt[i - 1]! - slope * (profile[i]!.d - profile[i - 1]!.d));
  for (let i = alt.length - 2; i >= 0; i--) alt[i] = Math.max(alt[i]!, alt[i + 1]! - slope * (profile[i + 1]!.d - profile[i]!.d));

  waypoints.forEach((w, i) => {
    const p = profile[wpIndex[i]!]!;
    const value = Math.round(fromAsl(alt[wpIndex[i]!]!, w.frame ?? 'asl', p.ground, homeElev) * 10) / 10;
    if (Math.abs(value - w.altitude) >= 0.1) out.raisedAltitudes.set(w.seq, value);
  });

  const floor = (i: number) => profile[i]!.ground + options.heightAgl;
  for (let s = 0; s < waypoints.length - 1; s++) {
    const a = wpIndex[s]!, b = wpIndex[s + 1]!;
    const keep = new Set<number>([a, b]);
    // split where the straight line strays furthest from the profile, or dips under the floor
    const worst = (i0: number, i1: number): number => {
      let at = -1, err = options.toleranceMeters;
      for (let i = i0 + 1; i < i1; i++) {
        const t = (profile[i]!.d - profile[i0]!.d) / (profile[i1]!.d - profile[i0]!.d || 1);
        const line = alt[i0]! + (alt[i1]! - alt[i0]!) * t;
        const e = Math.max(Math.abs(line - alt[i]!), line < floor(i) ? Infinity : 0);
        if (e > err) { err = e; at = i; }
      }
      return at;
    };
    const stack: Array<[number, number]> = [[a, b]];
    while (stack.length > 0 && keep.size - 2 < maxInserts) {
      const [i0, i1] = stack.pop()!;
      const m = worst(i0, i1);
      if (m < 0) continue;
      keep.add(m);
      stack.push([i0, m], [m, i1]);
    }
    const frame = waypoints[s]!.frame ?? 'asl';
    for (const i of [...keep].sort((x, y) => x - y)) {
      if (i === a || i === b) continue;
      const p = profile[i]!;
      out.inserts.push({
        afterSeq: waypoints[s]!.seq,
        latitude: p.lat,
        longitude: p.lon,
        altitude: Math.round(fromAsl(alt[i]!, frame, p.ground, homeElev) * 10) / 10,
        frame,
        distanceAlong: p.d - profile[a]!.d,
      });
    }
  }
  return out;
}
