/**
 * Continuous DEM terrain-follow for survey waypoints.
 *
 * Samples ground elevation at every waypoint from the Open-Meteo DEM (reusing
 * the cached/batched {@link getElevations}) and bakes an absolute (MSL) altitude
 * of `ground + AGL` into each one. The result is consumed as `SurveyResult.altitudes`
 * with the mission emitted in the GLOBAL (ASL) frame, so the vehicle holds a
 * constant height above ground without needing an onboard terrain database.
 *
 * The per-waypoint AGL is taken from any existing `result.altitudes` entry
 * (e.g. crosshatch second-pass offset) and otherwise falls back to the flat
 * `config.altitude`, so two-height patterns keep their relative spacing on top
 * of the terrain.
 */
import { getElevations } from '../../utils/elevation-api';
import type { SurveyResult, SurveyConfig } from './survey-types';
import { planTerrainFollow, type PlannerWaypoint, type TerrainLookup } from '../mission/terrain-altitude-planner';

export interface TerrainFollowOutcome {
  /** Per-waypoint absolute (MSL) altitudes aligned 1:1 with result.waypoints. */
  altitudes: number[];
  /** Number of waypoints whose ground elevation could be resolved from the DEM. */
  resolved: number;
  /** Ground elevation spread across the surveyed area (m), for the UI readout. */
  terrainRange: { min: number; max: number } | null;
}

/**
 * Compute MSL altitudes that hold a constant AGL over the terrain for every
 * waypoint. Returns null when there are no waypoints or the DEM resolved nothing
 * (e.g. offline) so the caller can leave the flat altitude in place.
 */
export async function computeTerrainFollowAltitudes(
  result: SurveyResult,
  config: SurveyConfig,
): Promise<TerrainFollowOutcome | null> {
  const wps = result.waypoints;
  if (wps.length === 0) return null;

  const ground = await getElevations(wps.map((wp) => ({ lat: wp.lat, lon: wp.lng })));

  let resolved = 0;
  let min = Infinity;
  let max = -Infinity;
  const altitudes: number[] = wps.map((_, i) => {
    const agl = result.altitudes?.[i] ?? config.altitude;
    const g = ground[i];
    if (g === null || g === undefined) {
      // No DEM coverage for this point: fall back to a relative-style altitude so
      // a hole in the data degrades to "fly the configured height" rather than 0.
      return agl;
    }
    resolved += 1;
    if (g < min) min = g;
    if (g > max) max = g;
    return Math.round((g + agl) * 10) / 10;
  });

  if (resolved === 0) return null;

  return {
    altitudes,
    resolved,
    terrainRange: min <= max ? { min: Math.round(min), max: Math.round(max) } : null,
  };
}

const FOLLOW_STEP_M = 5;
const FOLLOW_MAX_SAMPLES = 6000;
const FOLLOW_TOLERANCE_M = 1.5;
const FOLLOW_MAX_CLIMB_DEG = 25;
const BUCKET_DEG = 2e-4;

function samplesAlong(wps: SurveyResult['waypoints'], stepM: number): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1]!, b = wps[i]!;
    const kx = 111320 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
    const d = Math.hypot((b.lng - a.lng) * kx, (b.lat - a.lat) * 110540);
    const n = Math.max(1, Math.ceil(d / stepM));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lng + (b.lng - a.lng) * t });
    }
  }
  return out;
}

function lookupOf(points: Array<{ lat: number; lon: number }>, heights: Array<number | null>): TerrainLookup {
  const grid = new Map<string, Array<{ lat: number; lon: number; h: number }>>();
  points.forEach((p, i) => {
    const h = heights[i];
    if (h === null || h === undefined) return;
    const k = `${Math.floor(p.lon / BUCKET_DEG)},${Math.floor(p.lat / BUCKET_DEG)}`;
    const list = grid.get(k);
    if (list) list.push({ ...p, h });
    else grid.set(k, [{ ...p, h }]);
  });
  return {
    elevationAt: (lat, lon) => {
      const bx = Math.floor(lon / BUCKET_DEG), by = Math.floor(lat / BUCKET_DEG);
      let best: number | null = null, bestD = Infinity;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const s of grid.get(`${bx + dx},${by + dy}`) ?? []) {
            const d = (s.lat - lat) ** 2 + (s.lon - lon) ** 2;
            if (d < bestD) { bestD = d; best = s.h; }
          }
      return best;
    },
  };
}

/**
 * Legs that follow the ground: where the surface between two waypoints rises away from the straight
 * line by more than a tolerance, waypoints are inserted so the photo scale stays constant along the
 * whole leg, not only at its ends. Returns the result unchanged when nothing needs inserting.
 */
export async function densifyTerrainFollow(result: SurveyResult, config: SurveyConfig, altitudes: number[]): Promise<SurveyResult> {
  const wps = result.waypoints;
  if (wps.length < 2) return { ...result, altitudes };
  const total = samplesAlong(wps, FOLLOW_STEP_M).length;
  const step = total > FOLLOW_MAX_SAMPLES ? FOLLOW_STEP_M * Math.ceil(total / FOLLOW_MAX_SAMPLES) : FOLLOW_STEP_M;
  const points = samplesAlong(wps, step);
  const heights = await getElevations(points);
  if (!heights.some((h) => h !== null)) return { ...result, altitudes };
  const terrain = lookupOf(points, heights);
  const planner: PlannerWaypoint[] = wps.map((wp, i) => ({ seq: i, latitude: wp.lat, longitude: wp.lng, altitude: altitudes[i] ?? config.altitude, frame: 'asl' }));
  const plan = planTerrainFollow(planner, terrain, { heightAgl: config.altitude, maxClimbDeg: FOLLOW_MAX_CLIMB_DEG, sampleStepMeters: step, toleranceMeters: FOLLOW_TOLERANCE_M });
  if (plan.inserts.length === 0 && plan.raisedAltitudes.size === 0) return { ...result, altitudes };
  const byLeg = new Map<number, typeof plan.inserts>();
  for (const ins of plan.inserts) {
    const list = byLeg.get(ins.afterSeq);
    if (list) list.push(ins);
    else byLeg.set(ins.afterSeq, [ins]);
  }
  const outWps: SurveyResult['waypoints'] = [];
  const outAlts: number[] = [];
  const outYaws: number[] | undefined = result.waypointYaws ? [] : undefined;
  const outLooks: SurveyResult['waypointLookAts'] = result.waypointLookAts ? [] : undefined;
  const indexMap: number[] = [];
  wps.forEach((wp, i) => {
    indexMap.push(outWps.length);
    outWps.push(wp);
    outAlts.push(plan.raisedAltitudes.get(i) ?? altitudes[i] ?? config.altitude);
    if (outYaws && result.waypointYaws) outYaws.push(result.waypointYaws[i] ?? 0);
    if (outLooks && result.waypointLookAts) outLooks.push(result.waypointLookAts[i]!);
    for (const ins of (byLeg.get(i) ?? []).sort((a, b) => a.distanceAlong - b.distanceAlong)) {
      outWps.push({ lat: ins.latitude, lng: ins.longitude });
      outAlts.push(Math.round(ins.altitude * 10) / 10);
      if (outYaws && result.waypointYaws) outYaws.push(result.waypointYaws[i] ?? 0);
      if (outLooks && result.waypointLookAts) outLooks.push(result.waypointLookAts[i]!);
    }
  });
  return {
    ...result,
    waypoints: outWps,
    altitudes: outAlts,
    ...(outYaws ? { waypointYaws: outYaws } : {}),
    ...(outLooks ? { waypointLookAts: outLooks } : {}),
    ...(result.legStarts ? { legStarts: result.legStarts.map((i) => indexMap[i] ?? i) } : {}),
  };
}
